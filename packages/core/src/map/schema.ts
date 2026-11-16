import { z } from 'zod'

/*
 * Map documents (`maps/<id>.map.json`). All coordinates and lengths are in grid cells: x grows right, y grows down,
 * (0, 0) is the top-left corner of the map and cell (c, r) spans [c, c+1) × [r, r+1). `grid.size` only says how many
 * pixels one cell has when the map is exported.
 */

export const MAP_VERSION = 1

export const Point = z.object({ x: z.number(), y: z.number() })
export type Point = z.infer<typeof Point>

/** A path vertex; `in`/`out` are bezier handles relative to the vertex (both absent = sharp corner). */
export const PathPoint = z.object({ x: z.number(), y: z.number(), in: Point.optional(), out: Point.optional() })
export type PathPoint = z.infer<typeof PathPoint>

export const RectShape = z.object({ type: z.literal('rect'), w: z.number().positive(), h: z.number().positive(), radius: z.number().min(0).optional() })
export const EllipseShape = z.object({ type: z.literal('ellipse'), rx: z.number().positive(), ry: z.number().positive() })
/** Points are relative to the object x/y. `holes` are extra closed rings (filled even-odd), e.g. from a baked boolean. */
export const PathShape = z.object({
  type: z.literal('path'),
  points: z.array(PathPoint).min(2),
  closed: z.boolean().default(false),
  holes: z.array(z.array(PathPoint).min(3)).optional(),
})
export const Shape = z.discriminatedUnion('type', [RectShape, EllipseShape, PathShape])
export type Shape = z.infer<typeof Shape>
export type PathShape = z.infer<typeof PathShape>

export const HEX = /^#[0-9a-f]{6}$/i
const Color = z.string().regex(HEX, 'colors are #rrggbb')

/** Built-in procedural textures; a media path (media/…) may be used as a texture too. */
export const TEXTURES = ['grass', 'dirt', 'sand', 'stone', 'cobble', 'wood', 'tiles', 'water', 'lava', 'snow', 'brick', 'rock', 'shingles', 'thatch'] as const
export type BuiltinTexture = (typeof TEXTURES)[number]

/** A fill: a color, a texture (tinted by nothing) or both (texture over color). `scale` = cells per texture tile. */
export const Fill = z.object({
  color: Color.optional(),
  texture: z.string().optional(),
  scale: z.number().positive().optional(),
  opacity: z.number().min(0).max(1).optional(),
})
export type Fill = z.infer<typeof Fill>

export const Stroke = z.object({
  color: Color.default('#3b3027'),
  width: z.number().positive().default(0.1),
  dash: z.array(z.number().nonnegative()).optional(),
  opacity: z.number().min(0).max(1).optional(),
  /** Paint the stroke with a texture (built-in or media path) instead of the color, e.g. a dirt road brush. */
  texture: z.string().optional(),
})
export type Stroke = z.infer<typeof Stroke>

export const BoolOp = z.enum(['add', 'subtract'])
export type BoolOp = z.infer<typeof BoolOp>

const Base = {
  id: z.string(),
  name: z.string().optional(),
  /** Layer ids; the object shows while any of them is visible. Empty = always shown. */
  layers: z.array(z.string()).default([]),
  x: z.number(),
  y: z.number(),
  /** Degrees, clockwise, around x/y. */
  rotation: z.number().default(0),
  locked: z.boolean().optional(),
}

/** Painted terrain. `subtract` erases the paint of areas below it. */
export const AreaObject = z.object({ ...Base, kind: z.literal('area'), shape: Shape, op: BoolOp.default('add'), fill: Fill.default({ color: '#6b8f4e' }) })
export const LIGHT_LEVELS = ['light', 'dim', 'dark'] as const
export const LightLevel = z.enum(LIGHT_LEVELS)
export type LightLevel = z.infer<typeof LightLevel>

export const ROOM_OPS = ['add', 'subtract', 'separate'] as const
export const RoomOp = z.enum(ROOM_OPS)
export type RoomOp = z.infer<typeof RoomOp>
/**
 * Rooms merge (add) and cut (subtract) in order into one floor; its outline becomes walls. A `separate` room keeps its
 * own walls even inside another room (a room in a room, a tower in a courtyard). `light` overrides the map's ambient
 * light inside the room (a lit tavern on a dark night, a dark cellar at noon). `name` shows in its middle for the GM.
 */
export const RoomObject = z.object({ ...Base, kind: z.literal('room'), shape: Shape, op: RoomOp.default('add'), light: LightLevel.optional() })
/**
 * Free-standing wall line; blocks sight. `texture` is its material (wood, stone, brick, rock…), drawn along the line.
 * A closed wall may have a `fill`: a solid structure seen from outside, such as a roof, a cliff or a boulder.
 */
export const WallObject = z.object({
  ...Base,
  kind: z.literal('wall'),
  shape: Shape,
  width: z.number().positive().optional(),
  color: Color.optional(),
  texture: z.string().optional(),
  fill: Fill.optional(),
})
/** Decorative stroke / shape (roads, rivers, brush strokes); never blocks sight. */
export const PathObject = z.object({ ...Base, kind: z.literal('path'), shape: Shape, stroke: Stroke.optional(), fill: Fill.optional() })
export const DOOR_VARIANTS = ['door', 'double', 'window', 'secret'] as const
/** Opening in a wall, centered on x/y along `rotation`. Closed doors (not windows) block sight. */
export const DoorObject = z.object({
  ...Base,
  kind: z.literal('door'),
  width: z.number().positive().default(1),
  variant: z.enum(DOOR_VARIANTS).default('door'),
  open: z.boolean().default(false),
})
/** A media image; x/y is its center. */
export const ImageObject = z.object({
  ...Base,
  kind: z.literal('image'),
  src: z.string(),
  w: z.number().positive(),
  h: z.number().positive(),
  opacity: z.number().min(0).max(1).optional(),
})
export const LabelObject = z.object({
  ...Base,
  kind: z.literal('label'),
  text: z.string(),
  size: z.number().positive().default(0.6),
  color: Color.default('#1f1a15'),
})
/** Light source: bright radius, then dim light up to `dim` (cells). */
export const LightObject = z.object({
  ...Base,
  kind: z.literal('light'),
  bright: z.number().nonnegative().default(4),
  dim: z.number().nonnegative().default(8),
  color: Color.default('#ffd27a'),
})

export const MapObject = z.discriminatedUnion('kind', [AreaObject, RoomObject, WallObject, PathObject, DoorObject, ImageObject, LabelObject, LightObject])
export type MapObject = z.infer<typeof MapObject>
export type MapObjectKind = MapObject['kind']
export const OBJECT_KINDS = ['area', 'room', 'wall', 'path', 'door', 'image', 'label', 'light'] as const satisfies readonly MapObjectKind[]
export type ShapedObject = Extract<MapObject, { shape: Shape }>
export const isShaped = (o: MapObject): o is ShapedObject => 'shape' in o

export const Token = z.object({
  id: z.string(),
  name: z.string(),
  /** Center, in cells (cell centers are at .5). */
  x: z.number(),
  y: z.number(),
  /** Footprint in cells (1 = medium, 2 = large…). */
  size: z.number().positive().default(1),
  color: Color.default('#d9822b'),
  /** Linked node (e.g. the character). */
  node: z.string().optional(),
  image: z.string().optional(),
  /** Player tokens reveal the fog of war. */
  player: z.boolean().default(false),
  /** Sight radius in cells (absent = unlimited in light). */
  vision: z.number().nonnegative().optional(),
  /** Sees without light up to this radius (cells). */
  darkvision: z.number().nonnegative().optional(),
  layers: z.array(z.string()).default([]),
  hidden: z.boolean().optional(),
})
export type Token = z.infer<typeof Token>

export const Layer = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean().default(true),
  /** Layers sharing a group are exclusive: showing one hides the others (e.g. "before" / "after" the battle). */
  group: z.string().optional(),
})
export type Layer = z.infer<typeof Layer>

export const DIAGONAL_RULES = ['alternate', 'equal', 'euclid'] as const
export const DiagonalRule = z.enum(DIAGONAL_RULES)
export type DiagonalRule = z.infer<typeof DiagonalRule>

export const Grid = z.object({
  cols: z.number().int().min(1).max(500).default(30),
  rows: z.number().int().min(1).max(500).default(20),
  /** Pixels per cell in exports. */
  size: z.number().int().min(8).max(400).default(70),
  /** What one cell measures, e.g. 5 ft or 100 m. */
  unit: z.object({ amount: z.number().positive().default(5), name: z.string().default('ft') }).default({ amount: 5, name: 'ft' }),
  /**
   * Cost of a diagonal step: alternate = 1, 2, 1, 2… cells (D&D 2014/variant), equal = 1 cell (D&D 2024),
   * euclid = √2.
   */
  diagonal: DiagonalRule.default('equal'),
  show: z.boolean().default(true),
  color: Color.default('#000000'),
  opacity: z.number().min(0).max(1).default(0.18),
})
export type Grid = z.infer<typeof Grid>

export const AMBIENT = LIGHT_LEVELS
export const Fog = z.object({
  enabled: z.boolean().default(false),
  /** light: lit everywhere. dim: players see everywhere but it is darker away from lights. dark: players see only lit areas (or with darkvision). */
  ambient: z.enum(AMBIENT).default('light'),
  /** Areas players have seen, as polygons ([polygon][ring][point] = [x, y]). */
  explored: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))).default([]),
})
export type Fog = z.infer<typeof Fog>

export const MapStyle = z.object({
  background: Fill.default({ color: '#d8cfb8' }),
  floor: Fill.default({ color: '#efe6d2' }),
  /** Walls of rooms (and default for wall objects): color, thickness and an optional material texture. */
  wall: z
    .object({ color: Color.default('#2b241e'), width: z.number().positive().default(0.25), texture: z.string().optional() })
    .default({ color: '#2b241e', width: 0.25 }),
})
export type MapStyle = z.infer<typeof MapStyle>

export const MapDoc = z.object({
  version: z.literal(MAP_VERSION).default(MAP_VERSION),
  grid: Grid.default(Grid.parse({})),
  style: MapStyle.default(MapStyle.parse({})),
  layers: z.array(Layer).default([]),
  objects: z.array(MapObject).default([]),
  tokens: z.array(Token).default([]),
  fog: Fog.default(Fog.parse({})),
})
export type MapDoc = z.infer<typeof MapDoc>
export type MapDocInput = z.input<typeof MapDoc>

/**
 * Project-wide defaults for new maps (`maquest.json` → `maps`): set once, e.g. the diagonal rule of the system you
 * play, and every new map starts with them. Every field is optional.
 */
export const MapDefaults = z.object({
  grid: z
    .object({
      cols: z.number().int().min(1).max(500).optional(),
      rows: z.number().int().min(1).max(500).optional(),
      size: z.number().int().min(8).max(400).optional(),
      unit: z.object({ amount: z.number().positive(), name: z.string() }).optional(),
      diagonal: DiagonalRule.optional(),
      show: z.boolean().optional(),
      color: Color.optional(),
      opacity: z.number().min(0).max(1).optional(),
    })
    .optional(),
  style: z
    .object({
      background: Fill.optional(),
      floor: Fill.optional(),
      wall: z.object({ color: Color.optional(), width: z.number().positive().optional(), texture: z.string().optional() }).optional(),
    })
    .optional(),
  fog: z.object({ enabled: z.boolean().optional(), ambient: z.enum(AMBIENT).optional() }).optional(),
})
export type MapDefaults = z.infer<typeof MapDefaults>

const clean = <T extends object>(o: T | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>

/** A new, empty map; project defaults first, then the explicit patch. */
export function emptyMap(patch: { cols?: number; rows?: number } = {}, defaults: MapDefaults = {}): MapDoc {
  const style = MapStyle.parse({})
  return MapDoc.parse({
    grid: { ...clean(defaults.grid), ...clean(patch) },
    style: { ...style, ...clean(defaults.style), wall: { ...style.wall, ...clean(defaults.style?.wall) } },
    fog: clean(defaults.fog),
  })
}

/** The settings of a map that make sense as project defaults for new maps. */
export function mapDefaultsOf(doc: MapDoc): MapDefaults {
  const { cols, rows, size, unit, diagonal, show, color, opacity } = doc.grid
  return {
    grid: { cols, rows, size, unit, diagonal, show, color, opacity },
    style: structuredClone(doc.style),
    fog: { enabled: doc.fog.enabled, ambient: doc.fog.ambient },
  }
}

/** Whether an object (or token) shows with the current layer visibility. */
export function layerVisible(doc: Pick<MapDoc, 'layers'>, layers: readonly string[]) {
  if (!layers.length) return true
  return layers.some((id) => doc.layers.find((l) => l.id === id)?.visible ?? true)
}

/** Shows a layer; other layers of its group hide (the swap). Mutates and returns the doc. */
export function showLayer<T extends Pick<MapDoc, 'layers'>>(doc: T, id: string, visible = true): T {
  const layer = doc.layers.find((l) => l.id === id)
  if (!layer) throw new Error(`Layer not found: ${id}`)
  layer.visible = visible
  if (visible && layer.group) for (const l of doc.layers) if (l !== layer && l.group === layer.group) l.visible = false
  return doc
}

/** A fresh id with the prefix that is not used by any object, token or layer. */
export function freeMapId(doc: MapDoc, prefix: string, taken: ReadonlySet<string> = new Set()) {
  const used = new Set([...doc.objects.map((o) => o.id), ...doc.tokens.map((t) => t.id), ...doc.layers.map((l) => l.id), ...taken])
  let i = 1
  while (used.has(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}

const list = (items: readonly unknown[]) => (items.length ? `[\n${items.map((i) => `    ${JSON.stringify(i)}`).join(',\n')}\n  ]` : '[]')

/** Map JSON with one object, token and layer per line, so git diffs stay readable. */
export function stringifyMap(doc: MapDoc): string {
  return `{
  "version": ${doc.version},
  "grid": ${JSON.stringify(doc.grid)},
  "style": ${JSON.stringify(doc.style)},
  "layers": ${list(doc.layers)},
  "objects": ${list(doc.objects)},
  "tokens": ${list(doc.tokens)},
  "fog": ${JSON.stringify(doc.fog)}
}
`
}
