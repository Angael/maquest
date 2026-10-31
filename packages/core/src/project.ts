import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import transliterate from '@sindresorhus/transliterate'
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter'
import { DEFAULT_GUIDELINES } from './guidelines/defaults'
import { TEMPLATES } from './templates'
import type { EdgeType } from './schema'
import {
  ALLOWED_PARENTS,
  Board,
  CARD_SIZE,
  Clock,
  GROUP_HEADER,
  GROUP_PAD,
  Group,
  assignGroup,
  entityOf,
  onBoard,
  refsOf,
  bounds,
  fitGroups,
  groupContent,
  removeGroup,
  type GroupColor,
  type Rect,
  type Size,
  EDGE_LABEL_MAX,
  Edge,
  EdgeHandle,
  Graph,
  GuidelineScope,
  PHASE_WIDTH,
  Phase,
  NODE_TYPES,
  NodeMeta,
  ProjectConfig,
  TYPE_DIRS,
  type Guideline,
  type NodeType,
  type ProjectKind,
  type Status,
  type StoryNode,
  type OutlineNode,
  type Position,
} from './schema'

export const CONFIG_FILE = 'maquest.json'
export const GRAPH_FILE = 'graph.json'
export const GUIDELINES_DIR = 'guidelines'
export const GUIDELINE_USAGE_FILE = 'usage.json'
export const MEDIA_DIR = 'media'

export class MaquestError extends Error {}

export type NodeFilter = {
  type?: NodeType | NodeType[]
  parent?: string | null
  tag?: string
  status?: Status
  /** Case-insensitive; with several terms a node matches any of them. */
  text?: string | string[]
}

/** Find-and-replace on a body. Fails unless `find` occurs exactly once, or `all` is set. */
export type BodyEdit = { find: string; replace: string; all?: boolean }

export type TextMatch = { where: string; text: string }

/** Matches [[id]] and [[id|alias]]. Ids are slugs, so they need no escaping. */
const linkPattern = (id: string) => new RegExp(`\\[\\[${id}(\\|[^\\]]*)?\\]\\]`, 'g')

/** Where the terms occur in a node: title, summary, fields and body lines, each trimmed around the match. */
export function textMatches(n: StoryNode, terms: string[], max = 5): TextMatch[] {
  const needles = terms.map((t) => t.toLowerCase()).filter(Boolean)
  const places: [string, string][] = [
    ['title', n.title],
    ['summary', n.summary ?? ''],
    ...Object.entries(n.fields).map(([k, v]): [string, string] => [`field ${k}`, v]),
    ...n.body.split('\n').map((line, i): [string, string] => [`body line ${i + 1}`, line]),
  ]
  const out: TextMatch[] = []
  for (const [where, value] of places) {
    const lower = value.toLowerCase()
    const at = Math.min(...needles.map((t) => lower.indexOf(t)).filter((i) => i >= 0))
    if (!Number.isFinite(at)) continue
    const start = Math.max(0, at - 50)
    const end = Math.min(value.length, at + 90)
    out.push({ where, text: `${start ? '…' : ''}${value.slice(start, end).trim()}${end < value.length ? '…' : ''}` })
    if (out.length >= max) break
  }
  return out
}

function applyEdits(body: string, edits: BodyEdit[], id: string) {
  for (const e of edits) {
    const count = e.find ? body.split(e.find).length - 1 : 0
    if (!count) throw new MaquestError(`${id}: text to replace not found: ${JSON.stringify(e.find.slice(0, 80))}`)
    if (count > 1 && !e.all) {
      throw new MaquestError(`${id}: text to replace occurs ${count} times; add more context or set all: true: ${JSON.stringify(e.find.slice(0, 80))}`)
    }
    body = body.replaceAll(e.find, () => e.replace)
  }
  return body
}

export type CreateNodeInput = {
  type: NodeType
  title: string
  body?: string
  parent?: string
  order?: number
  status?: Status
  summary?: string
  tags?: string[]
  pinned?: boolean
  media?: string[]
  src?: string
  fields?: Record<string, string>
  clock?: Clock
  /** Use the type's starter template when body/fields are not given. Default true. */
  template?: boolean
}

export type UpdateNodeInput = {
  title?: string
  type?: NodeType
  /** null detaches from parent */
  parent?: string | null
  order?: number
  status?: Status | null
  summary?: string
  tags?: string[]
  pinned?: boolean
  media?: string[]
  src?: string
  /** Merged into existing fields; null removes a field. */
  fields?: Record<string, string | null>
  /** null removes the clock */
  clock?: Clock | null
  body?: string
  appendBody?: string
  /** Find-and-replace edits applied to the body (after `body`, before `appendBody`). */
  edits?: BodyEdit[]
}

export type BoardPatch = {
  title?: string
  phases?: Phase[]
  /** Adds nodes to a curated board (placed in `phase` if given, else near the board's other cards). */
  addNodes?: string[]
  removeNodes?: string[]
}

/** Rendered card sizes from the canvas; cards without one are assumed to be CARD_SIZE. */
export type CardSizes = Record<string, Size>
const sizeOf = (sizes?: CardSizes) => (id: string) => sizes?.[id] ?? CARD_SIZE

export type GroupInput = {
  sizes?: CardSizes
  title: string
  color?: GroupColor
  /** Group to nest the new group in. */
  parent?: string
  /** Cards to move into the group (placed on the board first if needed). */
  nodes?: string[]
  /** Existing groups to nest inside the new group. */
  groups?: string[]
  rect?: Rect
}

export type GroupPatch = {
  sizes?: CardSizes
  title?: string
  color?: GroupColor
  /** null moves the group to the top level. */
  parent?: string | null
  /** Cards to move into the group; cards placed elsewhere are moved to a free spot inside it. */
  addNodes?: string[]
  /** Cards to take out of the group (they stay on the board, outside it). */
  removeNodes?: string[]
  rect?: Rect
}

/** Layout extras from the canvas, which knows real card sizes. */
export type LayoutExtras = {
  /** Group rectangles (still grown to fit their content). */
  groups?: Record<string, Rect>
  sizes?: CardSizes
  /** Card id → group id (null = top level). */
  assign?: Record<string, string | null>
  /** Group id → parent group id (null = top level). */
  nest?: Record<string, string | null>
}

export function slugify(s: string): string {
  return (
    transliterate(s)
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  )
}

function writeAtomic(file: string, content: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, file)
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export type InitOptions = {
  name: string
  kind?: ProjectKind
  description?: string
  /** Command + args the agent should use to launch the Maquest MCP server. */
  mcp?: McpLaunch
}

export type McpLaunch = { command: string; args: string[]; env?: Record<string, string> }

export class Project {
  readonly root: string

  constructor(root: string) {
    this.root = path.resolve(root)
    if (!Project.isProject(this.root)) {
      throw new MaquestError(`Not a Maquest project (missing ${CONFIG_FILE}): ${this.root}`)
    }
  }

  static isProject(root: string) {
    return fs.existsSync(path.join(root, CONFIG_FILE))
  }

  /** Walks up from `start` to find the nearest project root. */
  static find(start: string): string | null {
    let dir = path.resolve(start)
    while (true) {
      if (Project.isProject(dir)) return dir
      const up = path.dirname(dir)
      if (up === dir) return null
      dir = up
    }
  }

  static init(root: string, opts: InitOptions): Project {
    root = path.resolve(root)
    fs.mkdirSync(root, { recursive: true })
    if (!Project.isProject(root)) {
      const config = ProjectConfig.parse({ name: opts.name, kind: opts.kind, description: opts.description })
      writeAtomic(path.join(root, CONFIG_FILE), JSON.stringify(config, null, 2) + '\n')
    }
    for (const dir of [...new Set(Object.values(TYPE_DIRS)), GUIDELINES_DIR, MEDIA_DIR]) {
      fs.mkdirSync(path.join(root, dir), { recursive: true })
    }
    if (!fs.existsSync(path.join(root, GRAPH_FILE))) {
      writeAtomic(path.join(root, GRAPH_FILE), JSON.stringify({ edges: [], boards: [] }, null, 2) + '\n')
    }
    if (opts.mcp) writeAgentFiles(root, opts.mcp)
    return new Project(root)
  }

  // ---------- config ----------

  config(): ProjectConfig {
    return ProjectConfig.parse(readJson(path.join(this.root, CONFIG_FILE), {}))
  }

  updateConfig(patch: Partial<ProjectConfig>): ProjectConfig {
    const next = ProjectConfig.parse({ ...this.config(), ...patch })
    writeAtomic(path.join(this.root, CONFIG_FILE), JSON.stringify(next, null, 2) + '\n')
    return next
  }

  // ---------- nodes ----------

  private readNodeFile(file: string): StoryNode | null {
    try {
      const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
      const meta = NodeMeta.safeParse({ title: path.basename(file, '.md'), ...data, id: path.basename(file, '.md') })
      if (!meta.success) return null
      return { ...meta.data, body, path: path.relative(this.root, file) }
    } catch {
      return null
    }
  }

  private nodeFile(type: NodeType, id: string) {
    return path.join(this.root, TYPE_DIRS[type], `${id}.md`)
  }

  listNodes(filter: NodeFilter = {}): StoryNode[] {
    const types = filter.type ? ([] as NodeType[]).concat(filter.type) : [...NODE_TYPES]
    const terms = filter.text === undefined ? [] : ([] as string[]).concat(filter.text).map((t) => t.toLowerCase())
    const out: StoryNode[] = []
    for (const type of types) {
      const dir = path.join(this.root, TYPE_DIRS[type])
      if (!fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md')) continue
        const n = this.readNodeFile(path.join(dir, f))
        if (!n || n.type !== type) continue
        if (filter.parent !== undefined && (n.parent ?? null) !== filter.parent) continue
        if (filter.tag && !n.tags.includes(filter.tag)) continue
        if (filter.status && n.status !== filter.status) continue
        if (terms.length) {
          const hay = `${n.title}\n${n.summary ?? ''}\n${n.body}\n${Object.values(n.fields).join('\n')}`.toLowerCase()
          if (!terms.some((t) => hay.includes(t))) continue
        }
        out.push(n)
      }
    }
    return out.toSorted((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.title.localeCompare(b.title))
  }

  getNode(id: string): StoryNode | null {
    for (const type of NODE_TYPES) {
      const file = this.nodeFile(type, id)
      if (fs.existsSync(file)) {
        const n = this.readNodeFile(file)
        if (n) return n
      }
    }
    return null
  }

  requireNode(id: string): StoryNode {
    const n = this.getNode(id)
    if (!n) throw new MaquestError(`Node not found: ${id}`)
    return n
  }

  private uniqueId(title: string) {
    const base = slugify(title)
    let id = base
    for (let i = 2; this.getNode(id); i++) id = `${base}-${i}`
    return id
  }

  private checkParent(type: NodeType, parent?: string) {
    if (!parent) return
    const p = this.requireNode(parent)
    const allowed = ALLOWED_PARENTS[type]
    if (!allowed?.includes(p.type)) {
      throw new MaquestError(`A ${type} cannot be placed under a ${p.type}. Allowed parents: ${allowed?.join(', ') || 'none (top level only)'}`)
    }
  }

  private writeNode(n: Omit<StoryNode, 'path'>) {
    const { body, id, ...meta } = n
    writeAtomic(this.nodeFile(n.type, id), stringifyFrontmatter({ ...meta }, body))
  }

  createNode(input: CreateNodeInput): StoryNode {
    this.checkParent(input.type, input.parent)
    const tpl = input.template === false ? undefined : TEMPLATES[input.type]
    const id = this.uniqueId(input.title)
    const now = new Date().toISOString()
    const order =
      input.order ??
      (input.parent !== undefined || ['story', 'idea'].includes(input.type)
        ? Math.max(0, ...this.listNodes({ type: input.type, parent: input.parent ?? null }).map((s) => s.order ?? 0)) + 1
        : undefined)
    const node = {
      ...NodeMeta.parse({
        id,
        type: input.type,
        title: input.title,
        parent: input.parent,
        order,
        status: input.status,
        summary: input.summary,
        tags: input.tags,
        pinned: input.pinned,
        media: input.media,
        src: input.src,
        fields: { ...tpl?.fields, ...input.fields },
        clock: input.clock && checkClock(input.clock),
        created: now,
        updated: now,
      }),
      body: input.body ?? tpl?.body ?? '',
    }
    this.writeNode(node)
    return this.requireNode(id)
  }

  updateNode(id: string, patch: UpdateNodeInput): StoryNode {
    const cur = this.requireNode(id)
    const type = patch.type ?? cur.type
    const parent = patch.parent === null ? undefined : (patch.parent ?? cur.parent)
    this.checkParent(type, parent)
    if (parent === id) throw new MaquestError('A node cannot be its own parent')
    const fields = { ...cur.fields }
    for (const [k, v] of Object.entries(patch.fields ?? {})) {
      if (v === null) delete fields[k]
      else fields[k] = v
    }
    let body = patch.body ?? cur.body
    if (patch.edits?.length) body = applyEdits(body, patch.edits, id)
    if (patch.appendBody) body = `${body.trimEnd()}\n\n${patch.appendBody}\n`
    const { path: oldPath, ...rest } = cur
    const next = {
      ...rest,
      title: patch.title ?? cur.title,
      type,
      parent,
      order: patch.order ?? (patch.parent !== undefined && patch.parent !== cur.parent ? undefined : cur.order),
      status: patch.status === null ? undefined : (patch.status ?? cur.status),
      summary: patch.summary ?? cur.summary,
      tags: patch.tags ?? cur.tags,
      pinned: patch.pinned ?? cur.pinned,
      media: patch.media ?? cur.media,
      src: patch.src ?? cur.src,
      fields,
      clock: patch.clock === null ? undefined : patch.clock ? checkClock(patch.clock) : cur.clock,
      body,
      updated: new Date().toISOString(),
    }
    if (next.order === undefined && parent) {
      next.order = Math.max(0, ...this.listNodes({ type, parent }).map((s) => s.order ?? 0)) + 1
    }
    this.writeNode(next)
    if (type !== cur.type) {
      fs.rmSync(path.join(this.root, oldPath), { force: true })
      // Children that may not live under the new type are detached.
      for (const child of this.children(id)) {
        if (!ALLOWED_PARENTS[child.type]?.includes(type)) this.updateNode(child.id, { parent: null })
      }
    }
    return this.requireNode(id)
  }

  children(id: string): StoryNode[] {
    return this.listNodes({ parent: id })
  }

  /** Nodes whose body links to `id` with [[id]]. */
  linksTo(id: string): StoryNode[] {
    const re = linkPattern(id)
    return this.listNodes().filter((n) => n.id !== id && n.body.match(re))
  }

  /** Rewrites [[from]] links in every body to [[to]], keeping any |alias. Returns the ids of changed nodes. */
  private relink(from: string, to: string): string[] {
    const re = linkPattern(from)
    return this.linksTo(from).map((n) => {
      const { path: _path, ...rest } = n
      this.writeNode({ ...rest, body: n.body.replaceAll(re, (_m, alias: string | undefined) => `[[${to}${alias ?? ''}]]`) })
      return n.id
    })
  }

  /** Changes a node's id: renames its file and updates children, connections, board cards and [[links]]. */
  renameNode(id: string, newId: string): StoryNode {
    const cur = this.requireNode(id)
    const next = slugify(newId)
    if (next === id) return cur
    if (this.getNode(next)) throw new MaquestError(`Node already exists: ${next}`)
    const { path: oldPath, ...rest } = cur
    this.writeNode({ ...rest, id: next, updated: new Date().toISOString() })
    fs.rmSync(path.join(this.root, oldPath), { force: true })
    for (const child of this.children(id)) {
      const { path: _path, ...c } = child
      this.writeNode({ ...c, parent: next })
    }
    const g = this.graph()
    this.repoint(g, id, next)
    this.saveGraph(g)
    this.relink(id, next)
    return this.requireNode(next)
  }

  /** Moves connections and board cards from one node id to another, dropping duplicates. */
  private repoint(g: Graph, from: string, to: string) {
    const rekey = (key: string) => (entityOf(key) === from ? `${to}${key.slice(from.length)}` : key)
    for (const e of g.edges) {
      if (e.source === from) e.source = to
      if (e.target === from) e.target = to
    }
    const seen = new Set<string>()
    g.edges = g.edges.filter((e) => {
      const k = `${e.source}>${e.target}>${e.type}`
      if (e.source === e.target || seen.has(k)) return false
      seen.add(k)
      return true
    })
    for (const b of g.boards) {
      const taken = new Set(b.nodes ?? [])
      for (const key of refsOf(b, from)) {
        const target = taken.has(rekey(key)) ? null : rekey(key)
        if (target && b.layout[key]) b.layout[target] = b.layout[key]
        delete b.layout[key]
        if (target) taken.add(target)
        b.nodes = b.nodes?.flatMap((k) => (k === key ? (target ? [target] : []) : [k]))
        for (const group of b.groups) group.nodes = group.nodes.flatMap((k) => (k === key ? (target ? [target] : []) : [k]))
      }
    }
  }

  /**
   * Deletes a node. With `recursive`, deletes all descendants; otherwise children are detached.
   * With `replaceWith`, its connections, board cards and [[links]] move to that node instead of being dropped.
   */
  deleteNode(id: string, opts: { recursive?: boolean; replaceWith?: string } = {}): string[] {
    const n = this.requireNode(id)
    if (opts.replaceWith !== undefined) {
      if (opts.replaceWith === id) throw new MaquestError('A node cannot replace itself')
      this.requireNode(opts.replaceWith)
    }
    const deleted: string[] = []
    for (const child of this.children(id)) {
      if (opts.recursive) deleted.push(...this.deleteNode(child.id, { recursive: true }))
      else this.updateNode(child.id, { parent: null })
    }
    if (opts.replaceWith) {
      const g = this.graph()
      this.repoint(g, id, opts.replaceWith)
      this.saveGraph(g)
      this.relink(id, opts.replaceWith)
    }
    fs.rmSync(path.join(this.root, n.path), { force: true })
    deleted.push(id)
    const g = this.graph()
    g.edges = g.edges.filter((e) => e.source !== id && e.target !== id)
    for (const b of g.boards) {
      for (const key of refsOf(b, id)) delete b.layout[key]
      delete b.layout[id]
      b.nodes = b.nodes?.filter((n) => entityOf(n) !== id)
      for (const group of b.groups) group.nodes = group.nodes.filter((n) => entityOf(n) !== id)
    }
    this.saveGraph(g)
    return deleted
  }

  /** Sets explicit order of children under a parent (or of top-level nodes of a type). */
  reorder(ids: string[]) {
    ids.forEach((id, i) => {
      const n = this.requireNode(id)
      const { path: _p, ...rest } = n
      this.writeNode({ ...rest, order: i + 1 })
    })
  }

  outline(storyId?: string): OutlineNode[] {
    const all = this.listNodes({ type: ['story', 'chapter', 'scene'] })
    const byParent = new Map<string, StoryNode[]>()
    for (const n of all) if (n.parent) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n])
    const build = (n: StoryNode): OutlineNode => ({
      id: n.id,
      type: n.type,
      title: n.title,
      status: n.status,
      summary: n.summary,
      children: (byParent.get(n.id) ?? []).map(build),
    })
    return all.filter((n) => n.type === 'story' && (!storyId || n.id === storyId)).map(build)
  }

  // ---------- graph ----------

  graph(): Graph {
    const g = Graph.parse(readJson(path.join(this.root, GRAPH_FILE), {}))
    // Legacy boards without a node list showed every node; pin that down so boards stay independent.
    if (g.boards.some((b) => !b.nodes)) {
      const all = this.listNodes().map((n) => n.id)
      for (const b of g.boards) b.nodes ??= all
    }
    return g
  }

  private saveGraph(g: Graph) {
    writeAtomic(path.join(this.root, GRAPH_FILE), JSON.stringify(g, null, 2) + '\n')
  }

  edgesOf(id: string): Edge[] {
    return this.graph().edges.filter((e) => e.source === id || e.target === id)
  }

  addEdge(input: { source: string; target: string; type?: EdgeType; label?: string; sourceHandle?: EdgeHandle; targetHandle?: EdgeHandle }): Edge {
    checkLabel(input.label)
    this.requireNode(input.source)
    this.requireNode(input.target)
    const g = this.graph()
    const type = input.type ?? 'link'
    const existing = g.edges.find((e) => e.source === input.source && e.target === input.target && e.type === type)
    if (existing) {
      if (input.label !== undefined) existing.label = input.label || undefined
      if (input.sourceHandle !== undefined) existing.sourceHandle = EdgeHandle.parse(input.sourceHandle)
      if (input.targetHandle !== undefined) existing.targetHandle = EdgeHandle.parse(input.targetHandle)
      this.saveGraph(g)
      return existing
    }
    const edge = Edge.parse({ id: randomUUID().slice(0, 8), ...input, type, label: input.label || undefined })
    g.edges.push(edge)
    this.saveGraph(g)
    return edge
  }

  updateEdge(
    id: string,
    patch: { type?: EdgeType; label?: string; source?: string; target?: string; sourceHandle?: EdgeHandle; targetHandle?: EdgeHandle },
  ): Edge {
    const g = this.graph()
    const e = g.edges.find((x) => x.id === id)
    if (!e) throw new MaquestError(`Edge not found: ${id}`)
    checkLabel(patch.label)
    if (patch.type) e.type = patch.type
    if (patch.label !== undefined) e.label = patch.label || undefined
    if (patch.source) e.source = this.requireNode(patch.source).id
    if (patch.target) e.target = this.requireNode(patch.target).id
    if (patch.sourceHandle !== undefined) e.sourceHandle = EdgeHandle.parse(patch.sourceHandle)
    if (patch.targetHandle !== undefined) e.targetHandle = EdgeHandle.parse(patch.targetHandle)
    this.saveGraph(g)
    return e
  }

  removeEdge(id: string) {
    const g = this.graph()
    const before = g.edges.length
    g.edges = g.edges.filter((e) => e.id !== id)
    if (g.edges.length === before) throw new MaquestError(`Edge not found: ${id}`)
    this.saveGraph(g)
  }

  // ---------- boards ----------

  boards(): Board[] {
    return this.graph().boards
  }

  /** A board by id; without one, the first board. */
  board(id?: string): Board {
    const boards = this.graph().boards
    const b = id === undefined ? boards[0] : boards.find((x) => x.id === id)
    if (!b) throw new MaquestError(`Board not found: ${id}`)
    return b
  }

  /** Saves card positions on a board; on a curated board this also adds the cards to it. */
  setLayout(positions: Record<string, Position>, boardId?: string, extras: LayoutExtras = {}) {
    const g = this.graph()
    const b = boardId === undefined ? g.boards[0] : g.boards.find((x) => x.id === boardId)
    if (!b) throw new MaquestError(`Board not found: ${boardId}`)
    Object.assign(b.layout, positions)
    b.nodes ??= []
    for (const id of Object.keys(positions)) if (!b.nodes.includes(id)) b.nodes.push(id)
    try {
      for (const [id, target] of Object.entries(extras.nest ?? {})) assignGroup(b, id, target, true)
      for (const [id, target] of Object.entries(extras.assign ?? {})) assignGroup(b, id, target)
    } catch (cause) {
      throw new MaquestError(cause instanceof Error ? cause.message : String(cause))
    }
    for (const [id, rect] of Object.entries(extras.groups ?? {})) {
      const group = b.groups.find((x) => x.id === id)
      if (group) Object.assign(group, rect)
    }
    fitGroups(b, sizeOf(extras.sizes))
    this.saveGraph(g)
  }

  // ---------- groups ----------

  createGroup(boardId: string, input: GroupInput): Group {
    const g = this.graph()
    const b = this.findBoard(g, boardId)
    let id = `g-${randomUUID().slice(0, 6)}`
    while (b.groups.some((x) => x.id === id)) id = `g-${randomUUID().slice(0, 6)}`
    const rect = input.rect ?? emptyGroupSpot(b)
    const group = Group.parse({ id, title: input.title, color: input.color, ...rect })
    b.groups.push(group)
    this.editGroup(g, b, group, { parent: input.parent, addNodes: input.nodes, keepPositions: true })
    for (const child of input.groups ?? []) this.groupAction(() => assignGroup(b, child, id, true))
    if (!input.rect && (input.nodes?.length || input.groups?.length)) {
      // Wrap the content tightly instead of keeping the placeholder rectangle.
      const content = groupContent(b, id, sizeOf(input.sizes))
      if (content) Object.assign(group, content)
    }
    fitGroups(b, sizeOf(input.sizes))
    this.saveGraph(g)
    return group
  }

  updateGroup(boardId: string, id: string, patch: GroupPatch): Group {
    const g = this.graph()
    const b = this.findBoard(g, boardId)
    const group = b.groups.find((x) => x.id === id || x.title === id)
    if (!group) throw new MaquestError(`Group not found on ${b.id}: ${id}`)
    if (patch.title !== undefined) group.title = patch.title
    if (patch.color !== undefined) group.color = patch.color
    if (patch.rect) Object.assign(group, patch.rect)
    this.editGroup(g, b, group, patch)
    fitGroups(b, sizeOf(patch.sizes))
    this.saveGraph(g)
    return group
  }

  /** Removes a group frame; its cards and subgroups stay where they are. */
  deleteGroup(boardId: string, id: string) {
    const g = this.graph()
    const b = this.findBoard(g, boardId)
    this.groupAction(() => removeGroup(b, b.groups.find((x) => x.title === id)?.id ?? id))
    this.saveGraph(g)
  }

  private findBoard(g: Graph, id: string) {
    const b = g.boards.find((x) => x.id === id)
    if (!b) throw new MaquestError(`Board not found: ${id}`)
    return b
  }

  private groupAction(fn: () => void) {
    try {
      fn()
    } catch (cause) {
      throw new MaquestError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  private editGroup(g: Graph, b: Board, group: Group, patch: Pick<GroupPatch, 'parent' | 'addNodes' | 'removeNodes'> & { keepPositions?: boolean }) {
    if (patch.parent !== undefined) this.groupAction(() => assignGroup(b, group.id, patch.parent ?? null, true))
    for (const n of patch.addNodes ?? []) {
      this.requireNode(entityOf(n))
      b.nodes ??= []
      if (!b.nodes.includes(n)) b.nodes.push(n)
      const placed = b.layout[n] ?? g.boards.find((x) => x.layout[n])?.layout[n]
      // Cards already in place keep their spot when the group is being built around them.
      b.layout[n] = patch.keepPositions && placed ? placed : spotInGroup(b, group)
      assignGroup(b, n, group.id)
    }
    for (const n of patch.removeNodes ?? []) {
      if (!group.nodes.includes(n)) continue
      assignGroup(b, n, group.parent ?? null)
      const at = b.layout[n]
      if (at && !group.parent) b.layout[n] = { x: group.x + group.width + 40, y: at.y }
    }
  }

  createBoard(input: { title: string; nodes?: string[]; phases?: string[] }): Board {
    const g = this.graph()
    const base = slugify(input.title)
    let id = base
    for (let i = 2; g.boards.some((b) => b.id === id); i++) id = `${base}-${i}`
    for (const n of input.nodes ?? []) this.requireNode(n)
    const board = Board.parse({ id, title: input.title, nodes: [], phases: (input.phases ?? []).map(phase) })
    g.boards.push(board)
    this.saveGraph(g)
    if (input.nodes?.length) return this.updateBoard(id, { addNodes: input.nodes })
    return board
  }

  updateBoard(id: string, patch: BoardPatch & { phase?: string }): Board {
    const g = this.graph()
    const b = g.boards.find((x) => x.id === id)
    if (!b) throw new MaquestError(`Board not found: ${id}`)
    if (patch.title !== undefined) b.title = patch.title
    if (patch.phases) b.phases = patch.phases.map((p) => Phase.parse(p))
    const column = patch.phase === undefined ? -1 : b.phases.findIndex((p) => p.id === patch.phase || p.title === patch.phase)
    if (patch.phase !== undefined && column < 0) throw new MaquestError(`Phase not found on ${id}: ${patch.phase}`)
    for (const n of patch.addNodes ?? []) {
      this.requireNode(n)
      b.nodes ??= []
      if (!onBoard(b, n)) b.nodes.push(n)
      else if (!b.nodes.includes(n)) continue
      if (column >= 0 || !b.layout[n]) b.layout[n] = freeSpot(b, column, g.boards.find((x) => x.layout[n])?.layout[n])
    }
    if (patch.removeNodes?.length) {
      b.nodes = (b.nodes ?? []).filter((n) => !patch.removeNodes!.includes(n))
      for (const n of patch.removeNodes) delete b.layout[n]
      for (const group of b.groups) group.nodes = group.nodes.filter((n) => !patch.removeNodes!.includes(n))
    }
    this.saveGraph(g)
    return b
  }

  /** Puts boards in the given order; boards not listed keep their relative order after the listed ones. */
  reorderBoards(ids: string[]) {
    const g = this.graph()
    for (const id of ids) if (!g.boards.some((b) => b.id === id)) throw new MaquestError(`Board not found: ${id}`)
    const rank = (id: string) => (ids.includes(id) ? ids.indexOf(id) : ids.length)
    g.boards = g.boards.toSorted((a, b) => rank(a.id) - rank(b.id))
    this.saveGraph(g)
    return g.boards
  }

  deleteBoard(id: string) {
    const g = this.graph()
    if (g.boards.length === 1 && g.boards[0].id === id) throw new MaquestError('A project needs at least one board')
    const before = g.boards.length
    g.boards = g.boards.filter((b) => b.id !== id)
    if (g.boards.length === before) throw new MaquestError(`Board not found: ${id}`)
    this.saveGraph(g)
  }

  // ---------- guidelines ----------

  private readOverride(id: string): Partial<Guideline> | null {
    const file = path.join(this.root, GUIDELINES_DIR, `${id}.md`)
    if (!fs.existsSync(file)) return null
    const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
    return {
      title: typeof data.title === 'string' ? data.title : undefined,
      scope: GuidelineScope.safeParse(data.scope).data,
      disabled: data.disabled === true,
      body: body.trim() || undefined,
    }
  }

  /** Merged guidelines: built-in defaults overridden by project files in guidelines/. */
  guidelines(opts: { includeDisabled?: boolean; applicableOnly?: boolean } = {}): Guideline[] {
    const dir = path.join(this.root, GUIDELINES_DIR)
    const overrideIds = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.md'))
          .map((f) => f.slice(0, -3))
      : []
    const out: Guideline[] = []
    for (const d of DEFAULT_GUIDELINES) {
      const o = overrideIds.includes(d.id) ? this.readOverride(d.id) : null
      out.push(o ? { ...d, ...strip(o), source: 'override' } : { ...d, source: 'default' })
    }
    for (const id of overrideIds) {
      if (DEFAULT_GUIDELINES.some((d) => d.id === id)) continue
      const o = this.readOverride(id)!
      out.push({ id, title: o.title ?? id, scope: o.scope ?? 'all', body: o.body ?? '', disabled: o.disabled, source: 'custom' })
    }
    const kind = this.config().kind
    const usage = this.guidelineUsage()
    return out
      .filter((g) => (opts.includeDisabled || !g.disabled) && (!opts.applicableOnly || kind === 'mixed' || g.scope === 'all' || g.scope === kind))
      .map((g) => ({ ...g, reads: usage[g.id]?.reads ?? 0, writes: usage[g.id]?.writes ?? 0 }))
  }

  private guidelineUsage(): Record<string, { reads?: number; writes?: number }> {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.root, GUIDELINES_DIR, GUIDELINE_USAGE_FILE), 'utf8'))
    } catch {
      return {}
    }
  }

  /** Counts agent reads/writes per guideline in guidelines/usage.json. */
  trackGuidelineUse(ids: string[], kind: 'reads' | 'writes') {
    if (!ids.length) return
    const usage = this.guidelineUsage()
    for (const id of ids) usage[id] = { ...usage[id], [kind]: (usage[id]?.[kind] ?? 0) + 1 }
    writeAtomic(path.join(this.root, GUIDELINES_DIR, GUIDELINE_USAGE_FILE), JSON.stringify(usage, null, 2) + '\n')
  }

  guideline(id: string): Guideline | null {
    return this.guidelines({ includeDisabled: true }).find((g) => g.id === id) ?? null
  }

  defaultGuideline(id: string) {
    return DEFAULT_GUIDELINES.find((d) => d.id === id) ?? null
  }

  /** Writes a project override (or a new custom guideline). */
  setGuideline(id: string, patch: { title?: string; body?: string; scope?: GuidelineScope; disabled?: boolean }): Guideline {
    id = slugify(id)
    const cur = this.guideline(id)
    const next = {
      title: patch.title ?? cur?.title ?? id,
      scope: patch.scope ?? cur?.scope ?? 'all',
      disabled: patch.disabled ?? cur?.disabled ?? undefined,
    }
    const body = patch.body ?? cur?.body ?? ''
    writeAtomic(path.join(this.root, GUIDELINES_DIR, `${id}.md`), stringifyFrontmatter({ ...next, disabled: next.disabled || undefined }, body.trim() + '\n'))
    return this.guideline(id)!
  }

  /** Removes the project override, restoring the built-in default (or deleting a custom guideline). */
  resetGuideline(id: string) {
    fs.rmSync(path.join(this.root, GUIDELINES_DIR, `${id}.md`), { force: true })
  }

  // ---------- media ----------

  /** Copies a file into media/ and returns its project-relative path. */
  importMedia(source: string, name?: string): string {
    return this.writeMedia(name ?? path.basename(source), fs.readFileSync(source))
  }

  writeMedia(name: string, data: Buffer | Uint8Array): string {
    const ext = path.extname(name).toLowerCase()
    const base = slugify(path.basename(name, ext))
    let file = `${base}${ext}`
    for (let i = 2; fs.existsSync(path.join(this.root, MEDIA_DIR, file)); i++) file = `${base}-${i}${ext}`
    writeAtomic(path.join(this.root, MEDIA_DIR, file), Buffer.from(data))
    return `${MEDIA_DIR}/${file}`
  }

  listMedia(): string[] {
    const dir = path.join(this.root, MEDIA_DIR)
    return fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => !f.startsWith('.'))
          .map((f) => `${MEDIA_DIR}/${f}`)
      : []
  }

  resolve(rel: string): string {
    const abs = path.resolve(this.root, rel)
    if (!abs.startsWith(this.root + path.sep)) throw new MaquestError(`Path escapes project: ${rel}`)
    return abs
  }
}

function checkLabel(label?: string) {
  if (label && label.length > EDGE_LABEL_MAX) {
    throw new MaquestError(
      `Edge label too long (${label.length} > ${EDGE_LABEL_MAX}). A label names the relationship in a few words ("betrays", "owes a debt to"); put notes and status on the nodes instead.`,
    )
  }
}

function checkClock(clock: Clock): Clock {
  const c = Clock.parse(clock)
  return { ...c, filled: Math.min(c.filled, c.size), steps: c.steps.slice(0, c.size) }
}

function phase(title: string, i: number): Phase {
  return { id: `${slugify(title)}-${i + 1}`, title }
}

/**
 * Where a newly placed card goes: below the cards already in its phase column; without a phase, in the
 * unsorted strip left of the columns (phase boards) or where it sits on another board.
 */
function freeSpot(b: Board, column: number, fallback?: Position): Position {
  if (column < 0 && fallback && !b.phases.length) return fallback
  const x = column >= 0 ? column * PHASE_WIDTH + 40 : b.phases.length ? -PHASE_WIDTH / 2 : 0
  const below = Object.values(b.layout).filter((p) => Math.floor(p.x / PHASE_WIDTH) === Math.floor(x / PHASE_WIDTH))
  return { x, y: below.length ? Math.max(...below.map((p) => p.y)) + 200 : 0 }
}

/** A free spot inside a group: below its current content, growing the group as needed. */
function spotInGroup(b: Board, group: Group): Position {
  const content = groupContent(b, group.id)
  if (!content) return { x: group.x + GROUP_PAD, y: group.y + GROUP_HEADER + GROUP_PAD }
  return { x: group.x + GROUP_PAD, y: content.y + content.height - GROUP_PAD + 40 }
}

/** Where a new empty group goes: right of everything on the board. */
function emptyGroupSpot(b: Board): Rect {
  const all = bounds([...Object.values(b.layout).map((p) => ({ ...p, ...CARD_SIZE })), ...b.groups])
  return {
    x: all ? all.x + all.width + 80 : 0,
    y: all ? all.y : 0,
    width: 2 * CARD_SIZE.width + 3 * GROUP_PAD,
    height: CARD_SIZE.height + 2 * GROUP_PAD + GROUP_HEADER,
  }
}

function strip<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

const AGENT_DOC = `# Maquest project

This folder is a Maquest writing project (stories, chapters, scenes, entities, backlog, node graph).

- Use the **maquest** MCP server tools to read and edit this project. Don't hand-edit files unless the tools can't do it.
- Start with the \`overview\` tool, then read the writing guidelines (\`guidelines\` tool) before making creative changes.
- Be proactive: when the author shares ideas, add them to the project immediately (scenes, entities, links, backlog) and report what changed.
- **You own git.** If the folder isn't a git repository yet, run \`git init\`. Commit after each meaningful change with a short, descriptive message (what changed in the story, not which files). Don't ask before committing; never rewrite or discard history the author made.
- The author may edit or override guidelines in \`guidelines/\`. Follow project overrides over defaults.
`

/** Earlier generated versions, replaced automatically when unedited. */
const LEGACY_AGENT_DOCS = new Set([
  `# Maquest project

This folder is a Maquest writing project (stories, chapters, scenes, entities, backlog, node graph).

- Use the **maquest** MCP server tools to read and edit this project. Don't hand-edit files unless the tools can't do it.
- Start with the \`overview\` tool, then read the writing guidelines (\`guidelines\` tool) before making creative changes.
- Be proactive: when the author shares ideas, add them to the project immediately (scenes, entities, links, backlog) and report what changed.
- The author may edit or override guidelines in \`guidelines/\`. Follow project overrides over defaults.
`,
])

/** Rewriting unchanged files would show up as noise in the project's git history. */
function write(file: string, content: string) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) writeAtomic(file, content)
}

/** Writes .mcp.json (Claude Code & others), .codex/config.toml, .cursor/mcp.json and agent instructions. */
export function writeAgentFiles(root: string, mcp: McpLaunch) {
  const server = { command: mcp.command, args: mcp.args, ...(mcp.env ? { env: mcp.env } : {}) }
  const mcpJson = path.join(root, '.mcp.json')
  const existing = readJson<{ mcpServers?: Record<string, unknown> }>(mcpJson, {})
  write(mcpJson, JSON.stringify({ ...existing, mcpServers: { ...existing.mcpServers, maquest: server } }, null, 2) + '\n')
  write(path.join(root, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { maquest: server } }, null, 2) + '\n')
  const toml = `[mcp_servers.maquest]\ncommand = ${JSON.stringify(mcp.command)}\nargs = ${JSON.stringify(mcp.args)}\n${
    mcp.env
      ? `env = { ${Object.entries(mcp.env)
          .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
          .join(', ')} }\n`
      : ''
  }`
  write(path.join(root, '.codex', 'config.toml'), toml)
  const agents = path.join(root, 'AGENTS.md')
  if (!fs.existsSync(agents) || LEGACY_AGENT_DOCS.has(fs.readFileSync(agents, 'utf8'))) write(agents, AGENT_DOC)
  if (!fs.existsSync(path.join(root, 'CLAUDE.md'))) write(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n')
  const ignore = path.join(root, '.gitignore')
  const current = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : ''
  const lines = new Set(current.split(/\r?\n/).map((l) => l.trim()))
  const missing = GIT_IGNORED.filter((l) => !lines.has(l))
  if (missing.length) write(ignore, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`)
}

/** Machine-specific agent config and usage counters that don't belong in a project's history. */
const GIT_IGNORED = ['.mcp.json', '.cursor/', '.codex/', `${GUIDELINES_DIR}/${GUIDELINE_USAGE_FILE}`]
