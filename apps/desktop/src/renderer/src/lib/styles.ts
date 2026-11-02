import { useMemo } from 'react'
import { icons, type LucideIcon } from 'lucide-react'
import { projectTypes, typeInfo, type EdgeType, type GroupColor, type NodeType, type Status, type TypeInfo } from '@maquest/core/schema'
import { useConfig } from './queries'

const kebab = (k: string) =>
  k
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase()
const BY_NAME = new Map(Object.entries(icons).map(([k, icon]) => [kebab(k), icon as LucideIcon]))
/** All lucide icon names in kebab-case (as stored in maquest.json). */
export const ICON_NAMES = [...BY_NAME.keys()]
const compact = (s: string) => s.replaceAll('-', '')
const BY_COMPACT = new Map(ICON_NAMES.map((name) => [compact(name), BY_NAME.get(name)!]))

export const iconFor = (name: string): LucideIcon => BY_NAME.get(name) ?? BY_COMPACT.get(compact(name)) ?? icons.Shapes

export type TypeStyle = Omit<TypeInfo, 'icon'> & { icon: LucideIcon; iconName: string }

const styled = (t: TypeInfo): TypeStyle => ({ ...t, icon: iconFor(t.icon), iconName: t.icon })

/** The project's node types with resolved icons; `of` also covers types no longer defined. */
export function useTypes() {
  const { data: config } = useConfig()
  return useMemo(() => {
    const list = projectTypes(config ?? {}).map(styled)
    const map = new Map(list.map((t) => [t.id, t]))
    return { list, of: (id: NodeType): TypeStyle => map.get(id) ?? styled(typeInfo(id)) }
  }, [config])
}

export type EdgeKind = EdgeType | 'contains'

/*
 * Line colors: one quiet family (oklch L 0.72-0.84, C ~0.1) so lines stay distinguishable on bg-app without glowing.
 * leads-to is the brand orange, the story's main thread. Hex, because React Flow derives marker ids from the color.
 */
export const EDGE_STYLE: Record<EdgeKind, { color: string; dash?: string; animated?: boolean; width?: number }> = {
  contains: { color: '#5c5751', dash: '2 4', width: 1 },
  link: { color: '#989189', width: 1.5 },
  'leads-to': { color: '#f88a3d', animated: true, width: 2 },
  'branches-to': { color: '#e7c869', dash: '8 4', animated: true, width: 1.75 },
  parallel: { color: '#6dbddc', dash: '12 4 2 4', width: 1.75 },
  foreshadows: { color: '#bb99e3', dash: '3 3', width: 1.75 },
  involves: { color: '#7da6e3', width: 1.5 },
  'located-at': { color: '#75c59b', width: 1.5 },
  'member-of': { color: '#9e9ce1', width: 1.5 },
  owns: { color: '#e4b572', dash: '6 3', width: 1.5 },
  relationship: { color: '#e28dae', width: 1.75 },
  'clue-for': { color: '#6ccac4', dash: '1 5', width: 2 },
}

/** Group frame colors: border (drawn at low alpha), near-invisible fill, lighter tint for the title. */
export const GROUP_STYLE: Record<GroupColor, { border: string; fill: string; text: string }> = {
  stone: { border: '#8b857f', fill: 'rgb(139 133 127 / 0.05)', text: '#aeaaa5' },
  amber: { border: '#e4ac59', fill: 'rgb(228 172 89 / 0.045)', text: '#f2cf96' },
  emerald: { border: '#6fbe95', fill: 'rgb(111 190 149 / 0.045)', text: '#a9e0c1' },
  sky: { border: '#6bb6d9', fill: 'rgb(107 182 217 / 0.045)', text: '#a7d9f3' },
  violet: { border: '#a390dc', fill: 'rgb(163 144 220 / 0.05)', text: '#c7bbf1' },
  rose: { border: '#df7e86', fill: 'rgb(223 126 134 / 0.045)', text: '#f6aeb3' },
}

/** Status pills on cards: one quiet dot color per stage, idea → done. */
export const STATUS_STYLE: Record<Status, { color: string; label: string }> = {
  idea: { color: '#857f79', label: 'Idea' },
  draft: { color: '#e8be62', label: 'Draft' },
  revised: { color: '#70b4dc', label: 'Revised' },
  done: { color: '#61c594', label: 'Done' },
}
