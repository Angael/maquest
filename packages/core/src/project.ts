import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter'
import { DEFAULT_GUIDELINES } from './guidelines/defaults'
import { TEMPLATES } from './templates'
import type {
  EdgeType} from './schema';
import {
  ALLOWED_PARENTS,
  Board,
  Clock,
  EDGE_LABEL_MAX,
  MAIN_BOARD,
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
export const MEDIA_DIR = 'media'

export class MaquestError extends Error {}

export type NodeFilter = {
  type?: NodeType | NodeType[]
  parent?: string | null
  tag?: string
  status?: Status
  text?: string
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
  /** Merged into existing fields; empty string removes a field. */
  fields?: Record<string, string>
  /** null removes the clock */
  clock?: Clock | null
  body?: string
  appendBody?: string
}

export type BoardPatch = {
  title?: string
  phases?: Phase[]
  /** Adds nodes to a curated board (placed in `phase` if given, else near the board's other cards). */
  addNodes?: string[]
  removeNodes?: string[]
}


export function slugify(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replaceAll(/[̀-ͯ]/g, '')
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
    const text = filter.text?.toLowerCase()
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
        if (text && !`${n.title}\n${n.summary ?? ''}\n${n.body}\n${Object.values(n.fields).join('\n')}`.toLowerCase().includes(text)) continue
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
      throw new MaquestError(
        `A ${type} cannot be placed under a ${p.type}. Allowed parents: ${allowed?.join(', ') || 'none (top level only)'}`,
      )
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
      if (v === '') delete fields[k]
      else fields[k] = v
    }
    let body = patch.body ?? cur.body
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
    if (type !== cur.type) fs.rmSync(path.join(this.root, oldPath), { force: true })
    return this.requireNode(id)
  }

  children(id: string): StoryNode[] {
    return this.listNodes({ parent: id })
  }

  /** Deletes a node. With `recursive`, deletes all descendants; otherwise children are detached. */
  deleteNode(id: string, opts: { recursive?: boolean } = {}): string[] {
    const n = this.requireNode(id)
    const deleted: string[] = []
    for (const child of this.children(id)) {
      if (opts.recursive) deleted.push(...this.deleteNode(child.id, opts))
      else this.updateNode(child.id, { parent: null })
    }
    fs.rmSync(path.join(this.root, n.path), { force: true })
    deleted.push(id)
    const g = this.graph()
    g.edges = g.edges.filter((e) => e.source !== id && e.target !== id)
    for (const b of g.boards) {
      delete b.layout[id]
      if (b.nodes) b.nodes = b.nodes.filter((n) => n !== id)
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
    return Graph.parse(readJson(path.join(this.root, GRAPH_FILE), {}))
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

  updateEdge(id: string, patch: { type?: EdgeType; label?: string; source?: string; target?: string; sourceHandle?: EdgeHandle; targetHandle?: EdgeHandle }): Edge {
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

  board(id: string = MAIN_BOARD): Board {
    const b = this.graph().boards.find((x) => x.id === id)
    if (!b) throw new MaquestError(`Board not found: ${id}`)
    return b
  }

  /** Saves card positions on a board; on a curated board this also adds the cards to it. */
  setLayout(positions: Record<string, Position>, boardId: string = MAIN_BOARD) {
    const g = this.graph()
    const b = g.boards.find((x) => x.id === boardId)
    if (!b) throw new MaquestError(`Board not found: ${boardId}`)
    Object.assign(b.layout, positions)
    if (b.nodes) for (const id of Object.keys(positions)) if (!b.nodes.includes(id)) b.nodes.push(id)
    this.saveGraph(g)
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
      if (b.nodes && !b.nodes.includes(n)) b.nodes.push(n)
      if (column >= 0 || !b.layout[n]) b.layout[n] = freeSpot(b, column, g.boards.find((x) => x.id === MAIN_BOARD)?.layout[n])
    }
    if (patch.removeNodes?.length) {
      if (!b.nodes) throw new MaquestError('The main board shows every node; remove nodes from curated boards only')
      b.nodes = b.nodes.filter((n) => !patch.removeNodes!.includes(n))
      for (const n of patch.removeNodes) delete b.layout[n]
    }
    this.saveGraph(g)
    return b
  }

  deleteBoard(id: string) {
    if (id === MAIN_BOARD) throw new MaquestError('The main board cannot be deleted')
    const g = this.graph()
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
      ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))
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
    return out.filter(
      (g) =>
        (opts.includeDisabled || !g.disabled) &&
        (!opts.applicableOnly || kind === 'mixed' || g.scope === 'all' || g.scope === kind),
    )
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
    writeAtomic(
      path.join(this.root, GUIDELINES_DIR, `${id}.md`),
      stringifyFrontmatter({ ...next, disabled: next.disabled || undefined }, body.trim() + '\n'),
    )
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
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')).map((f) => `${MEDIA_DIR}/${f}`) : []
  }

  resolve(rel: string): string {
    const abs = path.resolve(this.root, rel)
    if (!abs.startsWith(this.root + path.sep)) throw new MaquestError(`Path escapes project: ${rel}`)
    return abs
  }
}

function checkLabel(label?: string) {
  if (label && label.length > EDGE_LABEL_MAX) {
    throw new MaquestError(`Edge label too long (${label.length} > ${EDGE_LABEL_MAX}). A label names the relationship in a few words ("betrays", "owes a debt to"); put notes and status on the nodes instead.`)
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
 * unsorted strip left of the columns (phase boards) or at its main-board spot.
 */
function freeSpot(b: Board, column: number, fallback?: Position): Position {
  if (column < 0 && fallback && !b.phases.length) return fallback
  const x = column >= 0 ? column * PHASE_WIDTH + 40 : b.phases.length ? -PHASE_WIDTH / 2 : 0
  const below = Object.values(b.layout).filter((p) => Math.floor(p.x / PHASE_WIDTH) === Math.floor(x / PHASE_WIDTH))
  return { x, y: below.length ? Math.max(...below.map((p) => p.y)) + 200 : 0 }
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
const LEGACY_AGENT_DOCS = new Set([`# Maquest project

This folder is a Maquest writing project (stories, chapters, scenes, entities, backlog, node graph).

- Use the **maquest** MCP server tools to read and edit this project. Don't hand-edit files unless the tools can't do it.
- Start with the \`overview\` tool, then read the writing guidelines (\`guidelines\` tool) before making creative changes.
- Be proactive: when the author shares ideas, add them to the project immediately (scenes, entities, links, backlog) and report what changed.
- The author may edit or override guidelines in \`guidelines/\`. Follow project overrides over defaults.
`])

/** Writes .mcp.json (Claude Code & others), .codex/config.toml, .cursor/mcp.json and agent instructions. */
export function writeAgentFiles(root: string, mcp: McpLaunch) {
  const server = { command: mcp.command, args: mcp.args, ...(mcp.env ? { env: mcp.env } : {}) }
  const mcpJson = path.join(root, '.mcp.json')
  const existing = readJson<{ mcpServers?: Record<string, unknown> }>(mcpJson, {})
  writeAtomic(mcpJson, JSON.stringify({ ...existing, mcpServers: { ...existing.mcpServers, maquest: server } }, null, 2) + '\n')
  writeAtomic(path.join(root, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { maquest: server } }, null, 2) + '\n')
  const toml = `[mcp_servers.maquest]\ncommand = ${JSON.stringify(mcp.command)}\nargs = ${JSON.stringify(mcp.args)}\n${
    mcp.env ? `env = { ${Object.entries(mcp.env).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ')} }\n` : ''
  }`
  writeAtomic(path.join(root, '.codex', 'config.toml'), toml)
  const agents = path.join(root, 'AGENTS.md')
  if (!fs.existsSync(agents) || LEGACY_AGENT_DOCS.has(fs.readFileSync(agents, 'utf8'))) writeAtomic(agents, AGENT_DOC)
  if (!fs.existsSync(path.join(root, 'CLAUDE.md'))) writeAtomic(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n')
}
