import { MapObject, Token, explore, freeMapId, sight, type MapDoc, type MapObjectKind, type Point } from '@maquest/core/map'
import type { TokenKind } from './mapStore'

/** Small immutable helpers the editor uses on map documents. */

export const snapTo = (v: number, step: number) => (step ? Math.round(v / step) * step : v)
export const snapPoint = (p: Point, step: number): Point => ({ x: snapTo(p.x, step), y: snapTo(p.y, step) })

/** Tokens snap so their footprint covers whole cells: centers at .5 for odd sizes, whole numbers for even. */
export function snapToken(p: Point, size: number): Point {
  const off = Math.round(size) % 2 ? 0.5 : 0
  return { x: Math.floor(p.x - off + 0.5) + off, y: Math.floor(p.y - off + 0.5) + off }
}

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

export function addObject(doc: MapDoc, input: Record<string, unknown> & { kind: MapObjectKind }, layer: string | null): { doc: MapDoc; id: string } {
  const id = freeMapId(doc, PREFIX[input.kind])
  const object = MapObject.parse({ x: 0, y: 0, ...input, id, layers: layer ? [layer] : [] })
  return { doc: { ...doc, objects: [...doc.objects, object] }, id }
}

/**
 * What a new token of each kind starts with. Sight is unlimited where it is lit (absent `vision`), as in most VTTs and
 * in D&D. Player characters also start with darkvision 60 ft (12 cells), the most common range among player races,
 * so they are not blind on a dark map; the GM removes it for humans. Enemies and NPCs never reveal the fog, so their
 * vision only matters once the GM changes them.
 */
export const TOKEN_PRESETS = {
  player: { name: 'Player', color: '#3f8f5a', player: true, darkvision: 12 },
  enemy: { name: 'Enemy', color: '#b8322a', player: false },
  npc: { name: 'NPC', color: '#3a73b8', player: false },
} as const satisfies Record<TokenKind, { name: string; color: string; player: boolean; darkvision?: number }>

/** A new token of a kind, named "<Kind> <n>", snapped so it covers whole cells unless `free`. */
export function addToken(doc: MapDoc, at: Point, layer: string | null, kind: TokenKind = 'player', free = false): { doc: MapDoc; id: string } {
  const id = freeMapId(doc, 'token')
  const { name, ...preset } = TOKEN_PRESETS[kind]
  const taken = new Set(doc.tokens.map((t) => t.name))
  let n = doc.tokens.filter((t) => t.name.startsWith(`${name} `)).length + 1
  while (taken.has(`${name} ${n}`)) n++
  const token = Token.parse({ id, name: `${name} ${n}`, ...preset, ...(free ? at : snapToken(at, 1)), layers: layer ? [layer] : [] })
  return { doc: { ...doc, tokens: [...doc.tokens, token] }, id }
}

export function patchObject(doc: MapDoc, id: string, patch: Record<string, unknown>): MapDoc {
  return {
    ...doc,
    objects: doc.objects.map((o) => (o.id === id ? MapObject.parse({ ...o, ...patch, id, kind: o.kind }) : o)),
    tokens: doc.tokens.map((t) => (t.id === id ? Token.parse({ ...t, ...patch, id }) : t)),
  }
}

export function removeIds(doc: MapDoc, ids: readonly string[]): MapDoc {
  const set = new Set(ids)
  return { ...doc, objects: doc.objects.filter((o) => !set.has(o.id)), tokens: doc.tokens.filter((t) => !set.has(t.id)) }
}

/** Moves objects and tokens by a delta (tokens re-snap when `snapTokens`). */
export function moveIds(doc: MapDoc, ids: readonly string[], dx: number, dy: number, snapTokens: boolean): MapDoc {
  const set = new Set(ids)
  return {
    ...doc,
    objects: doc.objects.map((o) => (set.has(o.id) && !o.locked ? { ...o, x: o.x + dx, y: o.y + dy } : o)),
    tokens: doc.tokens.map((t) => {
      if (!set.has(t.id)) return t
      const p = { x: t.x + dx, y: t.y + dy }
      return { ...t, ...(snapTokens ? snapToken(p, t.size) : p) }
    }),
  }
}

/** Copies of the objects/tokens one cell down-right; returns the new ids. */
export function duplicateIds(doc: MapDoc, ids: readonly string[]): { doc: MapDoc; ids: string[] } {
  let next = doc
  const out: string[] = []
  const taken = new Set<string>()
  for (const id of ids) {
    const o = doc.objects.find((x) => x.id === id)
    const t = doc.tokens.find((x) => x.id === id)
    const fresh = freeMapId(next, (o ? PREFIX[o.kind] : 'token') as string, taken)
    taken.add(fresh)
    if (o) next = { ...next, objects: [...next.objects, { ...structuredClone(o), id: fresh, x: o.x + 1, y: o.y + 1 }] }
    else if (t) next = { ...next, tokens: [...next.tokens, { ...structuredClone(t), id: fresh, x: t.x + 1, y: t.y + 1 }] }
    else continue
    out.push(fresh)
  }
  return { doc: next, ids: out }
}

export function reorder(doc: MapDoc, ids: readonly string[], to: 'front' | 'back' | 'forward' | 'backward'): MapDoc {
  const set = new Set(ids)
  const moving = doc.objects.filter((o) => set.has(o.id))
  const rest = doc.objects.filter((o) => !set.has(o.id))
  if (to === 'front') return { ...doc, objects: [...rest, ...moving] }
  if (to === 'back') return { ...doc, objects: [...moving, ...rest] }
  const objects = [...doc.objects]
  const step = to === 'forward' ? 1 : -1
  const order = to === 'forward' ? [...objects.keys()].toReversed() : [...objects.keys()]
  for (const i of order) {
    if (!set.has(objects[i].id)) continue
    const j = i + step
    if (j < 0 || j >= objects.length || set.has(objects[j].id)) continue
    ;[objects[i], objects[j]] = [objects[j], objects[i]]
  }
  return { ...doc, objects }
}

/** Grows the explored fog by what the players see now (no-op while fog is off). */
export function withExplored(doc: MapDoc): MapDoc {
  if (!doc.fog.enabled || !doc.tokens.some((t) => t.player)) return doc
  return { ...doc, fog: { ...doc.fog, explored: explore(doc.fog.explored as never, sight(doc).visible) } }
}
