import assert from 'node:assert/strict'
import test from 'node:test'
import { Board, type Rect } from './schema'
import { LAYOUT_MODES, arrange, type LayoutCard } from './layout'

const size = { width: 200, height: 100 }
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

function scene() {
  const board = Board.parse({
    id: 'main',
    title: 'Main',
    layout: { a: { x: 0, y: 0 }, b: { x: 900, y: 900 }, c: { x: -500, y: 300 }, d: { x: 50, y: 50 }, e: { x: 70, y: 70 } },
    groups: [
      { id: 'city', title: 'City', nodes: ['c'], x: -600, y: -600, width: 2000, height: 2000 },
      { id: 'inn', title: 'Inn', parent: 'city', nodes: ['a', 'b'], x: -50, y: -100, width: 1200, height: 1200 },
    ],
  })
  const cards: LayoutCard[] = Object.entries(board.layout).map(([id, position]) => ({ id, position, size }))
  return { board, cards }
}

for (const mode of LAYOUT_MODES.map((m) => m.mode))
  test(`${mode}: groups contain their cards and subgroups and never overlap loose cards`, async () => {
    const { board, cards } = scene()
    const { positions, groups } = await arrange(
      board,
      cards,
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'd' },
        { source: 'c', target: 'e' },
      ],
      { mode },
    )
    const box = (id: string) => ({ ...positions[id], ...size })
    assert.ok(contains(groups.inn, box('a')) && contains(groups.inn, box('b')))
    assert.ok(contains(groups.city, groups.inn) && contains(groups.city, box('c')))
    for (const loose of ['d', 'e']) assert.ok(!overlaps(groups.city, box(loose)), loose)
    assert.ok(!overlaps(box('a'), box('b')))
    // Groups shrink-wrap their content.
    assert.ok(groups.inn.width < 1200)
  })

for (const mode of LAYOUT_MODES.map((m) => m.mode))
  test(`${mode}: pinned cards keep their place, and so does their group`, async () => {
    const { board, cards } = scene()
    cards.find((c) => c.id === 'a')!.pinned = true
    const { positions } = await arrange(board, cards, [{ source: 'a', target: 'b' }], { mode })
    assert.deepEqual(positions.a, { x: 0, y: 0 })
    assert.ok(!overlaps({ ...positions.a, ...size }, { ...positions.b, ...size }))
  })

test('smart and grid layouts of unlinked cards follow the screen shape instead of one tall column', async () => {
  const ids = Array.from({ length: 24 }, (_, i) => `n${i}`)
  const board = Board.parse({ id: 'main', title: 'Main', layout: Object.fromEntries(ids.map((id, i) => [id, { x: 0, y: i * 140 }])) })
  const cards: LayoutCard[] = ids.map((id) => ({ id, position: board.layout[id], size }))
  for (const mode of ['smart', 'grid'] as const) {
    const { positions } = await arrange(board, cards, [], { mode, aspectRatio: 21 / 9 })
    const xs = ids.map((id) => positions[id].x)
    const ys = ids.map((id) => positions[id].y)
    const ratio = (Math.max(...xs) - Math.min(...xs) + size.width) / (Math.max(...ys) - Math.min(...ys) + size.height)
    assert.ok(ratio > 1.2, `${mode} ratio ${ratio}`)
    for (const [i, a] of ids.entries())
      for (const b of ids.slice(i + 1)) assert.ok(!overlaps({ ...positions[a], ...size }, { ...positions[b], ...size }), `${a} ${b}`)
  }
})

const readingOrder = (positions: Record<string, { x: number; y: number }>, ids: string[]) =>
  ids.toSorted((a, b) => positions[a].y - positions[b].y || positions[a].x - positions[b].x)

for (const mode of LAYOUT_MODES.map((m) => m.mode))
  test(`${mode}: cards keep their phase column and their top-to-bottom order within it`, async () => {
    const ids = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5']
    const board = Board.parse({
      id: 'main',
      title: 'Main',
      phases: [
        { id: 'p1', title: 'One' },
        { id: 'p2', title: 'Two' },
      ],
      layout: Object.fromEntries(ids.map((id, i) => [id, { x: 40, y: i * 300 }])),
    })
    const cards: LayoutCard[] = ids.map((id) => ({ id, position: board.layout[id], size }))
    // Links that a flow layout would like to reorder.
    const edges = [
      { source: 'm5', target: 'm0' },
      { source: 'm4', target: 'm1' },
    ]
    const { positions } = await arrange(board, cards, edges, { mode })
    for (const id of ids) assert.ok(positions[id].x < 600, `${id} left its column`)
    assert.deepEqual(readingOrder(positions, ids), ids)
  })

for (const mode of ['smart', 'grid'] as const)
  test(`${mode}: packed groups keep their reading order`, async () => {
    // Mixed sizes in one row: compaction used to tuck small groups under bigger ones, out of sequence.
    const sizes = [
      [300, 400],
      [500, 120],
      [240, 300],
      [400, 120],
      [240, 500],
      [600, 200],
      [240, 120],
      [300, 260],
      [450, 330],
    ]
    const groupIds = sizes.map((_, i) => `g${i}`)
    const layout: Record<string, { x: number; y: number }> = {}
    const cards: LayoutCard[] = []
    const groups = sizes.map(([width, height], i) => {
      layout[`c${i}`] = { x: i * 700 + 10, y: 50 }
      cards.push({ id: `c${i}`, position: layout[`c${i}`], size: { width: width - 30, height: height - 80 } })
      return { id: `g${i}`, title: `G${i}`, nodes: [`c${i}`], x: i * 700, y: 0, width, height }
    })
    const board = Board.parse({ id: 'main', title: 'Main', layout, groups })
    const { groups: rects } = await arrange(board, cards, [], { mode })
    assert.deepEqual(readingOrder(rects, groupIds), groupIds)
    for (const [i, a] of groupIds.entries()) for (const b of groupIds.slice(i + 1)) assert.ok(!overlaps(rects[a], rects[b]), `${a} ${b}`)
  })
