import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { CARD_SIZE, GROUP_HEADER, GROUP_PAD, Project, overlapWarnings, sparseGroups } from './index'

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-groups-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return Project.init(root, { name: 'Groups' })
}

const inside = (r: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }, size = { width: 224, height: 160 }) =>
  p.x >= r.x && p.y >= r.y && p.x + size.width <= r.x + r.width && p.y + size.height <= r.y + r.height

test('a group created around cards wraps them tightly', (t) => {
  const p = fixture(t)
  const a = p.createNode({ type: 'location', title: 'Hall' })
  const b = p.createNode({ type: 'location', title: 'Cellar' })
  p.setLayout({ [a.id]: { x: 0, y: 0 }, [b.id]: { x: 400, y: 100 } })
  const g = p.createGroup('main', { title: 'Tavern', nodes: [a.id, b.id] })
  assert.deepEqual(
    { x: g.x, y: g.y, width: g.width, height: g.height },
    {
      x: -GROUP_PAD,
      y: -GROUP_PAD - GROUP_HEADER,
      width: 400 + CARD_SIZE.width + 2 * GROUP_PAD,
      height: 100 + CARD_SIZE.height + 2 * GROUP_PAD + GROUP_HEADER,
    },
  )
})

test('groups grow to keep moved cards and nested groups inside', (t) => {
  const p = fixture(t)
  const a = p.createNode({ type: 'location', title: 'Room' })
  p.setLayout({ [a.id]: { x: 0, y: 0 } })
  const city = p.createGroup('main', { title: 'City' })
  const tavern = p.createGroup('main', { title: 'Tavern', parent: city.id, nodes: [a.id] })
  p.setLayout({ [a.id]: { x: 2000, y: 900 } })
  const board = p.board()
  const [outer, inner] = [city.id, tavern.id].map((id) => board.groups.find((g) => g.id === id)!)
  assert.ok(inside(inner, board.layout[a.id]))
  assert.ok(inside(outer, { x: inner.x, y: inner.y }, inner))
})

test('cards added to a group move inside it; ungrouping keeps cards and lifts subgroups', (t) => {
  const p = fixture(t)
  const a = p.createNode({ type: 'character', title: 'Guard' })
  p.setLayout({ [a.id]: { x: -3000, y: -3000 } })
  const city = p.createGroup('main', { title: 'City', rect: { x: 0, y: 0, width: 600, height: 400 } })
  const gate = p.createGroup('main', { title: 'Gate', parent: city.id, rect: { x: 20, y: 60, width: 300, height: 200 } })
  p.updateGroup('main', 'Gate', { addNodes: [a.id] })
  let board = p.board()
  assert.ok(
    inside(
      board.groups.find((g) => g.id === gate.id)!,
      board.layout[a.id],
    ),
  )
  p.deleteGroup('main', city.id)
  board = p.board()
  assert.deepEqual(
    board.groups.map((g) => [g.id, g.parent, g.nodes]),
    [[gate.id, undefined, [a.id]]],
  )
  assert.throws(() => p.setLayout({}, 'main', { nest: { [gate.id]: gate.id } }), /inside itself/)
})

test('deleting a node removes it from groups', (t) => {
  const p = fixture(t)
  const a = p.createNode({ type: 'item', title: 'Key' })
  p.setLayout({ [a.id]: { x: 0, y: 0 } })
  p.createGroup('main', { title: 'Vault', nodes: [a.id] })
  p.deleteNode(a.id)
  assert.deepEqual(p.board().groups[0].nodes, [])
})

const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const card = (p: { x: number; y: number }) => ({ ...p, ...CARD_SIZE })

test('piecemeal agent edits keep groups tight, gridded and apart', (t) => {
  // Replays an agent session: groups built one call at a time, cards moved between them, a group nested late.
  const p = fixture(t)
  const ids = Array.from({ length: 14 }, (_, i) => p.createNode({ type: 'location', title: `Place ${i}` }).id)
  p.setLayout(Object.fromEntries(ids.map((id, i) => [id, { x: (i % 4) * 300, y: Math.floor(i / 4) * 220 }])))
  const town = p.createGroup('main', { title: 'Town', nodes: ids.slice(0, 2) })
  const manor = p.createGroup('main', { title: 'Manor', nodes: [ids[1], ids[2], ids[9]] })
  const market = p.createGroup('main', { title: 'Market', nodes: [ids[3], ids[8]] })
  const temple = p.createGroup('main', { title: 'Temple', nodes: [ids[10], ids[11]] })
  for (const id of ids.slice(4, 8)) p.updateGroup('main', town.id, { addNodes: [id] })
  p.updateGroup('main', town.id, { removeNodes: [ids[4]] })
  p.updateGroup('main', temple.id, { addNodes: [ids[4]], parent: town.id })
  p.updateGroup('main', market.id, { parent: town.id })

  const b = p.board()
  const g = (id: string) => b.groups.find((x) => x.id === id)!
  // Every card sits inside its group; groups at the same level never overlap.
  for (const group of b.groups) for (const n of group.nodes) assert.ok(inside(group, b.layout[n], CARD_SIZE), `${n} in ${group.title}`)
  for (const level of [undefined, town.id]) {
    const siblings = b.groups.filter((x) => x.parent === level)
    for (const [i, a] of siblings.entries()) for (const c of siblings.slice(i + 1)) assert.ok(!overlap(a, c), `${a.title} vs ${c.title}`)
  }
  assert.ok(!overlap(g(town.id), g(manor.id)))
  for (const n of b.nodes ?? [])
    if (!b.groups.some((x) => x.nodes.includes(n))) for (const x of b.groups) assert.ok(!overlap(x, card(b.layout[n])), `${x.title} covers ${n}`)
  // Cards are packed into a grid, so no group is left as a mostly empty frame.
  assert.deepEqual(sparseGroups(b), [])
  assert.deepEqual(overlapWarnings(b), [])
})

test('nesting moves the group into its parent instead of stretching the parent', (t) => {
  const p = fixture(t)
  const [a, c] = ['Gate', 'Crypt'].map((title) => p.createNode({ type: 'location', title }).id)
  p.setLayout({ [a]: { x: 0, y: 0 }, [c]: { x: 0, y: 3000 } })
  const city = p.createGroup('main', { title: 'City', nodes: [a] })
  const crypt = p.createGroup('main', { title: 'Crypt', nodes: [c] })
  p.updateGroup('main', crypt.id, { parent: city.id })
  const b = p.board()
  const outer = b.groups.find((g) => g.id === city.id)!
  assert.ok(outer.height < 2 * CARD_SIZE.height + 4 * GROUP_PAD + 2 * GROUP_HEADER + 120, `city height ${outer.height}`)
  assert.ok(inside(outer, b.layout[c], CARD_SIZE))
})

test('arrangeBoard tidies a messy board', async (t) => {
  const p = fixture(t)
  const ids = Array.from({ length: 6 }, (_, i) => p.createNode({ type: 'location', title: `Spot ${i}` }).id)
  p.setLayout(Object.fromEntries(ids.map((id, i) => [id, { x: 0, y: i * 900 }])))
  p.createGroup('main', { title: 'A', nodes: ids.slice(0, 3), rect: { x: -100, y: -100, width: 5000, height: 5000 } })
  p.createGroup('main', { title: 'B', nodes: ids.slice(3), rect: { x: -50, y: -50, width: 4000, height: 6000 } })
  await p.arrangeBoard('main')
  const [ga, gb] = p.board().groups
  assert.ok(!overlap(ga, gb))
  assert.ok(ga.width * ga.height < (5000 * 5000) / 4)
})
