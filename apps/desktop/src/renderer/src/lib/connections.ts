import type { EdgeType, NodeType } from '@maquest/core/schema'

/** Canvas defaults only: ambiguous pairs stay free links; hierarchy is never inferred. */
export function inferConnectionType(source: NodeType, target: NodeType): EdgeType {
  if (target === 'location' && (source === 'location' || source === 'character' || source === 'item' || source === 'scene' || source === 'chapter')) return 'located-at'
  if (source === 'character' && target === 'faction') return 'member-of'
  if ((source === 'character' || source === 'faction') && target === 'item') return 'owns'
  if ((source === 'character' && target === 'character') || (source === 'faction' && target === 'faction')) return 'relationship'
  if ((source === 'scene' || source === 'chapter') && (target === 'character' || target === 'faction' || target === 'item')) return 'involves'
  if (source === 'scene' && target === 'scene') return 'leads-to'
  return 'link'
}
