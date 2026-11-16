import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import transliterate from '@sindresorhus/transliterate'
import { distance } from 'fastest-levenshtein'
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter'
import { DEFAULT_GUIDELINES } from './guidelines/defaults'
import { TEMPLATES } from './templates'
import { arrange, type LayoutMode } from './layout'
import { RULES, runChecks, type CheckReport, type QuickFix } from './checks'
import { isEmptyValue, mergeValues, plainText, propertyRows } from './sheet'
import type { EdgeType } from './schema'
import { MapDoc, applyMapOps, emptyMap, stringifyMap, type MapOp } from './map'
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
  freeSpot as groupSpot,
  groupOf,
  groupSubtree,
  moveGroup,
  settleGroup,
  removeGroup,
  type GroupColor,
  type Rect,
  type Size,
  EDGE_LABEL_MAX,
  Edge,
  EdgeHandle,
  Graph,
  GuidelineScope,
  CustomCheck,
  RuleSetting,
  PHASE_WIDTH,
  Phase,
  NodeMeta,
  ProjectConfig,
  TYPE_DIRS,
  isBuiltinType,
  TYPE_ID,
  projectTypes,
  typeProblems,
  BUILTIN_TYPE_KEYS,
  TypeDef,
  type TypeInfo,
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
/** Scratch notes the author jots down mid-session for the agent to pick up. */
export const LIVE_NOTES_FILE = 'live-notes.md'
export const MEDIA_DIR = 'media'
/** Map documents sit next to their node file: maps/<id>.map.json. */
export const MAP_EXT = '.map.json'

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
    ...Object.entries(n.fields).map(([k, v]): [string, string] => [`field ${k}`, plainText(v)]),
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

/** 1-based line number of a character offset. */
const lineAt = (body: string, offset: number) => body.slice(0, offset).split('\n').length

/** A few numbered lines of `body` around `line`, to show what the text there currently says. */
function excerpt(body: string, line: number, around = 2) {
  const lines = body.split('\n')
  const from = Math.max(1, line - around)
  const to = Math.min(lines.length, line + around)
  return lines
    .slice(from - 1, to)
    .map((l, i) => `  ${from + i}| ${l.length > 160 ? `${l.slice(0, 160)}…` : l}`)
    .join('\n')
}

/**
 * Why an exact edit did not match, with where the closest part of `find` occurs now. Matching stays exact:
 * this only helps the caller resend correct text, it never picks a replacement target itself.
 */
function editMismatch(body: string, find: string, id: string, n: number) {
  const head = `${id}: edit ${n}: text to replace not found: ${JSON.stringify(find.slice(0, 80))}`
  const probes = find
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 8)
  for (let len = Math.min(find.length, 60); len >= 12; len = Math.floor(len / 2)) probes.push(find.trim().slice(0, len))
  for (const probe of probes) {
    const at = body.indexOf(probe)
    if (at < 0) continue
    const line = lineAt(body, at)
    return `${head}. Part of it (${JSON.stringify(probe.slice(0, 40))}) is at body line ${line}; the body there now reads:\n${excerpt(body, line)}\nResend the edit with the exact current text.`
  }
  return `${head}. No part of it occurs in the body (${body.length} chars); re-read the node before editing.`
}

/** Applies exact find-and-replace edits; fails without guessing when a `find` is missing or ambiguous. */
export function applyEdits(body: string, edits: BodyEdit[], id: string) {
  edits.forEach((e, i) => {
    const count = e.find ? body.split(e.find).length - 1 : 0
    if (!count) throw new MaquestError(editMismatch(body, e.find, id, i + 1))
    if (count > 1 && !e.all) {
      const lines: number[] = []
      for (let at = body.indexOf(e.find); at >= 0 && lines.length < 10; at = body.indexOf(e.find, at + 1)) lines.push(lineAt(body, at))
      throw new MaquestError(
        `${id}: edit ${i + 1}: text to replace occurs ${count} times (body lines ${lines.join(', ')}); add more context or set all: true: ${JSON.stringify(e.find.slice(0, 80))}`,
      )
    }
    body = body.replaceAll(e.find, () => e.replace)
  })
  return body
}

/** Up to `max` existing ids that look like `id`: containing it, sharing a word with it, or a few typos away. */
export function suggestIds(id: string, candidates: readonly { id: string; title?: string }[], max = 3): string[] {
  const want = id.toLowerCase()
  const words = new Set(want.split(/[^a-z0-9]+/).filter((w) => w.length >= 3))
  const scored = candidates.flatMap((c) => {
    const slug = c.title ? slugify(c.title) : c.id
    const d = Math.min(distance(want, c.id), distance(want, slug))
    const contains = c.id.includes(want) || want.includes(c.id) || slug.includes(want)
    const shared = c.id.split('-').filter((w) => words.has(w)).length
    const close = d <= Math.max(2, Math.floor(want.length * 0.34))
    return contains || shared || close ? [{ id: c.id, rank: (contains ? 0 : close ? 1 : 2) * 1000 - shared * 10 + d }] : []
  })
  return scored
    .toSorted((a, b) => a.rank - b.rank)
    .slice(0, max)
    .map((x) => x.id)
}

/** "Node not found" with likely ids, and a pointer to the guidelines when the id names one. */
export function nodeNotFoundMessage(id: string, candidates: readonly { id: string; title?: string }[], guidelineIds: readonly string[] = []) {
  const similar = suggestIds(id, candidates)
  return [
    `Node not found: ${id}.`,
    similar.length ? `Did you mean: ${similar.join(', ')}?` : '',
    guidelineIds.includes(id) ? `"${id}" is a writing guideline, not a node: use the guidelines tool (action read or write, id "${id}").` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Why a node may not sit under a parent, naming both. */
export function hierarchyMessage(id: string, type: NodeType, parent: string, parentType: NodeType) {
  const allowed = ALLOWED_PARENTS[type]
  return `${id}: a ${type} cannot be placed under ${parent} (a ${parentType}). Allowed parents for a ${type}: ${allowed?.join(', ') || 'none (top level only)'}`
}

/** Ids are lowercase slugs (letters, digits and dashes). */
export function checkNewId(id: string) {
  if (slugify(id) !== id) throw new MaquestError(`Invalid id "${id}": ids are lowercase slugs; use "${slugify(id)}"`)
  return id
}

/** Thrown when live notes changed since the caller last saw them; carries the current notes. */
export class LiveNotesChangedError extends MaquestError {
  constructor(readonly current: string) {
    super('The live notes changed since you last saw them; nothing was cleared.')
  }
}

export type CreateNodeInput = {
  /** Explicit id for the new node (a slug that must not exist yet); by default it is derived from the title. */
  id?: string
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
  fields?: Record<string, unknown>
  clock?: Clock
  checks?: { off: string[] }
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
  /** Merged into the existing fields (maps one level deep, so { scores: { dex: 16 } } changes one score); null removes. */
  fields?: Record<string, unknown>
  /** null removes the clock */
  clock?: Clock | null
  /** Rules Maquest should not report for this node; null clears. */
  checks?: { off: string[] } | null
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
    const cur = this.config()
    // An undefined name or kind keeps the current one; a bare spread would erase the name and reset the kind.
    const next = ProjectConfig.parse({ ...cur, ...patch, name: patch.name ?? cur.name, kind: patch.kind ?? cur.kind })
    writeAtomic(path.join(this.root, CONFIG_FILE), JSON.stringify(next, null, 2) + '\n')
    return next
  }

  /** Changes check rule settings (null resets a rule to its default) and, when given, replaces the custom checks. */
  setChecks(patch: Record<string, unknown> = {}, custom?: unknown[]) {
    const known = new Set(RULES.map((r) => r.id))
    const checks: Record<string, unknown> = { ...this.config().checks }
    for (const [id, v] of Object.entries(patch)) {
      if (!known.has(id)) throw new MaquestError(`Unknown check rule: ${id}. Rules: ${[...known].join(', ')}`)
      if (v === null) delete checks[id]
      else if (!RuleSetting.safeParse(v).success) throw new MaquestError(`checks.${id}: expected "error", "warn", "info", "off" or [level, { options }]`)
      else checks[id] = v
    }
    if (custom) {
      custom.forEach((c, i) => {
        const parsed = CustomCheck.safeParse(c)
        if (!parsed.success)
          throw new MaquestError(`customChecks[${i}]: ${parsed.error.issues.map((x) => `${x.path.join('.') || 'check'}: ${x.message}`).join('; ')}`)
        if (known.has(parsed.data.id)) throw new MaquestError(`customChecks[${i}]: id ${parsed.data.id} is a built-in rule`)
      })
    }
    return this.updateConfig({
      checks: Object.keys(checks).length ? checks : undefined,
      ...(custom && { customChecks: custom.length ? custom : undefined }),
    })
  }

  // ---------- types ----------

  /** Built-in and custom node types with their effective label, color, icon and folder. */
  types(): TypeInfo[] {
    return projectTypes(this.config())
  }

  type(id: NodeType): TypeInfo {
    const t = this.types().find((x) => x.id === id)
    if (!t)
      throw new MaquestError(
        `Unknown node type: ${id}. Types: ${this.types()
          .map((x) => x.id)
          .join(', ')}`,
      )
    return t
  }

  /**
   * Adds, changes or removes node types. A def is merged into the current one (fields set to null are dropped);
   * null resets a built-in type to its defaults or removes a custom type, which must have no nodes left.
   */
  setTypes(patch: Record<string, Partial<Record<keyof TypeDef, unknown>> | null>): TypeInfo[] {
    const config = this.config()
    const defs: Record<string, TypeDef> = { ...config.types }
    for (const [id, change] of Object.entries(patch)) {
      if (!TYPE_ID.test(id)) throw new MaquestError(`Invalid type id "${id}": use a lowercase slug, e.g. "monster"`)
      if (change === null) {
        if (!isBuiltinType(id) && defs[id]) {
          const count = this.listNodes({ type: id }).length
          if (count) throw new MaquestError(`Type ${id} still has ${count} node${count === 1 ? '' : 's'}; convert or delete them first`)
        }
        delete defs[id]
        continue
      }
      const merged: Record<string, unknown> = { ...defs[id] }
      for (const [k, v] of Object.entries(change)) {
        if (v === null || v === undefined || v === '') delete merged[k]
        else merged[k] = v
      }
      if (isBuiltinType(id) && (merged.dir || merged.body !== undefined)) {
        throw new MaquestError(`Built-in type ${id}: only ${BUILTIN_TYPE_KEYS.join(', ')} can be changed`)
      }
      const parsed = TypeDef.safeParse(merged)
      if (!parsed.success) throw new MaquestError(`types.${id}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'type'}: ${i.message}`).join('; ')}`)
      const def = parsed.data
      if (!isBuiltinType(id) && defs[id]?.dir !== def.dir && defs[id] && this.listNodes({ type: id }).length) {
        throw new MaquestError(`Type ${id} has nodes; its folder cannot change`)
      }
      // An empty override of a built-in is just its defaults; custom types exist through their entry.
      if (Object.keys(def).length || !isBuiltinType(id)) defs[id] = def
      else delete defs[id]
    }
    const problems = typeProblems({ types: defs }).filter((x) => x.type in patch)
    if (problems.length) throw new MaquestError(problems.map((x) => `types.${x.type}: ${x.message}`).join('; '))
    const types = projectTypes({ types: defs })
    const reserved = new Set([GUIDELINES_DIR, MEDIA_DIR])
    for (const t of types) {
      if (reserved.has(t.dir)) throw new MaquestError(`Type ${t.id}: folder "${t.dir}" is reserved`)
      reserved.add(t.dir)
    }
    this.updateConfig({ types: Object.keys(defs).length ? defs : undefined })
    for (const t of types) fs.mkdirSync(path.join(this.root, t.dir), { recursive: true })
    return types
  }

  // ---------- nodes ----------

  private readNodeFile(file: string): StoryNode | null {
    try {
      const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
      const meta = NodeMeta.safeParse({ title: path.basename(file, '.md'), ...legacyMeta(data), id: path.basename(file, '.md') })
      if (!meta.success) return null
      return { ...meta.data, body, path: path.relative(this.root, file) }
    } catch {
      return null
    }
  }

  /** Markdown files in type folders that are not readable nodes (bad frontmatter, wrong type, duplicate ids). */
  unreadableFiles(): { path: string; problem: string }[] {
    const out: { path: string; problem: string }[] = []
    const seen = new Map<string, string>()
    const types = this.types()
    const dirs = new Map<string, string[]>()
    for (const t of types) dirs.set(t.dir, [...(dirs.get(t.dir) ?? []), t.id])
    for (const [folder, ids] of dirs) {
      const dir = path.join(this.root, folder)
      if (!fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md')) continue
        const rel = path.join(folder, f)
        let data: Record<string, unknown>
        try {
          data = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8')).data
        } catch (e) {
          out.push({ path: rel, problem: `frontmatter is not valid YAML (${(e as Error).message.split('\n')[0]})` })
          continue
        }
        const meta = NodeMeta.safeParse({ title: path.basename(f, '.md'), ...legacyMeta(data), id: path.basename(f, '.md') })
        if (!meta.success) {
          out.push({ path: rel, problem: meta.error.issues.map((i) => `${i.path.join('.') || 'frontmatter'}: ${i.message}`).join('; ') })
          continue
        }
        if (!ids.includes(meta.data.type)) {
          out.push({ path: rel, problem: `type "${meta.data.type}" does not belong in ${folder}/ (expected ${ids.join(' or ')})` })
          continue
        }
        const id = meta.data.id
        if (seen.has(id)) out.push({ path: rel, problem: `duplicate id ${id}: ${seen.get(id)} has the same file name` })
        else seen.set(id, rel)
      }
    }
    return out
  }

  /** Runs Maquest checks over the whole project. */
  check(): CheckReport {
    return runChecks({
      nodes: this.listNodes(),
      graph: this.graph(),
      config: this.config(),
      types: this.types(),
      media: this.listMedia(),
      files: this.unreadableFiles(),
    })
  }

  /** Applies a quick fix from a check issue (arrange is async: use planArrange, or await this). */
  applyFix(fix: QuickFix): void | Promise<void> {
    switch (fix.kind) {
      case 'place':
        this.updateBoard(this.board(fix.board).id, { addNodes: [fix.node] })
        return
      case 'remove-edge':
        this.removeEdge(fix.edge)
        return
      case 'remove-card': {
        const g = this.graph()
        const b = this.findBoard(g, fix.board)
        b.nodes = b.nodes?.filter((n) => n !== fix.card)
        delete b.layout[fix.card]
        for (const group of b.groups) group.nodes = group.nodes.filter((n) => n !== fix.card)
        this.saveGraph(g)
        return
      }
      case 'delete-group':
        this.deleteGroup(fix.board, fix.group)
        return
      case 'unlink': {
        const n = this.requireNode(fix.node)
        const re = linkPattern(fix.target)
        const plain = (s: string) => s.replaceAll(re, (_m, alias: string | undefined) => alias?.slice(1) || fix.target)
        const fields = Object.fromEntries(Object.entries(n.fields).map(([k, v]) => [k, typeof v === 'string' ? plain(v) : v]))
        this.updateNode(n.id, { body: plain(n.body), fields, summary: n.summary && plain(n.summary) })
        return
      }
      case 'rename-fields': {
        const n = this.requireNode(fix.node)
        const fields: Record<string, unknown> = {}
        for (const [from, to] of Object.entries(fix.fields)) {
          const v = n.fields[from]
          if (v === undefined || from === to) continue
          if (n.fields[to] === undefined || isEmptyValue(n.fields[to]))
            fields[to] = typeof v === 'string' && /^[+-]?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v
          fields[from] = null
        }
        this.updateNode(n.id, { fields })
        return
      }
      case 'arrange':
        return this.arrangeBoard(fix.board)
    }
  }

  private nodeFile(type: NodeType, id: string, types = this.types()) {
    const t = types.find((x) => x.id === type)
    if (!t) throw new MaquestError(`Unknown node type: ${type}. Types: ${types.map((x) => x.id).join(', ')}`)
    return path.join(this.root, t.dir, `${id}.md`)
  }

  listNodes(filter: NodeFilter = {}): StoryNode[] {
    const all = this.types()
    const wanted = filter.type ? ([] as NodeType[]).concat(filter.type) : null
    const types = wanted ? all.filter((t) => wanted.includes(t.id)) : all
    const terms = filter.text === undefined ? [] : ([] as string[]).concat(filter.text).map((t) => t.toLowerCase())
    const out: StoryNode[] = []
    for (const { id: type, dir: folder } of types) {
      const dir = path.join(this.root, folder)
      if (!fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md')) continue
        const n = this.readNodeFile(path.join(dir, f))
        if (!n || n.type !== type) continue
        if (filter.parent !== undefined && (n.parent ?? null) !== filter.parent) continue
        if (filter.tag && !n.tags.includes(filter.tag)) continue
        if (filter.status && n.status !== filter.status) continue
        if (terms.length) {
          const hay = `${n.title}\n${n.summary ?? ''}\n${n.body}\n${Object.values(n.fields).map(plainText).join('\n')}`.toLowerCase()
          if (!terms.some((t) => hay.includes(t))) continue
        }
        out.push(n)
      }
    }
    return out.toSorted((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.title.localeCompare(b.title))
  }

  getNode(id: string): StoryNode | null {
    for (const { dir } of this.types()) {
      const file = path.join(this.root, dir, `${id}.md`)
      if (fs.existsSync(file)) {
        const n = this.readNodeFile(file)
        if (n) return n
      }
    }
    return null
  }

  requireNode(id: string): StoryNode {
    const n = this.getNode(id)
    if (!n) throw this.nodeNotFound(id)
    return n
  }

  /** A "node not found" error that suggests similar ids and points guideline ids to the guidelines. */
  nodeNotFound(id: string): MaquestError {
    const guidelines = this.guidelines({ includeDisabled: true }).map((g) => g.id)
    return new MaquestError(nodeNotFoundMessage(id, this.listNodes(), guidelines))
  }

  private uniqueId(title: string) {
    const base = slugify(title)
    let id = base
    for (let i = 2; this.getNode(id); i++) id = `${base}-${i}`
    return id
  }

  private checkParent(id: string, type: NodeType, parent?: string) {
    if (!parent) return
    const p = this.requireNode(parent)
    if (!ALLOWED_PARENTS[type]?.includes(p.type)) throw new MaquestError(hierarchyMessage(id, type, parent, p.type))
  }

  private writeNode(n: Omit<StoryNode, 'path'>) {
    const { body, id, ...meta } = n
    writeAtomic(this.nodeFile(n.type, id), stringifyFrontmatter({ ...meta }, body))
  }

  createNode(input: CreateNodeInput): StoryNode {
    const id = input.id === undefined ? this.uniqueId(input.title) : checkNewId(input.id)
    if (input.id !== undefined) {
      const taken = this.getNode(id)
      if (taken) throw new MaquestError(`Node already exists: ${id} (${taken.type} "${taken.title}"). Update it instead, or choose another id.`)
    }
    this.checkParent(id, input.type, input.parent)
    const info = this.type(input.type)
    const tpl =
      input.template === false
        ? undefined
        : info.builtin
          ? TEMPLATES[input.type]
          : { fields: Object.fromEntries(propertyRows(info).flatMap((r) => (r.def.widget === 'text' ? [[r.def.key, '']] : []))), body: info.body }
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
        fields: mergeValues(tpl?.fields ?? {}, input.fields ?? {}),
        clock: input.clock && checkClock(input.clock),
        checks: input.checks?.off.length ? input.checks : undefined,
        created: now,
        updated: now,
      }),
      body:
        input.body ??
        (input.template !== false && info.tabs.some((t) => t.kind !== 'fields')
          ? info.tabs
              .filter((t) => t.kind !== 'fields')
              .map((t) => `# ${t.title}\n`)
              .join('\n')
          : (tpl?.body ?? '')),
    }
    this.writeNode(node)
    if (input.type === 'map' && !fs.existsSync(this.mapPath(id))) this.writeMap(id, emptyMap())
    return this.requireNode(id)
  }

  updateNode(id: string, patch: UpdateNodeInput): StoryNode {
    const cur = this.requireNode(id)
    const type = patch.type ?? cur.type
    if (patch.type) this.type(type)
    const parent = patch.parent === null ? undefined : (patch.parent ?? cur.parent)
    if (parent === id) throw new MaquestError('A node cannot be its own parent')
    this.checkParent(id, type, parent)
    const fields = patch.fields ? mergeValues(cur.fields, patch.fields) : cur.fields
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
      checks: patch.checks === null ? undefined : patch.checks ? (patch.checks.off.length ? patch.checks : undefined) : cur.checks,
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
    const oldMap = path.join(this.root, oldPath.replace(/\.md$/, MAP_EXT))
    if (fs.existsSync(oldMap)) fs.renameSync(oldMap, path.join(this.root, path.dirname(oldPath), `${next}${MAP_EXT}`))
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
    fs.rmSync(path.join(this.root, n.path.replace(/\.md$/, MAP_EXT)), { force: true })
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

  /**
   * Auto-arranges a board the way the canvas "Layout" button does: groups lay out their own content and move
   * as blocks, shrink-wrapped, without overlaps; pinned cards stay put. Card sizes default to CARD_SIZE.
   */
  async arrangeBoard(boardId?: string, mode: LayoutMode = 'smart', sizes?: CardSizes) {
    const plan = await this.planArrange(boardId, mode, sizes)
    this.setLayout(plan.positions, plan.board, { groups: plan.groups, sizes })
  }

  /** The positions and group rectangles `arrangeBoard` would save, without saving them. */
  async planArrange(boardId?: string, mode: LayoutMode = 'smart', sizes?: CardSizes) {
    const b = this.board(boardId)
    const nodes = new Map(this.listNodes().map((n) => [n.id, n]))
    const size = sizeOf(sizes)
    const keys = (b.nodes ?? Object.keys(b.layout)).filter((k) => b.layout[k] && nodes.has(entityOf(k)))
    const cards = keys.map((k) => ({ id: k, position: b.layout[k], size: size(k), pinned: !!nodes.get(entityOf(k))?.pinned }))
    const first = new Map<string, string>()
    for (const k of keys) if (!first.has(entityOf(k))) first.set(entityOf(k), k)
    const edges = this.graph()
      .edges.filter((e) => first.has(e.source) && first.has(e.target))
      .map((e) => ({ source: first.get(e.source)!, target: first.get(e.target)! }))
    const { positions, groups } = await arrange(b, cards, edges, { mode })
    return { board: b.id, positions, groups }
  }

  // ---------- groups ----------

  createGroup(boardId: string, input: GroupInput): Group {
    const g = this.graph()
    const b = this.findBoard(g, boardId)
    const size = sizeOf(input.sizes)
    let id = `g-${randomUUID().slice(0, 6)}`
    while (b.groups.some((x) => x.id === id)) id = `g-${randomUUID().slice(0, 6)}`
    // Without an explicit rectangle, wrap the content where it already sits, unless that would swallow other
    // cards or groups; then start at the first card and pack the content into a grid there.
    const keep = !input.rect && this.canWrapInPlace(g, b, input, size)
    const anchor = (input.nodes ?? []).map((n) => b.layout[n] ?? g.boards.find((x) => x.layout[n])?.layout[n]).find(Boolean)
    const rect =
      input.rect ??
      (anchor && !keep
        ? {
            x: anchor.x - GROUP_PAD,
            y: anchor.y - GROUP_PAD - GROUP_HEADER,
            width: 2 * CARD_SIZE.width + 40 + 2 * GROUP_PAD,
            height: CARD_SIZE.height + 2 * GROUP_PAD + GROUP_HEADER,
          }
        : emptyGroupSpot(b))
    const group = Group.parse({ id, title: input.title, color: input.color, ...rect })
    b.groups.push(group)
    // A new group nests in place: it is placed inside its parent rather than stretching the parent to reach it.
    this.editGroup(g, b, group, {
      parent: input.parent,
      addNodes: input.nodes,
      keepPositions: !!input.rect || keep,
      moveIntoParent: !input.rect && !keep,
      size,
    })
    for (const child of input.groups ?? []) {
      this.groupAction(() => assignGroup(b, child, id, true))
      if (!input.rect && !keep) this.moveInto(b, child, id, size)
    }
    if (!input.rect && (input.nodes?.length || input.groups?.length)) settleGroup(b, id, size)
    fitGroups(b, size)
    this.saveGraph(g)
    return group
  }

  /** Whether the bounding box of a new group's content is free of unrelated cards and groups. */
  private canWrapInPlace(g: Graph, b: Board, input: GroupInput, size: (card: string) => Size) {
    const own = new Set(input.nodes ?? [])
    const ownGroups = new Set((input.groups ?? []).flatMap((x) => [...groupSubtree(b, x)]))
    for (const x of ownGroups) for (const n of b.groups.find((y) => y.id === x)?.nodes ?? []) own.add(n)
    const rects: Rect[] = [
      ...[...(input.nodes ?? [])].map((n) => {
        const at = b.layout[n] ?? g.boards.find((x) => x.layout[n])?.layout[n]
        return at && { ...at, ...size(n) }
      }),
      ...b.groups.filter((x) => (input.groups ?? []).includes(x.id)),
    ].filter((r): r is Rect => !!r)
    if (rects.length !== (input.nodes?.length ?? 0) + (input.groups?.length ?? 0)) return false
    const box = bounds(rects)
    if (!box) return false
    const hit = (r: Rect) => r.x < box.x + box.width && box.x < r.x + r.width && r.y < box.y + box.height && box.y < r.y + r.height
    // Cards already in one group can't be wrapped in place by a group outside it.
    for (const n of input.nodes ?? []) {
      const current = groupOf(b, n)?.id
      if (current && current !== input.parent && !ownGroups.has(current)) return false
    }
    const ancestors = new Set<string>()
    for (let p = input.parent; p && !ancestors.has(p); p = b.groups.find((x) => x.id === p)?.parent) ancestors.add(p)
    if (b.groups.some((x) => !ownGroups.has(x.id) && !ancestors.has(x.id) && hit(x))) return false
    return !(b.nodes ?? []).some((n) => !own.has(n) && b.layout[n] && hit({ ...b.layout[n], ...size(n) }))
  }

  updateGroup(boardId: string, id: string, patch: GroupPatch): Group {
    const g = this.graph()
    const b = this.findBoard(g, boardId)
    const group = b.groups.find((x) => x.id === id || x.title === id)
    if (!group) throw new MaquestError(`Group not found on ${b.id}: ${id}`)
    if (patch.title !== undefined) group.title = patch.title
    if (patch.color !== undefined) group.color = patch.color
    if (patch.rect) Object.assign(group, patch.rect)
    const size = sizeOf(patch.sizes)
    const before = new Set(Object.keys(b.layout).filter((n) => groupOf(b, n)?.id === group.id))
    this.editGroup(g, b, group, { ...patch, moveIntoParent: true, size })
    // Membership or nesting changed: wrap the group (and its ancestors) tightly and push neighbours aside.
    if (patch.parent !== undefined || patch.addNodes?.some((n) => !before.has(n)) || patch.removeNodes?.length) {
      settleGroup(b, group.id, size)
      if (patch.removeNodes?.length) {
        const old = patch.parent === undefined ? group.parent : undefined
        if (old) settleGroup(b, old, size)
      }
    }
    fitGroups(b, size)
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

  private editGroup(
    g: Graph,
    b: Board,
    group: Group,
    patch: Pick<GroupPatch, 'parent' | 'addNodes' | 'removeNodes'> & { keepPositions?: boolean; moveIntoParent?: boolean; size?: (card: string) => Size },
  ) {
    const size = patch.size ?? sizeOf()
    if (patch.parent !== undefined && patch.parent !== (group.parent ?? null)) {
      const from = group.parent
      this.groupAction(() => assignGroup(b, group.id, patch.parent ?? null, true))
      if (patch.moveIntoParent) {
        if (patch.parent) this.moveInto(b, group.id, patch.parent, size)
        else {
          // Out to the top level: next to the outermost group it used to be in.
          let top = b.groups.find((x) => x.id === from)
          while (top?.parent) top = b.groups.find((x) => x.id === top!.parent)
          if (top) moveGroup(b, group.id, top.x + top.width + 40 - group.x, top.y - group.y)
        }
      }
    }
    for (const n of patch.addNodes ?? []) {
      this.requireNode(entityOf(n))
      b.nodes ??= []
      if (!b.nodes.includes(n)) b.nodes.push(n)
      const placed = b.layout[n] ?? g.boards.find((x) => x.layout[n])?.layout[n]
      const already = groupOf(b, n)?.id === group.id
      // Cards already in place keep their spot when the group is being built around them.
      if (!(already && placed)) b.layout[n] = patch.keepPositions && placed ? placed : groupSpot(b, group.id, size(n), size, n)
      assignGroup(b, n, group.id)
    }
    for (const n of patch.removeNodes ?? []) {
      if (!group.nodes.includes(n)) continue
      assignGroup(b, n, group.parent ?? null)
      const at = b.layout[n]
      if (!at) continue
      // Out of the frame, next to it (inside the parent group when there is one).
      b.layout[n] = group.parent ? groupSpot(b, group.parent, size(n), size, n) : { x: group.x + group.width + 40, y: at.y }
    }
  }

  /** Moves a group (with its content) into a free spot of `parent`. */
  private moveInto(b: Board, id: string, parent: string, size: (card: string) => Size) {
    const child = b.groups.find((x) => x.id === id)
    if (!child) return
    const to = groupSpot(b, parent, child, size, id)
    moveGroup(b, id, to.x - child.x, to.y - child.y)
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

  // ---------- live notes ----------

  /** The author's live notes (live-notes.md); empty when there are none. */
  liveNotes(): string {
    try {
      return fs.readFileSync(path.join(this.root, LIVE_NOTES_FILE), 'utf8')
    } catch {
      return ''
    }
  }

  /**
   * Clears the live notes only if they still read `seen` (what the caller last saw, compared trimmed), so notes
   * the author added since are never dropped unseen. Throws LiveNotesChangedError with the current notes otherwise.
   */
  clearLiveNotes(seen: string) {
    const current = this.liveNotes().trim()
    if (!current) return
    if (current !== seen.trim()) throw new LiveNotesChangedError(current)
    this.setLiveNotes('')
  }

  setLiveNotes(text: string) {
    const file = path.join(this.root, LIVE_NOTES_FILE)
    if (!text.trim()) fs.rmSync(file, { force: true })
    else writeAtomic(file, text)
  }

  // ---------- maps ----------

  /** Absolute path of a map node's document (next to its .md file). */
  mapPath(id: string): string {
    const n = this.requireNode(id)
    if (n.type !== 'map') throw new MaquestError(`${id} is a ${n.type}, not a map`)
    return path.join(this.root, n.path.replace(/\.md$/, MAP_EXT))
  }

  /** A map's document; a missing file reads as an empty map. Invalid files throw with the problems. */
  readMap(id: string): MapDoc {
    const file = this.mapPath(id)
    if (!fs.existsSync(file)) return emptyMap()
    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
      throw new MaquestError(`${path.relative(this.root, file)} is not valid JSON: ${(e as Error).message}`)
    }
    const parsed = MapDoc.safeParse(raw)
    if (!parsed.success)
      throw new MaquestError(
        `${path.relative(this.root, file)} is not a valid map: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      )
    return parsed.data
  }

  writeMap(id: string, doc: MapDoc): MapDoc {
    const valid = MapDoc.parse(doc)
    writeAtomic(this.mapPath(id), stringifyMap(valid))
    return valid
  }

  editMap(id: string, ops: MapOp[]): { doc: MapDoc; results: string[] } {
    const r = applyMapOps(this.readMap(id), ops)
    this.writeMap(id, r.doc)
    return r
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

/**
 * Frontmatter of older versions in today's shape: statblock `stats` join the fields (a non-empty field of the same
 * key wins) and the per-node `system` goes away; the next write saves the new shape.
 */
export function legacyMeta(data: Record<string, unknown>): Record<string, unknown> {
  if (!('stats' in data) && !('system' in data)) return data
  const { stats, system: _system, ...rest } = data
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return rest
  const fields = rest.fields && typeof rest.fields === 'object' && !Array.isArray(rest.fields) ? { ...(rest.fields as Record<string, unknown>) } : {}
  for (const [k, v] of Object.entries(stats)) if (fields[k] === undefined || isEmptyValue(fields[k])) fields[k] = v
  return { ...rest, fields }
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
- Keep structured data (numbers, ratings, lists) in \`fields\`, one topic per \`# Heading\` tab, and shared reference text in library nodes; \`overview\` lists each type's fields and tabs. When the author settles what a type's sheet holds, define it on the type (\`project\` tool: \`types.<id>.fields\` and \`tabs\`).
- After a round of changes, run \`overview({ checks: true })\` and fix what you caused. Tell the author what "Maquest detected", never "the linter".
- The checks are yours to tune (\`project\` tool): levels and scope of built-in rules (\`checks\`), and project rules (\`customChecks\`) that require fields, tags, tabs or text, forbid text, allow only certain \`##\` headings or cap words, optionally inside one tab. When the author settles a format rule, add a check for it, not only a guideline.
`

/** Earlier generated versions, replaced automatically when unedited. */
const LEGACY_AGENT_DOCS = new Set([
  `# Maquest project

This folder is a Maquest writing project (stories, chapters, scenes, entities, backlog, node graph).

- Use the **maquest** MCP server tools to read and edit this project. Don't hand-edit files unless the tools can't do it.
- Start with the \`overview\` tool, then read the writing guidelines (\`guidelines\` tool) before making creative changes.
- Be proactive: when the author shares ideas, add them to the project immediately (scenes, entities, links, backlog) and report what changed.
- **You own git.** If the folder isn't a git repository yet, run \`git init\`. Commit after each meaningful change with a short, descriptive message (what changed in the story, not which files). Don't ask before committing; never rewrite or discard history the author made.
- The author may edit or override guidelines in \`guidelines/\`. Follow project overrides over defaults.
- Keep stats in statblocks (\`stats\`), one topic per \`# Heading\` tab, and shared rules text (spells, conditions) in library nodes; \`overview\` lists the systems and tabs.
- After a round of changes, run \`overview({ checks: true })\` and fix what you caused. Tell the author what "Maquest detected", never "the linter".
- The checks are yours to tune (\`project\` tool): levels and scope of built-in rules (\`checks\`), and project rules (\`customChecks\`) that require fields, stats, tags, tabs or text, forbid text, allow only certain \`##\` headings or cap words, optionally inside one tab. When the author settles a format rule, add a check for it, not only a guideline.
`,
  `# Maquest project

This folder is a Maquest writing project (stories, chapters, scenes, entities, backlog, node graph).

- Use the **maquest** MCP server tools to read and edit this project. Don't hand-edit files unless the tools can't do it.
- Start with the \`overview\` tool, then read the writing guidelines (\`guidelines\` tool) before making creative changes.
- Be proactive: when the author shares ideas, add them to the project immediately (scenes, entities, links, backlog) and report what changed.
- **You own git.** If the folder isn't a git repository yet, run \`git init\`. Commit after each meaningful change with a short, descriptive message (what changed in the story, not which files). Don't ask before committing; never rewrite or discard history the author made.
- The author may edit or override guidelines in \`guidelines/\`. Follow project overrides over defaults.
- Keep stats in statblocks (\`stats\`), one topic per \`# Heading\` tab, and shared rules text (spells, conditions) in library nodes; \`overview\` lists the systems and tabs.
- After a round of changes, run \`overview({ checks: true })\` and fix what you caused. Tell the author what "Maquest detected", never "the linter".
`,
  `# Maquest project

This folder is a Maquest writing project (stories, chapters, scenes, entities, backlog, node graph).

- Use the **maquest** MCP server tools to read and edit this project. Don't hand-edit files unless the tools can't do it.
- Start with the \`overview\` tool, then read the writing guidelines (\`guidelines\` tool) before making creative changes.
- Be proactive: when the author shares ideas, add them to the project immediately (scenes, entities, links, backlog) and report what changed.
- **You own git.** If the folder isn't a git repository yet, run \`git init\`. Commit after each meaningful change with a short, descriptive message (what changed in the story, not which files). Don't ask before committing; never rewrite or discard history the author made.
- The author may edit or override guidelines in \`guidelines/\`. Follow project overrides over defaults.
`,
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
