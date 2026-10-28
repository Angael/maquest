import assert from 'node:assert/strict'
import test from 'node:test'
import { Board, type Rect } from '@maquest/core/schema'
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
