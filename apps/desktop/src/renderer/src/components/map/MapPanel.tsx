import type { ReactNode } from 'react'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BrickWall,
  Combine,
  Copy,
  DoorOpen,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Lightbulb,
  Link2,
  PaintBucket,
  Pencil,
  PenTool,
  Plus,
  SquareDashed,
  Trash2,
  Type,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  DOOR_VARIANTS,
  Layer,
  bakeObjects,
  freeMapId,
  isShaped,
  joinObjects,
  showLayer,
  type MapDoc,
  type MapObject,
  type MapObjectKind,
  type Token,
} from '@maquest/core/map'
import { useNodes } from '../../lib/queries'
import { Button, IconButton, Input, Label, Segmented, Select, cn, floating } from '../ui'
import { useMapUI } from './mapStore'
import { ColorInput, TextureSelect } from './MapToolbar'
import { duplicateIds, patchObject, removeIds, reorder } from './edit'
import { FillRow, NumField, Row, Section, TextField, Toggle } from './fields'

type Props = { doc: MapDoc; commit: (next: MapDoc) => void }

const KIND: Record<MapObjectKind | 'token', { label: string; icon: LucideIcon }> = {
  room: { label: 'Room', icon: SquareDashed },
  area: { label: 'Painted area', icon: PaintBucket },
  wall: { label: 'Wall', icon: BrickWall },
  path: { label: 'Path', icon: PenTool },
  door: { label: 'Door', icon: DoorOpen },
  image: { label: 'Image', icon: ImageIcon },
  label: { label: 'Label', icon: Type },
  light: { label: 'Light', icon: Lightbulb },
  token: { label: 'Token', icon: UserRound },
}

/** Radii are stored in cells but read in the map's unit (a 60 ft darkvision, not 12 cells). */
function UnitField({ doc, label, cells, onChange, min = 0 }: { doc: MapDoc; label: string; cells: number; onChange: (cells: number) => void; min?: number }) {
  const { amount, name } = doc.grid.unit
  return (
    <NumField
      label={label}
      labelClass="w-16"
      value={Math.round(cells * amount * 100) / 100}
      step={amount}
      min={min}
      suffix={name}
      onChange={(v) => onChange(Math.round((v / amount) * 1000) / 1000)}
    />
  )
}

// ---------- selection ----------

/** The inspector of what is selected, floating over the map; empty selection, no panel. */
export function SelectionPanel({ doc, commit }: Props) {
  const selected = useMapUI((s) => s.selected)
  const select = useMapUI((s) => s.select)
  const items = selected.flatMap((id) => [...doc.objects.filter((o) => o.id === id), ...doc.tokens.filter((t) => t.id === id)])
  if (!items.length) return null
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
  const kind = one ? ('kind' in one ? one.kind : 'token') : null
  const Icon = kind ? KIND[kind].icon : Layers
  const title = one ? ('kind' in one ? (one.name ?? KIND[one.kind].label) : one.name) : `${items.length} selected`
  const onlyObjects = items.every((i) => 'kind' in i)
  return (
    <section aria-label="Selection" data-map-selection className={cn(floating, 'pointer-events-auto flex max-h-full w-72 flex-col overflow-hidden')}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-1 pl-3">
        <Icon size={14} aria-hidden className="shrink-0 text-accent-text" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{title}</h2>
        {onlyObjects && (
          <>
            <IconButton size="sm" icon={ArrowUpToLine} label="Bring to front" shortcut="]" onClick={() => commit(reorder(doc, ids, 'front'))} />
            <IconButton size="sm" icon={ArrowDownToLine} label="Send to back" shortcut="[" onClick={() => commit(reorder(doc, ids, 'back'))} />
          </>
        )}
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
        <IconButton size="sm" icon={X} label="Deselect" shortcut="Esc" onClick={() => select([])} />
      </header>
      <div className="min-h-0 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-3">
        {one && 'kind' in one && <ObjectFields doc={doc} o={one} patch={patch} />}
        {one && !('kind' in one) && <TokenFields doc={doc} t={one} patch={patch} />}
        {one && doc.layers.length > 0 && (
          <div className="pt-1.5">
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
            <div className="grid grid-cols-2 gap-1">
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
        {!one && <p className="text-2xs leading-4 text-fg-faint">Drag any of them to move all. Arrow keys nudge.</p>}
      </div>
    </section>
  )
}

const Grid2 = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">{children}</div>

function ObjectFields({ doc, o, patch }: { doc: MapDoc; o: MapObject; patch: (p: Record<string, unknown>) => void }) {
  const shape = isShaped(o) ? o.shape : null
  return (
    <>
      <TextField label="Name" value={o.name ?? ''} placeholder={KIND[o.kind].label} onChange={(name) => patch({ name: name || undefined })} />
      {o.kind === 'room' && (
        <>
          <Row label="Walls">
            <Segmented
              label="How the room joins the others"
              className="min-w-0 flex-1"
              value={o.op}
              onChange={(op) => patch({ op })}
              options={[
                { value: 'add', label: 'Merge', showLabel: true },
                { value: 'subtract', label: 'Cut out', showLabel: true },
                { value: 'separate', label: 'Own walls', showLabel: true },
              ]}
            />
          </Row>
          {o.op !== 'subtract' && (
            <Row label="Light">
              <Segmented
                label="Light inside the room"
                className="min-w-0 flex-1"
                value={o.light ?? 'auto'}
                onChange={(v) => patch({ light: v === 'auto' ? undefined : v })}
                options={[
                  { value: 'auto', label: 'Auto', showLabel: true },
                  { value: 'light', label: 'Lit', showLabel: true },
                  { value: 'dim', label: 'Dim', showLabel: true },
                  { value: 'dark', label: 'Dark', showLabel: true },
                ]}
              />
            </Row>
          )}
        </>
      )}
      {o.kind === 'area' && (
        <Segmented
          label="Combine"
          value={o.op}
          onChange={(op) => patch({ op })}
          options={[
            { value: 'add', label: 'Paint', showLabel: true },
            { value: 'subtract', label: 'Erase paint', showLabel: true },
          ]}
        />
      )}
      {o.kind === 'area' && o.op === 'add' && <FillRow label="Paint" fill={o.fill} onChange={(fill) => patch({ fill })} />}
      {o.kind === 'path' && (
        <>
          <Row label="Stroke">
            <ColorInput label="Stroke color" value={o.stroke?.color ?? '#3b3027'} onChange={(color) => patch({ stroke: { ...o.stroke, color } })} />
            <TextureSelect
              label="Stroke texture"
              value={o.stroke?.texture}
              onChange={(texture) => patch({ stroke: { ...o.stroke, texture } })}
              className="min-w-0 flex-1"
            />
          </Row>
          <NumField
            label="Width"
            value={o.stroke?.width ?? 0.1}
            min={0.01}
            step={0.05}
            suffix="cells"
            onChange={(width) => patch({ stroke: { ...o.stroke, width } })}
          />
          {shape?.type === 'path' && shape.closed && <FillRow label="Fill" fill={o.fill ?? {}} onChange={(fill) => patch({ fill })} />}
        </>
      )}
      {o.kind === 'wall' && (
        <>
          <Row label="Material">
            <ColorInput label="Wall color" value={o.color ?? doc.style.wall.color} onChange={(color) => patch({ color })} />
            <TextureSelect label="Wall material" none="Map default" value={o.texture} onChange={(texture) => patch({ texture })} className="min-w-0 flex-1" />
          </Row>
          <NumField label="Width" value={o.width ?? doc.style.wall.width} min={0.02} step={0.05} suffix="cells" onChange={(width) => patch({ width })} />
          {shape && (shape.type !== 'path' || shape.closed) && (
            <>
              <Toggle
                label="Solid inside (roof, rock, pillar)"
                checked={!!o.fill}
                onChange={(on) => patch({ fill: on ? { texture: 'shingles' } : undefined })}
              />
              {o.fill && <FillRow label="Top" fill={o.fill} onChange={(fill) => patch({ fill })} />}
            </>
          )}
        </>
      )}
      {o.kind === 'door' && (
        <>
          <Row label="Kind">
            <Select aria-label="Door kind" value={o.variant} onChange={(e) => patch({ variant: e.target.value })} className="min-w-0 flex-1">
              {DOOR_VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </Select>
          </Row>
          <Toggle label="Open" checked={o.open} onChange={(open) => patch({ open })} />
        </>
      )}
      {o.kind === 'image' && <NumField label="Opacity" value={o.opacity ?? 1} min={0} max={1} step={0.1} onChange={(opacity) => patch({ opacity })} />}
      {o.kind === 'label' && (
        <>
          <TextField label="Text" field="text" value={o.text} onChange={(text) => patch({ text })} />
          <Row label="Color">
            <ColorInput label="Text color" value={o.color} onChange={(color) => patch({ color })} />
          </Row>
        </>
      )}
      {o.kind === 'light' && (
        <>
          <UnitField doc={doc} label="Bright" cells={o.bright} onChange={(bright) => patch({ bright })} />
          <UnitField doc={doc} label="Dim" cells={o.dim} onChange={(dim) => patch({ dim })} />
          <Row label="Color" labelClass="w-16">
            <ColorInput label="Light color" value={o.color} onChange={(color) => patch({ color })} />
          </Row>
        </>
      )}
      <details className="group pt-1">
        <summary className="flex h-6 cursor-pointer list-none items-center text-xs text-fg-subtle select-none hover:text-fg-muted">Position and size</summary>
        <div className="space-y-1.5 pt-1">
          <Grid2>
            <NumField label="X" labelClass="w-5" value={o.x} onChange={(x) => patch({ x })} />
            <NumField label="Y" labelClass="w-5" value={o.y} onChange={(y) => patch({ y })} />
          </Grid2>
          {o.kind !== 'light' && <NumField label="Rotate" value={o.rotation} step={15} suffix="°" onChange={(rotation) => patch({ rotation })} />}
          {shape?.type === 'rect' && (
            <Grid2>
              <NumField label="W" labelClass="w-5" value={shape.w} min={0.1} onChange={(w) => patch({ shape: { ...shape, w } })} />
              <NumField label="H" labelClass="w-5" value={shape.h} min={0.1} onChange={(h) => patch({ shape: { ...shape, h } })} />
              <NumField label="Corners" value={shape.radius ?? 0} min={0} step={0.25} onChange={(radius) => patch({ shape: { ...shape, radius } })} />
            </Grid2>
          )}
          {shape?.type === 'ellipse' && (
            <Grid2>
              <NumField label="Rx" labelClass="w-5" value={shape.rx} min={0.1} onChange={(rx) => patch({ shape: { ...shape, rx } })} />
              <NumField label="Ry" labelClass="w-5" value={shape.ry} min={0.1} onChange={(ry) => patch({ shape: { ...shape, ry } })} />
            </Grid2>
          )}
          {o.kind === 'door' && <NumField label="Width" value={o.width} min={0.25} step={0.5} suffix="cells" onChange={(width) => patch({ width })} />}
          {o.kind === 'image' && (
            <Grid2>
              <NumField label="W" labelClass="w-5" value={o.w} min={0.1} onChange={(w) => patch({ w })} />
              <NumField label="H" labelClass="w-5" value={o.h} min={0.1} onChange={(h) => patch({ h })} />
            </Grid2>
          )}
          {o.kind === 'label' && <NumField label="Size" value={o.size} min={0.1} step={0.1} suffix="cells" onChange={(size) => patch({ size })} />}
          <Toggle label="Locked" checked={!!o.locked} onChange={(locked) => patch({ locked: locked || undefined })} />
        </div>
      </details>
      <p className="text-2xs leading-4 text-fg-faint">{HINT[o.kind]}</p>
    </>
  )
}

const HINT: Record<MapObjectKind, string> = {
  room: 'Drag the corners to resize, the top dot to rotate.',
  area: 'Drag the corners to resize, the top dot to rotate.',
  wall: 'Drag the white squares to move points and the dots to bend curves (Alt breaks the pair).',
  path: 'Drag the white squares to move points and the dots to bend curves (Alt breaks the pair).',
  door: 'Drag its ends to make it wider. Double-click opens and closes it.',
  image: 'Drag the corners to resize, the top dot to rotate.',
  label: 'Drag the corners to change the text size.',
  light: 'Drag the handles on its rings to change how far it shines.',
}

function TokenFields({ doc, t, patch }: { doc: MapDoc; t: Token; patch: (p: Record<string, unknown>) => void }) {
  const { data: nodes = [] } = useNodes()
  const characters = nodes.filter((n) => n.type === 'character')
  return (
    <>
      <Row label="Name" labelClass="w-16">
        <ColorInput label="Token color" value={t.color} onChange={(color) => patch({ color })} />
        <div className="min-w-0 flex-1">
          <TextField label="Token name" labelClass="sr-only" value={t.name} onChange={(name) => patch({ name })} />
        </div>
      </Row>
      {characters.length > 0 && (
        <Row label="Character" labelClass="w-16">
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
        </Row>
      )}
      <div className="flex gap-3">
        <Toggle label="Player (reveals fog)" checked={t.player} onChange={(player) => patch({ player })} />
        <Toggle label="Hidden" checked={!!t.hidden} onChange={(hidden) => patch({ hidden: hidden || undefined })} />
      </div>
      <Segmented
        label="Vision"
        value={t.vision === undefined ? 'all' : 'limited'}
        onChange={(v) => patch({ vision: v === 'all' ? undefined : 12 })}
        options={[
          { value: 'all', label: 'Unlimited sight', showLabel: true },
          { value: 'limited', label: 'Limited sight', showLabel: true },
        ]}
      />
      {t.vision !== undefined && <UnitField doc={doc} label="Vision" cells={t.vision} onChange={(vision) => patch({ vision })} />}
      <UnitField doc={doc} label="Darkvision" cells={t.darkvision ?? 0} onChange={(darkvision) => patch({ darkvision: darkvision || undefined })} />
      <NumField label="Size" labelClass="w-16" value={t.size} min={0.25} step={0.5} suffix="cells" onChange={(size) => patch({ size })} />
      <p className="text-2xs leading-4 text-fg-faint">Drag the handles on the map: the corner square resizes, the ring handles set vision and darkvision.</p>
    </>
  )
}

// ---------- layers ----------

/** Layers: show or hide sets of objects; layers of a group swap. */
export function LayersSection({ doc, commit }: Props) {
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
          Show or hide sets of objects. Layers with the same group swap, e.g. a town before and after a battle.
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

// ---------- map settings (also the project defaults for new maps) ----------

type SettingsValue = Pick<MapDoc, 'grid' | 'style'>

/** Grid, units and style of a map, or of the project defaults for new maps. */
export function MapSettingsForm({ value, onChange }: { value: SettingsValue; onChange: (next: SettingsValue) => void }) {
  const g = value.grid
  const st = value.style
  const setGrid = (p: Partial<MapDoc['grid']>) => onChange({ ...value, grid: { ...g, ...p } })
  const setStyle = (p: Partial<MapDoc['style']>) => onChange({ ...value, style: { ...st, ...p } })
  const lc = 'w-20'
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="mb-1">Size</Label>
        <Grid2>
          <NumField label="Columns" labelClass="w-14" value={g.cols} min={1} max={500} step={1} onChange={(cols) => setGrid({ cols: Math.round(cols) })} />
          <NumField label="Rows" labelClass="w-10" value={g.rows} min={1} max={500} step={1} onChange={(rows) => setGrid({ rows: Math.round(rows) })} />
        </Grid2>
      </div>
      <div className="space-y-1.5">
        <Label className="mb-1">Distances</Label>
        <Row label="1 cell is" labelClass={lc}>
          <div className="w-16 shrink-0">
            <NumField
              label="Cell length"
              labelClass="sr-only"
              value={g.unit.amount}
              min={0.01}
              step={1}
              onChange={(amount) => setGrid({ unit: { ...g.unit, amount } })}
            />
          </div>
          <div className="min-w-0 flex-1">
            <TextField label="Unit" labelClass="sr-only" value={g.unit.name} onChange={(name) => setGrid({ unit: { ...g.unit, name } })} />
          </div>
        </Row>
        <Row label="Diagonals" labelClass={lc}>
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
        </Row>
      </div>
      <div className="space-y-1.5">
        <Label className="mb-1">Grid</Label>
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
        <NumField
          label="Export"
          labelClass={lc}
          value={g.size}
          min={8}
          max={400}
          step={10}
          suffix="px per cell"
          onChange={(size) => setGrid({ size: Math.round(size) })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="mb-1">Look</Label>
        <FillRow label="Ground" labelClass={lc} fill={st.background} onChange={(background) => setStyle({ background })} />
        <FillRow label="Floors" labelClass={lc} fill={st.floor} onChange={(floor) => setStyle({ floor })} />
        <Row label="Walls" labelClass={lc}>
          <ColorInput label="Wall color" value={st.wall.color} onChange={(color) => setStyle({ wall: { ...st.wall, color } })} />
          <TextureSelect
            label="Wall material"
            none="No material"
            value={st.wall.texture}
            onChange={(texture) => setStyle({ wall: { ...st.wall, texture } })}
            className="min-w-0 flex-1"
          />
        </Row>
        <NumField
          label="Wall width"
          labelClass={lc}
          value={st.wall.width}
          min={0.02}
          step={0.05}
          suffix="cells"
          onChange={(width) => setStyle({ wall: { ...st.wall, width } })}
        />
      </div>
    </div>
  )
}
