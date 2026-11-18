import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EdgeType, NodeType } from '@maquest/core/schema'
import { entityOf } from '@maquest/core/schema'
import type { LayoutMode } from '@maquest/core/layout'

/** `maps` lists the project's maps; `map` is the editor of the open map tab (`map`). */
export type View = 'canvas' | 'backlog' | 'guidelines' | 'types' | 'maps' | 'map'
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
  /** Type the Types view shows. */
  typeFocus: string
  /** Map node shown in the map editor (one of `maps`). */
  map: string | null
  /** Maps open as tabs in the title bar, in tab order. */
  maps: string[]
  /** Opens a map in its own tab and shows it; `background` only adds the tab (middle click). */
  openMap: (id: string, background?: boolean) => void
  /** Closes a map tab; closing the shown one shows its neighbour, or the map list when none is left. */
  closeMap: (id: string) => void
  /** 'focus' shows edge names only for hovered / selected / focused lines. */
  edgeLabels: 'focus' | 'always'
  /** Draw involves/located-at/member-of/owns as lines instead of chips on the card. */
  referenceLines: boolean
  /** Algorithm the auto-layout button runs. */
  layoutMode: LayoutMode
  /** Node the canvas should center on once it is rendered. */
  pendingFocus: string | null
  /** A sheet tab to open once the node's inspector shows it (e.g. from the Problems menu). Not persisted. */
  sheetRequest: { id: string; tab?: string; edit: boolean } | null
  requestSheet: (r: { id: string; tab?: string; edit: boolean } | null) => void
  /** Selection each view had when it was left, restored on return. */
  viewSelections: Partial<Record<View, { selection: Selection; selectedNodeIds: string[] }>>
  /** Nodes pinned as inspector tabs. */
  tabs: string[]
  openTab: (id: string) => void
  closeTab: (id: string) => void
  /** Replace the pinned tabs (tab context menu); if the viewed tab was closed, `focus` becomes the viewed node. */
  setTabs: (tabs: string[], focus?: string) => void
  /** Canvas minimap shown (bottom right). */
  minimap: boolean
  setMinimap: (open: boolean) => void
  /** Live notes panel open. */
  liveNotesOpen: boolean
  liveNotesSize: { width: number; height: number }
  setLiveNotesSize: (size: { width: number; height: number }) => void
  setLiveNotesOpen: (open: boolean) => void
  /** Project sidebar shown (Ctrl+B) and its width in px. */
  sidebarOpen: boolean
  sidebarWidth: number
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
  /** Command palette (Ctrl+K) open. Not persisted. */
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  /** Keyboard shortcuts reference (Ctrl+/) open. Not persisted. */
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void
  /** Spellchecking in documents and notes. */
  spellcheck: boolean
  setSpellcheck: (on: boolean) => void
  /** Collapsed sidebar sections (`section:<type>`) and outline rows (node ids). */
  collapsed: string[]
  setCollapsed: (key: string, collapsed: boolean) => void
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
  /** Opens the Types view on a type. */
  openType: (id: string) => void
  setTypeFocus: (id: string) => void
  setLayoutMode: (mode: LayoutMode) => void
}

const toggle = <T>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/** A lone tab for the viewed node is just the normal view, so drop it and hide the strip. */
const solo = (tabs: string[], viewed: string | null | undefined) => (tabs.length === 1 && tabs[0] === viewed ? [] : tabs)

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
      typeFocus: 'character',
      map: null,
      maps: [],
      openMap: (map, background) =>
        set((s) => {
          const maps = s.maps.includes(map) ? s.maps : [...s.maps, map]
          if (background) return { maps }
          return {
            map,
            maps,
            view: 'map',
            ...(s.view === 'map' ? {} : { viewSelections: { ...s.viewSelections, [s.view]: { selection: s.selection, selectedNodeIds: s.selectedNodeIds } } }),
            selection: null,
            selectedNodeIds: [],
          }
        }),
      closeMap: (id) =>
        set((s) => {
          const i = s.maps.indexOf(id)
          const maps = s.maps.filter((m) => m !== id)
          if (s.map !== id) return { maps }
          const next = maps[Math.min(i, maps.length - 1)] ?? null
          return { maps, map: next, ...(s.view === 'map' && !next ? { view: 'maps' as const } : {}) }
        }),
      edgeLabels: 'focus',
      referenceLines: false,
      layoutMode: 'smart',
      pendingFocus: null,
      sheetRequest: null,
      requestSheet: (sheetRequest) => set({ sheetRequest }),
      viewSelections: {},
      liveNotesOpen: false,
      liveNotesSize: { width: 380, height: 260 },
      sidebarOpen: true,
      sidebarWidth: 248,
      paletteOpen: false,
      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      spellcheck: true,
      setSpellcheck: (spellcheck) => set({ spellcheck }),
      collapsed: [],
      setCollapsed: (key, collapsed) =>
        set((s) => (s.collapsed.includes(key) === collapsed ? {} : { collapsed: collapsed ? [...s.collapsed, key] : s.collapsed.filter((k) => k !== key) })),
      minimap: false,
      setMinimap: (minimap) => set({ minimap }),
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
          if (s.selection?.kind !== 'node' || s.selection.id !== id) return { tabs: solo(tabs, s.selection?.kind === 'node' ? s.selection.id : null) }
          const next = tabs[Math.min(i, tabs.length - 1)]
          return { tabs: solo(tabs, next), selection: next ? { kind: 'node', id: next } : null, selectedNodeIds: next ? [next] : [] }
        }),
      setTabs: (tabs, focus) =>
        set((s) => {
          const viewed = s.selection?.kind === 'node' ? s.selection.id : null
          if (!viewed || !focus || !s.tabs.includes(viewed) || tabs.includes(viewed)) return { tabs: solo(tabs, viewed) }
          return { tabs: solo(tabs, focus), selection: { kind: 'node', id: focus }, selectedNodeIds: [focus] }
        }),
      setLiveNotesOpen: (liveNotesOpen) => set({ liveNotesOpen }),
      setLiveNotesSize: (liveNotesSize) => set({ liveNotesSize }),
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
      setTypeFocus: (typeFocus) => set({ typeFocus }),
      openType: (typeFocus) => {
        set({ typeFocus })
        useUI.getState().setView('types')
      },
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
          liveNotesSize: saved.liveNotesSize ?? { width: 380, height: 260 },
          sidebarOpen: saved.sidebarOpen ?? true,
          sidebarWidth: saved.sidebarWidth ?? 248,
          minimap: saved.minimap ?? false,
          spellcheck: saved.spellcheck ?? true,
          collapsed: saved.collapsed ?? [],
        }
      },
      partialize: ({
        hiddenEdges,
        hiddenNodes,
        connectType,
        edgeLabels,
        referenceLines,
        layoutMode,
        liveNotesOpen,
        liveNotesSize,
        sidebarOpen,
        sidebarWidth,
        minimap,
        spellcheck,
        collapsed,
      }) => ({
        spellcheck,
        collapsed,
        liveNotesOpen,
        liveNotesSize,
        sidebarOpen,
        sidebarWidth,
        minimap,
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
