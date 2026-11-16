import { useEffect, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  Brush,
  Circle,
  DoorOpen,
  Hand,
  Image as ImageIcon,
  Lasso,
  Lightbulb,
  MousePointer2,
  PaintBucket,
  PenTool,
  Pentagon,
  Ruler,
  Spline,
  Square,
  SquareDashed,
  Type,
  UserRound,
  BrickWall,
  Eraser,
  type LucideIcon,
} from 'lucide-react'
import { TEXTURES } from '@maquest/core/map'
import { useQuery } from '@tanstack/react-query'
import { api, mediaUrl, isVideo } from '../../lib/api'
import { IconButton, Segmented, Separator, Select, Popover, cn, floating } from '../ui'
import { useMapUI, type MapTool } from './mapStore'

export const TOOLS: { id: MapTool; label: string; icon: LucideIcon; key: string }[] = [
  { id: 'select', label: 'Select and move', icon: MousePointer2, key: 'V' },
  { id: 'pan', label: 'Pan (or hold Space)', icon: Hand, key: 'H' },
  { id: 'room', label: 'Room: drag a shape; Alt subtracts', icon: SquareDashed, key: 'R' },
  { id: 'wall', label: 'Wall: click points, drag for curves, Enter ends', icon: BrickWall, key: 'W' },
  { id: 'door', label: 'Door: click on a wall', icon: DoorOpen, key: 'D' },
  { id: 'area', label: 'Paint area: color or texture under the rooms', icon: PaintBucket, key: 'A' },
  { id: 'brush', label: 'Brush', icon: Brush, key: 'B' },
  { id: 'path', label: 'Path: roads, rivers, lines', icon: PenTool, key: 'P' },
  { id: 'image', label: 'Image', icon: ImageIcon, key: 'I' },
  { id: 'label', label: 'Label', icon: Type, key: 'T' },
  { id: 'light', label: 'Light', icon: Lightbulb, key: 'L' },
  { id: 'token', label: 'Token', icon: UserRound, key: 'K' },
  { id: 'ruler', label: 'Ruler', icon: Ruler, key: 'M' },
  { id: 'eraser', label: 'Eraser: click or drag over things to delete them', icon: Eraser, key: 'E' },
]

/** Single-letter tool shortcuts while the map view has focus (not while typing). */
export function useToolKeys(active: boolean) {
  const setTool = useMapUI((s) => s.setTool)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], [role="menu"], [role="dialog"]')) return
      const tool = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase())
      if (tool) {
        e.preventDefault()
        setTool(tool.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, setTool])
}

export function ToolRail() {
  const tool = useMapUI((s) => s.tool)
  const setTool = useMapUI((s) => s.setTool)
  return (
    <div role="toolbar" aria-label="Map tools" aria-orientation="vertical" className={cn(floating, 'flex flex-col gap-0.5 p-1')}>
      {TOOLS.map((t, i) => (
        <span key={t.id} className="contents">
          {(i === 2 || i === 5 || i === 8 || i === 12) && <Separator className="my-0.5" />}
          <IconButton icon={t.icon} label={t.label} shortcut={t.key} tooltipSide="right" active={tool === t.id} onClick={() => setTool(t.id)} />
        </span>
      ))}
    </div>
  )
}

const SHAPES = [
  { value: 'rect' as const, label: 'Rectangle', icon: Square },
  { value: 'ellipse' as const, label: 'Ellipse (Shift: circle)', icon: Circle },
  { value: 'polygon' as const, label: 'Polygon / curves', icon: Pentagon },
  { value: 'freehand' as const, label: 'Freehand', icon: Lasso },
]

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

/** Options of the current tool, floating along the top of the map. */
export function ToolOptions() {
  const s = useMapUI(
    useShallow((x) => ({ tool: x.tool, shape: x.shape, op: x.op, snap: x.snap, fill: x.fill, stroke: x.stroke, ruler: x.ruler, image: x.image })),
  )
  const set = useMapUI((x) => x.set)
  const snap = (
    <Segmented
      label="Snap to grid"
      value={s.snap}
      onChange={(snap) => set({ snap })}
      options={[
        { value: 1, label: 'Cells', showLabel: true },
        { value: 0.5, label: '½', showLabel: true },
        { value: 0, label: 'Free', showLabel: true },
      ]}
    />
  )
  let body: ReactNode = null
  switch (s.tool) {
    case 'room':
    case 'area':
      body = (
        <>
          <Segmented label="Shape" value={s.shape} onChange={(shape) => set({ shape })} options={SHAPES} />
          <Segmented
            label="Combine"
            value={s.op}
            onChange={(op) => set({ op })}
            options={[
              { value: 'add', label: 'Add', showLabel: true },
              { value: 'subtract', label: 'Subtract', showLabel: true },
            ]}
          />
          {s.tool === 'area' && (
            <>
              <ColorInput label="Paint color" value={s.fill.color ?? '#6b8f4e'} onChange={(color) => set({ fill: { ...s.fill, color } })} />
              <TextureSelect label="Paint texture" value={s.fill.texture} onChange={(texture) => set({ fill: { ...s.fill, texture } })} />
            </>
          )}
          {snap}
        </>
      )
      break
    case 'brush':
    case 'path':
      body = (
        <>
          <ColorInput label="Stroke color" value={s.stroke.color} onChange={(color) => set({ stroke: { ...s.stroke, color } })} />
          <TextureSelect label="Stroke texture" value={s.stroke.texture} onChange={(texture) => set({ stroke: { ...s.stroke, texture } })} />
          <label className="flex items-center gap-1.5 text-xs text-fg-subtle">
            Width
            <input
              type="range"
              min={0.05}
              max={4}
              step={0.05}
              value={s.stroke.width}
              onChange={(e) => set({ stroke: { ...s.stroke, width: Number(e.target.value) } })}
              className="w-24 accent-accent"
              aria-label="Stroke width"
            />
            <span className="tabular w-8 text-fg-muted">{s.stroke.width.toFixed(2)}</span>
          </label>
          {s.tool === 'path' && snap}
        </>
      )
      break
    case 'wall':
    case 'door':
    case 'label':
    case 'light':
    case 'select':
      body = snap
      break
    case 'image':
      body = <ImagePicker />
      break
    case 'eraser':
      body = (
        <span className="px-1 text-xs whitespace-nowrap text-fg-subtle">
          Click or drag over walls, doors, paths, tokens… Start on a room or area to erase those too.
        </span>
      )
      break
    case 'ruler':
      body = (
        <Segmented
          label="Ruler"
          value={s.ruler}
          onChange={(ruler) => set({ ruler })}
          options={[
            { value: 'cells', label: 'Cells walked', icon: Spline, showLabel: true },
            { value: 'line', label: 'Straight line', icon: Ruler, showLabel: true },
          ]}
        />
      )
      break
  }
  if (!body) return null
  return <div className={cn(floating, 'flex h-9 min-w-0 items-center gap-2 overflow-hidden px-2')}>{body}</div>
}

function ImagePicker() {
  const image = useMapUI((s) => s.image)
  const set = useMapUI((s) => s.set)
  const { data: media = [] } = useQuery({ queryKey: ['media'], queryFn: () => api.listMedia() })
  const images = media.filter((m) => !isVideo(m))
  return (
    <div className="flex items-center gap-2">
      <Popover
        side="bottom"
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
