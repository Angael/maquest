import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EdgeType, NodeType } from '@maquest/core/schema'

export type View = 'canvas' | 'backlog' | 'guidelines'
export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null

type UI = {
  view: View
  selection: Selection
  selectedNodeIds: string[]
  hiddenEdges: (EdgeType | 'contains')[]
  hiddenNodes: NodeType[]
  storyScope: string | null
  connectType: EdgeType | 'auto'
  setView: (v: View) => void
  select: (s: Selection) => void
  selectNodes: (ids: string[]) => void
  toggleEdge: (t: EdgeType | 'contains') => void
  toggleNode: (t: NodeType) => void
  setStoryScope: (id: string | null) => void
  setConnectType: (t: EdgeType | 'auto') => void
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export const useUI = create<UI>()(
  persist(
    (set) => ({
      view: 'canvas',
      selection: null,
      selectedNodeIds: [],
      hiddenEdges: [],
      hiddenNodes: [],
      storyScope: null,
      connectType: 'auto',
      setView: (view) => set({ view }),
      select: (selection) => set({ selection, selectedNodeIds: selection?.kind === 'node' ? [selection.id] : [] }),
      selectNodes: (selectedNodeIds) => set((s) => {
        const primary = s.selection?.kind === 'node' && selectedNodeIds.includes(s.selection.id) ? s.selection.id : selectedNodeIds[0]
        return {
          selectedNodeIds,
          selection: primary ? { kind: 'node', id: primary } : s.selection?.kind === 'edge' ? s.selection : null,
        }
      }),
      toggleEdge: (t) => set((s) => ({ hiddenEdges: toggle(s.hiddenEdges, t) })),
      toggleNode: (t) => set((s) => ({ hiddenNodes: toggle(s.hiddenNodes, t) })),
      setStoryScope: (storyScope) => set({ storyScope }),
      setConnectType: (connectType) => set({ connectType }),
    }),
    {
      name: 'maquest-ui',
      version: 1,
      migrate: (state) => {
        const saved = state as Partial<UI>
        return { hiddenEdges: saved.hiddenEdges ?? [], hiddenNodes: saved.hiddenNodes ?? [], connectType: 'auto' as const }
      },
      partialize: ({ hiddenEdges, hiddenNodes, connectType }) => ({ hiddenEdges, hiddenNodes, connectType }),
    },
  ),
)
