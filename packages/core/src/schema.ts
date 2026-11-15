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
  /** Statblock system for this node, overriding its type's (see ProjectConfig.systems). */
  system: z.string().optional(),
  /** Structured statblock values keyed by the system's stat keys (numbers, text, maps, lists). */
  stats: z.record(z.string(), z.unknown()).optional(),
  /** Per-node check settings: rule ids (or "*") Maquest should not report for this node. */
  checks: z.object({ off: z.array(z.string()).default([]) }).optional(),
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

export const TAB_KINDS = ['prose', 'abilities'] as const
/** A body tab: the H1 heading `title` (or one of its aliases) and how its content renders. */
export const TabDef = z.object({
  title: z.string().min(1),
  kind: z.enum(TAB_KINDS).default('prose'),
  aliases: z.array(z.string()).optional(),
})
export type TabDef = z.infer<typeof TabDef>

// ---------- statblocks ----------

/**
 * How one stat renders: `subtitle` (italic line under the title, e.g. "Small humanoid"), `stat` (a key fact tile:
 * AC, HP, Speed), `line` (label: value, e.g. Senses), `scores` (a grid of numbers, optionally with modifiers),
 * `bonuses` (named numbers as chips: saves, skills), `tags` (chips: resistances, traits), `track` (current/max bar).
 */
export const STAT_KINDS = ['subtitle', 'stat', 'line', 'scores', 'bonuses', 'tags', 'track'] as const
export const StatKind = z.enum(STAT_KINDS)
export type StatKind = z.infer<typeof StatKind>
/** Stat keys: letters (any script), digits, dashes and underscores. */
export const STAT_KEY = /^[\p{L}\p{N}_-]+$/u

const StatFields = {
  label: z.string().optional(),
  kind: StatKind.optional(),
  /** scores: the keys in order (e.g. str…cha); bonuses: suggested keys. */
  keys: z.array(z.string()).optional(),
  /** Display labels of sub-keys, e.g. { str: "STR" }. */
  labels: z.record(z.string(), z.string()).optional(),
  /** scores: derived modifier shown next to each score. */
  modifier: z.enum(['d20', 'none']).optional(),
  /** bonuses: show numbers with a sign (+2). Default true. */
  signed: z.boolean().optional(),
  /** track: default maximum when the value has none. */
  max: z.number().optional(),
  required: z.boolean().optional(),
  /** Shown as a chip on the node's canvas card. */
  badge: z.boolean().optional(),
  /** Legacy field names that hold this stat (case-insensitive), so checks can offer to move them. */
  aliases: z.array(z.string()).optional(),
  /** What goes here, for agents and placeholders. */
  hint: z.string().optional(),
}
export const StatDef = z.object({ key: z.string().regex(STAT_KEY), ...StatFields })
export type StatDef = z.infer<typeof StatDef> & { kind: StatKind }

/** A statblock system. `extends` starts from another system; `stats` with an existing key change that stat. */
export const SystemDef = z.object({
  label: z.string().optional(),
  extends: z.string().optional(),
  /** Label of the statblock tab (default "Stats"). */
  tab: z.string().optional(),
  stats: z.array(z.object({ key: z.string().regex(STAT_KEY), ...StatFields })).default([]),
  /** Stat keys of the base system to drop. */
  omit: z.array(z.string()).optional(),
})
export type SystemDef = z.infer<typeof SystemDef>

// ---------- checks ----------

export const SEVERITIES = ['error', 'warn', 'info'] as const
export const Severity = z.enum(SEVERITIES)
export type Severity = z.infer<typeof Severity>
export const RuleLevel = z.enum([...SEVERITIES, 'off'])
export type RuleLevel = z.infer<typeof RuleLevel>
/** A rule's setting in ProjectConfig.checks: a level, or [level, options]. */
export const RuleSetting = z.union([RuleLevel, z.tuple([RuleLevel]), z.tuple([RuleLevel, z.record(z.string(), z.unknown())])])
export type RuleSetting = z.infer<typeof RuleSetting>

/** A declarative project check: nodes it applies to must have everything in `require` and nothing in `forbid`. */
export const CustomCheck = z.object({
  id: z.string().regex(TYPE_ID, 'check ids are lowercase slugs'),
  severity: Severity.default('warn'),
  message: z.string().min(1),
  hint: z.string().optional(),
  types: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  require: z
    .object({
      fields: z.array(z.string()).optional(),
      stats: z.array(z.string()).optional(),
      /** At least one of these tags. */
      tags: z.array(z.string()).optional(),
      summary: z.boolean().optional(),
      body: z.boolean().optional(),
      media: z.boolean().optional(),
      parent: z.boolean().optional(),
      /** A connection of each of these types (either direction). */
      edges: z.array(z.string()).optional(),
      /** Body tabs (H1 headings) that must exist. */
      tabs: z.array(z.string()).optional(),
    })
    .optional(),
  /** Text that must not appear in the body or fields (regular expression, case-insensitive). */
  forbid: z.string().optional(),
  maxWords: z.number().int().positive().optional(),
})
export type CustomCheck = z.infer<typeof CustomCheck>

/** Custom type ids that are rules libraries unless configured otherwise. */
export const LIBRARY_TYPE_IDS = ['spell', 'ability', 'power', 'feat', 'condition', 'talent', 'move', 'technique']

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
  /** Statblock system its nodes use (a preset like "dnd-2024" or one defined in ProjectConfig.systems). */
  system: z.string().optional(),
  /** Body tabs: H1 headings of the body shown as tabs, in this order; `abilities` tabs render as ability cards. */
  tabs: z.array(TabDef).optional(),
  /** Reusable rules text (spells, abilities, conditions): ability cards with the same name link to these nodes. */
  library: z.boolean().optional(),
})
export type TypeDef = z.infer<typeof TypeDef>

/** Settings of built-in types that projects may change. */
export const BUILTIN_TYPE_KEYS = ['label', 'plural', 'color', 'icon', 'system', 'tabs', 'library'] as const

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
  system?: string
  tabs: TabDef[]
  /** Reusable rules text; ability cards link to these nodes by name. */
  library: boolean
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
      system: def.system,
      tabs: def.tabs ?? [],
      library: def.library ?? false,
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
    system: def.system,
    tabs: def.tabs ?? [],
    library: def.library ?? LIBRARY_TYPE_IDS.includes(id),
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
  /**
   * Statblock systems by id, adding to or overriding the presets (see sheet.ts). Kept raw here so one bad entry
   * never makes the whole config unreadable; checks report invalid entries.
   */
  systems: z.record(z.string(), z.unknown()).optional(),
  /** Check rules: rule id → "error" | "warn" | "info" | "off", or [severity, options]. Validated by the checks. */
  checks: z.record(z.string(), z.unknown()).optional(),
  /** Project-defined declarative checks (see CustomCheck). */
  customChecks: z.array(z.unknown()).optional(),
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

// ---------- tidying (used after programmatic group edits, e.g. from agents) ----------

const TIDY_GAP = 40
const TIDY_MAX_COLUMNS = 3

const intersects = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap

/** Rectangles of a group's direct content: its cards and subgroups. */
function directContent(board: Board, id: string, size: (card: string) => Size, skip?: string): Rect[] {
  const group = board.groups.find((g) => g.id === id)
  if (!group) return []
  return [
    ...group.nodes.filter((n) => n !== skip && board.layout[n]).map((n) => ({ ...board.layout[n], ...size(n) })),
    ...board.groups.filter((g) => g.parent === id && g.id !== skip),
  ]
}

/**
 * The first free cell, in reading order, of a grid inside the group (at most three columns), for an item of
 * `item` size. Fills gaps before growing the group downwards. `skip` is the item being placed.
 */
export function freeSpot(board: Board, id: string, item: Size, size: (card: string) => Size = () => CARD_SIZE, skip?: string): Position {
  const group = board.groups.find((g) => g.id === id)
  if (!group) throw new Error(`Group not found: ${id}`)
  const taken = directContent(board, id, size, skip)
  const origin = { x: group.x + GROUP_PAD, y: group.y + GROUP_HEADER + GROUP_PAD }
  const cellW = Math.max(item.width, CARD_SIZE.width) + TIDY_GAP
  const cellH = item.height + TIDY_GAP
  const columns = Math.max(1, Math.min(TIDY_MAX_COLUMNS, Math.floor((group.width - 2 * GROUP_PAD + TIDY_GAP) / cellW)))
  // Only the size matters: `item` may be a whole group, whose own x/y must not override the candidate cell.
  const { width, height } = item
  // Below all existing content every cell is free, so this always terminates; the bound is a safety net.
  const bottom = Math.max(origin.y, ...taken.map((r) => r.y + r.height))
  const rows = Math.ceil((bottom - origin.y) / cellH) + 2
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const at = { x: origin.x + col * cellW, y: origin.y + row * cellH }
      if (!taken.some((r) => intersects(r, { ...at, width, height }, TIDY_GAP / 2))) return at
    }
  return { x: origin.x, y: bottom + TIDY_GAP }
}

/** Moves a group together with its cards and nested groups. */
export function moveGroup(board: Board, id: string, dx: number, dy: number) {
  const ids = groupSubtree(board, id)
  for (const g of board.groups)
    if (ids.has(g.id)) {
      g.x += dx
      g.y += dy
      for (const n of g.nodes) {
        const p = board.layout[n]
        if (p) board.layout[n] = { x: p.x + dx, y: p.y + dy }
      }
    }
}

/** Shrinks (or grows) a group to wrap its content exactly; empty groups keep their rectangle. */
export function wrapGroup(board: Board, id: string, size: (card: string) => Size = () => CARD_SIZE) {
  const group = board.groups.find((g) => g.id === id)
  const content = groupContent(board, id, size)
  if (group && content) Object.assign(group, content)
}

type BoardItem = { group: string } | { card: string }
const sameItem = (a: BoardItem, b: BoardItem) => ('group' in a ? 'group' in b && a.group === b.group : 'card' in b && a.card === b.card)

/**
 * Pushes siblings of an item (same parent group, or top level) out of its way: overlapping groups and loose
 * cards move right of it, and whatever they then overlap moves too. Returns whether anything moved.
 */
export function separate(board: Board, item: { group: string } | { card: string }, size: (card: string) => Size = () => CARD_SIZE): boolean {
  const parentOf = (it: { group: string } | { card: string }) =>
    'group' in it ? board.groups.find((g) => g.id === it.group)?.parent : groupOf(board, it.card)?.id
  const rectOf = (it: { group: string } | { card: string }): Rect | undefined =>
    'group' in it ? board.groups.find((g) => g.id === it.group) : board.layout[it.card] && { ...board.layout[it.card], ...size(it.card) }
  const level = parentOf(item)
  const siblings = (): ({ group: string } | { card: string })[] => [
    ...board.groups.filter((g) => g.parent === level).map((g) => ({ group: g.id })),
    ...(level ? (board.groups.find((g) => g.id === level)?.nodes ?? []) : (board.nodes ?? Object.keys(board.layout)).filter((n) => !groupOf(board, n)))
      .filter((n) => board.layout[n])
      .map((n) => ({ card: n })),
  ]
  let moved = false
  const queue = [item]
  for (let guard = 0; queue.length && guard < 500; guard++) {
    const current = queue.shift()!
    const r = rectOf(current)
    if (!r) continue
    for (const other of siblings()) {
      if (sameItem(other, current)) continue
      const o = rectOf(other)
      if (!o || !intersects(r, o, TIDY_GAP / 2 - 1)) continue
      const dx = r.x + r.width + TIDY_GAP - o.x
      if ('group' in other) moveGroup(board, other.group, dx, 0)
      else board.layout[other.card] = { x: o.x + dx, y: o.y }
      moved = true
      queue.push(other)
    }
  }
  return moved
}

/**
 * After a group's membership or nesting changed: wrap it tightly, push its siblings out of the way, and repeat
 * for each enclosing group so ancestors fit their content without overlapping their own siblings.
 */
export function settleGroup(board: Board, id: string, size: (card: string) => Size = () => CARD_SIZE) {
  const seen = new Set<string>()
  for (let current: string | undefined = id; current && !seen.has(current); current = board.groups.find((g) => g.id === current)?.parent) {
    seen.add(current)
    wrapGroup(board, current, size)
    separate(board, { group: current }, size)
  }
  fitGroups(board, size)
}

/** Groups overlapping a sibling group or a sibling loose card (e.g. "Town overlaps Castle"). */
export function overlapWarnings(board: Board, size: (card: string) => Size = () => CARD_SIZE): string[] {
  const out: string[] = []
  const levels = new Set<string | undefined>(board.groups.map((g) => g.parent))
  for (const level of levels) {
    const groups = board.groups.filter((g) => g.parent === level)
    const cards = (level ? (board.groups.find((g) => g.id === level)?.nodes ?? []) : (board.nodes ?? []).filter((n) => !groupOf(board, n))).filter(
      (n) => board.layout[n],
    )
    for (const [i, a] of groups.entries()) {
      for (const b of groups.slice(i + 1)) if (intersects(a, b)) out.push(`group "${a.title}" overlaps group "${b.title}"`)
      for (const n of cards) if (intersects(a, { ...board.layout[n], ...size(n) })) out.push(`group "${a.title}" covers card ${n}, which is not in it`)
    }
  }
  return out
}

/** Groups much larger than their content (e.g. left behind after cards moved out). */
export function sparseGroups(board: Board, size: (card: string) => Size = () => CARD_SIZE): Group[] {
  return board.groups.filter((g) => {
    const content = groupContent(board, g.id, size)
    return content && g.width * g.height > 3 * content.width * content.height && g.width * g.height > 4 * CARD_SIZE.width * CARD_SIZE.height
  })
}
