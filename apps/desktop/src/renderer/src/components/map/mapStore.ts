import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BoolOp, Fill } from '@maquest/core/map'

export type MapTool = 'select' | 'pan' | 'room' | 'area' | 'wall' | 'path' | 'brush' | 'door' | 'image' | 'label' | 'light' | 'token' | 'ruler' | 'eraser'
export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'freehand'
export type RulerMode = 'line' | 'cells'
/** gm: everything visible, fog see-through. player: what the players see. */
export type MapViewMode = 'gm' | 'player'

type MapUI = {
  tool: MapTool
  /** Shape drawn by the room and area tools. */
  shape: ShapeKind
  /** Whether new rooms/areas add or subtract (Alt flips it while drawing). */
  op: BoolOp
  /** Snap step in cells (0 = off). Ctrl while dragging bypasses it. */
  snap: 0 | 0.5 | 1
  /** Paint for new areas. */
  fill: Fill
  /** Brush / path stroke. */
  stroke: { color: string; width: number; texture?: string }
  ruler: RulerMode
  viewMode: MapViewMode
  /** Media path the image tool places. */
  image: string | null
  /** Selected object/token ids in the open map. */
  selected: string[]
  /** Layer new objects go on (null = no layer, always shown). */
  activeLayer: string | null
  /** The scene panel (fog, tokens, layers) on the right is shown. */
  panel: boolean
  setTool: (tool: MapTool) => void
  set: (patch: Partial<Omit<MapUI, 'set' | 'setTool' | 'select'>>) => void
  select: (ids: string[]) => void
}

export const useMapUI = create<MapUI>()(
  persist(
    (set) => ({
      tool: 'select',
      shape: 'rect',
      op: 'add',
      snap: 1,
      fill: { texture: 'grass' },
      stroke: { color: '#4a3b2c', width: 0.3 },
      ruler: 'cells',
      viewMode: 'gm',
      image: null,
      selected: [],
      activeLayer: null,
      panel: true,
      setTool: (tool) => set({ tool }),
      set: (patch) => set(patch),
      select: (selected) => set({ selected }),
    }),
    {
      name: 'maquest-map-ui',
      partialize: ({ shape, snap, fill, stroke, ruler, panel }) => ({ shape, snap, fill, stroke, ruler, panel }),
    },
  ),
)
