import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Project, applyGroupTree, connectNodes, readBodyFile, writeNodes, type Outcome } from './index'

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-batch-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return Project.init(root, { name: 'Batch' })
}

const statuses = (outcomes: Outcome<unknown>[]) => outcomes.map((o) => o.status)
const errorOf = (o: Outcome<unknown>) => (o.status === 'failed' ? o.error : '')

test('a batch with an invalid item writes nothing and says which item failed', (t) => {
  const p = fixture(t)
  const log = p.createNode({ type: 'note', title: 'Log', body: 'start' })
  const r = writeNodes(p, [
    { id: log.id, appendBody: 'session 1' },
    { id: log.id, appendBody: 'session 2' },
    { id: 'sesja-2-plan', parent: 'nowhere', summary: 'x' },
    { type: 'character', title: 'Bronn' },
  ])
  assert.equal(r.rejected, true)
  assert.deepEqual(statuses(r.outcomes), ['not-run', 'not-run', 'failed', 'not-run'])
  assert.match(errorOf(r.outcomes[2]), /Node not found: sesja-2-plan/)
  assert.equal(p.requireNode(log.id).body.trim(), 'start', 'earlier appends must not land when the batch is rejected')
  assert.equal(p.getNode('bronn'), null)
})

test('items are validated against the nodes, parents and renames planned earlier in the batch', (t) => {
  const p = fixture(t)
  const r = writeNodes(p, [
    { create: true, id: 'saga', type: 'story', title: 'Saga' },
    { type: 'chapter', title: 'One', parent: 'saga' },
    { id: 'saga', newId: 'epic' },
    { type: 'chapter', title: 'Two', parent: 'epic' },
  ])
  assert.equal(r.rejected, false)
  assert.deepEqual(statuses(r.outcomes), ['applied', 'applied', 'applied', 'applied'])
  assert.equal(p.requireNode('one').parent, 'epic')
  assert.equal(p.requireNode('two').parent, 'epic')
})

test('a dependent item names the earlier item whose problem it inherits', (t) => {
  const p = fixture(t)
  const r = writeNodes(p, [
    { create: true, id: 'saga', type: 'story' },
    { type: 'chapter', title: 'One', parent: 'saga' },
  ])
  assert.deepEqual(statuses(r.outcomes), ['failed', 'failed'])
  assert.match(errorOf(r.outcomes[1]), /item 1 would create it/)
})

test('hierarchy problems name the offending node and parent', (t) => {
  const p = fixture(t)
  const story = p.createNode({ type: 'story', title: 'Story' })
  const ch = p.createNode({ type: 'chapter', title: 'Ch', parent: story.id })
  const n = p.createNode({ type: 'note', title: 'Clue', parent: ch.id })
  const r = writeNodes(p, [{ id: n.id, type: 'character' }])
  assert.match(errorOf(r.outcomes[0]), new RegExp(`^${n.id}: a character cannot be placed under ${ch.id} \\(a chapter\\)`))
})

test('a runtime failure keeps earlier items, reports them applied and the rest not run', (t) => {
  const p = fixture(t)
  const a = p.createNode({ type: 'note', title: 'A', body: 'a' })
  const b = p.createNode({ type: 'note', title: 'B', body: 'b' })
  const c = p.createNode({ type: 'note', title: 'C', body: 'c' })
  // Simulate the author deleting B in the app after validation but before the item runs.
  const update = p.updateNode.bind(p)
  p.updateNode = (id, patch) => {
    if (id === a.id) fs.rmSync(path.join(p.root, b.path))
    return update(id, patch)
  }
  const r = writeNodes(p, [
    { id: a.id, appendBody: 'more' },
    { id: b.id, appendBody: 'more' },
    { id: c.id, appendBody: 'more' },
  ])
  assert.equal(r.rejected, false)
  assert.deepEqual(statuses(r.outcomes), ['applied', 'failed', 'not-run'])
  assert.match(p.requireNode(a.id).body, /more/)
  assert.doesNotMatch(p.requireNode(c.id).body, /more/)
})

test('explicit create ids: created as given, conflicts and non-slugs refused, never turned into updates', (t) => {
  const p = fixture(t)
  const r = writeNodes(p, [{ create: true, id: 'wdowa-morrow', type: 'character', title: 'Widow Morrow' }])
  assert.deepEqual(statuses(r.outcomes), ['applied'])
  assert.equal(p.requireNode('wdowa-morrow').title, 'Widow Morrow')

  const again = writeNodes(p, [{ create: true, id: 'wdowa-morrow', type: 'character', title: 'Other' }])
  assert.match(errorOf(again.outcomes[0]), /Node already exists: wdowa-morrow/)
  assert.equal(p.requireNode('wdowa-morrow').title, 'Widow Morrow')

  assert.match(errorOf(writeNodes(p, [{ create: true, id: 'Bad Id', type: 'note', title: 'X' }]).outcomes[0]), /use "bad-id"/)

  // Without create, an unknown id is an error with suggestions, never a new node.
  const typo = writeNodes(p, [{ id: 'wdowa-morow', type: 'character', title: 'Widow Morrow', summary: 'x' }])
  assert.match(errorOf(typo.outcomes[0]), /Did you mean: wdowa-morrow\?.*add create: true/)
  assert.equal(p.getNode('wdowa-morow'), null)

  assert.match(errorOf(writeNodes(p, [{ newId: 'x', type: 'note', title: 'X' }]).outcomes[0]), /pass id with create: true/)
})

test('a guideline id used as a node points to the guidelines tool', (t) => {
  const p = fixture(t)
  const r = writeNodes(p, [{ id: 'style', appendBody: 'Short sentences.' }])
  assert.match(errorOf(r.outcomes[0]), /"style" is a writing guideline, not a node/)
})

test('stale edits are caught in validation with the current text around the closest match', (t) => {
  const p = fixture(t)
  const n = p.createNode({ type: 'note', title: 'N', body: 'line one\nThe old fire burns low tonight.\nline three' })
  const r = writeNodes(p, [
    { id: n.id, appendBody: 'kept?' },
    { id: n.id, edits: [{ find: 'The old fire burns high tonight.', replace: 'x' }] },
  ])
  assert.equal(r.rejected, true)
  const err = errorOf(r.outcomes[1])
  assert.match(err, /edit 1: text to replace not found/)
  assert.match(err, /body line 2/)
  assert.match(err, /2\| The old fire burns low tonight\./)
  assert.doesNotMatch(p.requireNode(n.id).body, /kept/)
})

test('edits see the body as earlier items of the batch leave it', (t) => {
  const p = fixture(t)
  const n = p.createNode({ type: 'note', title: 'N', body: 'alpha' })
  const r = writeNodes(p, [
    { id: n.id, appendBody: 'beta' },
    { id: n.id, edits: [{ find: 'beta', replace: 'gamma' }] },
  ])
  assert.deepEqual(statuses(r.outcomes), ['applied', 'applied'])
  assert.equal(p.requireNode(n.id).body.trim(), 'alpha\n\ngamma')
})

test('bodyFile replaces the body from a local file, relative to the project root, and validates it', (t) => {
  const p = fixture(t)
  const long = `# Long\n\n${'Prose with "quotes" and \\ backslashes. '.repeat(400)}\n`
  fs.writeFileSync(path.join(p.root, 'draft.md'), long)
  const abs = path.join(os.tmpdir(), `maquest-body-${process.pid}.md`)
  fs.writeFileSync(abs, 'From an absolute path.')
  t.after(() => fs.rmSync(abs, { force: true }))
  const r = writeNodes(p, [
    { type: 'scene', title: 'Scene', bodyFile: 'draft.md' },
    { type: 'note', title: 'Abs', bodyFile: abs, appendBody: '\nMore.' },
  ])
  assert.deepEqual(statuses(r.outcomes), ['applied', 'applied'])
  assert.equal(p.requireNode('scene').body, long)
  assert.equal(p.requireNode('abs').body, 'From an absolute path.\nMore.')
  assert.ok(fs.existsSync(path.join(p.root, 'draft.md')), 'the source file is left alone')

  fs.writeFileSync(path.join(p.root, 'front.md'), '---\ntitle: x\n---\nbody')
  assert.throws(() => readBodyFile(p.root, 'front.md'), /frontmatter/)
  assert.throws(() => readBodyFile(p.root, 'missing.md'), /relative paths resolve against the project root/)
  fs.writeFileSync(path.join(p.root, 'bin.md'), Buffer.from([0xff, 0xfe, 0x00]))
  assert.throws(() => readBodyFile(p.root, 'bin.md'), /UTF-8/)
  const both = writeNodes(p, [{ type: 'note', title: 'Both', body: 'x', bodyFile: 'draft.md' }])
  assert.match(errorOf(both.outcomes[0]), /body or bodyFile, not both/)
})

test('connection batches are validated before any edge changes', (t) => {
  const p = fixture(t)
  const a = p.createNode({ type: 'character', title: 'Ashe' })
  const b = p.createNode({ type: 'character', title: 'Theron' })
  const r = connectNodes(p, [
    { action: 'add', source: a.id, target: b.id, type: 'link' },
    { action: 'add', source: a.id, target: 'therno' },
  ])
  assert.equal(r.rejected, true)
  assert.match(errorOf(r.outcomes[1]), /Did you mean: theron/)
  assert.equal(p.graph().edges.length, 0)

  const ok = connectNodes(p, [{ action: 'add', source: a.id, target: b.id, label: 'rivals' }])
  const edge = ok.outcomes[0].status === 'applied' ? ok.outcomes[0].result.edge : undefined
  assert.ok(edge)
  const twice = connectNodes(p, [
    { action: 'remove', id: edge.id },
    { action: 'remove', id: edge.id },
  ])
  assert.deepEqual(statuses(twice.outcomes), ['not-run', 'failed'])
  assert.equal(p.graph().edges.length, 1)
})

test('a group tree builds nested groups in one call, extends existing ones and lays out', async (t) => {
  const p = fixture(t)
  const [hall, cellar, gate, market] = ['Hall', 'Cellar', 'Gate', 'Market'].map((title) => p.createNode({ type: 'location', title }))
  const r = await applyGroupTree(p, 'main', [
    { title: 'Tavern', nodes: [hall.id, cellar.id], parent: 'City' },
    { title: 'City', nodes: [gate.id], color: 'amber' },
  ])
  assert.deepEqual(statuses(r.outcomes), ['applied', 'applied'])
  assert.equal(r.arranged, true)
  const b = p.board('main')
  const city = b.groups.find((g) => g.title === 'City')!
  const tavern = b.groups.find((g) => g.title === 'Tavern')!
  assert.equal(tavern.parent, city.id)
  assert.deepEqual(tavern.nodes.toSorted(), [cellar.id, hall.id].toSorted())
  assert.ok(tavern.x >= city.x && tavern.x + tavern.width <= city.x + city.width, 'nested group sits inside its parent')

  const more = await applyGroupTree(p, 'main', [{ title: 'Tavern', nodes: [market.id] }])
  assert.equal(more.outcomes[0].status === 'applied' && more.outcomes[0].result.action, 'updated')
  const after = p.board('main')
  assert.equal(after.groups.length, 2)
  assert.equal(after.groups.find((g) => g.title === 'Tavern')!.parent, city.id, 'an existing group keeps its parent when none is given')

  const bad = await applyGroupTree(p, 'main', [
    { title: 'Docks', nodes: ['nowhere'] },
    { title: 'Loop A', parent: 'Loop B' },
    { title: 'Loop B', parent: 'Loop A' },
  ])
  assert.equal(bad.rejected, true)
  assert.equal(bad.arranged, false)
  assert.match(errorOf(bad.outcomes[0]), /Node not found: nowhere/)
  assert.match(errorOf(bad.outcomes[1]), /nested inside itself/)
  assert.equal(p.board('main').groups.length, 2, 'a rejected tree changes nothing')
})
