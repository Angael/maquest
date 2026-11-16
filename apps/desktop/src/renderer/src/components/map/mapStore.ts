import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BoolOp, Fill, LightLevel, MapDoc, RoomOp } from '@maquest/core/map'

export type MapTool = 'select' | 'pan' | 'room' | 'area' | 'wall' | 'path' | 'brush' | 'door' | 'image' | 'label' | 'light' | 'token' | 'ruler' | 'eraser'
export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'freehand'
export type RulerMode = 'line' | 'cells'
/** gm: everything visible, fog see-through. player: what the players see. */
export type MapViewMode = 'gm' | 'player'
/** Snap step in cells (0 = off). */
export type Snap = 0 | 0.5 | 1
/** What the token buttons place: player characters reveal the fog; enemies and NPCs only show where players see. */
export type TokenKind = 'player' | 'enemy' | 'npc'

/** Tools that place or draw things, each with its own snapping. */
export type SnapTool = 'room' | 'wall' | 'door' | 'light' | 'token' | 'area' | 'path' | 'label' | 'image'

/**
 * Structure snaps to the grid (rooms, walls, doors, tokens); paint and decoration go where the mouse is. Ctrl while
 * dragging flips it.
 */
export const SNAP_DEFAULTS: Record<SnapTool, Snap> = {
  room: 1,
  wall: 1,
  door: 1,
  token: 1,
  light: 0.5,
  area: 0,
  path: 0,
  label: 0,
  image: 0,
}

type MapUI = {
  tool: MapTool
  /** Shape drawn by the room and area tools. */
  shape: ShapeKind
  /** How new paint areas combine (Alt flips it while drawing). */
  op: BoolOp
  /** How new rooms combine: merge, cut, or keep their own walls (Alt flips add/subtract while drawing). */
  roomOp: RoomOp
  /** Light inside new rooms (null = the map's ambient light). */
  roomLight: LightLevel | null
  /** Snap step per tool. */
  snaps: Record<SnapTool, Snap>
  /** Paint for new areas. */
  fill: Fill
  /** Brush / path stroke. */
  stroke: { color: string; width: number; texture?: string }
  ruler: RulerMode
  tokenKind: TokenKind
  viewMode: MapViewMode
  /** Media path the image tool places. */
  image: string | null
  /** Selected object/token ids in the open map. */
  selected: string[]
  /** Layer new objects go on (null = no layer, always shown). */
  activeLayer: string | null
  setTool: (tool: MapTool) => void
  set: (patch: Partial<Omit<MapUI, 'set' | 'setTool' | 'select' | 'setSnap'>>) => void
  setSnap: (tool: SnapTool, snap: Snap) => void
  select: (ids: string[]) => void
}

export const useMapUI = create<MapUI>()(
  persist(
    (set) => ({
      tool: 'select',
      shape: 'rect',
      op: 'add',
      roomOp: 'add',
      roomLight: null,
      snaps: SNAP_DEFAULTS,
      fill: { texture: 'grass' },
      stroke: { color: '#4a3b2c', width: 0.3 },
      ruler: 'cells',
      tokenKind: 'player',
      viewMode: 'gm',
      image: null,
      selected: [],
      activeLayer: null,
      setTool: (tool) => set({ tool }),
      set: (patch) => set(patch),
      setSnap: (tool, snap) => set((s) => ({ snaps: { ...s.snaps, [tool]: snap } })),
      select: (selected) => set({ selected }),
    }),
    {
      name: 'maquest-map-ui',
      // Older versions stored one `snap` for every tool; new tools get their default snap.
      merge: (persisted, current) => {
        const { snap: _old, panel: _panel, ...p } = (persisted ?? {}) as Partial<MapUI> & { snap?: unknown; panel?: unknown }
        return { ...current, ...p, snaps: { ...SNAP_DEFAULTS, ...p.snaps } }
      },
    },
  ),
)

/** The snap step a tool uses (0 for tools that never snap). */
export function snapOf(tool: string): Snap {
  const snaps = useMapUI.getState().snaps
  return tool in snaps ? snaps[tool as SnapTool] : 0
}

/** Moving things snaps like placing them: the finest snap of what is moving (a door and a paint area move freely). */
export function moveSnap(doc: MapDoc, ids: readonly string[]): Snap {
  let step: Snap = 1
  for (const id of ids) {
    const o = doc.objects.find((x) => x.id === id)
    const s = o ? snapOf(o.kind) : snapOf('token')
    if (s < step) step = s
  }
  return step
}
