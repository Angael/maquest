import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EdgeType, NodeType } from '@maquest/core/schema'
import { entityOf } from '@maquest/core/schema'
import type { LayoutMode } from './layout'

export type View = 'canvas' | 'backlog' | 'guidelines' | 'types'
export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null

type UI = {
  view: View
  selection: Selection
  /** Selected nodes; on the canvas these are card keys (see entityOf). */
  selectedNodeIds: string[]
  hiddenEdges: (EdgeType | 'contains')[]
  hiddenNodes: NodeType[]
  storyScope: string | null
  connectType: EdgeType | 'auto'
  /** Current canvas (board id). */
  board: string
  /** Guideline open in the Guidelines view. */
  guideline: string | null
  /** 'focus' shows edge names only for hovered / selected / focused lines. */
  edgeLabels: 'focus' | 'always'
  /** Draw involves/located-at/member-of/owns as lines instead of chips on the card. */
  referenceLines: boolean
  /** Algorithm the auto-layout button runs. */
  layoutMode: LayoutMode
  setView: (v: View) => void
  select: (s: Selection) => void
  selectNodes: (ids: string[]) => void
  toggleEdge: (t: EdgeType | 'contains') => void
  toggleNode: (t: NodeType) => void
  setStoryScope: (id: string | null) => void
  setConnectType: (t: EdgeType | 'auto') => void
  setBoard: (id: string) => void
  setGuideline: (id: string | null) => void
  setLayoutMode: (mode: LayoutMode) => void
}

const toggle = <T>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

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
      board: 'main',
      guideline: null,
      edgeLabels: 'focus',
      referenceLines: false,
      layoutMode: 'smart',
      setView: (view) => set({ view }),
      select: (selection) => set({ selection, selectedNodeIds: selection?.kind === 'node' ? [selection.id] : [] }),
      selectNodes: (selectedNodeIds) =>
        set((s) => {
          // Canvas selections hold card keys; the primary selection is always the node itself.
          const entities = selectedNodeIds.map(entityOf)
          const primary = s.selection?.kind === 'node' && entities.includes(s.selection.id) ? s.selection.id : entities[0]
          return {
            selectedNodeIds,
            selection: primary ? { kind: 'node', id: primary } : s.selection?.kind === 'edge' ? s.selection : null,
          }
        }),
      toggleEdge: (t) => set((s) => ({ hiddenEdges: toggle(s.hiddenEdges, t) })),
      toggleNode: (t) => set((s) => ({ hiddenNodes: toggle(s.hiddenNodes, t) })),
      setStoryScope: (storyScope) => set({ storyScope }),
      setConnectType: (connectType) => set({ connectType }),
      setBoard: (board) => set({ board, selection: null, selectedNodeIds: [] }),
      setGuideline: (guideline) => set({ guideline }),
      setLayoutMode: (layoutMode) => set({ layoutMode }),
    }),
    {
      name: 'maquest-ui',
      version: 2,
      migrate: (state) => {
        const saved = state as Partial<UI>
        return {
          hiddenEdges: saved.hiddenEdges ?? [],
          hiddenNodes: saved.hiddenNodes ?? [],
          connectType: 'auto' as const,
          edgeLabels: 'focus' as const,
          referenceLines: false,
          layoutMode: 'smart' as const,
        }
      },
      partialize: ({ hiddenEdges, hiddenNodes, connectType, edgeLabels, referenceLines, layoutMode }) => ({
        hiddenEdges,
        hiddenNodes,
        connectType,
        edgeLabels,
        referenceLines,
        layoutMode,
      }),
    },
  ),
)
