import { h, num, type SvgEl } from './svg'
import { TEXTURES, type BuiltinTexture, type Fill } from './schema'

/** Base color of each built-in texture when the fill has none. */
export const TEXTURE_COLORS: Record<BuiltinTexture, string> = {
  grass: '#6b8f4e',
  dirt: '#8a6a48',
  sand: '#d9c48f',
  stone: '#8f8b84',
  cobble: '#7f7b74',
  wood: '#9b6b3f',
  tiles: '#cbc4b5',
  water: '#4a7fa8',
  lava: '#b8401c',
  snow: '#eef2f5',
}

export const isBuiltinTexture = (t: string): t is BuiltinTexture => (TEXTURES as readonly string[]).includes(t)

/** Default tile size (cells) of each texture. */
const TILE: Record<BuiltinTexture, number> = { grass: 2, dirt: 2, sand: 2, stone: 2, cobble: 1, wood: 2, tiles: 1, water: 3, lava: 3, snow: 2 }

/** Small deterministic pseudo random sequence so textures look the same every render. */
function rand(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** Paint as color + opacity attributes (portable to any SVG viewer). */
type Paint = [string, number]
const dark: Paint = ['#000000', 0.16]
const light: Paint = ['#ffffff', 0.16]
const fillOf = ([c, o]: Paint) => ({ fill: c, 'fill-opacity': o })
const strokeOf = ([c, o]: Paint) => ({ stroke: c, 'stroke-opacity': o })

/** Marks of a texture inside a unit tile [0, 1]². */
function marks(t: BuiltinTexture): SvgEl[] {
  const r = rand(t.length * 7919)
  const dots = (n: number, size: number, paint: Paint) =>
    Array.from({ length: n }, () => h('circle', { cx: num(r()), cy: num(r()), r: num(size * (0.5 + r())), ...fillOf(paint) }))
  switch (t) {
    case 'grass':
      return Array.from({ length: 34 }, (_, i) => {
        const x = r()
        const y = r()
        const lean = (r() - 0.5) * 0.05
        return h('path', {
          d: `M${num(x)} ${num(y)}l${num(lean)} -${num(0.035 + r() * 0.03)}`,
          ...strokeOf(i % 3 ? dark : light),
          'stroke-width': 0.012,
          'stroke-linecap': 'round',
        })
      })
    case 'dirt':
      return [...dots(26, 0.012, dark), ...dots(12, 0.01, light)]
    case 'sand':
      return [...dots(40, 0.006, dark), ...dots(20, 0.006, light)]
    case 'snow':
      return [...dots(24, 0.008, ['#788ca0', 0.18])]
    case 'stone': {
      const d = 'M0 0H.55V.4H0Z M.55 0H1V.55H.55Z M0 .4H.3V1H0Z M.3 .4H.55V.75H.3Z M.55 .55H1V1H.55Z M.3 .75H.55V1H.3Z'
      return [h('path', { d, fill: 'none', ...strokeOf(dark), 'stroke-width': 0.02 }), ...dots(10, 0.01, light)]
    }
    case 'cobble':
      return [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.5, 0.75],
        [0, 0.75],
        [1, 0.75],
      ].map(([cx, cy]) => h('ellipse', { cx, cy, rx: 0.21, ry: 0.19, ...fillOf(light), ...strokeOf(dark), 'stroke-width': 0.025 }))
    case 'wood':
      return [
        h('path', { d: 'M0 .25H1M0 .5H1M0 .75H1M0 1H1M.3 0V.25M.8 .25V.5M.15 .5V.75M.6 .75V1', ...strokeOf(dark), 'stroke-width': 0.015, fill: 'none' }),
        ...Array.from({ length: 8 }, (_, i) =>
          h('path', { d: `M${num(r())} ${num(i * 0.125 + 0.06)}h${num(0.1 + r() * 0.2)}`, ...strokeOf(light), 'stroke-width': 0.008 }),
        ),
      ]
    case 'tiles':
      return [h('path', { d: 'M0 0H1V1H0Z M.5 0V1 M0 .5H1', fill: 'none', ...strokeOf(dark), 'stroke-width': 0.025 })]
    case 'water':
      return [0.2, 0.45, 0.7, 0.95].map((y, i) =>
        h('path', {
          d: `M${i % 2 ? -0.1 : 0.05} ${y}q.1 -.06 .2 0t.2 0`,
          fill: 'none',
          ...strokeOf(['#ffffff', 0.25]),
          'stroke-width': 0.015,
          'stroke-linecap': 'round',
        }),
      )
    case 'lava':
      return [...dots(10, 0.05, ['#ffbe3c', 0.35]), ...dots(14, 0.02, ['#280a00', 0.3])]
  }
}

/** Pattern id for a fill's texture, or undefined when it has none. */
export function textureId(fill: Fill, prefix = ''): string | undefined {
  if (!fill.texture) return undefined
  const key = `${fill.texture}-${fill.color ?? ''}-${fill.scale ?? ''}`
  return `${prefix}tex-${key.replaceAll(/[^a-z0-9-]/gi, '_')}`
}

/** `<pattern>` for a textured fill (built-in or a media image). */
export function texturePattern(fill: Fill, imageHref: (src: string) => string, prefix = ''): SvgEl | null {
  const id = textureId(fill, prefix)
  if (!id || !fill.texture) return null
  const builtin = isBuiltinTexture(fill.texture) ? fill.texture : null
  const size = fill.scale ?? (builtin ? TILE[builtin] : 4)
  const base = fill.color ?? (builtin ? TEXTURE_COLORS[builtin] : undefined)
  const content = builtin
    ? h('g', { transform: `scale(${num(size)})` }, base ? h('rect', { width: 1, height: 1, fill: base }) : null, ...marks(builtin))
    : h(
        'g',
        {},
        base ? h('rect', { width: num(size), height: num(size), fill: base }) : null,
        h('image', { href: imageHref(fill.texture), width: num(size), height: num(size), preserveAspectRatio: 'xMidYMid slice' }),
      )
  return h('pattern', { id, patternUnits: 'userSpaceOnUse', width: num(size), height: num(size) }, content)
}
