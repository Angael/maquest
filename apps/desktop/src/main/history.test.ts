import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Project } from '@maquest/core'
import { ProjectHistory } from './history'

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-history-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return { project: Project.init(root, { name: 'History' }), history: new ProjectHistory() }
}

test('undo and redo restore an entire multi-node position change', (t) => {
  const { project, history } = fixture(t)
  const a = project.createNode({ type: 'note', title: 'A' })
  const b = project.createNode({ type: 'note', title: 'B' })
  const before = { [a.id]: { x: 10, y: 20 }, [b.id]: { x: 30, y: 40 } }
  const after = { [a.id]: { x: -100, y: 200 }, [b.id]: { x: 300, y: -400 } }
  project.setLayout(before)
  history.record(project, () => project.setLayout(after))
  assert.deepEqual(history.undo(project), { canUndo: false, canRedo: true })
  assert.deepEqual(new Project(project.root).board().layout, before)
  assert.deepEqual(history.redo(project), { canUndo: true, canRedo: false })
  assert.deepEqual(new Project(project.root).board().layout, after)
})

test('deletion undo restores node bytes, detached children, incident handles and layout', (t) => {
  const { project, history } = fixture(t)
  const story = project.createNode({ type: 'story', title: 'Story', pinned: true, body: 'Original body\n' })
  const child = project.createNode({ type: 'chapter', title: 'Chapter', parent: story.id })
  const other = project.createNode({ type: 'note', title: 'Other' })
  const edge = project.addEdge({ source: story.id, target: other.id, sourceHandle: 'right', targetHandle: 'left' })
  project.setLayout({ [story.id]: { x: 15, y: 25 } })
  const graph = project.graph()
  const original = project.requireNode(story.id)
  const originalChild = project.requireNode(child.id)
  history.record(project, () => project.deleteNode(story.id))
  assert.equal(project.getNode(story.id), null)
  assert.equal(project.requireNode(child.id).parent, undefined)
  history.undo(project)
  const reloaded = new Project(project.root)
  assert.deepEqual(reloaded.requireNode(story.id), original)
  assert.deepEqual(reloaded.requireNode(child.id), originalChild)
  assert.deepEqual(reloaded.graph(), graph)
  assert.equal(reloaded.graph().edges[0].id, edge.id)
  history.redo(project)
  assert.equal(project.getNode(story.id), null)
  assert.equal(project.requireNode(child.id).parent, undefined)
  assert.deepEqual(project.graph(), { edges: [], boards: [{ id: 'main', title: 'Main', nodes: [], phases: [], layout: {}, groups: [] }] })
})

test('a new mutation after undo clears the redo branch', (t) => {
  const { project, history } = fixture(t)
  const node = project.createNode({ type: 'note', title: 'Original' })
  history.record(project, () => project.updateNode(node.id, { title: 'First' }))
  history.undo(project)
  history.record(project, () => project.updateNode(node.id, { title: 'Branch' }))
  assert.deepEqual(history.status(), { canUndo: true, canRedo: false })
  history.redo(project)
  assert.equal(project.requireNode(node.id).title, 'Branch')
})

test('conflicting MCP edits reject undo without changing files or history stacks', (t) => {
  const { project, history } = fixture(t)
  const node = project.createNode({ type: 'note', title: 'Original' })
  history.record(project, () => project.updateNode(node.id, { title: 'Desktop' }))
  const external = new Project(project.root)
  external.updateNode(node.id, { title: 'MCP', body: 'External work' })
  const before = external.requireNode(node.id)
  assert.throws(() => history.undo(project), /changed outside this history/)
  assert.deepEqual(project.requireNode(node.id), before)
  assert.deepEqual(history.status(), { canUndo: true, canRedo: false })
})

test('unrelated external nodes, edges and layout survive both undo and redo', (t) => {
  const { project, history } = fixture(t)
  const a = project.createNode({ type: 'note', title: 'A' })
  const b = project.createNode({ type: 'note', title: 'B' })
  history.record(project, () => project.setLayout({ [a.id]: { x: 100, y: 200 } }))
  const external = new Project(project.root)
  external.updateNode(b.id, { body: 'MCP body' })
  const c = external.createNode({ type: 'note', title: 'C', pinned: true })
  external.addEdge({ source: b.id, target: c.id, sourceHandle: 'bottom', targetHandle: 'top' })
  const edges = external.graph().edges
  external.setLayout({ [b.id]: { x: 300, y: 400 } })
  history.undo(project)
  assert.deepEqual(project.board().layout, { [b.id]: { x: 300, y: 400 } })
  assert.deepEqual(project.graph().edges, edges)
  assert.equal(project.requireNode(b.id).body, 'MCP body')
  assert.equal(project.requireNode(c.id).pinned, true)
  history.redo(project)
  assert.deepEqual(project.board().layout, { [a.id]: { x: 100, y: 200 }, [b.id]: { x: 300, y: 400 } })
  assert.deepEqual(project.graph().edges, edges)
  assert.equal(project.requireNode(b.id).body, 'MCP body')
})

test('redo rejects a conflicting external graph position edit', (t) => {
  const { project, history } = fixture(t)
  const node = project.createNode({ type: 'note', title: 'A' })
  history.record(project, () => project.setLayout({ [node.id]: { x: 10, y: 20 } }))
  history.undo(project)
  new Project(project.root).setLayout({ [node.id]: { x: 50, y: 60 } })
  assert.throws(() => history.redo(project), /changed outside this history/)
  assert.deepEqual(project.board().layout[node.id], { x: 50, y: 60 })
})

test('undoing creation rejects new external incident edges or children', (t) => {
  const { project, history } = fixture(t)
  const story = history.record(project, () => project.createNode({ type: 'story', title: 'Story' }))
  const external = new Project(project.root)
  const chapter = external.createNode({ type: 'chapter', title: 'Chapter', parent: story.id })
  assert.throws(() => history.undo(project), /missing parent/)
  assert.equal(project.requireNode(chapter.id).parent, story.id)
  external.updateNode(chapter.id, { parent: null })
  external.addEdge({ source: story.id, target: chapter.id })
  assert.throws(() => history.undo(project), /missing node/)
  assert.ok(project.getNode(story.id))
})

test('pin and explicit connection handles persist across reload and updates', (t) => {
  const { project, history } = fixture(t)
  const a = project.createNode({ type: 'note', title: 'A', pinned: true })
  const b = project.createNode({ type: 'note', title: 'B' })
  const edge = project.addEdge({ source: a.id, target: b.id, sourceHandle: 'right', targetHandle: 'left' })
  history.record(project, () => project.updateNode(a.id, { pinned: false }))
  assert.equal(new Project(project.root).requireNode(a.id).pinned, false)
  history.undo(project)
  assert.equal(new Project(project.root).requireNode(a.id).pinned, true)
  history.record(project, () => project.updateEdge(edge.id, { sourceHandle: 'bottom', targetHandle: 'top' }))
  assert.equal(new Project(project.root).graph().edges[0].sourceHandle, 'bottom')
  history.undo(project)
  assert.equal(new Project(project.root).graph().edges[0].sourceHandle, 'right')
  assert.equal(new Project(project.root).graph().edges[0].targetHandle, 'left')
})

test('history retains only the latest 100 mutations', (t) => {
  const { project, history } = fixture(t)
  const node = project.createNode({ type: 'note', title: 'A' })
  for (let i = 1; i <= 101; i++) {
    history.record(project, () => project.setLayout({ [node.id]: { x: i, y: 0 } }))
  }
  for (let i = 0; i < 100; i++) history.undo(project)
  assert.deepEqual(history.status(), { canUndo: false, canRedo: true })
  assert.deepEqual(project.board().layout[node.id], { x: 1, y: 0 })
})

test('undoing deletion detects an externally recreated id in another type folder', (t) => {
  const { project, history } = fixture(t)
  const original = project.createNode({ type: 'note', title: 'Shared' })
  history.record(project, () => project.deleteNode(original.id))
  const external = new Project(project.root).createNode({ type: 'character', title: 'Shared' })
  assert.equal(external.id, original.id)
  assert.throws(() => history.undo(project), /already used in another folder/)
  assert.equal(project.requireNode(original.id).type, 'character')
})

test('board creation, membership and per-board layout undo and redo together', (t) => {
  const { project, history } = fixture(t)
  const node = project.createNode({ type: 'note', title: 'Crypt' })
  history.record(project, () => project.createBoard({ title: 'Act I', phases: ['Arrival', 'Crypt'], nodes: [node.id] }))
  assert.deepEqual(project.board('act-i').nodes, [node.id])
  history.record(project, () => project.updateBoard('act-i', { addNodes: [node.id], phase: 'Crypt' }))
  assert.equal(project.board('act-i').layout[node.id].x, 560 + 40)
  history.undo(project)
  history.undo(project)
  assert.deepEqual(
    project.boards().map((b) => b.id),
    ['main'],
  )
  history.redo(project)
  assert.deepEqual(project.board('act-i').nodes, [node.id])
})

test('filling one template field keeps the other empty fields', (t) => {
  const { project, history } = fixture(t)
  const c = project.createNode({ type: 'character', title: 'Bob' })
  history.record(project, () => project.updateNode(c.id, { fields: { role: 'hero' } }))
  assert.deepEqual(new Project(project.root).requireNode(c.id).fields, { role: 'hero', want: '', need: '', flaw: '' })
  history.record(project, () => project.updateNode(c.id, { fields: { role: '', want: null } }))
  assert.deepEqual(new Project(project.root).requireNode(c.id).fields, { role: '', need: '', flaw: '' })
})
