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
  /**
   * The node's data: text, numbers, lists or maps by key, e.g. role, hp, scores. Its type's fields say how each one
   * shows and what the checks enforce; keys outside them are free-form fields.
   */
  fields: z.record(z.string(), z.unknown()).default({}),
  clock: Clock.optional(),
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

// ---------- fields and tabs ----------

/**
 * How a field shows on a sheet. Values stay plain YAML (text, numbers, lists, maps); the widget only decides how they
 * render and what a valid value looks like:
 * - `text` label: value line (`options` makes it a choice) · `subtitle` italic line under the title · `quote` pull quote
 * - `stat` big number tile, `40` or `{ value: 40, note: "9d6+9" }` · `toggle` yes/no
 * - `meter` current/max, `5`, `"5/9"` or `{ value: 5, max: 9 }`; style bar | ring | dots | boxes | clock
 * - `scores` named numbers `{ str: 10, dex: 14 }`; style grid | bars | radar | dots
 * - `pairs` named values as chips `{ Stealth: 6 }` or "Stealth +6, History 4" · `tags` chips · `list` bullet list
 * - `refs` links to other nodes (ids) · `table` rows of `{ column: value }`
 */
export const WIDGETS = ['text', 'subtitle', 'quote', 'stat', 'toggle', 'meter', 'scores', 'pairs', 'tags', 'list', 'refs', 'table'] as const
export const Widget = z.enum(WIDGETS)
export type Widget = z.infer<typeof Widget>

export const METER_STYLES = ['bar', 'ring', 'dots', 'boxes', 'clock'] as const
export const SCORES_STYLES = ['grid', 'bars', 'radar', 'dots'] as const

/** One field of a type's data: where its value lives (`key`), how it shows, and what the checks enforce. */
export const FieldDef = z
  .object({
    key: z.string().trim().min(1),
    label: z.string().optional(),
    widget: Widget.default('text'),
    /** What goes here, for agents and placeholders. */
    hint: z.string().optional(),
    /** Checks report nodes of the type without a value. */
    required: z.boolean().optional(),
    /** Shown as a chip on the node's canvas card. */
    badge: z.boolean().optional(),
    /** Other names of this field (e.g. older or translated keys), so checks can offer to rename them. */
    aliases: z.array(z.string()).optional(),
    /** text/subtitle/tags: the only allowed values. */
    options: z.array(z.string()).min(1).optional(),
    /** scores/pairs: sub-keys in order; table: columns in order. */
    keys: z.array(z.string()).optional(),
    /** Display labels of sub-keys or columns, e.g. { str: "STR" }. */
    labels: z.record(z.string(), z.string()).optional(),
    /** stat/meter/scores: allowed range; meter and scores bars/dots/radar also use max as the full scale. */
    min: z.number().optional(),
    max: z.number().optional(),
    /** meter: bar | ring | dots | boxes | clock; scores: grid | bars | radar | dots. */
    style: z.string().optional(),
    /** scores: a derived number shown next to each score, floor((score - base) / step), e.g. { base: 10, step: 2 }. */
    modifier: z.object({ base: z.number(), step: z.number().positive() }).optional(),
    /** pairs: show numbers with a sign (+2). Default true. */
    signed: z.boolean().optional(),
    /** meter/scores: accent color (default: the type's color). */
    color: z.string().regex(HEX_COLOR, 'color must be #rrggbb').optional(),
  })
  .superRefine((f, ctx) => {
    const styles: Partial<Record<Widget, readonly string[]>> = { meter: METER_STYLES, scores: SCORES_STYLES }
    const allowed = styles[f.widget]
    if (f.style !== undefined && !allowed?.includes(f.style))
      ctx.addIssue({ code: 'custom', path: ['style'], message: allowed ? `style of ${f.widget} is one of ${allowed.join(', ')}` : `${f.widget} has no styles` })
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) ctx.addIssue({ code: 'custom', path: ['min'], message: 'min is above max' })
  })
export type FieldDef = z.infer<typeof FieldDef>

export const TAB_KINDS = ['prose', 'cards', 'fields'] as const
/** A group of fields inside a fields tab, with an optional heading. */
export const TabSection = z.object({ title: z.string().optional(), fields: z.array(z.string()).min(1) })
export type TabSection = z.infer<typeof TabSection>
/**
 * A tab of a type's sheet. `prose` and `cards` tabs are the body's H1 section `title` (or one of its aliases): prose
 * is edited as markdown, cards render each `###` entry as a card. `fields` tabs show fields with their widgets:
 * `fields` lists them in order, `sections` groups them under headings; with neither, the tab shows every field of
 * the type that no other fields tab lists.
 */
export const TabDef = z.object({
  title: z.string().min(1),
  kind: z.enum(TAB_KINDS).default('prose'),
  aliases: z.array(z.string()).optional(),
  fields: z.array(z.string()).optional(),
  sections: z.array(TabSection).optional(),
})
export type TabDef = z.infer<typeof TabDef>

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
      /** Fields that must have a value. */
      fields: z.array(z.string()).optional(),
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
      /** Text that must appear (regular expression, case-insensitive); checked in `tab` when set. */
      match: z.string().optional(),
    })
    .optional(),
  /**
   * Limit `require.match`, `forbid`, `headings` and `maxWords` to these body tabs (H1 titles or their aliases).
   * Nodes without any of the tabs skip those tests; use `require.tabs` to demand the tab itself.
   */
  tab: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
  /** Text that must not appear (regular expression, case-insensitive): in `tab` when set, else in the body and fields. */
  forbid: z.string().optional(),
  /** Allowed `##` headings (regular expressions, matched against the whole heading, case-insensitive); others are reported. */
  headings: z.array(z.string()).min(1).optional(),
  maxWords: z.number().int().positive().optional(),
})
export type CustomCheck = z.infer<typeof CustomCheck>

/** A field in a type definition: a key (a plain text field) or a full FieldDef, checked when types resolve. */
const FieldEntry = z.union([z.string().trim().min(1), z.record(z.string(), z.unknown())])

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
  /** Another type whose fields (and tabs, unless this type sets its own) this type starts from. */
  extends: z.string().regex(TYPE_ID).optional(),
  /** The type's fields: keys of plain text fields, or FieldDefs. Ones with an inherited key change that field. */
  fields: z.array(FieldEntry).optional(),
  /** Inherited field keys to drop. */
  omit: z.array(z.string()).optional(),
  /** Custom types only: starter body for new nodes. */
  body: z.string().optional(),
  /** The sheet's tabs in order: body sections (prose, cards) and field tabs. */
  tabs: z.array(TabDef).optional(),
  /** Reusable reference text (spells, conditions, glossary entries): cards with the same name link to these nodes. */
  library: z.boolean().optional(),
})
export type TypeDef = z.infer<typeof TypeDef>

/** Settings of built-in types that projects may change. */
export const BUILTIN_TYPE_KEYS = ['label', 'plural', 'color', 'icon', 'extends', 'fields', 'omit', 'tabs', 'library'] as const

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
  /** The type's fields, inheritance applied; invalid entries are left out (see typeProblems). */
  fields: FieldDef[]
  body: string
  tabs: TabDef[]
  /** Reusable reference text; cards link to these nodes by name. */
  library: boolean
}

const titleCase = (s: string) => s.replaceAll('-', ' ').replace(/^./, (c) => c.toUpperCase())
const pluralOf = (s: string) => (/(s|x|ch|sh)$/.test(s) ? `${s}es` : /[^aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : `${s}s`)

/** A type's own look and settings, without inheritance (`projectTypes` applies `extends`). */
export function typeInfo(id: NodeType, def: TypeDef = {}): TypeInfo {
  const own = parseFields(def.fields ?? []).fields
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
      fields: own,
      body: '',
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
    fields: own,
    body: def.body ?? '',
    tabs: def.tabs ?? [],
    library: def.library ?? false,
  }
}

/** Field entries parsed into FieldDefs; invalid ones are left out and described in `problems`. */
export function parseFields(entries: readonly unknown[]): { fields: FieldDef[]; problems: string[] } {
  const fields: FieldDef[] = []
  const problems: string[] = []
  entries.forEach((raw, i) => {
    const parsed = FieldDef.safeParse(typeof raw === 'string' ? { key: raw } : raw)
    if (!parsed.success) {
      const name = raw && typeof raw === 'object' && 'key' in raw ? String((raw as { key: unknown }).key) : `#${i + 1}`
      problems.push(`field ${name}: ${parsed.error.issues.map((x) => `${x.path.join('.') || 'field'}: ${x.message}`).join('; ')}`)
    } else if (fields.some((f) => f.key === parsed.data.key)) problems.push(`field ${parsed.data.key} is listed twice`)
    else fields.push(parsed.data)
  })
  return { fields, problems }
}

/** Fields with a patch applied: entries with an existing key change that field (only the given settings). */
function mergeFields(base: readonly FieldDef[], entries: readonly unknown[], omit: readonly string[] = []): FieldDef[] {
  const out = base.filter((f) => !omit.includes(f.key)).map((f) => ({ ...f }))
  for (const raw of entries) {
    const patch = typeof raw === 'string' ? { key: raw } : (raw as Record<string, unknown>)
    const i = out.findIndex((f) => f.key === patch.key)
    if (i < 0) {
      const parsed = FieldDef.safeParse(patch)
      if (parsed.success) out.push(parsed.data)
      continue
    }
    const parsed = FieldDef.safeParse({ ...out[i], ...patch })
    if (parsed.success) out[i] = parsed.data
  }
  return out
}

/** Every type of a project: built-ins first (in their usual order), then custom types in config order. */
export function projectTypes(config: { types?: Record<string, TypeDef> }): TypeInfo[] {
  const defs = config.types ?? {}
  const ids = [...NODE_TYPES, ...Object.keys(defs).filter((id) => !isBuiltinType(id))]
  const done = new Map<string, TypeInfo>()
  const resolve = (id: string, seen: string[]): TypeInfo => {
    const cached = done.get(id)
    if (cached) return cached
    const def = defs[id] ?? {}
    const info = typeInfo(id, def)
    const parent = def.extends
    if (parent && ids.includes(parent) && !seen.includes(parent)) {
      const base = resolve(parent, [...seen, id])
      info.fields = mergeFields(base.fields, def.fields ?? [], def.omit)
      if (!def.tabs) info.tabs = base.tabs
    } else if (def.omit) info.fields = info.fields.filter((f) => !def.omit!.includes(f.key))
    done.set(id, info)
    return info
  }
  return ids.map((id) => resolve(id, [id]))
}

/** What is wrong with the project's type definitions (bad fields or tabs, unknown or circular extends). */
export function typeProblems(config: { types?: Record<string, TypeDef> }): { type: string; message: string }[] {
  const defs = config.types ?? {}
  const out: { type: string; message: string }[] = []
  const known = new Set([...NODE_TYPES, ...Object.keys(defs)])
  const types = new Map(projectTypes(config).map((t) => [t.id, t]))
  for (const [id, def] of Object.entries(defs)) {
    for (const message of parseFields(def.fields ?? []).problems) out.push({ type: id, message })
    if (def.extends) {
      if (!known.has(def.extends)) out.push({ type: id, message: `extends unknown type "${def.extends}"` })
      const chain = [id]
      for (let at = def.extends; at && known.has(at); at = defs[at]?.extends ?? '') {
        if (chain.includes(at)) {
          out.push({ type: id, message: `extends itself (${[...chain, at].join(' → ')})` })
          break
        }
        chain.push(at)
      }
    }
    const t = types.get(id)
    if (!t) continue
    const keys = new Set(t.fields.map((f) => f.key))
    for (const tab of t.tabs) {
      if (tab.kind !== 'fields' && (tab.fields || tab.sections)) out.push({ type: id, message: `tab ${tab.title}: only fields tabs list fields` })
      const listed = [...(tab.fields ?? []), ...(tab.sections ?? []).flatMap((s) => s.fields)]
      const unknown = listed.filter((k) => !keys.has(k))
      if (unknown.length) out.push({ type: id, message: `tab ${tab.title} lists fields the type does not define: ${unknown.join(', ')}` })
    }
    const titles = t.tabs.map((x) => x.title.toLowerCase())
    const twice = titles.filter((x, i) => titles.indexOf(x) !== i)
    if (twice.length) out.push({ type: id, message: `tab ${twice[0]} is listed twice` })
  }
  return out
}

export const ProjectConfig = z.object({
  name: z.string(),
  kind: ProjectKind.default('mixed'),
  description: z.string().optional(),
  /** Overrides for built-in types and definitions of custom ones, keyed by type id. */
  types: z.record(NodeType, TypeDef).optional(),
  /** No longer used (fields now live on types); kept so checks can point at it. */
  systems: z.unknown().optional(),
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
