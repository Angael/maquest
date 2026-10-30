import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Project, slugify, textMatches, writeAgentFiles } from './project'

const tmp = () => Project.init(fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-editing-')), { name: 'Editing' })

test('slugify transliterates letters without a decomposition', () => {
  assert.equal(slugify('Prawda dla DM: co naprawdę się stało'), 'prawda-dla-dm-co-naprawde-sie-stalo')
  assert.equal(slugify('Straße Ærø'), 'strasse-aero')
})

test('find matches any of several terms and reports where', () => {
  const p = tmp()
  const a = p.createNode({ type: 'note', title: 'A', body: 'one\nthe old fire\nthree' })
  p.createNode({ type: 'note', title: 'B', body: 'a hospital' })
  p.createNode({ type: 'note', title: 'C', body: 'nothing' })
  assert.deepEqual(
    p.listNodes({ text: ['FIRE', 'hospital'] }).map((n) => n.title),
    ['A', 'B'],
  )
  assert.deepEqual(textMatches(p.requireNode(a.id), ['fire']), [{ where: 'body line 2', text: 'the old fire' }])
})

test('body edits replace exactly one occurrence unless all is set', () => {
  const p = tmp()
  const a = p.createNode({ type: 'note', title: 'A', body: 'Wokol x, Wokol y' })
  assert.throws(() => p.updateNode(a.id, { edits: [{ find: 'Wokol', replace: 'Wokół' }] }), /2 times/)
  assert.throws(() => p.updateNode(a.id, { edits: [{ find: 'missing', replace: '' }] }), /not found/)
  assert.equal(p.updateNode(a.id, { edits: [{ find: 'Wokol', replace: 'Wokół', all: true }] }).body.trim(), 'Wokół x, Wokół y')
  assert.equal(p.updateNode(a.id, { edits: [{ find: 'x', replace: '$&$1' }] }).body.trim(), 'Wokół $&$1, Wokół y')
})

test('renaming a node moves its links, edges, children and board cards', () => {
  const p = tmp()
  const story = p.createNode({ type: 'story', title: 'Story' })
  const ch = p.createNode({ type: 'chapter', title: 'Ch', parent: story.id })
  const other = p.createNode({ type: 'note', title: 'Other', body: `See [[${story.id}]] and [[${story.id}|it]], not [[${story.id}-2]].` })
  const e = p.addEdge({ source: other.id, target: story.id })
  p.updateBoard('main', { addNodes: [story.id] })
  p.renameNode(story.id, 'saga')
  assert.equal(p.getNode(story.id), null)
  assert.equal(p.requireNode(ch.id).parent, 'saga')
  assert.equal(p.requireNode(other.id).body.trim(), 'See [[saga]] and [[saga|it]], not [[story-2]].')
  assert.equal(p.graph().edges.find((x) => x.id === e.id)?.target, 'saga')
  assert.ok(p.board('main').nodes?.includes('saga'))
  assert.ok(p.board('main').layout.saga)
})

test('deleting with replaceWith hands over links and edges; without it links are reported', () => {
  const p = tmp()
  const old = p.createNode({ type: 'character', title: 'Aldous' })
  const neu = p.createNode({ type: 'character', title: 'Osric' })
  const scene = p.createNode({ type: 'note', title: 'Scene', body: `[[${old.id}]] fights.` })
  p.addEdge({ source: scene.id, target: old.id })
  assert.deepEqual(
    p.linksTo(old.id).map((n) => n.id),
    [scene.id],
  )
  p.deleteNode(old.id, { replaceWith: neu.id })
  assert.equal(p.requireNode(scene.id).body.trim(), `[[${neu.id}]] fights.`)
  assert.deepEqual(
    p.edgesOf(neu.id).map((x) => x.source),
    [scene.id],
  )
})

test('agent files are only rewritten when they change and are git-ignored', () => {
  const p = tmp()
  const mcp = { command: 'node', args: ['mcp.js'] }
  writeAgentFiles(p.root, mcp)
  const file = path.join(p.root, '.mcp.json')
  fs.utimesSync(file, new Date(0), new Date(0))
  writeAgentFiles(p.root, mcp)
  assert.equal(fs.statSync(file).mtimeMs, 0)
  const ignore = fs.readFileSync(path.join(p.root, '.gitignore'), 'utf8').split('\n')
  assert.deepEqual(ignore.filter(Boolean), ['.mcp.json', '.cursor/', '.codex/', 'guidelines/usage.json'])
})
