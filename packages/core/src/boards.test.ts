import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Project } from './project'
import { freeRefKey, onBoard, refsOf } from './schema'

const tmp = () => Project.init(fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-boards-')), { name: 'Boards' })

test('legacy boards without a node list keep showing every node', () => {
  const p = tmp()
  const a = p.createNode({ type: 'note', title: 'A' })
  fs.writeFileSync(path.join(p.root, 'graph.json'), JSON.stringify({ edges: [], layout: { [a.id]: { x: 1, y: 2 } } }))
  assert.deepEqual(p.board().nodes, [a.id])
})

test('removing a node from a board keeps it elsewhere, and any board can go while one remains', () => {
  const p = tmp()
  const a = p.createNode({ type: 'note', title: 'A' })
  p.setLayout({ [a.id]: { x: 0, y: 0 } })
  const arc = p.createBoard({ title: 'Arc', nodes: [a.id] })
  p.updateBoard(arc.id, { removeNodes: [a.id] })
  assert.ok(p.getNode(a.id))
  assert.deepEqual(p.board('main').nodes, [a.id])
  p.deleteBoard('main')
  assert.equal(p.board().id, arc.id)
  assert.throws(() => p.deleteBoard(arc.id))
})

test('a board can show one node on several cards; deleting the node removes them all', () => {
  const p = tmp()
  const a = p.createNode({ type: 'note', title: 'A' })
  p.setLayout({ [a.id]: { x: 0, y: 0 } })
  const key = freeRefKey(p.board(), a.id)
  assert.equal(key, `${a.id}~2`)
  p.setLayout({ [key]: { x: 40, y: 40 } })
  assert.deepEqual(refsOf(p.board(), a.id), [a.id, key])
  p.updateBoard(p.board().id, { removeNodes: [a.id] })
  assert.ok(onBoard(p.board(), a.id))
  p.deleteNode(a.id)
  assert.deepEqual(p.board().nodes, [])
  assert.deepEqual(p.board().layout, {})
})
