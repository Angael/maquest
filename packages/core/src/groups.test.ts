import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { GROUP_HEADER, GROUP_PAD, Project } from './index'

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
    { x: -GROUP_PAD, y: -GROUP_PAD - GROUP_HEADER, width: 624 + 2 * GROUP_PAD, height: 260 + 2 * GROUP_PAD + GROUP_HEADER },
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
