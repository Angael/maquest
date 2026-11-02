import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EdgeType, NodeType } from '@maquest/core/schema'
import { entityOf } from '@maquest/core/schema'
import type { LayoutMode } from '@maquest/core/layout'

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
  /** Node the canvas should center on once it is rendered. */
  pendingFocus: string | null
  /** Selection each view had when it was left, restored on return. */
  viewSelections: Partial<Record<View, { selection: Selection; selectedNodeIds: string[] }>>
  /** Nodes pinned as inspector tabs. */
  tabs: string[]
  openTab: (id: string) => void
  closeTab: (id: string) => void
  /** Live notes panel open. */
  liveNotesOpen: boolean
  setLiveNotesOpen: (open: boolean) => void
  /** Project sidebar shown (Ctrl+B) and its width in px. */
  sidebarOpen: boolean
  sidebarWidth: number
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
  /** Command palette (Ctrl+K) open. Not persisted. */
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  /** Shows a node on the canvas: switches to `board` (when given), selects and centers it. */
  focusNode: (id: string, board?: string) => void
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
      pendingFocus: null,
      viewSelections: {},
      liveNotesOpen: false,
      sidebarOpen: true,
      sidebarWidth: 248,
      paletteOpen: false,
      tabs: [],
      openTab: (id) =>
        set((s) => {
          // The node being viewed becomes a tab too, so opening another one never loses it.
          const current = s.selection?.kind === 'node' ? [s.selection.id] : []
          const tabs = [...new Set([...s.tabs, ...current, id])]
          return { tabs, selection: { kind: 'node', id }, selectedNodeIds: [id] }
        }),
      closeTab: (id) =>
        set((s) => {
          const i = s.tabs.indexOf(id)
          const tabs = s.tabs.filter((t) => t !== id)
          if (s.selection?.kind !== 'node' || s.selection.id !== id) return { tabs }
          const next = tabs[Math.min(i, tabs.length - 1)]
          return { tabs, selection: next ? { kind: 'node', id: next } : null, selectedNodeIds: next ? [next] : [] }
        }),
      setLiveNotesOpen: (liveNotesOpen) => set({ liveNotesOpen }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setView: (view) =>
        set((s) =>
          s.view === view
            ? {}
            : {
                view,
                viewSelections: { ...s.viewSelections, [s.view]: { selection: s.selection, selectedNodeIds: s.selectedNodeIds } },
                ...(s.viewSelections[view] ?? { selection: null, selectedNodeIds: [] }),
              },
        ),
      focusNode: (id, board) =>
        set((s) => ({
          ...(s.view === 'canvas'
            ? {}
            : { view: 'canvas' as const, viewSelections: { ...s.viewSelections, [s.view]: { selection: s.selection, selectedNodeIds: s.selectedNodeIds } } }),
          ...(board ? { board } : {}),
          selection: { kind: 'node' as const, id },
          selectedNodeIds: [id],
          pendingFocus: id,
        })),
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
          liveNotesOpen: saved.liveNotesOpen ?? false,
          sidebarOpen: saved.sidebarOpen ?? true,
          sidebarWidth: saved.sidebarWidth ?? 248,
        }
      },
      partialize: ({ hiddenEdges, hiddenNodes, connectType, edgeLabels, referenceLines, layoutMode, liveNotesOpen, sidebarOpen, sidebarWidth }) => ({
        liveNotesOpen,
        sidebarOpen,
        sidebarWidth,
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
