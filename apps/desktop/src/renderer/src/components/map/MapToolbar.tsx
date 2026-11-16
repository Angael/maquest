import { useEffect, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  Brush,
  Circle,
  CloudFog,
  DoorOpen,
  Hand,
  Image as ImageIcon,
  Lasso,
  Lightbulb,
  Moon,
  MousePointer2,
  PaintBucket,
  PenTool,
  Pentagon,
  PersonStanding,
  RotateCcw,
  Ruler,
  Skull,
  Spline,
  Square,
  SquareDashed,
  Sun,
  Sunset,
  Type,
  UserRound,
  BrickWall,
  Eraser,
  Eye,
  EyeOff,
  type LucideIcon,
} from 'lucide-react'
import { TEXTURES, type MapDoc } from '@maquest/core/map'
import { useQuery } from '@tanstack/react-query'
import { api, mediaUrl, isVideo } from '../../lib/api'
import { IconButton, Segmented, Select, Popover, Tooltip, cn, floating } from '../ui'
import { useMapUI, type MapTool, type Snap, type SnapTool, type TokenKind } from './mapStore'
import { TOKEN_PRESETS, patchObject } from './edit'

type ToolButton = { id: MapTool; label: string; icon: LucideIcon; key: string }

/** The tool groups of the left rail, top to bottom. `gm` groups only show while editing as the GM. */
export const TOOL_GROUPS: { id: string; label: string; gm?: boolean; tools: ToolButton[] }[] = [
  {
    id: 'cursor',
    label: 'Pointer',
    tools: [
      { id: 'select', label: 'Select and move', icon: MousePointer2, key: 'V' },
      { id: 'pan', label: 'Pan (or hold Space)', icon: Hand, key: 'H' },
      { id: 'eraser', label: 'Eraser: click or drag over things to delete them', icon: Eraser, key: 'E' },
    ],
  },
  {
    id: 'build',
    label: 'Build',
    gm: true,
    tools: [
      { id: 'room', label: 'Room', icon: SquareDashed, key: 'R' },
      { id: 'wall', label: 'Wall: click points, drag for curves, Enter ends', icon: BrickWall, key: 'W' },
      { id: 'door', label: 'Door: click on a wall', icon: DoorOpen, key: 'D' },
      { id: 'light', label: 'Light', icon: Lightbulb, key: 'L' },
    ],
  },
  {
    id: 'paint',
    label: 'Paint',
    gm: true,
    tools: [
      { id: 'area', label: 'Paint area: color or texture under the rooms', icon: PaintBucket, key: 'A' },
      { id: 'brush', label: 'Brush', icon: Brush, key: 'B' },
      { id: 'path', label: 'Path: roads, rivers, lines', icon: PenTool, key: 'P' },
      { id: 'image', label: 'Image', icon: ImageIcon, key: 'I' },
      { id: 'label', label: 'Label', icon: Type, key: 'T' },
    ],
  },
  { id: 'measure', label: 'Measure', tools: [{ id: 'ruler', label: 'Ruler', icon: Ruler, key: 'M' }] },
]

export const TOOLS = TOOL_GROUPS.flatMap((g) => g.tools)

/** Tools players may use while the map is shown to them. */
const PLAY_TOOLS = new Set<MapTool>(['select', 'pan', 'ruler', 'token'])

export const TOKEN_BUTTONS: { kind: TokenKind; label: string; icon: LucideIcon; key: string }[] = [
  { kind: 'player', label: 'Player character: reveals the fog', icon: UserRound, key: 'K' },
  { kind: 'enemy', label: 'Enemy', icon: Skull, key: 'X' },
  { kind: 'npc', label: 'NPC', icon: PersonStanding, key: 'N' },
]

/** Single-letter tool shortcuts while the map view has focus (not while typing). */
export function useToolKeys(active: boolean) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], [role="menu"], [role="dialog"]')) return
      const key = e.key.toLowerCase()
      const { viewMode, setTool, set } = useMapUI.getState()
      const tool = TOOLS.find((t) => t.key.toLowerCase() === key)
      const token = TOKEN_BUTTONS.find((t) => t.key.toLowerCase() === key)
      if (tool && (viewMode === 'gm' || PLAY_TOOLS.has(tool.id))) {
        e.preventDefault()
        setTool(tool.id)
      } else if (token) {
        e.preventDefault()
        set({ tool: 'token', tokenKind: token.kind })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}

/** The left rail: tool groups as separate floating strips; the active tool's options open beside it. */
export function ToolRail() {
  const tool = useMapUI((s) => s.tool)
  const viewMode = useMapUI((s) => s.viewMode)
  const setTool = useMapUI((s) => s.setTool)
  const groups = TOOL_GROUPS.filter((g) => viewMode === 'gm' || !g.gm)
  return (
    <div className="flex flex-col gap-2" data-map-rail>
      {groups.map((g) => {
        const tools = g.tools.filter((t) => viewMode === 'gm' || PLAY_TOOLS.has(t.id))
        return (
          <div key={g.id} role="toolbar" aria-label={g.label} aria-orientation="vertical" className={cn(floating, 'flex flex-col gap-0.5 p-1')}>
            {tools.map((t) => (
              <div key={t.id} className="relative">
                <IconButton icon={t.icon} label={t.label} shortcut={t.key} tooltipSide="right" active={tool === t.id} onClick={() => setTool(t.id)} />
                {tool === t.id && <Flyout tool={t.id} />}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** Options of a tool, beside its button (like a context menu, not a bar at the top of the screen). */
function Flyout({ tool }: { tool: MapTool }) {
  const body = toolOptions(tool)
  if (!body) return null
  return (
    <div
      data-map-tool-options
      role="group"
      aria-label="Tool options"
      className={cn(floating, 'absolute top-0 left-full z-10 ml-2 flex w-max max-w-[min(26rem,calc(100vw-6rem))] flex-col gap-1.5 p-2')}
    >
      {body}
    </div>
  )
}

const SHAPES = [
  { value: 'rect' as const, label: 'Rectangle', icon: Square },
  { value: 'ellipse' as const, label: 'Ellipse (Shift: circle)', icon: Circle },
  { value: 'polygon' as const, label: 'Polygon / curves', icon: Pentagon },
  { value: 'freehand' as const, label: 'Freehand', icon: Lasso },
]

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-fg-subtle">{label}</span>
      {children}
    </div>
  )
}

function SnapRow({ tool }: { tool: SnapTool }) {
  const snap = useMapUI((s) => s.snaps[tool])
  const setSnap = useMapUI((s) => s.setSnap)
  return (
    <OptionRow label="Snap">
      <Segmented<Snap>
        label="Snap to grid (Ctrl while dragging flips it)"
        value={snap}
        onChange={(v) => setSnap(tool, v)}
        options={[
          { value: 1, label: 'Cells', showLabel: true },
          { value: 0.5, label: '½', showLabel: true },
          { value: 0, label: 'Free', showLabel: true },
        ]}
      />
    </OptionRow>
  )
}

function toolOptions(tool: MapTool): ReactNode {
  switch (tool) {
    case 'room':
      return <RoomOptions />
    case 'area':
      return <AreaOptions />
    case 'brush':
      return <StrokeOptions />
    case 'path':
      return (
        <>
          <StrokeOptions />
          <SnapRow tool="path" />
        </>
      )
    case 'wall':
    case 'door':
    case 'light':
    case 'label':
      return <SnapRow tool={tool} />
    case 'image':
      return (
        <>
          <ImagePicker />
          <SnapRow tool="image" />
        </>
      )
    case 'eraser':
      return (
        <p className="max-w-60 text-xs leading-5 text-fg-subtle">
          Click or drag over walls, doors, paths, tokens… Start on a room or a painted area to erase those too.
        </p>
      )
    case 'ruler':
      return <RulerOptions />
    default:
      return null
  }
}

function ShapeRow() {
  const shape = useMapUI((s) => s.shape)
  const set = useMapUI((s) => s.set)
  return (
    <OptionRow label="Shape">
      <Segmented label="Shape" value={shape} onChange={(v) => set({ shape: v })} options={SHAPES} />
    </OptionRow>
  )
}

function RoomOptions() {
  const s = useMapUI(useShallow((x) => ({ roomOp: x.roomOp, roomLight: x.roomLight })))
  const set = useMapUI((x) => x.set)
  return (
    <>
      <ShapeRow />
      <OptionRow label="Walls">
        <Segmented
          label="How the room joins the others (Alt flips add and subtract)"
          value={s.roomOp}
          onChange={(roomOp) => set({ roomOp })}
          options={[
            { value: 'add', label: 'Merge', showLabel: true },
            { value: 'subtract', label: 'Cut out', showLabel: true },
            { value: 'separate', label: 'Own walls', showLabel: true },
          ]}
        />
      </OptionRow>
      <OptionRow label="Light">
        <Segmented
          label="Light inside the room"
          value={s.roomLight ?? 'auto'}
          onChange={(v) => set({ roomLight: v === 'auto' ? null : v })}
          options={[
            { value: 'auto', label: 'Auto', showLabel: true },
            { value: 'light', label: 'Lit', showLabel: true },
            { value: 'dim', label: 'Dim', showLabel: true },
            { value: 'dark', label: 'Dark', showLabel: true },
          ]}
        />
      </OptionRow>
      <SnapRow tool="room" />
    </>
  )
}

function AreaOptions() {
  const s = useMapUI(useShallow((x) => ({ op: x.op, fill: x.fill })))
  const set = useMapUI((x) => x.set)
  return (
    <>
      <ShapeRow />
      <OptionRow label="Paint">
        <ColorInput label="Paint color" value={s.fill.color ?? '#6b8f4e'} onChange={(color) => set({ fill: { ...s.fill, color } })} />
        <TextureSelect label="Paint texture" value={s.fill.texture} onChange={(texture) => set({ fill: { ...s.fill, texture } })} />
      </OptionRow>
      <OptionRow label="Mode">
        <Segmented
          label="Paint or erase paint (Alt flips it)"
          value={s.op}
          onChange={(op) => set({ op })}
          options={[
            { value: 'add', label: 'Paint', showLabel: true },
            { value: 'subtract', label: 'Erase paint', showLabel: true },
          ]}
        />
      </OptionRow>
      <SnapRow tool="area" />
    </>
  )
}

function StrokeOptions() {
  const stroke = useMapUI((s) => s.stroke)
  const set = useMapUI((s) => s.set)
  return (
    <>
      <OptionRow label="Stroke">
        <ColorInput label="Stroke color" value={stroke.color} onChange={(color) => set({ stroke: { ...stroke, color } })} />
        <TextureSelect label="Stroke texture" value={stroke.texture} onChange={(texture) => set({ stroke: { ...stroke, texture } })} />
      </OptionRow>
      <OptionRow label="Width">
        <input
          type="range"
          min={0.05}
          max={4}
          step={0.05}
          value={stroke.width}
          onChange={(e) => set({ stroke: { ...stroke, width: Number(e.target.value) } })}
          className="w-28 accent-accent"
          aria-label="Stroke width"
        />
        <span className="tabular w-8 text-xs text-fg-muted">{stroke.width.toFixed(2)}</span>
      </OptionRow>
    </>
  )
}

function RulerOptions() {
  const ruler = useMapUI((s) => s.ruler)
  const set = useMapUI((s) => s.set)
  return (
    <Segmented
      label="Ruler"
      value={ruler}
      onChange={(v) => set({ ruler: v })}
      options={[
        { value: 'cells', label: 'Cells walked', icon: Spline, showLabel: true },
        { value: 'line', label: 'Straight line', icon: Ruler, showLabel: true },
      ]}
    />
  )
}

export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      type="color"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-6 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-[4px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0.5"
    />
  )
}

/** Texture choice: none, a built-in texture, or a project image (tiles). */
export function TextureSelect({
  value,
  onChange,
  label,
  className,
  none = 'Plain color',
}: {
  value?: string
  onChange: (v: string | undefined) => void
  label: string
  className?: string
  /** Name of the no-texture choice. */
  none?: string
}) {
  const { data: media = [] } = useQuery({ queryKey: ['media'], queryFn: () => api.listMedia() })
  const images = media.filter((m) => !isVideo(m))
  return (
    <Select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className={cn('w-28', className)}>
      <option value="">{none}</option>
      <optgroup label="Textures">
        {TEXTURES.map((t) => (
          <option key={t} value={t}>
            {t[0].toUpperCase() + t.slice(1)}
          </option>
        ))}
      </optgroup>
      {images.length > 0 && (
        <optgroup label="Project images">
          {images.map((m) => (
            <option key={m} value={m}>
              {m.replace(/^media\//, '')}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  )
}

function ImagePicker() {
  const image = useMapUI((s) => s.image)
  const set = useMapUI((s) => s.set)
  const { data: media = [] } = useQuery({ queryKey: ['media'], queryFn: () => api.listMedia() })
  const images = media.filter((m) => !isVideo(m))
  return (
    <div className="flex flex-col gap-1.5">
      <Popover
        side="right"
        align="start"
        trigger={
          <button
            type="button"
            className="flex h-7 items-center gap-2 rounded-md px-2 text-xs text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-hover"
          >
            {image ? <img src={mediaUrl(image)} alt="" className="size-5 rounded object-cover" /> : <ImageIcon size={14} aria-hidden />}
            {image ? image.replace(/^media\//, '') : 'Choose an image…'}
          </button>
        }
      >
        <div className="grid max-h-80 w-72 grid-cols-3 gap-1 overflow-y-auto p-2">
          {images.length === 0 && <div className="col-span-3 p-2 text-xs text-fg-subtle">No images yet. Drop image files onto the map to import them.</div>}
          {images.map((m) => (
            <button
              key={m}
              type="button"
              title={m}
              onClick={() => set({ image: m })}
              className={cn(
                'aspect-square overflow-hidden rounded-md bg-surface outline-none focus-visible:ring-2 focus-visible:ring-accent',
                image === m && 'ring-2 ring-accent',
              )}
            >
              <img src={mediaUrl(m)} alt={m} className="size-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      </Popover>
      <span className="text-xs text-fg-subtle">Click the map to place it, or drop files on it.</span>
    </div>
  )
}

// ---------- floating docks: tokens, light ----------

type DockProps = { doc: MapDoc; commit: (d: MapDoc) => void }

/** Bottom dock: place player characters, enemies and NPCs, and pick tokens on the map. */
export function TokenDock({ doc, commit }: DockProps) {
  const s = useMapUI(useShallow((x) => ({ tool: x.tool, kind: x.tokenKind, selected: x.selected, viewMode: x.viewMode })))
  const set = useMapUI((x) => x.set)
  const select = useMapUI((x) => x.select)
  // While the players watch, only their own tokens are listed.
  const tokens = doc.tokens.filter((t) => s.viewMode === 'gm' || t.player).toSorted((a, b) => Number(b.player) - Number(a.player))
  return (
    <div
      className={cn(floating, 'flex h-10 max-w-[min(56rem,calc(100vw-2rem))] min-w-0 items-center gap-1 px-1')}
      data-map-tokens
      role="toolbar"
      aria-label="Tokens"
    >
      {TOKEN_BUTTONS.map((b) => (
        <IconButton
          key={b.kind}
          icon={b.icon}
          label={`Place: ${b.label}`}
          shortcut={b.key}
          tooltipSide="top"
          active={s.tool === 'token' && s.kind === b.kind}
          onClick={() => set({ tool: 'token', tokenKind: b.kind })}
          className="relative"
        >
          <span aria-hidden className="absolute right-1 bottom-1 size-1.5 rounded-full" style={{ background: TOKEN_PRESETS[b.kind].color }} />
        </IconButton>
      ))}
      {tokens.length > 0 && <div className="mx-1 h-5 w-px shrink-0 bg-line" />}
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {tokens.map((t) => {
          const on = s.selected.includes(t.id)
          return (
            <div
              key={t.id}
              className={cn(
                'group flex h-7 shrink-0 items-center rounded-full pr-0.5 pl-1 text-xs text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-hover',
                on && 'bg-accent-soft text-fg shadow-[inset_0_0_0_1px_var(--color-accent)] hover:bg-accent-soft',
              )}
            >
              <button
                type="button"
                data-token-chip={t.id}
                onClick={(e) => select(e.shiftKey ? [...new Set([...s.selected, t.id])] : [t.id])}
                className="flex h-full max-w-36 items-center gap-1.5 rounded-full pr-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span aria-hidden className="size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1px_oklch(0_0_0/0.3)]" style={{ background: t.color }} />
                <span className={cn('truncate', t.hidden && 'text-fg-faint line-through')}>{t.name}</span>
              </button>
              {s.viewMode === 'gm' && (
                <Tooltip content={t.hidden ? `Show ${t.name} to players` : `Hide ${t.name} from players`} side="top">
                  <button
                    type="button"
                    aria-label={t.hidden ? `Show ${t.name} to players` : `Hide ${t.name} from players`}
                    onClick={() => commit(patchObject(doc, t.id, { hidden: t.hidden ? undefined : true }))}
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-fg-subtle opacity-0 outline-none group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70',
                      t.hidden && 'opacity-100',
                    )}
                  >
                    {t.hidden ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
                  </button>
                </Tooltip>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Light of the scene (time of day) and the fog of war, floating over the map. */
export function SceneDock({ doc, commit }: DockProps) {
  const fog = doc.fog
  const viewMode = useMapUI((s) => s.viewMode)
  const setFog = (p: Partial<MapDoc['fog']>) => commit({ ...doc, fog: { ...fog, ...p } })
  return (
    <div className={cn(floating, 'flex h-10 items-center gap-1 px-1')} role="toolbar" aria-label="Light and fog" data-map-scene>
      <Segmented
        label="Light"
        value={fog.ambient}
        onChange={(ambient) => setFog({ ambient })}
        options={[
          { value: 'light', label: 'Daylight', icon: Sun },
          { value: 'dim', label: 'Dim: dusk, a cloudy night', icon: Sunset },
          { value: 'dark', label: 'Dark: players see only lit places and with darkvision', icon: Moon },
        ]}
      />
      {viewMode === 'gm' && (
        <>
          <IconButton
            icon={CloudFog}
            label={fog.enabled ? 'Fog of war on: players reveal what their tokens see' : 'Fog of war off'}
            tooltipSide="top"
            active={fog.enabled}
            onClick={() => setFog({ enabled: !fog.enabled })}
          />
          {fog.enabled && fog.explored.length > 0 && (
            <IconButton
              icon={RotateCcw}
              label="Reset explored: players forget what they have seen"
              tooltipSide="top"
              onClick={() => setFog({ explored: [] })}
            />
          )}
        </>
      )}
    </div>
  )
}
