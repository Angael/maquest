import fs from 'node:fs'
import path from 'node:path'
import { GRAPH_FILE, TYPE_DIRS, MaquestError, parseFrontmatter, type Edge, type Graph, type Project } from '@maquest/core'

type Snapshot = { files: Map<string, string>; graph: Graph }
type Change<T> = { key: string; before: T | undefined; after: T | undefined }
type Entry = { files: Change<string>[]; edges: Change<Edge>[]; layout: Change<{ x: number; y: number }>[] }
const LIMIT = 100

function snapshot(project: Project): Snapshot {
  const files = new Map<string, string>()
  for (const dir of new Set(Object.values(TYPE_DIRS))) {
    const absolute = path.join(project.root, dir)
    if (!fs.existsSync(absolute)) continue
    for (const name of fs.readdirSync(absolute)) {
      if (name.endsWith('.md')) files.set(path.join(dir, name), fs.readFileSync(path.join(absolute, name), 'utf8'))
    }
  }
  // A malformed graph must never be silently replaced by history restoration.
  const graph = JSON.parse(fs.readFileSync(path.join(project.root, GRAPH_FILE), 'utf8')) as Graph
  if (!Array.isArray(graph.edges) || !graph.layout) throw new MaquestError('Cannot record history: invalid graph.json')
  return { files, graph }
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function changes<T>(before: Map<string, T>, after: Map<string, T>): Change<T>[] {
  const result: Change<T>[] = []
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (!equal(before.get(key), after.get(key))) result.push({ key, before: before.get(key), after: after.get(key) })
  }
  return result
}

function writeAtomic(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, content)
  fs.renameSync(temporary, file)
}

/** Bounded desktop-only deltas; MCP edits remain external and are conflict checked. */
export class ProjectHistory {
  private past: Entry[] = []
  private future: Entry[] = []

  status() {
    return { canUndo: this.past.length > 0, canRedo: this.future.length > 0 }
  }

  record<T>(project: Project, operation: () => T): T {
    // Synchronous operations run to completion before another desktop IPC mutation.
    const before = snapshot(project)
    try {
      return operation()
    } finally {
      // Capture partial domain mutations even if a batch fails midway, so they remain undoable.
      const after = snapshot(project)
      const entry: Entry = {
        files: changes(before.files, after.files),
        edges: changes(new Map(before.graph.edges.map((e) => [e.id, e])), new Map(after.graph.edges.map((e) => [e.id, e]))),
        layout: changes(new Map(Object.entries(before.graph.layout)), new Map(Object.entries(after.graph.layout))),
      }
      if (entry.files.length || entry.edges.length || entry.layout.length) {
        this.past.push(entry)
        if (this.past.length > LIMIT) this.past.shift()
        this.future = []
      }
    }
  }

  undo(project: Project) {
    return this.restore(project, false)
  }

  redo(project: Project) {
    return this.restore(project, true)
  }

  private restore(project: Project, forward: boolean) {
    // Synchronous preflight and restoration keep desktop history mutations serialized.
    const from = forward ? this.future : this.past
    const to = forward ? this.past : this.future
    const entry = from.at(-1)
    if (!entry) return this.status()
    const current = snapshot(project)
    const files = new Map(current.files)
    const edges = new Map(current.graph.edges.map((e) => [e.id, e]))
    const layout = new Map(Object.entries(current.graph.layout))
    const apply = <T>(map: Map<string, T>, deltas: Change<T>[]) => {
      for (const delta of deltas) {
        const expected = forward ? delta.before : delta.after
        const desired = forward ? delta.after : delta.before
        if (!equal(map.get(delta.key), expected)) {
          throw new MaquestError(`Cannot ${forward ? 'redo' : 'undo'}: ${delta.key} was changed outside this history. No files were changed.`)
        }
        if (desired === undefined) map.delete(delta.key)
        else map.set(delta.key, desired)
      }
    }
    apply(files, entry.files)
    apply(edges, entry.edges)
    apply(layout, entry.layout)

    // Check relationships against the merged result, including new external links/children.
    const ids = new Set([...files.keys()].map((file) => path.basename(file, '.md')))
    if (ids.size !== files.size) throw new MaquestError('Cannot restore history: a node id is already used in another folder. No files were changed.')
    const removedIds = new Set([...current.files.keys()].map((file) => path.basename(file, '.md')).filter((id) => !ids.has(id)))
    const changedFiles = new Set(entry.files.map((delta) => delta.key))
    for (const [file, content] of files) {
      const parent = parseFrontmatter(content).data.parent
      if (typeof parent === 'string' && !ids.has(parent) && (removedIds.has(parent) || changedFiles.has(file))) {
        throw new MaquestError(`Cannot restore history: ${file} refers to missing parent ${parent}. No files were changed.`)
      }
    }
    const changedEdges = new Set(entry.edges.map((delta) => delta.key))
    for (const edge of edges.values()) {
      if ((!ids.has(edge.source) || !ids.has(edge.target)) && (changedEdges.has(edge.id) || removedIds.has(edge.source) || removedIds.has(edge.target))) {
        throw new MaquestError(`Cannot restore history: edge ${edge.id} refers to a missing node. No files were changed.`)
      }
    }
    for (const delta of entry.layout) {
      if (layout.has(delta.key) && !ids.has(delta.key)) throw new MaquestError(`Cannot restore history: layout node ${delta.key} no longer exists. No files were changed.`)
    }
    for (const id of removedIds) {
      if (layout.has(id)) throw new MaquestError(`Cannot restore history: externally added layout still refers to ${id}. No files were changed.`)
    }
    const graphChanged = entry.edges.length > 0 || entry.layout.length > 0
    // Recheck raw bytes immediately before writing, catching non-cooperating disk editors.
    for (const delta of entry.files) {
      const file = path.join(project.root, delta.key)
      const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined
      if (actual !== current.files.get(delta.key)) throw new MaquestError(`Cannot restore history: ${delta.key} changed concurrently. No files were changed.`)
    }
    const graphFile = path.join(project.root, GRAPH_FILE)
    if (graphChanged && !equal(JSON.parse(fs.readFileSync(graphFile, 'utf8')), current.graph)) {
      throw new MaquestError('Cannot restore history: graph.json changed concurrently. No files were changed.')
    }
    try {
      for (const delta of entry.files) {
        const content = files.get(delta.key)
        const file = path.join(project.root, delta.key)
        if (content === undefined) fs.rmSync(file, { force: true })
        else writeAtomic(file, content)
      }
      if (graphChanged) writeAtomic(graphFile, JSON.stringify({ ...current.graph, edges: [...edges.values()], layout: Object.fromEntries(layout) }, null, 2) + '\n')
    } catch (error) {
      // Keep a failed filesystem write from leaving a half-restored history entry.
      for (const delta of entry.files) {
        const content = current.files.get(delta.key)
        const file = path.join(project.root, delta.key)
        if (content === undefined) fs.rmSync(file, { force: true })
        else writeAtomic(file, content)
      }
      if (graphChanged) writeAtomic(graphFile, JSON.stringify(current.graph, null, 2) + '\n')
      throw error
    }
    from.pop()
    to.push(entry)
    return this.status()
  }
}
