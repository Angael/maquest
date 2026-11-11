import type { FitViewOptions, Node as FlowNode } from '@xyflow/react'
import { Globe, LayoutGrid, Route, type LucideIcon } from 'lucide-react'
import { CARD_SIZE, EDGE_TYPES, type NodeType } from '@maquest/core/schema'
import type { EdgeKind, TypeStyle } from '../../lib/styles'
import type { CardData } from '../StoryCard'
import type { GroupFlowNode } from '../GroupFrame'

export type CardFlowNode = FlowNode<CardData, 'card'>
export type AnyFlowNode = CardFlowNode | GroupFlowNode

export const isCard = (n: FlowNode): n is CardFlowNode => n.type === 'card'

export const cardSize = (n: CardFlowNode) => ({
  width: n.measured?.width ?? (n.data.node.type === 'media' ? 288 : CARD_SIZE.width),
  height: n.measured?.height ?? CARD_SIZE.height,
})

/** Fit-view leaves room for the floating chrome: toolbar and view menu on top, controls on the left. */
export const FIT_VIEW: FitViewOptions = { padding: { top: '72px', left: '64px', right: '32px', bottom: '32px' }, maxZoom: 1 }

export const EDGE_KINDS: EdgeKind[] = ['contains', ...EDGE_TYPES]

/** View presets: which card types and lines each shows. Anything else is a custom view. */
export const VIEW_MODES: { label: string; hint: string; icon: LucideIcon; nodes: (types: readonly TypeStyle[]) => NodeType[]; edges: readonly EdgeKind[] }[] = [
  { label: 'Everything', hint: 'Every card and line', icon: LayoutGrid, nodes: (types) => types.map((t) => t.id), edges: EDGE_KINDS },
  {
    label: 'Story flow',
    hint: 'Stories, chapters, scenes and notes with their plot lines',
    icon: Route,
    nodes: () => ['story', 'chapter', 'scene', 'note'],
    edges: ['contains', 'leads-to', 'branches-to', 'parallel', 'foreshadows'],
  },
  {
    label: 'World',
    hint: 'Characters, places, factions and other entities with their relations',
    icon: Globe,
    nodes: (types) => [...types.filter((t) => t.entity).map((t) => t.id), 'media', 'note'],
    edges: ['link', 'involves', 'located-at', 'member-of', 'owns', 'relationship'],
  },
]

const sameValue = (a: unknown, b: unknown) => {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/**
 * Returns `next` with every item that matches its previous version (by id, comparing fields one level deep) swapped
 * for that previous object, so React Flow and memoized cards and lines skip work for items that did not change.
 */
export function reuseItems<T extends { id: string }>(cache: Map<string, T>, next: T[]): T[] {
  const out = next.map((item) => {
    const prev = cache.get(item.id)
    if (!prev) return item
    const keys = Object.keys(item) as (keyof T)[]
    return keys.length === Object.keys(prev).length && keys.every((k) => sameValue(prev[k], item[k])) ? prev : item
  })
  cache.clear()
  for (const item of out) cache.set(item.id, item)
  return out
}
