import { BookOpen, Box, Castle, FileText, Film, Flag, Lightbulb, MapPin, Clapperboard, User, type LucideIcon } from 'lucide-react'
import type { EdgeType, NodeType } from '@maquest/core/schema'

export const NODE_STYLE: Record<NodeType, { label: string; plural: string; icon: LucideIcon; color: string }> = {
  story: { label: 'Story', plural: 'Stories', icon: BookOpen, color: '#f59e0b' },
  chapter: { label: 'Chapter', plural: 'Chapters', icon: Flag, color: '#f97316' },
  scene: { label: 'Scene', plural: 'Scenes', icon: Clapperboard, color: '#ef4444' },
  note: { label: 'Note', plural: 'Notes', icon: FileText, color: '#a8a29e' },
  character: { label: 'Character', plural: 'Characters', icon: User, color: '#3b82f6' },
  location: { label: 'Location', plural: 'Locations', icon: MapPin, color: '#10b981' },
  faction: { label: 'Faction', plural: 'Factions', icon: Castle, color: '#8b5cf6' },
  item: { label: 'Item', plural: 'Items', icon: Box, color: '#eab308' },
  idea: { label: 'Idea', plural: 'Backlog', icon: Lightbulb, color: '#ec4899' },
  media: { label: 'Media', plural: 'Media', icon: Film, color: '#06b6d4' },
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
