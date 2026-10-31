import { isBuiltinType, type EdgeType, type NodeType } from '@maquest/core/schema'

/** Canvas defaults only: ambiguous pairs stay free links; hierarchy is never inferred. */
export function inferConnectionType(source: NodeType, target: NodeType): EdgeType {
  if (target === 'location' && (source === 'location' || source === 'character' || source === 'item' || source === 'scene' || source === 'chapter'))
    return 'located-at'
  if (source === 'character' && target === 'faction') return 'member-of'
  if ((source === 'character' || source === 'faction') && target === 'item') return 'owns'
  if ((source === 'character' && target === 'character') || (source === 'faction' && target === 'faction')) return 'relationship'
  // Custom types are entities, so scenes involve them like characters.
  const entity = target === 'character' || target === 'faction' || target === 'item' || !isBuiltinType(target)
  if ((source === 'scene' || source === 'chapter') && entity) return 'involves'
  if (source === 'scene' && target === 'scene') return 'leads-to'
  return 'link'
}
