import { z } from 'zod'

export const NODE_TYPES = ['story', 'chapter', 'scene', 'note', 'character', 'location', 'faction', 'item', 'idea', 'media'] as const
export const NodeType = z.enum(NODE_TYPES)
export type NodeType = z.infer<typeof NodeType>

export const ENTITY_TYPES = ['character', 'location', 'faction', 'item'] as const satisfies readonly NodeType[]
export const STRUCTURE_TYPES = ['story', 'chapter', 'scene'] as const satisfies readonly NodeType[]

/** Folder (relative to project root) each node type is stored in. */
export const TYPE_DIRS: Record<NodeType, string> = {
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

/** A canvas. `nodes` undefined = every node (the main board); otherwise only the listed nodes. */
export const Board = z.object({
  id: z.string(),
  title: z.string(),
  nodes: z.array(z.string()).optional(),
  /** Optional left-to-right columns (acts / phases). A node's phase follows from its x position. */
  phases: z.array(Phase).default([]),
  layout: z.record(z.string(), Position).default({}),
})
export type Board = z.infer<typeof Board>

export const Graph = z
  .object({
    edges: z.array(Edge).default([]),
    boards: z.array(Board).default([]),
    /** Legacy single-board layout, folded into the main board on read. */
    layout: z.record(z.string(), Position).optional(),
  })
  .transform(({ edges, boards, layout }) => {
    if (!boards.some((b) => b.id === MAIN_BOARD)) boards = [{ id: MAIN_BOARD, title: 'Main', phases: [], layout: layout ?? {} }, ...boards]
    return { edges, boards }
  })
export type Graph = z.output<typeof Graph>

export const onBoard = (board: Board, id: string) => !board.nodes || board.nodes.includes(id)

/** Index of the phase column containing x, or -1 outside the columns. */
export function phaseIndex(board: Board, x: number) {
  const i = Math.floor(x / PHASE_WIDTH)
  return board.phases.length && i >= 0 && i < board.phases.length ? i : -1
}

export const PROJECT_KINDS = ['novel', 'screenplay', 'rpg', 'mixed'] as const
export const ProjectKind = z.enum(PROJECT_KINDS)
export type ProjectKind = z.infer<typeof ProjectKind>

export const ProjectConfig = z.object({
  name: z.string(),
  kind: ProjectKind.default('mixed'),
  description: z.string().optional(),
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
}
export type OutlineNode = { id: string; type: NodeType; title: string; status?: Status; summary?: string; children: OutlineNode[] }
