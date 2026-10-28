import dagre from '@dagrejs/dagre'
import ELK, { type LayoutOptions } from 'elkjs/lib/elk.bundled.js'
import { CARD_SIZE, GROUP_HEADER, GROUP_PAD, PHASE_WIDTH, bounds, phaseIndex, type Board, type Position, type Rect, type Size } from '@maquest/core/schema'

export type LayoutCard = { id: string; position: Position; size: Size; pinned?: boolean }
export type LayoutResult = { positions: Record<string, Position>; groups: Record<string, Rect> }
export type LayoutMode = 'smart' | 'grid' | 'flow-right' | 'flow-down' | 'classic'
export type LayoutOptionsInput = { mode?: LayoutMode; /** Width / height to aim for at the top level, usually the viewport's. */ aspectRatio?: number }

export const LAYOUT_MODES: { mode: LayoutMode; label: string; hint: string }[] = [
  { mode: 'smart', label: 'Smart', hint: 'Flow where cards are linked, compact grid where they are not; fits the screen' },
  { mode: 'grid', label: 'Grid', hint: 'Pack everything into a compact grid in reading order, ignoring links' },
  { mode: 'flow-right', label: 'Flow →', hint: 'Follow links left to right, wrapping long chains to fit the screen' },
  { mode: 'flow-down', label: 'Flow ↓', hint: 'Follow links top to bottom' },
  { mode: 'classic', label: 'Classic', hint: 'The original left-to-right layout' },
]

const GAP = 40
const GROUP_ASPECT = 1.6
const key = (id: string, group: boolean) => (group ? `group:${id}` : id)
const elk = new ELK()

type Box = { key: string; width: number; height: number }

/** Top-left positions for one container's items, in an arbitrary frame. */
async function place(items: Box[], links: [string, string][], mode: LayoutMode, aspectRatio: number): Promise<Map<string, Position>> {
  if (mode === 'classic') {
    const g = new dagre.graphlib.Graph().setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 120 }).setDefaultEdgeLabel(() => ({}))
    for (const item of items) g.setNode(item.key, { width: item.width, height: item.height })
    for (const [source, target] of links) g.setEdge(source, target)
    dagre.layout(g)
    return new Map(items.map((item) => [item.key, { x: g.node(item.key).x - item.width / 2, y: g.node(item.key).y - item.height / 2 }]))
  }
  const packed = mode === 'grid' || (mode === 'smart' && !links.length)
  const common: LayoutOptions = {
    'elk.aspectRatio': String(aspectRatio),
    'elk.spacing.nodeNode': String(GAP),
    'elk.padding': '[top=0,left=0,bottom=0,right=0]',
  }
  const options: LayoutOptions = packed
    ? { ...common, 'elk.algorithm': 'rectpacking' }
    : {
        ...common,
        'elk.algorithm': 'layered',
        'elk.direction': mode === 'flow-down' ? 'DOWN' : 'RIGHT',
        'elk.separateConnectedComponents': 'true',
        'elk.spacing.componentComponent': String(GAP * 1.5),
        'elk.layered.spacing.nodeNodeBetweenLayers': '120',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        ...(mode === 'flow-right' ? { 'elk.layered.wrapping.strategy': 'MULTI_EDGE' } : {}),
      }
  const result = await elk.layout({
    id: 'root',
    layoutOptions: options,
    children: items.map((item) => ({ id: item.key, width: item.width, height: item.height })),
    edges: packed ? [] : links.map(([source, target], i) => ({ id: `e${i}`, sources: [source], targets: [target] })),
  })
  return new Map((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]))
}

/**
 * Arranges cards bottom-up: each group lays out its own cards and subgroups (per `mode`, edges lifted to the
 * group's direct children), shrinks to fit, then moves as one block in its parent. Pinned cards never move;
 * a group holding a pinned card keeps its place and arranges the rest around it. Cards not passed in
 * (hidden) travel with their group untouched.
 */
export async function arrange(
  board: Board,
  cards: LayoutCard[],
  edges: { source: string; target: string }[],
  { mode = 'smart', aspectRatio = 16 / 9 }: LayoutOptionsInput = {},
): Promise<LayoutResult> {
  const card = new Map(cards.map((c) => [c.id, c]))
  const pos = new Map<string, Position>(Object.entries(board.layout).map(([id, p]) => [id, { ...p }]))
  for (const c of cards) pos.set(c.id, { ...c.position })
  const rect = new Map(board.groups.map((g) => [g.id, { x: g.x, y: g.y, width: g.width, height: g.height }]))
  const groupOfCard = new Map<string, string>()
  for (const g of board.groups) for (const n of g.nodes) groupOfCard.set(n, g.id)
  const parentOf = new Map(board.groups.filter((g) => g.parent && rect.has(g.parent)).map((g) => [g.id, g.parent!]))
  const childGroups = (container: string | undefined) => board.groups.filter((g) => parentOf.get(g.id) === container).map((g) => g.id)
  const childCards = (container: string | undefined) => cards.filter((c) => groupOfCard.get(c.id) === container).map((c) => c.id)

  const pinned = new Map<string, boolean>()
  const hasPinned = (g: string): boolean => {
    if (!pinned.has(g)) pinned.set(g, childCards(g).some((c) => card.get(c)!.pinned) || childGroups(g).some(hasPinned))
    return pinned.get(g)!
  }
  const translate = (g: string, dx: number, dy: number) => {
    const r = rect.get(g)!
    rect.set(g, { ...r, x: r.x + dx, y: r.y + dy })
    for (const n of board.groups.find((x) => x.id === g)!.nodes) {
      const p = pos.get(n)
      if (p) pos.set(n, { x: p.x + dx, y: p.y + dy })
    }
    for (const child of childGroups(g)) translate(child, dx, dy)
  }
  // Direct child of `container` that contains `id`, if any.
  const representative = (id: string, container: string | undefined) => {
    let current = key(id, false)
    let up = groupOfCard.get(id)
    for (let guard = 0; guard < 64; guard++) {
      if (up === container) return current
      if (up === undefined) return null
      current = key(up, true)
      up = parentOf.get(up)
    }
    return null
  }

  const layout = async (container: string | undefined) => {
    for (const g of childGroups(container)) await layout(g)
    type Item = { key: string; id: string; group: boolean; fixed: boolean; box: () => Rect }
    const items: Item[] = [
      ...childCards(container).map((id) => ({
        key: key(id, false),
        id,
        group: false,
        fixed: !!card.get(id)!.pinned,
        box: () => ({ ...pos.get(id)!, ...card.get(id)!.size }),
      })),
      ...childGroups(container).map((id) => ({ key: key(id, true), id, group: true, fixed: hasPinned(id), box: () => rect.get(id)! })),
    ]
    if (items.length) {
      // Feed items in reading order so packed layouts keep the user's rough arrangement.
      items.sort((a, b) => a.box().y - b.box().y || a.box().x - b.box().x || a.key.localeCompare(b.key))
      const links = new Map<string, [string, string]>()
      for (const e of edges) {
        const source = representative(e.source, container)
        const target = representative(e.target, container)
        if (source && target && source !== target) links.set(`${source}\n${target}`, [source, target])
      }
      const placed = await place(
        items.map((item) => ({ key: item.key, width: item.box().width, height: item.box().height })),
        [...links.values()],
        mode,
        container === undefined ? aspectRatio : GROUP_ASPECT,
      )
      const topLeft = (item: Item) => placed.get(item.key) ?? { x: 0, y: 0 }
      const movable = items
        .filter((item) => !item.fixed)
        .toSorted((a, b) => topLeft(a).x - topLeft(b).x || topLeft(a).y - topLeft(b).y || a.key.localeCompare(b.key))
      // Inside a group, layout coordinates start at the group's content origin (top level keeps the layout's own).
      const frame = container === undefined ? null : rect.get(container)!
      const minimum = bounds(movable.map((item) => ({ ...topLeft(item), width: 0, height: 0 })))
      const origin = frame && minimum ? { x: frame.x + GROUP_PAD - minimum.x, y: frame.y + GROUP_HEADER + GROUP_PAD - minimum.y } : { x: 0, y: 0 }
      const occupied = items.filter((item) => item.fixed).map((item) => item.box())
      const targets = new Map<Item, Position>()
      if (container === undefined && board.phases.length) {
        // Keep every item in its phase column; pack each column into two lanes, in layout order.
        const columns = new Map<number, Item[]>()
        for (const item of movable) {
          const x = item.box().x
          const i = phaseIndex(board, x)
          const column = i >= 0 ? i : x < 0 ? 0 : board.phases.length - 1
          columns.set(column, [...(columns.get(column) ?? []), item])
        }
        for (const [column, list] of columns) {
          list.sort((a, b) => topLeft(a).y - topLeft(b).y || a.key.localeCompare(b.key))
          const lanes = [0, 0]
          for (const item of list) {
            const { width, height } = item.box()
            const x = column * PHASE_WIDTH + GAP
            if (width > 230) {
              const y = Math.max(...lanes)
              targets.set(item, { x, y })
              lanes[0] = lanes[1] = y + height + GAP
            } else {
              const lane = lanes[0] <= lanes[1] ? 0 : 1
              targets.set(item, { x: x + lane * 250, y: lanes[lane] })
              lanes[lane] += height + GAP
            }
          }
        }
      } else
        for (const item of movable) {
          const at = topLeft(item)
          const box = { x: at.x + origin.x, y: at.y + origin.y, width: item.box().width, height: item.box().height }
          for (;;) {
            const collisions = occupied.filter(
              (o) => box.x < o.x + o.width + GAP && box.x + box.width + GAP > o.x && box.y < o.y + o.height + GAP && box.y + box.height + GAP > o.y,
            )
            if (!collisions.length) break
            box.y = Math.max(...collisions.map((o) => o.y + o.height + GAP))
          }
          occupied.push(box)
          targets.set(item, { x: box.x, y: box.y })
        }
      for (const [item, to] of targets) {
        if (item.group) {
          const from = rect.get(item.id)!
          translate(item.id, to.x - from.x, to.y - from.y)
        } else pos.set(item.id, to)
      }
    }
    if (container !== undefined) {
      // Shrink-wrap the group around everything it holds, hidden cards included.
      const group = board.groups.find((x) => x.id === container)!
      const content = bounds([
        ...group.nodes.filter((n) => pos.has(n)).map((n) => ({ ...pos.get(n)!, ...(card.get(n)?.size ?? CARD_SIZE) })),
        ...childGroups(container).map((c) => rect.get(c)!),
      ])
      if (content)
        rect.set(container, {
          x: content.x - GROUP_PAD,
          y: content.y - GROUP_PAD - GROUP_HEADER,
          width: content.width + 2 * GROUP_PAD,
          height: content.height + 2 * GROUP_PAD + GROUP_HEADER,
        })
    }
  }
  await layout(undefined)

  const positions: Record<string, Position> = {}
  for (const [id, p] of pos) if (card.has(id) || groupOfCard.has(id)) positions[id] = p
  return { positions, groups: Object.fromEntries(rect) }
}
