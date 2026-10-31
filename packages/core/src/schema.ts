import { z } from 'zod'

/** Built-in node types. Projects can add their own entity types (see `ProjectConfig.types`). */
export const NODE_TYPES = ['story', 'chapter', 'scene', 'note', 'character', 'location', 'faction', 'item', 'idea', 'media'] as const
export type BuiltinType = (typeof NODE_TYPES)[number]
export const TYPE_ID = /^[a-z][a-z0-9-]*$/
/** A built-in or project-defined type id (lowercase slug). */
export const NodeType = z.string().regex(TYPE_ID, 'type ids are lowercase slugs, e.g. "monster"')
export type NodeType = string
export const isBuiltinType = (t: string): t is BuiltinType => (NODE_TYPES as readonly string[]).includes(t)

export const ENTITY_TYPES = ['character', 'location', 'faction', 'item'] as const satisfies readonly BuiltinType[]
export const STRUCTURE_TYPES = ['story', 'chapter', 'scene'] as const satisfies readonly BuiltinType[]

/** Folder (relative to project root) each built-in node type is stored in. */
export const TYPE_DIRS: Record<BuiltinType, string> = {
  story: 'stories',
  chapter: 'chapters',
  scene: 'scenes',
  note: 'notes',
  character: 'characters',
  location: 'locations',
  faction: 'factions',
  item: 'items',
  idea: 'backlog',
  media: 'media-nodes',
}

/** Which parent types a node type may have (empty = top level only). */
export const ALLOWED_PARENTS: Partial<Record<NodeType, NodeType[]>> = {
  chapter: ['story'],
  scene: ['chapter'],
  note: ['story', 'chapter', 'scene'],
}

export const Status = z.enum(['idea', 'draft', 'revised', 'done'])
export type Status = z.infer<typeof Status>

/** Progress clock (fronts, threats, countdowns): `filled` of `size` segments, optional text per segment. */
export const Clock = z.object({
  size: z.number().int().min(2).max(12),
  filled: z.number().int().min(0).default(0),
  steps: z.array(z.string()).default([]),
})
export type Clock = z.infer<typeof Clock>

export const NodeMeta = z.object({
  id: z.string(),
  type: NodeType,
  title: z.string(),
  parent: z.string().optional(),
  order: z.number().optional(),
  status: Status.optional(),
  pinned: z.boolean().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** Media files (paths relative to project root, e.g. media/map.png) attached to this node. */
  media: z.array(z.string()).default([]),
  /** For `media` nodes: the file shown on the canvas. */
  src: z.string().optional(),
  /** Free-form typed fields, e.g. role/goal for characters. */
  fields: z.record(z.string(), z.string()).default({}),
  clock: Clock.optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
})
export type NodeMeta = z.infer<typeof NodeMeta>

export type StoryNode = NodeMeta & { body: string; path: string }

export const EDGE_TYPES = [
  'link',
  'leads-to',
  'branches-to',
  'parallel',
  'foreshadows',
  'involves',
  'located-at',
  'member-of',
  'owns',
  'relationship',
  'clue-for',
] as const
export const EdgeType = z.enum(EDGE_TYPES)
export type EdgeType = z.infer<typeof EdgeType>

export const EDGE_DESCRIPTIONS: Record<EdgeType, string> = {
  link: 'Free association between any two nodes',
  'leads-to': 'Narrative flow: source happens, then target',
  'branches-to': 'Alternative path / player choice',
  parallel: 'Happens at the same time in another thread',
  foreshadows: 'Source sets up, target pays off',
  involves: 'Scene/chapter involves an entity',
  'located-at': 'Takes place at / is found at a location',
  'member-of': 'Character belongs to a faction',
  owns: 'Character/faction possesses an item or location',
  relationship: 'Relationship between characters/factions (describe it in the label)',
  'clue-for': 'Source holds a clue pointing to the target (three-clue rule: every important target needs 3+)',
}

/** "Who/where/what" references; the canvas shows them as chips on the source card instead of lines. */
export const REFERENCE_EDGE_TYPES = ['involves', 'located-at', 'member-of', 'owns'] as const satisfies readonly EdgeType[]
export const isReferenceEdge = (t: EdgeType) => (REFERENCE_EDGE_TYPES as readonly EdgeType[]).includes(t)

/** Edge labels name the relationship in a few words; notes and status belong on nodes. */
export const EDGE_LABEL_MAX = 48

/** Soft limit: summaries are one line on cards; longer detail belongs in the body. */
export const SUMMARY_MAX = 160

/** Advisory notes about a node's title/summary (never blocks a write). */
export function textWarnings(n: { title?: string; summary?: string }): string[] {
  const out: string[] = []
  if (n.title && /(…|\.\.\.)\s*$/.test(n.title)) out.push('title ends with "…"; use a short complete phrase')
  if (n.summary && n.summary.length > SUMMARY_MAX)
    out.push(`summary is ${n.summary.length} chars; keep it one sentence under ${SUMMARY_MAX} and move detail to body`)
  return out
}

/** Incoming clue-for count per target node (only nodes with at least one clue). */
export function clueCounts(edges: readonly Edge[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of edges) if (e.type === 'clue-for') out.set(e.target, (out.get(e.target) ?? 0) + 1)
  return out
}
export const EdgeHandle = z.enum(['top', 'right', 'bottom', 'left'])
export type EdgeHandle = z.infer<typeof EdgeHandle>

export const Edge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: EdgeType.default('link'),
  label: z.string().optional(),
  sourceHandle: EdgeHandle.optional(),
  targetHandle: EdgeHandle.optional(),
})
export type Edge = z.infer<typeof Edge>

export const Position = z.object({ x: z.number(), y: z.number() })
export type Position = z.infer<typeof Position>

/** Width of one phase column on a board; phase i spans x ∈ [i·W, (i+1)·W). */
export const PHASE_WIDTH = 560
export const Phase = z.object({ id: z.string(), title: z.string() })
export type Phase = z.infer<typeof Phase>

export const MAIN_BOARD = 'main'
/** Id of the built-in read-only canvas that always shows every node (never stored in graph.json). */
export const ALL_BOARD = '@all'

export const GROUP_COLORS = ['stone', 'amber', 'emerald', 'sky', 'violet', 'rose'] as const
export const GroupColor = z.enum(GROUP_COLORS)
export type GroupColor = z.infer<typeof GroupColor>

/**
 * A bordered area on a board (room, city, chapter…). Cards listed in `nodes` and groups whose `parent` is this
 * group always sit inside its rectangle; the rectangle grows to fit them.
 */
export const Group = z.object({
  id: z.string(),
  title: z.string(),
  color: GroupColor.default('stone'),
  parent: z.string().optional(),
  nodes: z.array(z.string()).default([]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type Group = z.infer<typeof Group>
export type Rect = { x: number; y: number; width: number; height: number }
export type Size = { width: number; height: number }

/** Inner padding of a group and the height of its title bar. */
export const GROUP_PAD = 24
export const GROUP_HEADER = 36
/** Card size assumed where the real (rendered) size is unknown. */
export const CARD_SIZE: Size = { width: 256, height: 180 }

/** A canvas showing the listed nodes. `nodes` undefined only in legacy files, where it meant every node (read as such). */
export const Board = z.object({
  id: z.string(),
  title: z.string(),
  nodes: z.array(z.string()).optional(),
  /** Optional left-to-right columns (acts / phases). A node's phase follows from its x position. */
  phases: z.array(Phase).default([]),
  layout: z.record(z.string(), Position).default({}),
  groups: z.array(Group).default([]),
})
export type Board = z.infer<typeof Board>

export const Graph = z
  .object({
    edges: z.array(Edge).default([]),
    boards: z.array(Board).default([]),
    /** Legacy single-board layout, folded into a starting board on read. */
    layout: z.record(z.string(), Position).optional(),
  })
  .transform(({ edges, boards, layout }) => {
    // A legacy layout showed every node; a fresh project starts with one empty board.
    if (!boards.length) boards = [{ id: MAIN_BOARD, title: 'Main', nodes: layout ? undefined : [], phases: [], layout: layout ?? {}, groups: [] }]
    return { edges, boards }
  })
export type Graph = z.output<typeof Graph>

/**
 * Board cards are keyed by node id; further references to the same node on one board get `id~n` keys.
 * Layout, groups and `nodes` all use these keys.
 */
export const REF_SEP = '~'
export const entityOf = (key: string) => key.split(REF_SEP)[0]
/** Every card on the board that shows node `id`. */
export const refsOf = (board: Board, id: string) => (board.nodes ?? []).filter((key) => entityOf(key) === id)
export const onBoard = (board: Board, id: string) => !!board.nodes?.some((key) => entityOf(key) === id)
/** A key for one more card of node `id` on the board: the id itself when it has none yet. */
export function freeRefKey(board: Board, id: string, taken: ReadonlySet<string> = new Set()) {
  const used = new Set([...(board.nodes ?? []), ...taken])
  if (!used.has(id)) return id
  let i = 2
  while (used.has(`${id}${REF_SEP}${i}`)) i++
  return `${id}${REF_SEP}${i}`
}

/** Index of the phase column containing x, or -1 outside the columns. */
export function phaseIndex(board: Board, x: number) {
  const i = Math.floor(x / PHASE_WIDTH)
  return board.phases.length && i >= 0 && i < board.phases.length ? i : -1
}

/** The group a card (or, with `group`, a group) directly belongs to. */
export function groupOf(board: Board, id: string, group = false): Group | undefined {
  if (group) {
    const parent = board.groups.find((g) => g.id === id)?.parent
    return board.groups.find((g) => g.id === parent)
  }
  return board.groups.find((g) => g.nodes.includes(id))
}

/** Ids of the group and every group nested in it. */
export function groupSubtree(board: Board, id: string): Set<string> {
  const ids = new Set([id])
  for (let grew = true; grew;) {
    grew = false
    for (const g of board.groups)
      if (g.parent && ids.has(g.parent) && !ids.has(g.id)) {
        ids.add(g.id)
        grew = true
      }
  }
  return ids
}

export function groupDepth(board: Board, id: string): number {
  let depth = 0
  const seen = new Set<string>()
  for (let g = board.groups.find((x) => x.id === id); g?.parent && !seen.has(g.parent); g = board.groups.find((x) => x.id === g!.parent)) {
    seen.add(g.parent)
    depth++
  }
  return depth
}

/** Bounding box of rectangles, or null for none. */
export function bounds(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y }
}

/** The smallest rectangle a group may have: its cards and subgroups plus padding and title bar. */
export function groupContent(board: Board, id: string, size: (card: string) => Size = () => CARD_SIZE): Rect | null {
  const group = board.groups.find((g) => g.id === id)
  if (!group) return null
  const rects: Rect[] = group.nodes.filter((n) => board.layout[n]).map((n) => ({ ...board.layout[n], ...size(n) }))
  for (const child of board.groups) if (child.parent === id) rects.push(child)
  const box = bounds(rects)
  return (
    box && { x: box.x - GROUP_PAD, y: box.y - GROUP_PAD - GROUP_HEADER, width: box.width + 2 * GROUP_PAD, height: box.height + 2 * GROUP_PAD + GROUP_HEADER }
  )
}

/** Grows every group (innermost first) until it contains its content. Mutates and returns the board. */
export function fitGroups(board: Board, size?: (card: string) => Size): Board {
  const order = board.groups.toSorted((a, b) => groupDepth(board, b.id) - groupDepth(board, a.id))
  for (const g of order) {
    const content = groupContent(board, g.id, size)
    if (!content) continue
    const box = bounds([g, content])!
    Object.assign(g, box)
  }
  return board
}

/** Innermost group whose rectangle contains the point, skipping `exclude` (e.g. a dragged group's subtree). */
export function groupAt(board: Board, point: Position, exclude: ReadonlySet<string> = new Set()): Group | undefined {
  return board.groups
    .filter((g) => !exclude.has(g.id) && point.x >= g.x && point.x <= g.x + g.width && point.y >= g.y && point.y <= g.y + g.height)
    .toSorted((a, b) => groupDepth(board, b.id) - groupDepth(board, a.id) || a.width * a.height - b.width * b.height)[0]
}

/**
 * Moves a card (or group, with `group`) into `target` (null = top level). Groups can't move into themselves
 * or their own subgroups.
 */
export function assignGroup(board: Board, id: string, target: string | null, group = false) {
  if (target && !board.groups.some((g) => g.id === target)) throw new Error(`Group not found: ${target}`)
  if (group) {
    const g = board.groups.find((x) => x.id === id)
    if (!g) throw new Error(`Group not found: ${id}`)
    if (target && groupSubtree(board, id).has(target)) throw new Error('A group cannot be placed inside itself')
    if (target) g.parent = target
    else delete g.parent
    return
  }
  for (const g of board.groups) if (g.nodes.includes(id)) g.nodes = g.nodes.filter((n) => n !== id)
  if (target) board.groups.find((g) => g.id === target)!.nodes.push(id)
}

/** Removes a group; its cards and subgroups move up to its parent. */
export function removeGroup(board: Board, id: string) {
  const g = board.groups.find((x) => x.id === id)
  if (!g) throw new Error(`Group not found: ${id}`)
  const parent = board.groups.find((x) => x.id === g.parent)
  if (parent) parent.nodes.push(...g.nodes)
  for (const child of board.groups) if (child.parent === id) child.parent = g.parent
  board.groups = board.groups.filter((x) => x.id !== id)
}

export const PROJECT_KINDS = ['novel', 'screenplay', 'rpg', 'mixed'] as const
export const ProjectKind = z.enum(PROJECT_KINDS)
export type ProjectKind = z.infer<typeof ProjectKind>

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Look of a node type: built-in defaults; projects may override any of these and add their own types. */
export const TypeDef = z.object({
  label: z.string().min(1).optional(),
  plural: z.string().min(1).optional(),
  color: z.string().regex(HEX_COLOR, 'color must be #rrggbb').optional(),
  /** Lucide icon name in kebab-case, e.g. "skull". */
  icon: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'icon must be a kebab-case lucide icon name')
    .optional(),
  /** Custom types only: folder the nodes live in (default: the plural of the id). */
  dir: z.string().regex(TYPE_ID).optional(),
  /** Custom types only: starter fields for new nodes. */
  fields: z.array(z.string().min(1)).optional(),
  /** Custom types only: starter body for new nodes. */
  body: z.string().optional(),
})
export type TypeDef = z.infer<typeof TypeDef>

export const BUILTIN_TYPE_DEFS: Record<BuiltinType, { label: string; plural: string; color: string; icon: string }> = {
  story: { label: 'Story', plural: 'Stories', icon: 'book-open', color: '#f59e0b' },
  chapter: { label: 'Chapter', plural: 'Chapters', icon: 'flag', color: '#f97316' },
  scene: { label: 'Scene', plural: 'Scenes', icon: 'clapperboard', color: '#ef4444' },
  note: { label: 'Note', plural: 'Notes', icon: 'file-text', color: '#a8a29e' },
  character: { label: 'Character', plural: 'Characters', icon: 'user', color: '#3b82f6' },
  location: { label: 'Location', plural: 'Locations', icon: 'map-pin', color: '#10b981' },
  faction: { label: 'Faction', plural: 'Factions', icon: 'castle', color: '#8b5cf6' },
  item: { label: 'Item', plural: 'Items', icon: 'box', color: '#eab308' },
  idea: { label: 'Idea', plural: 'Backlog', icon: 'lightbulb', color: '#ec4899' },
  media: { label: 'Media', plural: 'Media', icon: 'film', color: '#06b6d4' },
}

/** A node type as the project sees it: built-in defaults merged with overrides, or a custom type. */
export type TypeInfo = {
  id: NodeType
  label: string
  plural: string
  color: string
  icon: string
  dir: string
  builtin: boolean
  /** Character-like things referenced from scenes (all custom types are entities). */
  entity: boolean
  fields: string[]
  body: string
}

const titleCase = (s: string) => s.replaceAll('-', ' ').replace(/^./, (c) => c.toUpperCase())
const pluralOf = (s: string) => (/(s|x|ch|sh)$/.test(s) ? `${s}es` : /[^aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : `${s}s`)

export function typeInfo(id: NodeType, def: TypeDef = {}): TypeInfo {
  if (isBuiltinType(id)) {
    const base = BUILTIN_TYPE_DEFS[id]
    return {
      id,
      label: def.label ?? base.label,
      plural: def.plural ?? base.plural,
      color: def.color ?? base.color,
      icon: def.icon ?? base.icon,
      dir: TYPE_DIRS[id],
      builtin: true,
      entity: (ENTITY_TYPES as readonly string[]).includes(id),
      fields: [],
      body: '',
    }
  }
  const label = def.label ?? titleCase(id)
  return {
    id,
    label,
    plural: def.plural ?? pluralOf(label),
    color: def.color ?? '#94a3b8',
    icon: def.icon ?? 'shapes',
    dir: def.dir ?? pluralOf(id),
    builtin: false,
    entity: true,
    fields: def.fields ?? [],
    body: def.body ?? '',
  }
}

/** Every type of a project: built-ins first (in their usual order), then custom types in config order. */
export function projectTypes(config: { types?: Record<string, TypeDef> }): TypeInfo[] {
  const defs = config.types ?? {}
  return [...NODE_TYPES, ...Object.keys(defs).filter((id) => !isBuiltinType(id))].map((id) => typeInfo(id, defs[id]))
}

export const ProjectConfig = z.object({
  name: z.string(),
  kind: ProjectKind.default('mixed'),
  description: z.string().optional(),
  /** Overrides for built-in types and definitions of custom ones, keyed by type id. */
  types: z.record(NodeType, TypeDef).optional(),
  version: z.literal(1).default(1),
})
export type ProjectConfig = z.infer<typeof ProjectConfig>

export const GuidelineScope = z.enum(['all', 'novel', 'screenplay', 'rpg'])
export type GuidelineScope = z.infer<typeof GuidelineScope>

export type Guideline = {
  id: string
  title: string
  scope: GuidelineScope
  body: string
  disabled?: boolean
  source: 'default' | 'override' | 'custom'
  /** How often agents read/wrote it via MCP (guidelines/usage.json). */
  reads?: number
  writes?: number
}
export type OutlineNode = { id: string; type: NodeType; title: string; status?: Status; summary?: string; children: OutlineNode[] }
