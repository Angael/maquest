import { useState, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpToLine, Combine, Copy, Eye, EyeOff, Layers, Link2, Plus, Trash2, Pencil, RotateCcw } from 'lucide-react'
import {
  DOOR_VARIANTS,
  Layer,
  bakeObjects,
  freeMapId,
  isShaped,
  joinObjects,
  showLayer,
  type Fill,
  type MapDoc,
  type MapObject,
  type Token,
} from '@maquest/core/map'
import { useNodes } from '../../lib/queries'
import { Button, IconButton, Input, Label, Segmented, Select, cn } from '../ui'
import { useMapUI } from './mapStore'
import { ColorInput, TextureSelect } from './MapToolbar'
import { duplicateIds, patchObject, removeIds, reorder } from './edit'

type Props = { doc: MapDoc; commit: (next: MapDoc) => void }

type NumProps = {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  suffix?: string
  className?: string
}

/** Number input that commits on Enter / blur (so typing "1." does not jump); a new value from outside resets it. */
export const NumField = (p: NumProps) => <NumInput key={p.value} {...p} />

function NumInput({ label, value, onChange, step = 0.5, min, suffix, className }: NumProps) {
  const [text, setText] = useState(String(round(value)))
  const done = () => {
    const n = Number(text)
    if (text.trim() !== '' && Number.isFinite(n) && (min === undefined || n >= min)) {
      if (n !== value) onChange(n)
    } else setText(String(round(value)))
  }
  return (
    <label className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <span className="w-12 shrink-0 text-xs text-fg-subtle">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        className="tabular h-6 min-w-0 px-1.5 text-xs"
      />
      {suffix && <span className="shrink-0 text-xs text-fg-faint">{suffix}</span>}
    </label>
  )
}

type TextProps = { label: string; value: string; onChange: (v: string) => void; field?: string }
const TextField = (p: TextProps) => <TextInput key={p.value} {...p} />

function TextInput({ label, value, onChange, field }: TextProps) {
  const [text, setText] = useState(value)
  return (
    <label className="flex min-w-0 items-center gap-1.5">
      <span className="w-12 shrink-0 text-xs text-fg-subtle">{label}</span>
      <Input
        data-map-field={field}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onChange(text)}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        className="h-6 min-w-0 px-1.5 text-xs"
      />
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex h-6 cursor-pointer items-center gap-2 text-xs text-fg-muted">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  )
}

const round = (n: number) => Math.round(n * 100) / 100

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <div className="mb-2 flex h-6 items-center justify-between">
        <h3 className="text-xs font-medium text-fg-subtle">{title}</h3>
        {action}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function FillRow({ label, fill, onChange }: { label: string; fill: Fill; onChange: (f: Fill) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-xs text-fg-subtle">{label}</span>
      <ColorInput label={`${label} color`} value={fill.color ?? '#888888'} onChange={(color) => onChange({ ...fill, color })} />
      <TextureSelect label={`${label} texture`} value={fill.texture} onChange={(texture) => onChange({ ...fill, texture })} className="min-w-0 flex-1" />
    </div>
  )
}

export function MapPanel({ doc, commit }: Props) {
  const selected = useMapUI((s) => s.selected)
  const items = selected.flatMap((id) => [...doc.objects.filter((o) => o.id === id), ...doc.tokens.filter((t) => t.id === id)])
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {items.length > 0 && <SelectionSection doc={doc} commit={commit} items={items} />}
      <LayersSection doc={doc} commit={commit} />
      <FogSection doc={doc} commit={commit} />
      <GridSection doc={doc} commit={commit} />
      <StyleSection doc={doc} commit={commit} />
      <TokensSection doc={doc} />
    </div>
  )
}

function SelectionSection({ doc, commit, items }: Props & { items: (MapObject | Token)[] }) {
  const select = useMapUI((s) => s.select)
  const ids = items.map((i) => i.id)
  const one = items.length === 1 ? items[0] : null
  const patch = (p: Record<string, unknown>) => one && commit(patchObject(doc, one.id, p))
  const shapes = items.filter((i): i is Extract<MapObject, { shape: unknown }> => 'kind' in i && isShaped(i))
  const closed = shapes.filter((o) => o.shape.type !== 'path' || o.shape.closed)
  const open = shapes.filter((o) => o.shape.type === 'path' && !o.shape.closed)
  const run = (fn: (d: MapDoc) => string) => {
    const next = structuredClone(doc)
    fn(next)
    commit(next)
  }
  const title = one ? ('kind' in one ? (one.name ?? `${one.kind[0].toUpperCase()}${one.kind.slice(1)}`) : one.name) : `${items.length} selected`
  return (
    <Section
      title={title}
      action={
        <div className="flex items-center">
          <IconButton size="sm" icon={ArrowUpToLine} label="Bring to front" shortcut="]" onClick={() => commit(reorder(doc, ids, 'front'))} />
          <IconButton size="sm" icon={ArrowDownToLine} label="Send to back" shortcut="[" onClick={() => commit(reorder(doc, ids, 'back'))} />
          <IconButton
            size="sm"
            icon={Copy}
            label="Duplicate"
            shortcut="Ctrl+D"
            onClick={() => {
              const r = duplicateIds(doc, ids)
              commit(r.doc)
              select(r.ids)
            }}
          />
          <IconButton
            size="sm"
            icon={Trash2}
            label="Delete"
            shortcut="Del"
            onClick={() => {
              commit(removeIds(doc, ids))
              select([])
            }}
          />
        </div>
      }
    >
      {one && 'kind' in one && <ObjectFields o={one} patch={patch} />}
      {one && !('kind' in one) && <TokenFields t={one} patch={patch} />}
      {one && doc.layers.length > 0 && (
        <div className="pt-1">
          <Label className="mb-1">On layers</Label>
          <div className="flex flex-wrap gap-x-3">
            {doc.layers.map((l) => (
              <Toggle
                key={l.id}
                label={l.name}
                checked={one.layers.includes(l.id)}
                onChange={(on) => patch({ layers: on ? [...one.layers, l.id] : one.layers.filter((x) => x !== l.id) })}
              />
            ))}
          </div>
          {!one.layers.length && <p className="text-2xs text-fg-faint">On no layer: always shown.</p>}
        </div>
      )}
      {closed.length >= 2 && closed.length === items.length && (
        <div className="pt-1">
          <Label className="mb-1">Combine into one shape</Label>
          <div className="grid grid-cols-4 gap-1">
            {(['union', 'subtract', 'intersect', 'exclude'] as const).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant="subtle"
                title={mode === 'subtract' ? 'Cut the later shapes out of the first selected' : undefined}
                onClick={() => {
                  run((d) => bakeObjects(d, ids, mode))
                  select([ids[0]])
                }}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      )}
      {open.length >= 1 && open.length <= 2 && open.length === items.length && (
        <Button
          size="sm"
          variant="subtle"
          className="w-full"
          onClick={() => {
            run((d) => joinObjects(d, ids))
            select([ids[0]])
          }}
        >
          {open.length === 2 ? <Link2 size={14} aria-hidden /> : <Combine size={14} aria-hidden />}
          {open.length === 2 ? 'Join the two lines' : 'Close the line'}
        </Button>
      )}
    </Section>
  )
}

function ObjectFields({ o, patch }: { o: MapObject; patch: (p: Record<string, unknown>) => void }) {
  const xy = (
    <div className="grid grid-cols-2 gap-1.5">
      <NumField label="X" value={o.x} onChange={(x) => patch({ x })} />
      <NumField label="Y" value={o.y} onChange={(y) => patch({ y })} />
      {o.kind !== 'light' && <NumField label="Rotate" value={o.rotation} step={15} suffix="°" onChange={(rotation) => patch({ rotation })} />}
    </div>
  )
  const shape = isShaped(o) ? o.shape : null
  return (
    <>
      <TextField label="Name" value={o.name ?? ''} onChange={(name) => patch({ name: name || undefined })} />
      {xy}
      {shape?.type === 'rect' && (
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="Width" value={shape.w} min={0.1} onChange={(w) => patch({ shape: { ...shape, w } })} />
          <NumField label="Height" value={shape.h} min={0.1} onChange={(h) => patch({ shape: { ...shape, h } })} />
          <NumField label="Corners" value={shape.radius ?? 0} min={0} step={0.25} onChange={(radius) => patch({ shape: { ...shape, radius } })} />
        </div>
      )}
      {shape?.type === 'ellipse' && (
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="Rx" value={shape.rx} min={0.1} onChange={(rx) => patch({ shape: { ...shape, rx } })} />
          <NumField label="Ry" value={shape.ry} min={0.1} onChange={(ry) => patch({ shape: { ...shape, ry } })} />
        </div>
      )}
      {shape?.type === 'path' && (
        <p className="text-2xs text-fg-faint">
          {shape.points.length} points. Drag the white squares to move points and the dots to bend curves (Alt breaks the pair).
        </p>
      )}
      {(o.kind === 'room' || o.kind === 'area') && (
        <Segmented
          label="Combine"
          value={o.op}
          onChange={(op) => patch({ op })}
          options={[
            { value: 'add', label: 'Add', showLabel: true },
            { value: 'subtract', label: o.kind === 'room' ? 'Cut out' : 'Erase', showLabel: true },
          ]}
        />
      )}
      {o.kind === 'area' && o.op === 'add' && <FillRow label="Paint" fill={o.fill} onChange={(fill) => patch({ fill })} />}
      {o.kind === 'path' && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="w-12 shrink-0 text-xs text-fg-subtle">Stroke</span>
            <ColorInput label="Stroke color" value={o.stroke?.color ?? '#3b3027'} onChange={(color) => patch({ stroke: { ...o.stroke, color } })} />
            <TextureSelect
              label="Stroke texture"
              value={o.stroke?.texture}
              onChange={(texture) => patch({ stroke: { ...o.stroke, texture } })}
              className="min-w-0 flex-1"
            />
          </div>
          <NumField label="Width" value={o.stroke?.width ?? 0.1} min={0.01} step={0.05} onChange={(width) => patch({ stroke: { ...o.stroke, width } })} />
          {shape?.type === 'path' && shape.closed && <FillRow label="Fill" fill={o.fill ?? {}} onChange={(fill) => patch({ fill })} />}
        </>
      )}
      {o.kind === 'wall' && (
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="Width" value={o.width ?? 0.25} min={0.02} step={0.05} onChange={(width) => patch({ width })} />
          <div className="flex items-center gap-1.5">
            <span className="w-12 shrink-0 text-xs text-fg-subtle">Color</span>
            <ColorInput label="Wall color" value={o.color ?? '#2b241e'} onChange={(color) => patch({ color })} />
          </div>
        </div>
      )}
      {o.kind === 'door' && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <NumField label="Width" value={o.width} min={0.25} step={0.5} onChange={(width) => patch({ width })} />
            <Select aria-label="Door kind" value={o.variant} onChange={(e) => patch({ variant: e.target.value })}>
              {DOOR_VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <Toggle label="Open" checked={o.open} onChange={(open) => patch({ open })} />
        </>
      )}
      {o.kind === 'image' && (
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="Width" value={o.w} min={0.1} onChange={(w) => patch({ w })} />
          <NumField label="Height" value={o.h} min={0.1} onChange={(h) => patch({ h })} />
          <NumField label="Opacity" value={o.opacity ?? 1} min={0} step={0.1} onChange={(opacity) => patch({ opacity: Math.min(1, opacity) })} />
        </div>
      )}
      {o.kind === 'label' && (
        <>
          <TextField label="Text" field="text" value={o.text} onChange={(text) => patch({ text })} />
          <div className="grid grid-cols-2 gap-1.5">
            <NumField label="Size" value={o.size} min={0.1} step={0.1} onChange={(size) => patch({ size })} />
            <div className="flex items-center gap-1.5">
              <span className="w-12 shrink-0 text-xs text-fg-subtle">Color</span>
              <ColorInput label="Text color" value={o.color} onChange={(color) => patch({ color })} />
            </div>
          </div>
        </>
      )}
      {o.kind === 'light' && (
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="Bright" value={o.bright} min={0} step={1} suffix="cells" onChange={(bright) => patch({ bright })} />
          <NumField label="Dim" value={o.dim} min={0} step={1} suffix="cells" onChange={(dim) => patch({ dim })} />
          <div className="flex items-center gap-1.5">
            <span className="w-12 shrink-0 text-xs text-fg-subtle">Color</span>
            <ColorInput label="Light color" value={o.color} onChange={(color) => patch({ color })} />
          </div>
        </div>
      )}
      <Toggle label="Locked" checked={!!o.locked} onChange={(locked) => patch({ locked: locked || undefined })} />
    </>
  )
}

function TokenFields({ t, patch }: { t: Token; patch: (p: Record<string, unknown>) => void }) {
  const { data: nodes = [] } = useNodes()
  const characters = nodes.filter((n) => n.type === 'character')
  return (
    <>
      <TextField label="Name" value={t.name} onChange={(name) => patch({ name })} />
      <div className="grid grid-cols-2 gap-1.5">
        <NumField label="Size" value={t.size} min={0.25} step={1} suffix="cells" onChange={(size) => patch({ size })} />
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-xs text-fg-subtle">Color</span>
          <ColorInput label="Token color" value={t.color} onChange={(color) => patch({ color })} />
        </div>
        <NumField label="Vision" value={t.vision ?? 0} min={0} step={1} suffix="cells" onChange={(vision) => patch({ vision: vision || undefined })} />
        <NumField
          label="Darkvis."
          value={t.darkvision ?? 0}
          min={0}
          step={1}
          suffix="cells"
          onChange={(darkvision) => patch({ darkvision: darkvision || undefined })}
        />
      </div>
      <p className="text-2xs text-fg-faint">Vision 0 = unlimited in light.</p>
      <div className="flex gap-3">
        <Toggle label="Player (reveals fog)" checked={t.player} onChange={(player) => patch({ player })} />
        <Toggle label="Hidden" checked={!!t.hidden} onChange={(hidden) => patch({ hidden: hidden || undefined })} />
      </div>
      {characters.length > 0 && (
        <label className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-xs text-fg-subtle">Node</span>
          <Select
            aria-label="Linked character"
            value={t.node ?? ''}
            className="min-w-0 flex-1"
            onChange={(e) => {
              const node = characters.find((n) => n.id === e.target.value)
              patch({ node: e.target.value || undefined, ...(node && t.name.startsWith('Token ') ? { name: node.title } : {}) })
            }}
          >
            <option value="">None</option>
            {characters.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </Select>
        </label>
      )}
    </>
  )
}

function LayersSection({ doc, commit }: Props) {
  const active = useMapUI((s) => s.activeLayer)
  const set = useMapUI((s) => s.set)
  const update = (id: string, p: Partial<Layer>) => commit({ ...doc, layers: doc.layers.map((l) => (l.id === id ? { ...l, ...p } : l)) })
  const groups = [...new Set(doc.layers.map((l) => l.group).filter((g): g is string => !!g))]
  return (
    <Section
      title="Layers"
      action={
        <IconButton
          size="sm"
          icon={Plus}
          label="Add layer"
          onClick={() => {
            const id = freeMapId(doc, 'layer')
            commit({ ...doc, layers: [...doc.layers, Layer.parse({ id, name: `Layer ${doc.layers.length + 1}` })] })
            set({ activeLayer: id })
          }}
        />
      }
    >
      {doc.layers.length === 0 && (
        <p className="text-xs leading-5 text-fg-subtle">
          Layers show or hide sets of objects. Give two layers the same group to swap between them, e.g. a town before and after a battle.
        </p>
      )}
      {doc.layers.map((l) => (
        <div key={l.id} className={cn('group flex items-center gap-1 rounded-md pr-1', active === l.id && 'bg-accent-soft')}>
          <IconButton
            size="sm"
            icon={l.visible ? Eye : EyeOff}
            label={l.visible ? `Hide ${l.name}` : l.group ? `Show ${l.name} (hides the rest of ${l.group})` : `Show ${l.name}`}
            onClick={() => commit(showLayer(structuredClone(doc), l.id, !l.visible))}
          />
          <Input
            value={l.name}
            aria-label="Layer name"
            onChange={(e) => update(l.id, { name: e.target.value })}
            className="h-6 min-w-0 flex-1 px-1.5 text-xs"
          />
          <Input
            value={l.group ?? ''}
            placeholder="group"
            aria-label="Exclusive group"
            title="Layers with the same group swap: showing one hides the others"
            list="map-layer-groups"
            onChange={(e) => update(l.id, { group: e.target.value || undefined })}
            className="h-6 w-16 px-1.5 text-xs"
          />
          <IconButton
            size="sm"
            icon={Pencil}
            label={active === l.id ? 'Drawing on this layer (click to stop)' : 'Draw new objects on this layer'}
            active={active === l.id}
            onClick={() => set({ activeLayer: active === l.id ? null : l.id })}
          />
          <IconButton
            size="sm"
            icon={Trash2}
            label={`Delete layer ${l.name} (objects stay)`}
            onClick={() => {
              if (active === l.id) set({ activeLayer: null })
              commit({
                ...doc,
                layers: doc.layers.filter((x) => x.id !== l.id),
                objects: doc.objects.map((o) => ({ ...o, layers: o.layers.filter((x) => x !== l.id) })),
                tokens: doc.tokens.map((t) => ({ ...t, layers: t.layers.filter((x) => x !== l.id) })),
              })
            }}
          />
        </div>
      ))}
      <datalist id="map-layer-groups">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      {groups.map((g) => {
        const members = doc.layers.filter((l) => l.group === g)
        const shown = members.find((l) => l.visible)
        return members.length > 1 ? (
          <div key={g} className="flex items-center gap-2 pt-1">
            <Layers size={14} aria-hidden className="shrink-0 text-fg-subtle" />
            <Segmented
              label={`Swap ${g}`}
              value={shown?.id ?? ''}
              onChange={(id) => commit(showLayer(structuredClone(doc), id))}
              options={members.map((l) => ({ value: l.id, label: l.name, showLabel: true }))}
              className="min-w-0 flex-1"
            />
          </div>
        ) : null
      })}
    </Section>
  )
}

function FogSection({ doc, commit }: Props) {
  const fog = doc.fog
  const setFog = (p: Partial<MapDoc['fog']>) => commit({ ...doc, fog: { ...fog, ...p } })
  return (
    <Section
      title="Vision and fog of war"
      action={fog.explored.length > 0 ? <IconButton size="sm" icon={RotateCcw} label="Reset explored areas" onClick={() => setFog({ explored: [] })} /> : null}
    >
      <Toggle label="Fog of war: players reveal what their tokens see" checked={fog.enabled} onChange={(enabled) => setFog({ enabled })} />
      <Segmented
        label="Light"
        value={fog.ambient}
        onChange={(ambient) => setFog({ ambient })}
        options={[
          { value: 'light', label: 'Daylight', showLabel: true },
          { value: 'dim', label: 'Dim', showLabel: true },
          { value: 'dark', label: 'Dark', showLabel: true },
        ]}
      />
      <p className="text-2xs leading-4 text-fg-faint">
        In the dark, players see only lit areas and what darkvision reaches. Walls and closed doors block sight.
      </p>
    </Section>
  )
}

function GridSection({ doc, commit }: Props) {
  const g = doc.grid
  const setGrid = (p: Partial<MapDoc['grid']>) => commit({ ...doc, grid: { ...g, ...p } })
  return (
    <Section title="Grid and units">
      <div className="grid grid-cols-2 gap-1.5">
        <NumField label="Columns" value={g.cols} min={1} step={1} onChange={(cols) => setGrid({ cols: Math.round(Math.min(500, cols)) })} />
        <NumField label="Rows" value={g.rows} min={1} step={1} onChange={(rows) => setGrid({ rows: Math.round(Math.min(500, rows)) })} />
        <NumField label="1 cell =" value={g.unit.amount} min={0.01} step={1} onChange={(amount) => setGrid({ unit: { ...g.unit, amount } })} />
        <TextField label="Unit" value={g.unit.name} onChange={(name) => setGrid({ unit: { ...g.unit, name } })} />
      </div>
      <label className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 text-xs text-fg-subtle">Diagonal</span>
        <Select
          aria-label="Diagonal rule"
          value={g.diagonal}
          onChange={(e) => setGrid({ diagonal: e.target.value as MapDoc['grid']['diagonal'] })}
          className="min-w-0 flex-1"
        >
          <option value="equal">1 cell (D&D 2024)</option>
          <option value="alternate">1, 2, 1, 2… (5-10-5)</option>
          <option value="euclid">Exact (√2)</option>
        </Select>
      </label>
      <div className="flex items-center gap-3">
        <Toggle label="Show grid" checked={g.show} onChange={(show) => setGrid({ show })} />
        <ColorInput label="Grid color" value={g.color} onChange={(color) => setGrid({ color })} />
        <input
          type="range"
          aria-label="Grid opacity"
          min={0.05}
          max={1}
          step={0.05}
          value={g.opacity}
          onChange={(e) => setGrid({ opacity: Number(e.target.value) })}
          className="min-w-0 flex-1 accent-accent"
        />
      </div>
      <NumField label="Export" value={g.size} min={8} step={10} suffix="px / cell" onChange={(size) => setGrid({ size: Math.round(Math.min(400, size)) })} />
    </Section>
  )
}

function StyleSection({ doc, commit }: Props) {
  const st = doc.style
  const setStyle = (p: Partial<MapDoc['style']>) => commit({ ...doc, style: { ...st, ...p } })
  return (
    <Section title="Style">
      <FillRow label="Ground" fill={st.background} onChange={(background) => setStyle({ background })} />
      <FillRow label="Floor" fill={st.floor} onChange={(floor) => setStyle({ floor })} />
      <div className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 text-xs text-fg-subtle">Walls</span>
        <ColorInput label="Wall color" value={st.wall.color} onChange={(color) => setStyle({ wall: { ...st.wall, color } })} />
        <NumField
          label="Width"
          value={st.wall.width}
          min={0.02}
          step={0.05}
          onChange={(width) => setStyle({ wall: { ...st.wall, width } })}
          className="flex-1"
        />
      </div>
    </Section>
  )
}

function TokensSection({ doc }: { doc: MapDoc }) {
  const selected = useMapUI((s) => s.selected)
  const select = useMapUI((s) => s.select)
  if (!doc.tokens.length) return null
  return (
    <Section title="Tokens">
      {doc.tokens.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => select([t.id])}
          className={cn(
            'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-fg-muted hover:bg-hover',
            selected.includes(t.id) && 'bg-accent-soft text-fg',
          )}
        >
          <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: t.color }} />
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
          {t.player && <span className="text-2xs text-fg-faint">player</span>}
        </button>
      ))}
    </Section>
  )
}
