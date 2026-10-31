import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Project } from './project'

const tmp = () => Project.init(fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-types-')), { name: 'Types' })

test('custom types get a folder, starter template and are listed', () => {
  const p = tmp()
  p.setTypes({ monster: { label: 'Monster', icon: 'skull', color: '#dc2626', fields: ['threat'], body: '## Tactics\n' } })
  const t = p.type('monster')
  assert.equal(t.dir, 'monsters')
  assert.equal(t.plural, 'Monsters')
  assert.equal(t.entity, true)
  const n = p.createNode({ type: 'monster', title: 'Ash Wraith' })
  assert.equal(n.path, path.join('monsters', 'ash-wraith.md'))
  assert.deepEqual(n.fields, { threat: '' })
  assert.equal(n.body, '## Tactics\n')
  assert.deepEqual(
    p.listNodes({ type: 'monster' }).map((x) => x.id),
    ['ash-wraith'],
  )
  assert.equal(p.getNode('ash-wraith')?.type, 'monster')
})

test('notes convert to a custom type and back', () => {
  const p = tmp()
  p.setTypes({ monster: {} })
  const n = p.createNode({ type: 'note', title: 'Ghoul' })
  assert.equal(p.updateNode(n.id, { type: 'monster' }).path, path.join('monsters', 'ghoul.md'))
  assert.equal(fs.existsSync(path.join(p.root, 'notes', 'ghoul.md')), false)
  assert.throws(() => p.setTypes({ monster: null }), /still has 1 node/)
  p.updateNode(n.id, { type: 'note' })
  p.setTypes({ monster: null })
  assert.equal(
    p.types().some((t) => t.id === 'monster'),
    false,
  )
})

test('built-in types can be restyled and reset, not moved', () => {
  const p = tmp()
  p.setTypes({ character: { label: 'Hero', color: '#000000', icon: 'sword' } })
  assert.deepEqual((({ label, color, icon, dir }) => ({ label, color, icon, dir }))(p.type('character')), {
    label: 'Hero',
    color: '#000000',
    icon: 'sword',
    dir: 'characters',
  })
  p.setTypes({ character: { label: null } })
  assert.equal(p.type('character').label, 'Character')
  assert.throws(() => p.setTypes({ character: { dir: 'heroes' } }), /only label/)
  p.setTypes({ character: null })
  assert.equal(p.config().types, undefined)
})

test('unknown types and clashing folders are rejected', () => {
  const p = tmp()
  assert.throws(() => p.createNode({ type: 'dragon', title: 'X' }), /Unknown node type/)
  assert.throws(() => p.setTypes({ hero: { dir: 'characters' } }), /reserved/)
  assert.throws(() => p.setTypes({ Bad: {} }), /slug/)
})
