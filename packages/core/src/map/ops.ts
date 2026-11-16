import { z } from 'zod'
import { bake, joinPaths, objectRegion, regionShape, worldPoints, type BakeOp } from './geometry'
import {
  AMBIENT,
  DiagonalRule,
  Fill,
  Grid,
  Layer,
  MapDoc,
  MapObject,
  OBJECT_KINDS,
  Token,
  freeMapId,
  isShaped,
  showLayer,
  type MapObjectKind,
  type ShapedObject,
} from './schema'

/*
 * Batch edits of a map document, shared by the MCP `map` tool and the app. All ops apply to a copy in order; the
 * result is validated as a whole, so a failing op leaves the map unchanged.
 */

const Loose = z.record(z.string(), z.unknown())

export const MapOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), object: Loose.describe('A map object; id optional (generated from kind)') }),
  z.object({ op: z.literal('update'), id: z.string(), set: Loose.describe('Fields to change; shape/fill/stroke are replaced whole') }),
  z.object({ op: z.literal('remove'), ids: z.array(z.string()).min(1).describe('Object, token or layer ids') }),
  z.object({ op: z.literal('order'), id: z.string(), to: z.enum(['front', 'back', 'forward', 'backward']) }),
  z.object({
    op: z.literal('layer'),
    id: z.string().optional().describe('Existing layer id to change; omit to add a layer'),
    name: z.string().optional(),
    visible: z.boolean().optional(),
    group: z.string().nullable().optional().describe('Exclusive group: showing one layer of a group hides the rest'),
    objects: z.array(z.string()).optional().describe('Put these objects/tokens on the layer (keeps their other layers)'),
    removeObjects: z.array(z.string()).optional().describe('Take these objects/tokens off the layer'),
  }),
  z.object({ op: z.literal('show'), layer: z.string().describe('Show this layer; layers of its group hide (before/after swap)') }),
  z.object({ op: z.literal('token'), id: z.string().optional().describe('Existing token id to change; omit to add'), set: Loose }),
  z.object({ op: z.literal('grid'), set: Loose.describe('cols, rows, size, unit {amount,name}, diagonal, show, color, opacity') }),
  z.object({ op: z.literal('style'), set: Loose.describe('background, floor (fills), wall {color,width}') }),
  z.object({
    op: z.literal('fog'),
    enabled: z.boolean().optional(),
    ambient: z.enum(AMBIENT).optional(),
    reset: z.boolean().optional().describe('Forget what players have explored'),
  }),
  z.object({
    op: z.literal('bake'),
    ids: z.array(z.string()).min(2),
    mode: z.enum(['union', 'subtract', 'intersect', 'exclude']),
  }),
  z.object({ op: z.literal('join'), ids: z.array(z.string()).min(1).max(2).describe('Two open paths/walls to join, or one to close') }),
])
export type MapOp = z.infer<typeof MapOp>

const PREFIX: Record<MapObjectKind, string> = {
  area: 'area',
  room: 'room',
  wall: 'wall',
  path: 'path',
  door: 'door',
  image: 'img',
  label: 'label',
  light: 'light',
}

function zodMessage(e: unknown) {
  if (e instanceof z.ZodError) return e.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ')
  return e instanceof Error ? e.message : String(e)
}

function findObject(doc: MapDoc, id: string) {
  const i = doc.objects.findIndex((o) => o.id === id)
  if (i < 0) throw new Error(`No object ${id}. Objects: ${doc.objects.map((o) => o.id).join(', ') || 'none'}`)
  return i
}

function checkLayers(doc: MapDoc, layers: readonly string[]) {
  const missing = layers.filter((l) => !doc.layers.some((x) => x.id === l))
  if (missing.length)
    throw new Error(`Unknown layer ${missing.join(', ')}. Layers: ${doc.layers.map((l) => l.id).join(', ') || 'none (add one with op layer)'}`)
}

/** Applies ops to a copy of the doc; returns the new doc and one line per op. Throws `#n: message` on failure. */
export function applyMapOps(input: MapDoc, ops: readonly MapOp[]): { doc: MapDoc; results: string[] } {
  const doc: MapDoc = structuredClone(input)
  const results: string[] = []
  ops.forEach((op, n) => {
    try {
      results.push(`#${n + 1} ${applyOne(doc, op)}`)
    } catch (e) {
      throw new Error(`#${n + 1} (${op.op}): ${zodMessage(e)}`)
    }
  })
  return { doc: MapDoc.parse(doc), results }
}

function applyOne(doc: MapDoc, op: MapOp): string {
  switch (op.op) {
    case 'add': {
      const kind = op.object.kind as MapObjectKind
      if (!OBJECT_KINDS.includes(kind)) throw new Error(`object.kind must be one of ${OBJECT_KINDS.join(', ')}`)
      const id = typeof op.object.id === 'string' ? op.object.id : freeMapId(doc, PREFIX[kind])
      if (doc.objects.some((o) => o.id === id) || doc.tokens.some((t) => t.id === id)) throw new Error(`Id ${id} is taken`)
      const object = MapObject.parse({ x: 0, y: 0, ...op.object, id })
      checkLayers(doc, object.layers)
      doc.objects.push(object)
      return `added ${object.kind} ${id}`
    }
    case 'update': {
      const token = doc.tokens.findIndex((t) => t.id === op.id)
      if (token >= 0) return applyOne(doc, { op: 'token', id: op.id, set: op.set })
      const i = findObject(doc, op.id)
      const next = MapObject.parse({ ...doc.objects[i], ...op.set, id: op.id, kind: doc.objects[i].kind })
      checkLayers(doc, next.layers)
      doc.objects[i] = next
      return `updated ${op.id}`
    }
    case 'remove': {
      for (const id of op.ids) {
        if (doc.layers.some((l) => l.id === id)) {
          doc.layers = doc.layers.filter((l) => l.id !== id)
          for (const o of [...doc.objects, ...doc.tokens]) o.layers = o.layers.filter((l) => l !== id)
        } else if (doc.tokens.some((t) => t.id === id)) doc.tokens = doc.tokens.filter((t) => t.id !== id)
        else doc.objects.splice(findObject(doc, id), 1)
      }
      return `removed ${op.ids.join(', ')}`
    }
    case 'order': {
      const i = findObject(doc, op.id)
      const [o] = doc.objects.splice(i, 1)
      const to = op.to === 'front' ? doc.objects.length : op.to === 'back' ? 0 : op.to === 'forward' ? Math.min(doc.objects.length, i + 1) : Math.max(0, i - 1)
      doc.objects.splice(to, 0, o)
      return `moved ${op.id} ${op.to}`
    }
    case 'layer': {
      let layer = op.id ? doc.layers.find((l) => l.id === op.id) : undefined
      if (op.id && !layer) throw new Error(`No layer ${op.id}. Layers: ${doc.layers.map((l) => l.id).join(', ') || 'none'}`)
      if (!layer) {
        if (!op.name) throw new Error('A new layer needs a name')
        layer = Layer.parse({ id: freeMapId(doc, 'layer'), name: op.name, group: op.group ?? undefined })
        doc.layers.push(layer)
      }
      if (op.name) layer.name = op.name
      if (op.group === null) delete layer.group
      else if (op.group) layer.group = op.group
      if (op.visible !== undefined) showLayer(doc, layer.id, op.visible)
      const id = layer.id
      for (const target of op.objects ?? []) {
        const o = doc.objects.find((x) => x.id === target) ?? doc.tokens.find((x) => x.id === target)
        if (!o) throw new Error(`No object or token ${target}`)
        if (!o.layers.includes(id)) o.layers.push(id)
      }
      for (const target of op.removeObjects ?? []) {
        const o = doc.objects.find((x) => x.id === target) ?? doc.tokens.find((x) => x.id === target)
        if (o) o.layers = o.layers.filter((l) => l !== id)
      }
      return `layer ${id} (${layer.name}${layer.group ? `, group ${layer.group}` : ''}, ${layer.visible ? 'visible' : 'hidden'})`
    }
    case 'show': {
      showLayer(doc, op.layer, true)
      return `showing ${op.layer}; ${
        doc.layers
          .filter((l) => !l.visible)
          .map((l) => l.id)
          .join(', ') || 'no layers'
      } hidden`
    }
    case 'token': {
      const i = op.id ? doc.tokens.findIndex((t) => t.id === op.id) : -1
      if (op.id && i < 0 && doc.objects.some((o) => o.id === op.id)) throw new Error(`${op.id} is an object, not a token`)
      if (i >= 0) {
        doc.tokens[i] = Token.parse({ ...doc.tokens[i], ...op.set, id: op.id })
        checkLayers(doc, doc.tokens[i].layers)
        return `updated token ${op.id}`
      }
      const id = op.id ?? freeMapId(doc, 'token')
      const t = Token.parse({ x: 0.5, y: 0.5, name: id, ...op.set, id })
      checkLayers(doc, t.layers)
      doc.tokens.push(t)
      return `added token ${id}`
    }
    case 'grid': {
      const set = { ...op.set }
      if (set.diagonal !== undefined) DiagonalRule.parse(set.diagonal)
      doc.grid = Grid.parse({ ...doc.grid, ...set, unit: { ...doc.grid.unit, ...(set.unit as object | undefined) } })
      return `grid ${doc.grid.cols}×${doc.grid.rows}, 1 cell = ${doc.grid.unit.amount} ${doc.grid.unit.name}`
    }
    case 'style': {
      const set = op.set as Record<string, unknown>
      if (set.background) doc.style.background = Fill.parse(set.background)
      if (set.floor) doc.style.floor = Fill.parse(set.floor)
      if (set.wall) doc.style.wall = { ...doc.style.wall, ...(set.wall as object) }
      return 'style updated'
    }
    case 'fog': {
      if (op.enabled !== undefined) doc.fog.enabled = op.enabled
      if (op.ambient) doc.fog.ambient = op.ambient
      if (op.reset) doc.fog.explored = []
      return `fog ${doc.fog.enabled ? 'on' : 'off'}, ambient ${doc.fog.ambient}${op.reset ? ', explored reset' : ''}`
    }
    case 'bake':
      return bakeObjects(doc, op.ids, op.mode)
    case 'join':
      return joinObjects(doc, op.ids)
  }
}

function shapedObjects(doc: MapDoc, ids: readonly string[]): ShapedObject[] {
  return ids.map((id) => {
    const o = doc.objects[findObject(doc, id)]
    if (!isShaped(o)) throw new Error(`${id} is a ${o.kind}; only shapes (area, room, wall, path) can be combined`)
    return o
  })
}

/** Replaces the objects with one path shape (kind, style and layers of the first). */
export function bakeObjects(doc: MapDoc, ids: readonly string[], mode: BakeOp): string {
  const objects = shapedObjects(doc, ids)
  const region = bake(objects, mode)
  const first = objects[0]
  const shape = regionShape(region, { x: first.x, y: first.y })
  const index = doc.objects.indexOf(first)
  doc.objects = doc.objects.filter((o) => !ids.includes(o.id) || o === first)
  if (!shape) {
    doc.objects = doc.objects.filter((o) => o !== first)
    return `${mode} left nothing; removed ${ids.join(', ')}`
  }
  doc.objects[doc.objects.indexOf(first) < 0 ? index : doc.objects.indexOf(first)] = { ...first, rotation: 0, shape } as MapObject
  return `${mode} of ${ids.join(', ')} is now ${first.id} (${region.length} piece${region.length === 1 ? '' : 's'})`
}

/** Joins two open paths/walls into the first, or closes a single open path. */
export function joinObjects(doc: MapDoc, ids: readonly string[]): string {
  const objects = shapedObjects(doc, ids)
  for (const o of objects) if (o.shape.type !== 'path' || o.shape.closed) throw new Error(`${o.id} is not an open path`)
  const [first, second] = objects
  const points = second ? joinPaths(worldPoints(first), worldPoints(second)) : worldPoints(first)
  const ox = points[0].x
  const oy = points[0].y
  const local = points.map((p) => ({ ...p, x: p.x - ox, y: p.y - oy }))
  const i = doc.objects.indexOf(first)
  doc.objects[i] = { ...first, x: ox, y: oy, rotation: 0, shape: { type: 'path', points: local, closed: !second } } as MapObject
  if (second) doc.objects = doc.objects.filter((o) => o !== second)
  return second ? `joined ${second.id} into ${first.id}` : `closed ${first.id}`
}

// ---------- summaries for agents ----------

const r1 = (n: number) => Math.round(n * 100) / 100

function shapeText(o: ShapedObject) {
  const s = o.shape
  if (s.type === 'rect') return `rect ${r1(s.w)}×${r1(s.h)}${s.radius ? ` r${r1(s.radius)}` : ''}`
  if (s.type === 'ellipse') return s.rx === s.ry ? `circle r${r1(s.rx)}` : `ellipse ${r1(s.rx)}×${r1(s.ry)}`
  const curves = s.points.some((p) => p.in || p.out)
  return `${s.closed ? 'polygon' : 'line'} ${s.points.length} pts${curves ? ' curved' : ''}${s.holes?.length ? ` ${s.holes.length} holes` : ''}`
}

export function objectLine(o: MapObject): string {
  const at = `at (${r1(o.x)}, ${r1(o.y)})${o.rotation ? ` rot ${r1(o.rotation)}°` : ''}`
  const layers = o.layers.length ? ` layers ${o.layers.join(',')}` : ''
  const name = o.name ? ` "${o.name}"` : ''
  let what: string
  switch (o.kind) {
    case 'area':
      what = `${shapeText(o)} ${o.op === 'subtract' ? 'erase' : (o.fill.texture ?? o.fill.color ?? '')}`
      break
    case 'room':
      what = `${shapeText(o)}${o.op === 'add' ? '' : ` ${o.op}`}${o.light ? ` ${o.light}` : ''}`
      break
    case 'wall':
    case 'path':
      what = shapeText(o)
      break
    case 'door':
      what = `${o.variant} w${r1(o.width)} ${o.open ? 'open' : 'closed'}`
      break
    case 'image':
      what = `${o.src} ${r1(o.w)}×${r1(o.h)}`
      break
    case 'label':
      what = JSON.stringify(o.text)
      break
    case 'light':
      what = `bright ${r1(o.bright)} dim ${r1(o.dim)}`
      break
  }
  return `${o.id} ${o.kind}${name} ${what} ${at}${layers}`
}

/** Compact text for agents: size, grid, layers, counts; with `full`, one line per object and token. */
export function mapSummary(doc: MapDoc, full = false): string {
  const g = doc.grid
  const lines = [
    `Map ${g.cols}×${g.rows} cells, 1 cell = ${g.unit.amount} ${g.unit.name}, diagonals ${g.diagonal}, grid ${g.show ? 'shown' : 'hidden'}`,
    `Fog ${doc.fog.enabled ? 'on' : 'off'}, ambient ${doc.fog.ambient}, explored ${doc.fog.explored.length} areas`,
  ]
  if (doc.layers.length)
    lines.push(`Layers: ${doc.layers.map((l) => `${l.id} "${l.name}"${l.group ? ` [group ${l.group}]` : ''} ${l.visible ? 'visible' : 'hidden'}`).join('; ')}`)
  const counts = new Map<string, number>()
  for (const o of doc.objects) counts.set(o.kind, (counts.get(o.kind) ?? 0) + 1)
  lines.push(`Objects: ${[...counts].map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}; tokens: ${doc.tokens.length}`)
  if (full) {
    for (const o of doc.objects) lines.push(`- ${objectLine(o)}`)
    for (const t of doc.tokens)
      lines.push(
        `- ${t.id} token "${t.name}" at (${r1(t.x)}, ${r1(t.y)}) size ${t.size}${t.player ? ' player' : ''}${t.vision !== undefined ? ` vision ${t.vision}` : ''}${t.darkvision ? ` darkvision ${t.darkvision}` : ''}${t.node ? ` node ${t.node}` : ''}${t.layers.length ? ` layers ${t.layers.join(',')}` : ''}`,
      )
  } else if (doc.objects.length) lines.push('Read with full=true for every object.')
  return lines.join('\n')
}

/** Area (cells²) of a closed object, for summaries/tests. */
export function objectArea(o: ShapedObject): number {
  let total = 0
  for (const poly of objectRegion(o))
    poly.forEach((ring, i) => {
      let a = 0
      for (let k = 0; k + 1 < ring.length; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1]
      total += (i === 0 ? 1 : -1) * Math.abs(a / 2)
    })
  return total
}
