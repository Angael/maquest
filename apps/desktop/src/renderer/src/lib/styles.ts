import { useMemo } from 'react'
import { icons, type LucideIcon } from 'lucide-react'
import { projectTypes, typeInfo, type EdgeType, type NodeType, type TypeInfo } from '@maquest/core/schema'
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

export const EDGE_STYLE: Record<EdgeKind, { color: string; dash?: string; animated?: boolean; width?: number }> = {
  contains: { color: '#57534e', dash: '2 4', width: 1 },
  link: { color: '#a8a29e', width: 1.5 },
  'leads-to': { color: '#f97316', animated: true, width: 2.5 },
  'branches-to': { color: '#facc15', dash: '8 4', animated: true, width: 2 },
  parallel: { color: '#38bdf8', dash: '12 4 2 4', width: 2 },
  foreshadows: { color: '#c084fc', dash: '3 3', width: 2 },
  involves: { color: '#60a5fa', width: 1.5 },
  'located-at': { color: '#34d399', width: 1.5 },
  'member-of': { color: '#a78bfa', width: 1.5 },
  owns: { color: '#fbbf24', dash: '6 3', width: 1.5 },
  relationship: { color: '#f472b6', width: 2 },
  'clue-for': { color: '#2dd4bf', dash: '1 5', width: 2.5 },
}
