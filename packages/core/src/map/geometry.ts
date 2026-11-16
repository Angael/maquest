import pc from 'polygon-clipping'
import {
  isShaped,
  layerVisible,
  type DiagonalRule,
  type DoorObject,
  type Grid,
  type MapDoc,
  type MapObject,
  type PathPoint,
  type Point,
  type Shape,
  type ShapedObject,
  type Token,
} from './schema'
import type { z } from 'zod'

export type Pair = [number, number]
export type Ring = Pair[]
export type Polygon = Ring[]
export type Multi = Polygon[]
type Door = z.infer<typeof DoorObject>

const RAD = Math.PI / 180
const round = (n: number, d = 1000) => Math.round(n * d) / d

// ---------- transforms ----------

export function rotateVec(p: Point, deg: number): Point {
  if (!deg) return { x: p.x, y: p.y }
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/** Local object point → map point. */
export function toWorld(o: { x: number; y: number; rotation?: number }, p: Point): Point {
  const r = rotateVec(p, o.rotation ?? 0)
  return { x: o.x + r.x, y: o.y + r.y }
}

/** Map point → local object point. */
export function toLocal(o: { x: number; y: number; rotation?: number }, p: Point): Point {
  return rotateVec({ x: p.x - o.x, y: p.y - o.y }, -(o.rotation ?? 0))
}

// ---------- flattening ----------

function cubic(a: Point, c1: Point, c2: Point, b: Point, steps: number, out: Pair[]) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push([
      u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    ])
  }
}

const hasCurve = (a: PathPoint, b: PathPoint) => !!(a.out || b.in)

/** Flattened ring/line of path points (local coords). */
export function flattenPoints(points: readonly PathPoint[], closed: boolean): Pair[] {
  if (!points.length) return []
  const out: Pair[] = [[points[0].x, points[0].y]]
  const n = closed ? points.length : points.length - 1
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (hasCurve(a, b)) {
      const c1 = { x: a.x + (a.out?.x ?? 0), y: a.y + (a.out?.y ?? 0) }
      const c2 = { x: b.x + (b.in?.x ?? 0), y: b.y + (b.in?.y ?? 0) }
      const len = Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - b.x, c2.y - b.y)
      cubic(a, c1, c2, b, Math.min(48, Math.max(8, Math.ceil(len * 4))), out)
    } else out.push([b.x, b.y])
  }
  // A closed ring repeats its first point last; drop it (rings are implicitly closed).
  if (closed && out.length > 1) out.pop()
  return out
}

function ellipsePoints(rx: number, ry: number): Pair[] {
  const steps = Math.min(128, Math.max(24, Math.ceil(Math.max(rx, ry) * 12)))
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2
    return [Math.cos(a) * rx, Math.sin(a) * ry] as Pair
  })
}

function rectPoints(w: number, h: number, radius = 0): Pair[] {
  const r = Math.min(radius, w / 2, h / 2)
  const x = w / 2
  const y = h / 2
  if (r <= 0)
    return [
      [-x, -y],
      [x, -y],
      [x, y],
      [-x, y],
    ]
  const out: Pair[] = []
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = (from + (i / 6) * 90) * RAD
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  corner(x - r, -y + r, -90)
  corner(x - r, y - r, 0)
  corner(-x + r, y - r, 90)
  corner(-x + r, -y + r, 180)
  return out
}

export const isClosed = (s: Shape) => s.type !== 'path' || s.closed

/** Every ring of a shape in local coords (holes after the outline). Open paths give one polyline. */
export function shapeRings(s: Shape): Pair[][] {
  if (s.type === 'rect') return [rectPoints(s.w, s.h, s.radius)]
  if (s.type === 'ellipse') return [ellipsePoints(s.rx, s.ry)]
  return [flattenPoints(s.points, s.closed), ...(s.holes ?? []).map((h) => flattenPoints(h, true))]
}

const worldRing = (o: { x: number; y: number; rotation?: number }, ring: Pair[]): Pair[] =>
  ring.map(([x, y]) => {
    const p = toWorld(o, { x, y })
    return [p.x, p.y]
  })

/** The shape's rings in map coordinates. */
export function objectRings(o: ShapedObject): Pair[][] {
  return shapeRings(o.shape).map((r) => worldRing(o, r))
}

const closeRing = (r: Ring): Ring => (r.length && (r[0][0] !== r.at(-1)![0] || r[0][1] !== r.at(-1)![1]) ? [...r, r[0]] : r)

/** The filled region of a closed shape (rings combine even-odd), or [] for open paths. */
export function objectRegion(o: ShapedObject): Multi {
  if (!isClosed(o.shape)) return []
  const rings = objectRings(o).filter((r) => r.length >= 3)
  if (!rings.length) return []
  try {
    const polys = rings.map((r) => [closeRing(r)] as Polygon)
    return polys.length === 1 ? pc.union(polys[0]) : pc.xor(polys[0], ...polys.slice(1))
  } catch {
    return []
  }
}

// ---------- booleans ----------

export const EMPTY: Multi = []

const snap = (m: Multi, d: number): Multi => m.map((poly) => poly.map((ring) => ring.map(([x, y]) => [Math.round(x * d) / d, Math.round(y * d) / d] as Pair)))

/**
 * Runs a polygon-clipping operation. Its sweep line occasionally throws on nearly coincident edges; snapping the input
 * to a coarser grid and trying again fixes those cases instead of dropping the result.
 */
function safe(fn: (...m: Multi[]) => Multi, input: Multi[], fallback: Multi): Multi {
  for (const d of [0, 1e9, 1e6, 1e4]) {
    try {
      return fn(...(d ? input.map((m) => snap(m, d)) : input))
    } catch {
      // Try again on a coarser grid.
    }
  }
  return fallback
}

export const union = (a: Multi, ...b: Multi[]): Multi => {
  const all = [a, ...b].filter((m) => m.length)
  if (all.length < 2) return all[0] ?? []
  return safe((first, ...rest) => pc.union(first, ...rest), all, all[0])
}
export const difference = (a: Multi, ...b: Multi[]): Multi => {
  const cut = b.filter((m) => m.length)
  if (!a.length || !cut.length) return a
  return safe((first, ...rest) => pc.difference(first, ...rest), [a, ...cut], a)
}
export const intersection = (a: Multi, b: Multi): Multi => (!a.length || !b.length ? [] : safe((x, y) => pc.intersection(x, y), [a, b], []))
export const xor = (a: Multi, b: Multi): Multi => (!a.length ? b : !b.length ? a : safe((x, y) => pc.xor(x, y), [a, b], a))

export const visibleObjects = (doc: MapDoc) => doc.objects.filter((o) => layerVisible(doc, o.layers))

/** The floor: visible rooms merged and cut in order. */
export function roomRegion(doc: MapDoc, objects = visibleObjects(doc)): Multi {
  return roomRegions(objects).floor
}

/** The floor, plus what is left of each `separate` room after the subtract rooms above it (their outlines are walls too). */
export function roomRegions(objects: readonly MapObject[]): { floor: Multi; separate: Multi[] } {
  let floor: Multi = []
  const separate: Multi[] = []
  for (const o of objects) {
    if (o.kind !== 'room') continue
    const shape = objectRegion(o)
    if (o.op === 'subtract') {
      floor = difference(floor, shape)
      for (let i = 0; i < separate.length; i++) separate[i] = difference(separate[i], shape)
    } else {
      floor = union(floor, shape)
      if (o.op === 'separate') separate.push(shape)
    }
  }
  return { floor, separate }
}

/** Painted areas: each visible `add` area with what is left after the `subtract` areas above it. */
export function areaRegions(doc: MapDoc, objects = visibleObjects(doc)) {
  const out: { object: Extract<MapObject, { kind: 'area' }>; region: Multi; cut: boolean }[] = []
  for (const o of objects) {
    if (o.kind !== 'area') continue
    const shape = objectRegion(o)
    if (o.op === 'subtract') {
      for (const a of out) {
        const next = difference(a.region, shape)
        if (next !== a.region) a.cut = true
        a.region = next
      }
    } else out.push({ object: o, region: shape, cut: false })
  }
  return out
}

export type BakeOp = 'union' | 'subtract' | 'intersect' | 'exclude'

/** Destructive boolean of closed shapes, in order (subtract cuts the later ones out of the first). */
export function bake(objects: readonly ShapedObject[], op: BakeOp): Multi {
  const regions = objects.map(objectRegion).filter((r) => r.length)
  if (!regions.length) return []
  const [first, ...rest] = regions
  if (op === 'union') return union(first, ...rest)
  if (op === 'subtract') return difference(first, ...rest)
  if (op === 'intersect') return rest.reduce((acc, r) => intersection(acc, r), first)
  return rest.reduce((acc, r) => xor(acc, r), first)
}

/** A path shape for a region (outer rings and holes all as even-odd rings) around `origin`. */
export function regionShape(region: Multi, origin: Point): Extract<Shape, { type: 'path' }> | null {
  const rings = region
    .flat()
    .map((r) => (r.length > 1 && r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] ? r.slice(0, -1) : r))
    .filter((r) => r.length >= 3)
  if (!rings.length) return null
  const pts = (r: Ring) => r.map(([x, y]) => ({ x: round(x - origin.x), y: round(y - origin.y) }))
  const [first, ...holes] = rings
  return { type: 'path', points: pts(first), closed: true, ...(holes.length ? { holes: holes.map(pts) } : {}) }
}

// ---------- paths: join / reverse ----------

/** The path's points in map coords (handles rotated, still relative). */
export function worldPoints(o: ShapedObject): PathPoint[] {
  if (o.shape.type !== 'path') return []
  return o.shape.points.map((p) => {
    const w = toWorld(o, p)
    return {
      x: w.x,
      y: w.y,
      ...(p.in ? { in: rotateVec(p.in, o.rotation) } : {}),
      ...(p.out ? { out: rotateVec(p.out, o.rotation) } : {}),
    }
  })
}

export const reversePoints = (pts: readonly PathPoint[]): PathPoint[] =>
  pts.toReversed().map(({ x, y, in: i, out }) => ({ x, y, ...(out ? { in: out } : {}), ...(i ? { out: i } : {}) }))

const gapOf = (p: PathPoint, q: PathPoint) => Math.hypot(p.x - q.x, p.y - q.y)

/**
 * Joins two open paths at their nearest ends into one open path (map coords). Ends closer than `merge` cells become
 * one point.
 */
export function joinPaths(a: readonly PathPoint[], b: readonly PathPoint[], merge = 0.2): PathPoint[] {
  const options: [number, PathPoint[], PathPoint[]][] = [
    [gapOf(a.at(-1)!, b[0]), [...a], [...b]],
    [gapOf(a.at(-1)!, b.at(-1)!), [...a], reversePoints(b)],
    [gapOf(a[0], b[0]), reversePoints(a), [...b]],
    [gapOf(a[0], b.at(-1)!), reversePoints(a), reversePoints(b)],
  ]
  const [gap, first, second] = options.toSorted((x, y) => x[0] - y[0])[0]
  if (gap <= merge) {
    const end = first.pop()!
    const start = second.shift()!
    first.push({ x: end.x, y: end.y, ...(end.in ? { in: end.in } : {}), ...(start.out ? { out: start.out } : {}) })
  }
  return [...first, ...second]
}

// ---------- walls, doors ----------

export type Segment = [Pair, Pair]

/** Door axis endpoints in map coords. */
export function doorEnds(d: Pick<Door, 'x' | 'y' | 'rotation' | 'width'>): Segment {
  const a = toWorld(d, { x: -d.width / 2, y: 0 })
  const b = toWorld(d, { x: d.width / 2, y: 0 })
  return [
    [a.x, a.y],
    [b.x, b.y],
  ]
}

/** The convex footprint a door cuts out of walls. */
export function doorCut(d: Door, wall: number): Pair[] {
  const t = Math.max(wall * 1.5, 0.35)
  return rectPoints(d.width, t).map(([x, y]) => {
    const p = toWorld(d, { x, y })
    return [p.x, p.y] as Pair
  })
}

/** Parameter interval [t0, t1] of segment a→b inside a convex polygon (Cyrus–Beck), or null. */
function insideConvex(a: Pair, b: Pair, poly: Pair[]): [number, number] | null {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  // Orientation decides which side of each edge is inside.
  let area = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    area += p[0] * q[1] - q[0] * p[1]
  }
  const sign = area > 0 ? 1 : -1
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    // Inward normal.
    const nx = -(q[1] - p[1]) * sign
    const ny = (q[0] - p[0]) * sign
    const num = nx * (a[0] - p[0]) + ny * (a[1] - p[1])
    const den = nx * dx + ny * dy
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null
      continue
    }
    const t = -num / den
    if (den > 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return null
  }
  return [t0, t1]
}

const lerp = (a: Pair, b: Pair, t: number): Pair => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Splits polylines where doors cut them. Returns the remaining chains. */
export function cutChains(lines: readonly Pair[][], cuts: readonly Pair[][]): Pair[][] {
  const out: Pair[][] = []
  for (const line of lines) {
    const from = out.length
    let chain: Pair[] = []
    const flush = () => {
      if (chain.length > 1) out.push(chain)
      chain = []
    }
    for (let i = 0; i + 1 < line.length; i++) {
      let pieces: Segment[] = [[line[i], line[i + 1]]]
      for (const cut of cuts) {
        const next: Segment[] = []
        for (const [a, b] of pieces) {
          const inside = insideConvex(a, b, cut)
          if (!inside || inside[1] - inside[0] < 1e-9) next.push([a, b])
          else {
            if (inside[0] > 1e-9) next.push([a, lerp(a, b, inside[0])])
            if (inside[1] < 1 - 1e-9) next.push([lerp(a, b, inside[1]), b])
          }
        }
        pieces = next
      }
      for (const [a, b] of pieces) {
        const last = chain.at(-1)
        if (!last || Math.abs(last[0] - a[0]) > 1e-9 || Math.abs(last[1] - a[1]) > 1e-9) {
          flush()
          chain.push(a)
        }
        chain.push(b)
      }
    }
    flush()
    // A cut ring: the last chain runs into the first one, so join them for clean corners.
    const first = out[from]
    const last = out.at(-1)!
    if (out.length - from > 1 && same(last.at(-1)!, first[0])) out[from] = [...out.pop()!, ...first.slice(1)]
  }
  return out
}

const same = (a: Pair, b: Pair) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9

const ringLine = (r: Ring): Pair[] => (r.length && (r[0][0] !== r.at(-1)![0] || r[0][1] !== r.at(-1)![1]) ? [...r, r[0]] : r)

export type WallGeometry = {
  /** Room outlines with door gaps. */
  rooms: Pair[][]
  /** Free-standing walls with door gaps. */
  walls: { object: Extract<MapObject, { kind: 'wall' }>; chains: Pair[][] }[]
  doors: Door[]
  /** Footprint each door cuts out of walls (same order as `doors`). */
  cuts: Pair[][]
}

export function wallGeometry(doc: MapDoc, objects = visibleObjects(doc), floor = roomRegion(doc, objects)): WallGeometry {
  const doors = objects.filter((o): o is Door => o.kind === 'door')
  const width = doc.style.wall.width
  const cuts = doors.map((d) => doorCut(d, width))
  // Separate rooms add their own outline, inside other rooms too.
  const rings = [...floor.flat(), ...roomRegions(objects).separate.flatMap((r) => r.flat())]
  const rooms = cutChains(rings.map(ringLine), cuts)
  const wallObjects = objects.filter((o): o is Extract<MapObject, { kind: 'wall' }> => o.kind === 'wall')
  const walls = wallObjects.map((o) => ({
    object: o,
    chains: cutChains(
      objectRings(o).map((r) => (isClosed(o.shape) ? ringLine(r) : r)),
      doors.map((d) => doorCut(d, o.width ?? width)),
    ),
  }))
  // The widest cut of each door: where a closed door has to seal the gap it made.
  const widest = Math.max(width, ...wallObjects.map((o) => o.width ?? width))
  return { rooms, walls, doors, cuts: doors.map((d) => doorCut(d, widest)) }
}

/**
 * Everything that blocks sight: walls and closed doors (windows and open doors let it through). A closed door seals
 * the whole footprint it cut out of the wall, not only its own line: a door that sits at an angle to the wall (or on a
 * curve) leaves the wall ends off its line, and sight used to slip through those slivers.
 */
export function sightSegments(geo: WallGeometry): Segment[] {
  const out: Segment[] = []
  const add = (chain: Pair[]) => {
    for (let i = 0; i + 1 < chain.length; i++) out.push([chain[i], chain[i + 1]])
  }
  geo.rooms.forEach(add)
  for (const w of geo.walls) w.chains.forEach(add)
  geo.doors.forEach((d, i) => {
    if (d.open || d.variant === 'window') return
    out.push(doorEnds(d))
    const cut = geo.cuts?.[i]
    if (cut) add([...cut, cut[0]])
  })
  return out
}

/** Nearest wall position for placing a door: the point on the closest segment and its direction (degrees). */
export function nearestWall(geo: WallGeometry, p: Point, max = 1): { x: number; y: number; rotation: number } | null {
  let best: { x: number; y: number; rotation: number; d: number } | null = null
  const visit = (chain: Pair[]) => {
    for (let i = 0; i + 1 < chain.length; i++) {
      const [a, b] = [chain[i], chain[i + 1]]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len2 = dx * dx + dy * dy
      if (!len2) continue
      const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len2))
      const x = a[0] + dx * t
      const y = a[1] + dy * t
      const d = Math.hypot(p.x - x, p.y - y)
      if (d <= max && (!best || d < best.d)) best = { x, y, rotation: Math.atan2(dy, dx) / RAD, d }
    }
  }
  geo.rooms.forEach(visit)
  for (const w of geo.walls) w.chains.forEach(visit)
  if (!best) return null
  const { x, y, rotation } = best
  return { x, y, rotation }
}

// ---------- vision ----------

export function circle(c: Point, r: number, steps = 72): Multi {
  if (r <= 0) return []
  const ring: Ring = Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2
    return [c.x + Math.cos(a) * r, c.y + Math.sin(a) * r] as Pair
  })
  return [[closeRing(ring)]]
}

export const rectRegion = (x: number, y: number, w: number, h: number): Multi => [
  [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ],
  ],
]

/**
 * Visibility polygon from `o`: the area not hidden behind any segment, limited to `radius`.
 * Classic angular sweep: rays to every segment end (and just past it) plus even samples for the circle, nearest hit
 * per ray capped at the radius. The ring is star-shaped around `o`, so it needs no boolean clipping (which used to
 * fail on degenerate input and blank out whole positions).
 */
export function visibility(o: Point, segments: readonly Segment[], radius: number): Multi {
  const R = radius
  if (!(R > 0)) return []
  const near = segments.filter(([a, b]) => {
    const minx = Math.min(a[0], b[0])
    const maxx = Math.max(a[0], b[0])
    const miny = Math.min(a[1], b[1])
    const maxy = Math.max(a[1], b[1])
    return maxx >= o.x - R && minx <= o.x + R && maxy >= o.y - R && miny <= o.y + R && (a[0] !== b[0] || a[1] !== b[1])
  })
  const angles: number[] = []
  for (const [a, b] of near)
    for (const p of [a, b]) {
      const dx = p[0] - o.x
      const dy = p[1] - o.y
      if (dx * dx + dy * dy > (R + 1e-6) * (R + 1e-6)) continue
      const t = Math.atan2(dy, dx)
      angles.push(t - 1e-6, t, t + 1e-6)
    }
  // Even sampling keeps the radius round.
  const steps = Math.min(720, Math.max(96, Math.ceil(R * 24)))
  for (let i = 0; i < steps; i++) angles.push(-Math.PI + (i / steps) * Math.PI * 2)
  angles.sort((a, b) => a - b)
  const ring: Ring = []
  for (const t of angles) {
    const dx = Math.cos(t)
    const dy = Math.sin(t)
    let best = R
    for (const [a, b] of near) {
      const ex = b[0] - a[0]
      const ey = b[1] - a[1]
      const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-12) continue
      const ax = a[0] - o.x
      const ay = a[1] - o.y
      const hit = (ax * ey - ay * ex) / den
      const u = (ax * dy - ay * dx) / den
      if (hit >= 0 && u >= -1e-9 && u <= 1 + 1e-9 && hit < best) best = hit
    }
    // A wall through the viewer itself would collapse the polygon; keep a sliver so it stays a valid ring.
    best = Math.max(best, 1e-4)
    const p: Pair = [o.x + dx * best, o.y + dy * best]
    const last = ring.at(-1)
    if (!last || Math.abs(last[0] - p[0]) > 1e-7 || Math.abs(last[1] - p[1]) > 1e-7) ring.push(p)
  }
  if (ring.length < 3) return []
  return [[closeRing(ring)]]
}

export type Sight = {
  /** What player tokens see right now. */
  visible: Multi
  /** Fully lit: bright light from lights and rooms (or the whole map) lit by daylight. */
  bright: Multi
  /** Lit at least dimly (contains `bright`). Only computed when the map has darkness or dimness somewhere. */
  dim: Multi
  /** Unlit darkness: players see it only with darkvision. */
  dark: Multi
  /** Ambient dimness not reached by any light (drawn darker than light's own dim edge). */
  dusk: Multi
  /** Whether anything on the map is not in plain daylight (else bright/dim/dark/dusk are empty). */
  shaded: boolean
}

/**
 * The map's light as zones: the ambient light everywhere, overridden inside rooms that set their own light (in order),
 * then lights on top.
 */
function lightZones(doc: MapDoc, objects: readonly MapObject[], segments: readonly Segment[]) {
  const rooms = objects.filter((o): o is Extract<MapObject, { kind: 'room' }> => o.kind === 'room' && !!o.light && o.op !== 'subtract')
  const shaded = doc.fog.ambient !== 'light' || rooms.some((r) => r.light !== 'light')
  if (!shaded) return { shaded, bright: [] as Multi, dim: [] as Multi, dark: [] as Multi, dusk: [] as Multi }
  const map = rectRegion(0, 0, doc.grid.cols, doc.grid.rows)
  const zone: Record<'light' | 'dim' | 'dark', Multi> = { light: [], dim: [], dark: [] }
  zone[doc.fog.ambient] = map
  for (const r of rooms) {
    const region = objectRegion(r)
    for (const k of ['light', 'dim', 'dark'] as const) zone[k] = k === r.light ? union(zone[k], region) : difference(zone[k], region)
  }
  let lit: Multi = []
  let glow: Multi = []
  for (const l of objects) {
    if (l.kind !== 'light') continue
    const reach = Math.max(l.bright, l.dim)
    if (!reach) continue
    const los = visibility(l, segments, reach)
    if (l.bright) lit = union(lit, intersection(los, circle(l, l.bright)))
    glow = union(glow, los)
  }
  const bright = union(zone.light, lit)
  return {
    shaded,
    bright,
    dim: union(bright, zone.dim, glow),
    dark: difference(zone.dark, glow),
    dusk: difference(zone.dim, glow),
  }
}

export function sight(doc: MapDoc, objects = visibleObjects(doc), geo = wallGeometry(doc, objects)): Sight {
  const segments = sightSegments(geo)
  const far = Math.hypot(doc.grid.cols, doc.grid.rows) + 2
  const zones = lightZones(doc, objects, segments)
  let visible: Multi = []
  for (const t of doc.tokens) {
    if (!t.player || t.hidden || !layerVisible(doc, t.layers)) continue
    visible = union(visible, tokenSight(t, segments, far, zones.dark, zones.dim))
  }
  return { visible, ...zones }
}

/** What one token sees: in range and in light (`lit`, unless nothing is `dark`), plus its darkvision. */
function tokenSight(t: Token, segments: readonly Segment[], far: number, dark: Multi, lit: Multi): Multi {
  const range = t.vision ?? far
  const los = visibility(t, segments, Math.max(range, t.darkvision ?? 0))
  const inRange = t.vision === undefined ? los : intersection(los, circle(t, range))
  if (!dark.length) return inRange
  const seenLit = intersection(inRange, lit)
  const darkSeen = t.darkvision ? intersection(los, circle(t, t.darkvision)) : []
  // Players always see their own square.
  return union(seenLit, darkSeen, circle(t, Math.max(0.5, t.size / 2), 24))
}

/** Explored fog grown by what is visible now; coordinates rounded so the file stays small. */
export function explore(explored: Multi, visible: Multi): Multi {
  const merged = union(explored, visible)
  return merged
    .map((poly) => poly.map((ring) => ring.map(([x, y]) => [round(x, 100), round(y, 100)] as Pair)).filter((r) => r.length >= 4))
    .filter((poly) => poly.length)
}

// ---------- grid, ruler ----------

export const cellOf = (p: Point): Pair => [Math.floor(p.x), Math.floor(p.y)]
export const cellCenter = ([c, r]: Pair): Point => ({ x: c + 0.5, y: r + 0.5 })

/** Cells on the straight line between two cells, 8-connected (Bresenham). */
export function cellLine(a: Pair, b: Pair): Pair[] {
  const out: Pair[] = []
  let [x, y] = a
  const dx = Math.abs(b[0] - x)
  const dy = -Math.abs(b[1] - y)
  const sx = x < b[0] ? 1 : -1
  const sy = y < b[1] ? 1 : -1
  let err = dx + dy
  for (;;) {
    out.push([x, y])
    if (x === b[0] && y === b[1]) return out
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

/** Appends a cell to a traced path, filling any gap so consecutive cells are neighbors. Returns the new path. */
export function traceCell(path: readonly Pair[], cell: Pair): Pair[] {
  const last = path.at(-1)
  if (!last) return [cell]
  if (last[0] === cell[0] && last[1] === cell[1]) return path as Pair[]
  // Going back over the previous cell undoes the last step, so wiggles do not add distance.
  const prev = path.at(-2)
  if (prev && prev[0] === cell[0] && prev[1] === cell[1]) return path.slice(0, -1)
  return [...path, ...cellLine(last, cell).slice(1)]
}

/** Distance in cells walked from cell center to cell center along a path of neighboring cells. */
export function pathCells(cells: readonly Pair[], rule: DiagonalRule): number {
  let total = 0
  let diagonals = 0
  for (let i = 1; i < cells.length; i++) {
    const dx = Math.abs(cells[i][0] - cells[i - 1][0])
    const dy = Math.abs(cells[i][1] - cells[i - 1][1])
    if (!dx && !dy) continue
    if (dx && dy) {
      diagonals++
      total += rule === 'euclid' ? Math.SQRT2 : rule === 'alternate' && diagonals % 2 === 0 ? 2 : 1
    } else total += Math.hypot(dx, dy)
  }
  return total
}

/** Straight-line measure: exact length and the grid distance between the two cells' centers. */
export function lineMeasure(a: Point, b: Point, rule: DiagonalRule) {
  const ca = cellOf(a)
  const cb = cellOf(b)
  const dx = Math.abs(cb[0] - ca[0])
  const dy = Math.abs(cb[1] - ca[1])
  const lo = Math.min(dx, dy)
  const hi = Math.max(dx, dy)
  const cells = rule === 'euclid' ? Math.hypot(dx, dy) : rule === 'alternate' ? hi + Math.floor(lo / 2) : hi
  return { length: Math.hypot(b.x - a.x, b.y - a.y), cells }
}

export function formatDistance(cells: number, grid: Pick<Grid, 'unit'>) {
  const v = cells * grid.unit.amount
  const text = Number.isInteger(v) ? String(v) : v.toFixed(1)
  return `${text} ${grid.unit.name}`.trim()
}

// ---------- bounds ----------

export type Box = { x: number; y: number; w: number; h: number }

/** Local (unrotated, around x/y) box of an object, for selection handles. */
export function localBox(o: MapObject): Box {
  if (isShaped(o)) {
    const s = o.shape
    if (s.type === 'rect') return { x: -s.w / 2, y: -s.h / 2, w: s.w, h: s.h }
    if (s.type === 'ellipse') return { x: -s.rx, y: -s.ry, w: s.rx * 2, h: s.ry * 2 }
    const pts = shapeRings(s).flat()
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x || 0.01, h: Math.max(...ys) - y || 0.01 }
  }
  switch (o.kind) {
    case 'door':
      return { x: -o.width / 2, y: -0.2, w: o.width, h: 0.4 }
    case 'image':
      return { x: -o.w / 2, y: -o.h / 2, w: o.w, h: o.h }
    case 'label': {
      const w = Math.max(0.5, o.text.length * o.size * 0.55)
      return { x: -w / 2, y: -o.size * 0.7, w, h: o.size }
    }
    case 'light':
      return { x: -0.3, y: -0.3, w: 0.6, h: 0.6 }
  }
}

/** Map-space bounding box of an object (rotation included). */
export function worldBox(o: MapObject): Box {
  const b = localBox(o)
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ].map((p) => toWorld(o, p))
  const x = Math.min(...corners.map((p) => p.x))
  const y = Math.min(...corners.map((p) => p.y))
  return { x, y, w: Math.max(...corners.map((p) => p.x)) - x, h: Math.max(...corners.map((p) => p.y)) - y }
}

/** Ramer–Douglas–Peucker simplification of a polyline (brush strokes). */
export function simplify(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 3) return [...points]
  const [a, b] = [points[0], points.at(-1)!]
  let worst = 0
  let index = 0
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len
    if (d > worst) {
      worst = d
      index = i
    }
  }
  if (worst <= tolerance) return [a, b]
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)]
}
