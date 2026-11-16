import {
  areaRegions,
  difference,
  roomRegion,
  sight as computeSight,
  visibleObjects,
  wallGeometry,
  worldBox,
  type Multi,
  type Pair,
  type Sight,
  type WallGeometry,
} from './geometry'
import { layerVisible, type Fill, type MapDoc, type MapObject, type PathPoint, type Shape, type Token } from './schema'
import { h, num, svgString, type SvgEl } from './svg'
import { texturePattern, textureId, TEXTURE_COLORS, isBuiltinTexture } from './textures'

export type Overlay = 'none' | 'gm' | 'player'

export type RenderOptions = {
  /** Resolves a media path (media/x.png) to an href (URL or data URI). Default: the path itself. */
  imageHref?: (src: string) => string
  /** edit adds hit shapes, subtract outlines and light markers; export is the clean picture. */
  mode?: 'edit' | 'export'
  /** Grid lines (default: the map's grid.show). */
  grid?: boolean
  tokens?: boolean
  /** Fog of war: none, gm (see-through) or player (opaque). Only when the map's fog is enabled. */
  fog?: Overlay
  /** Darkness away from lights: none, gm (faint) or player. Only when the map's ambient is not light. */
  lighting?: Overlay
  /** Precomputed sight (otherwise computed when fog or lighting needs it). */
  sight?: Sight
  /** Unique prefix for ids (patterns, clips) when several maps share a page. */
  idPrefix?: string
  /** Room names in their middle (default: in edit mode). */
  roomNames?: boolean
  /** Clip everything to the map's rectangle (default true; the editor shows what lies outside). */
  clip?: boolean
  /** Pixel size of the root svg; default grid.size per cell. */
  width?: number | string
  height?: number | string
}

/** Path data of a shape in local coordinates, curves kept exact. */
export function shapeD(s: Shape): string {
  if (s.type === 'rect') {
    const x = s.w / 2
    const y = s.h / 2
    const r = Math.min(s.radius ?? 0, x, y)
    if (r <= 0) return `M${num(-x)} ${num(-y)}H${num(x)}V${num(y)}H${num(-x)}Z`
    const a = (tx: number, ty: number) => `A${num(r)} ${num(r)} 0 0 1 ${num(tx)} ${num(ty)}`
    return `M${num(-x + r)} ${num(-y)}H${num(x - r)}${a(x, -y + r)}V${num(y - r)}${a(x - r, y)}H${num(-x + r)}${a(-x, y - r)}V${num(-y + r)}${a(-x + r, -y)}Z`
  }
  if (s.type === 'ellipse') return `M${num(-s.rx)} 0A${num(s.rx)} ${num(s.ry)} 0 1 0 ${num(s.rx)} 0A${num(s.rx)} ${num(s.ry)} 0 1 0 ${num(-s.rx)} 0Z`
  return [pointsD(s.points, s.closed), ...(s.holes ?? []).map((ring) => pointsD(ring, true))].join('')
}

export function pointsD(points: readonly PathPoint[], closed: boolean): string {
  if (!points.length) return ''
  let d = `M${num(points[0].x)} ${num(points[0].y)}`
  const n = closed ? points.length : points.length - 1
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a.out || b.in)
      d += `C${num(a.x + (a.out?.x ?? 0))} ${num(a.y + (a.out?.y ?? 0))} ${num(b.x + (b.in?.x ?? 0))} ${num(b.y + (b.in?.y ?? 0))} ${num(b.x)} ${num(b.y)}`
    else if (!(closed && i === points.length - 1)) d += `L${num(b.x)} ${num(b.y)}`
  }
  return closed ? `${d}Z` : d
}

export const multiD = (m: Multi): string =>
  m
    .flat()
    .map((ring) => `M${ring.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}Z`)
    .join('')

export const chainD = (chains: readonly Pair[][]): string => chains.map((c) => `M${c.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}`).join('')

export const transformOf = (o: { x: number; y: number; rotation?: number }) =>
  `translate(${num(o.x)} ${num(o.y)})${o.rotation ? ` rotate(${num(o.rotation)})` : ''}`

/** Paint attribute for a fill (pattern reference or color). */
function paint(fill: Fill | undefined, prefix: string): { fill: string; 'fill-opacity'?: number } {
  if (!fill) return { fill: 'none' }
  const tex = textureId(fill, prefix)
  const fallback = fill.texture && isBuiltinTexture(fill.texture) ? TEXTURE_COLORS[fill.texture] : '#888888'
  return { fill: tex ? `url(#${tex})` : (fill.color ?? fallback), ...(fill.opacity !== undefined ? { 'fill-opacity': fill.opacity } : {}) }
}

const DOOR_COLOR = '#8a5a2b'

function door(o: Extract<MapObject, { kind: 'door' }>, wall: { color: string; width: number }, edit: boolean): SvgEl {
  const w = o.width
  const t = Math.max(0.12, wall.width * 0.7)
  const base = { 'data-id': o.id, 'data-kind': 'door', transform: transformOf(o) }
  if (o.variant === 'secret' && !edit && !o.open)
    return h('path', { ...base, d: `M${num(-w / 2)} 0H${num(w / 2)}`, stroke: wall.color, 'stroke-width': wall.width, 'stroke-linecap': 'round' })
  if (o.variant === 'window')
    return h(
      'g',
      base,
      h('rect', { x: num(-w / 2), y: num(-t / 2), width: num(w), height: num(t), fill: '#cfe3ee', stroke: wall.color, 'stroke-width': 0.04 }),
      h('path', { d: `M${num(-w / 2)} 0H${num(w / 2)}`, stroke: wall.color, 'stroke-width': 0.03 }),
    )
  const leaves = o.variant === 'double' ? [-1, 1] : [-1]
  const leafW = o.variant === 'double' ? w / 2 : w
  const parts: SvgEl[] = [h('rect', { x: num(-w / 2), y: num(-t / 2), width: num(w), height: num(t), fill: 'transparent' })]
  for (const side of leaves) {
    // Hinge at the leaf's outer end; an open leaf swings 80° away from the wall.
    const hinge = side * (w / 2)
    const angle = o.open ? side * -80 : 0
    parts.push(
      h(
        'g',
        { transform: `translate(${num(hinge)} 0) rotate(${angle})` },
        h('rect', {
          x: side < 0 ? 0 : num(-leafW),
          y: num(-t / 2),
          width: num(leafW),
          height: num(t),
          fill: DOOR_COLOR,
          stroke: wall.color,
          'stroke-width': 0.035,
        }),
      ),
    )
  }
  if (edit && o.variant === 'secret') parts.push(h('text', { x: 0, y: num(-t), 'font-size': 0.35, 'text-anchor': 'middle', fill: '#c2410c' }, 'S'))
  return h('g', base, ...parts)
}

function token(t: Token, prefix: string, href: (src: string) => string): SvgEl {
  const r = t.size * 0.42
  const initials = t.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  const clip = `${prefix}tok-${t.id}`
  return h(
    'g',
    { 'data-token': t.id, transform: `translate(${num(t.x)} ${num(t.y)})` },
    h('title', {}, t.name),
    h('circle', { r: num(r + 0.04), fill: '#000000', 'fill-opacity': 0.35, cy: 0.04 }),
    h('circle', { r: num(r), fill: t.color, stroke: '#ffffff', 'stroke-width': num(Math.max(0.04, r * 0.1)) }),
    t.image
      ? h(
          'g',
          {},
          h('clipPath', { id: clip }, h('circle', { r: num(r * 0.9) })),
          h('image', {
            href: href(t.image),
            x: num(-r),
            y: num(-r),
            width: num(r * 2),
            height: num(r * 2),
            'clip-path': `url(#${clip})`,
            preserveAspectRatio: 'xMidYMid slice',
          }),
        )
      : h(
          'text',
          {
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': num(r * 0.8),
            'font-family': 'Inter, system-ui, sans-serif',
            'font-weight': 600,
            fill: '#ffffff',
          },
          initials,
        ),
  )
}

const isClosedShape = (shape: Shape) => shape.type !== 'path' || shape.closed

/** A wall line: its color at full width, with the material texture inside so the wall still reads as an edge. */
function wallStroke(d: string, color: string, width: number, texture: string | undefined, prefix: string, attrs: Record<string, string>): SvgEl[] {
  const line = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const
  const base = h('path', { ...attrs, ...line, stroke: color, 'stroke-width': num(width), ...(attrs['data-id'] ? {} : { 'pointer-events': 'none' }) })
  if (!texture) return [base]
  const tex = textureId({ texture }, prefix)
  return [base, h('path', { ...line, stroke: `url(#${tex})`, 'stroke-width': num(width * 0.7), 'pointer-events': 'none' })]
}

/** How far (cells) players glimpse past the edge of what they see: enough to make out the wall and its material. */
export const FOG_GLIMPSE = 0.6
/** How far players glimpse into a solid structure they see the side of (a roof, a cliff), fading out. */
export const SOLID_GLIMPSE = 1.6

type Solid = { d: string; transform: string }

/**
 * The fog of war: opaque where nobody has looked, dimmed where players have been, clear where they see now. The edges
 * are soft and reach a little past what is seen, so a wall bounding the view shows its material and the start of
 * what lies behind (a roof, a cliff), fading out before it gives the rest away.
 */
function fogOverlay(cols: number, rows: number, explored: Multi, visible: Multi, player: boolean, prefix: string, solids: Solid[]): SvgEl {
  const id = `${prefix}fog`
  const g = FOG_GLIMPSE
  const pad = SOLID_GLIMPSE * 3
  const reveal = (m: Multi, shade: string) =>
    m.length ? h('path', { d: multiD(m), fill: shade, stroke: shade, 'stroke-width': num(g * 1.4), 'stroke-linejoin': 'round', 'fill-rule': 'nonzero' }) : null
  // Into solids the glimpse reaches further and fades in two steps (then the blur smooths it).
  const into = (m: Multi, near: string, far: string) =>
    solids.length && m.length
      ? h(
          'g',
          { 'clip-path': `url(#${id}-solids)` },
          h('path', { d: multiD(m), fill: 'none', stroke: far, 'stroke-width': num(SOLID_GLIMPSE * 2), 'stroke-linejoin': 'round' }),
          h('path', { d: multiD(m), fill: 'none', stroke: near, 'stroke-width': num(SOLID_GLIMPSE), 'stroke-linejoin': 'round' }),
        )
      : null
  const exploredShade = player ? '#999999' : '#a6a6a6'
  return h(
    'g',
    { 'data-fog': 'hidden', 'pointer-events': 'none' },
    h(
      'defs',
      {},
      h(
        'filter',
        { id: `${id}-soft`, filterUnits: 'userSpaceOnUse', x: -pad, y: -pad, width: cols + pad * 2, height: rows + pad * 2 },
        h('feGaussianBlur', { stdDeviation: num(g * 0.35) }),
      ),
      solids.length ? h('clipPath', { id: `${id}-solids` }, ...solids.map((x) => h('path', { d: x.d, transform: x.transform, 'fill-rule': 'evenodd' }))) : null,
      h(
        'mask',
        { id: `${id}-mask`, maskUnits: 'userSpaceOnUse', x: -pad, y: -pad, width: cols + pad * 2, height: rows + pad * 2 },
        h(
          'g',
          { filter: `url(#${id}-soft)` },
          h('rect', { x: -pad, y: -pad, width: cols + pad * 2, height: rows + pad * 2, fill: '#ffffff' }),
          // Explored: remembered, so only partly fogged.
          reveal(explored, exploredShade),
          into(explored, exploredShade, '#d0d0d0'),
          reveal(visible, '#000000'),
          into(visible, '#000000', '#6a6a6a'),
        ),
      ),
    ),
    h('rect', { width: cols, height: rows, fill: '#0c0b0a', 'fill-opacity': player ? 1 : 0.55, mask: `url(#${id}-mask)` }),
  )
}

export type Scene = { svg: SvgEl; geometry: WallGeometry; sight?: Sight }

/** Renders a map to an SVG element tree (shared by the editor, canvas thumbnails and SVG export). */
export function renderMap(doc: MapDoc, opts: RenderOptions = {}): Scene {
  const mode = opts.mode ?? 'export'
  const edit = mode === 'edit'
  const href = opts.imageHref ?? ((s: string) => s)
  const prefix = opts.idPrefix ?? ''
  const { cols, rows } = doc.grid
  const objects = visibleObjects(doc)
  const floor = roomRegion(doc, objects)
  const geometry = wallGeometry(doc, objects, floor)
  const fogOn = doc.fog.enabled && (opts.fog ?? 'none') !== 'none'
  const lightOn = (opts.lighting ?? 'none') !== 'none' && (doc.fog.ambient !== 'light' || objects.some((o) => o.kind === 'room' && !!o.light))
  const sight = opts.sight ?? (fogOn || lightOn ? computeSight(doc, objects, geometry) : undefined)

  // Patterns for every textured fill in use.
  const fills: Fill[] = [doc.style.background, doc.style.floor]
  if (doc.style.wall.texture) fills.push({ texture: doc.style.wall.texture })
  for (const o of objects) {
    if ((o.kind === 'area' || o.kind === 'path' || o.kind === 'wall') && o.fill) fills.push(o.fill)
    if (o.kind === 'path' && o.stroke?.texture) fills.push({ texture: o.stroke.texture })
    if (o.kind === 'wall' && o.texture) fills.push({ texture: o.texture })
  }
  const patterns = new Map<string, SvgEl>()
  for (const f of fills) {
    const id = textureId(f, prefix)
    if (id && !patterns.has(id)) {
      const p = texturePattern(f, href, prefix)
      if (p) patterns.set(id, p)
    }
  }

  const terrain: SvgEl[] = []
  const areas = areaRegions(doc, objects)
  for (const o of objects) {
    if (o.kind !== 'area') continue
    if (o.op === 'subtract') {
      if (edit)
        terrain.push(
          h('path', {
            'data-id': o.id,
            'data-kind': 'area',
            d: shapeD(o.shape),
            transform: transformOf(o),
            fill: 'transparent',
            stroke: '#c2410c',
            'stroke-width': 0.04,
            'stroke-dasharray': '0.15 0.1',
          }),
        )
      continue
    }
    const a = areas.find((x) => x.object === o)!
    const attrs = { 'data-id': o.id, 'data-kind': 'area', ...paint(o.fill, prefix) }
    terrain.push(
      a.cut
        ? h('path', { ...attrs, d: multiD(a.region), 'fill-rule': 'evenodd' })
        : h('path', { ...attrs, d: shapeD(o.shape), transform: transformOf(o), 'fill-rule': 'evenodd' }),
    )
  }

  const rooms: SvgEl[] = []
  if (floor.length) rooms.push(h('path', { d: multiD(floor), 'fill-rule': 'evenodd', ...paint(doc.style.floor, prefix) }))
  if (edit)
    for (const o of objects)
      if (o.kind === 'room')
        rooms.push(
          h('path', {
            'data-id': o.id,
            'data-kind': 'room',
            d: shapeD(o.shape),
            transform: transformOf(o),
            fill: 'transparent',
            'fill-rule': 'evenodd',
            ...(o.op === 'subtract' ? { stroke: '#c2410c', 'stroke-width': 0.04, 'stroke-dasharray': '0.15 0.1' } : {}),
          }),
        )

  const decor: SvgEl[] = []
  for (const o of objects) {
    if (o.kind === 'path') {
      const s = o.stroke
      decor.push(
        h('path', {
          'data-id': o.id,
          'data-kind': 'path',
          d: shapeD(o.shape),
          transform: transformOf(o),
          'fill-rule': 'evenodd',
          ...(o.fill && (o.shape.type !== 'path' || o.shape.closed) ? paint(o.fill, prefix) : { fill: 'none' }),
          ...(s
            ? {
                stroke: s.texture ? `url(#${textureId({ texture: s.texture }, prefix)})` : s.color,
                'stroke-width': s.width,
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
                'stroke-dasharray': s.dash?.join(' '),
                'stroke-opacity': s.opacity,
              }
            : {}),
        }),
      )
    } else if (o.kind === 'image')
      decor.push(
        h('image', {
          'data-id': o.id,
          'data-kind': 'image',
          href: href(o.src),
          x: num(-o.w / 2),
          y: num(-o.h / 2),
          width: num(o.w),
          height: num(o.h),
          transform: transformOf(o),
          opacity: o.opacity,
          preserveAspectRatio: 'none',
        }),
      )
  }

  const gridOn = opts.grid ?? doc.grid.show
  const grid = gridOn
    ? h('path', {
        d: [...Array.from({ length: cols + 1 }, (_, i) => `M${i} 0V${rows}`), ...Array.from({ length: rows + 1 }, (_, j) => `M0 ${j}H${cols}`)].join(''),
        stroke: doc.grid.color,
        'stroke-opacity': doc.grid.opacity,
        'stroke-width': 1,
        'vector-effect': 'non-scaling-stroke',
        fill: 'none',
        'pointer-events': 'none',
      })
    : null

  const wall = doc.style.wall
  const walls: SvgEl[] = []
  // Solid structures (closed walls with a fill: roofs, cliffs, boulders) sit under every wall line.
  for (const o of objects)
    if (o.kind === 'wall' && o.fill && isClosedShape(o.shape))
      walls.push(
        h('path', { 'data-id': o.id, 'data-kind': 'wall', d: shapeD(o.shape), transform: transformOf(o), 'fill-rule': 'evenodd', ...paint(o.fill, prefix) }),
      )
  if (geometry.rooms.length) walls.push(...wallStroke(chainD(geometry.rooms), wall.color, wall.width, wall.texture, prefix, {}))
  for (const w of geometry.walls)
    walls.push(
      ...wallStroke(chainD(w.chains), w.object.color ?? wall.color, w.object.width ?? wall.width, w.object.texture ?? wall.texture, prefix, {
        'data-id': w.object.id,
        'data-kind': 'wall',
      }),
    )
  // An invisible wide stroke so thin walls are easy to click while editing.
  if (edit)
    for (const w of geometry.walls)
      walls.push(h('path', { 'data-id': w.object.id, 'data-kind': 'wall', d: chainD(w.chains), fill: 'none', stroke: 'transparent', 'stroke-width': 0.4 }))
  for (const d of geometry.doors) walls.push(door(d, wall, edit))

  const labels = objects
    .filter((o): o is Extract<MapObject, { kind: 'label' }> => o.kind === 'label')
    .map((o) =>
      h(
        'text',
        {
          'data-id': o.id,
          'data-kind': 'label',
          transform: transformOf(o),
          'font-size': num(o.size),
          'font-family': 'Literata, Georgia, serif',
          'text-anchor': 'middle',
          fill: o.color,
          stroke: '#ffffff',
          'stroke-opacity': 0.55,
          'stroke-width': num(o.size * 0.12),
          'paint-order': 'stroke',
          'stroke-linejoin': 'round',
        },
        o.text,
      ),
    )

  if (opts.roomNames ?? edit)
    for (const o of objects) {
      if (o.kind !== 'room' || o.op === 'subtract' || !o.name) continue
      const b = worldBox(o)
      const size = Math.max(0.3, Math.min(0.7, b.w / Math.max(4, o.name.length * 0.7), b.h / 3))
      labels.push(
        h(
          'text',
          {
            'data-room-name': o.id,
            x: num(b.x + b.w / 2),
            y: num(b.y + b.h / 2),
            'font-size': num(size),
            'font-family': 'Literata, Georgia, serif',
            'font-style': 'italic',
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            fill: '#3b3027',
            'fill-opacity': 0.75,
            stroke: '#ffffff',
            'stroke-opacity': 0.5,
            'stroke-width': num(size * 0.12),
            'paint-order': 'stroke',
            'pointer-events': 'none',
          },
          o.name,
        ),
      )
    }

  const lights = edit
    ? objects
        .filter((o): o is Extract<MapObject, { kind: 'light' }> => o.kind === 'light')
        .map((o) =>
          h(
            'g',
            { 'data-id': o.id, 'data-kind': 'light', transform: transformOf(o) },
            h('circle', { r: 0.28, fill: o.color, 'fill-opacity': 0.9, stroke: '#3b2a10', 'stroke-width': 0.04 }),
            h('circle', { r: 0.12, fill: '#ffffff' }),
          ),
        )
    : []

  const overlays: SvgEl[] = []
  if (lightOn && sight?.shaded) {
    // Darkness, unlit ambient dimness, then the dim edge of lights; the GM sees it all a little lighter.
    const k = opts.lighting === 'gm' ? 0.55 : 1
    const shade = (region: Multi, opacity: number) =>
      region.length &&
      overlays.push(h('path', { d: multiD(region), fill: '#05070d', 'fill-opacity': num(opacity * k), 'fill-rule': 'evenodd', 'pointer-events': 'none' }))
    shade(sight.dark, 0.8)
    shade(sight.dusk, 0.45)
    shade(difference(sight.dim, sight.bright, sight.dark, sight.dusk), 0.25)
  }
  if (fogOn && sight) {
    const explored = doc.fog.explored as Multi
    const player = opts.fog === 'player'
    const solids = objects
      .filter((o): o is Extract<MapObject, { kind: 'wall' }> => o.kind === 'wall' && !!o.fill && isClosedShape(o.shape))
      .map((o) => ({ d: shapeD(o.shape), transform: transformOf(o) }))
    overlays.push(fogOverlay(cols, rows, explored, sight.visible, player, prefix, solids))
  }

  // Players only see other tokens inside what their characters see; the GM sees all.
  const playerFog = fogOn && opts.fog === 'player' && !!sight
  const tokens =
    (opts.tokens ?? true)
      ? doc.tokens
          .filter((t) => layerVisible(doc, t.layers) && (edit || !t.hidden))
          .map((t) => (playerFog && !t.player ? h('g', { 'clip-path': `url(#${prefix}sight)` }, token(t, prefix, href)) : token(t, prefix, href)))
      : []

  const clip = `${prefix}map-clip`
  const svg = h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${cols} ${rows}`,
      width: opts.width ?? cols * doc.grid.size,
      height: opts.height ?? rows * doc.grid.size,
    },
    h(
      'defs',
      {},
      ...patterns.values(),
      h('clipPath', { id: clip }, h('rect', { width: cols, height: rows })),
      playerFog && sight ? h('clipPath', { id: `${prefix}sight` }, h('path', { d: multiD(sight.visible) })) : null,
    ),
    h(
      'g',
      opts.clip === false ? {} : { 'clip-path': `url(#${clip})` },
      h('rect', { width: cols, height: rows, ...paint(doc.style.background, prefix), 'data-background': '1' }),
      h('g', { 'data-band': 'terrain' }, ...terrain),
      h('g', { 'data-band': 'rooms' }, ...rooms),
      h('g', { 'data-band': 'decor' }, ...decor),
      grid,
      h('g', { 'data-band': 'walls' }, ...walls),
      h('g', { 'data-band': 'labels' }, ...labels),
      h('g', { 'data-band': 'lights' }, ...lights),
      ...overlays,
      h('g', { 'data-band': 'tokens' }, ...tokens),
    ),
  )
  return { svg, geometry, sight }
}

/** The map as a standalone SVG document. */
export function mapSvg(doc: MapDoc, opts: RenderOptions = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svgString(renderMap(doc, opts).svg)}\n`
}
