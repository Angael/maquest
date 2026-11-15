import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { LiveNotesChangedError, Project, bodyHeadings, clipLines, packByBudget, sliceBody, suggestIds } from './index'

const body = ['# Spells', 'intro', '## Fireball', 'boom', '```', '# not a heading', '```', '## Shield', 'block', '# Gear', 'rope'].join('\n')

test('headings skip fenced code and carry line numbers', () => {
  assert.deepEqual(
    bodyHeadings(body).map((h) => [h.line, h.level, h.title]),
    [
      [1, 1, 'Spells'],
      [3, 2, 'Fireball'],
      [8, 2, 'Shield'],
      [10, 1, 'Gear'],
    ],
  )
})

test('a section runs to the next heading of the same or a higher level', () => {
  assert.deepEqual(sliceBody(body, { section: 'spells' }), { text: body.split('\n').slice(0, 9).join('\n'), from: 1, to: 9, total: 11 })
  assert.equal(sliceBody(body, { section: '## Fireball' }).text, '## Fireball\nboom\n```\n# not a heading\n```')
  assert.equal(sliceBody(body, { from: 10, to: 11 }).text, '# Gear\nrope')
  assert.throws(() => sliceBody(body, { section: 'Armor' }), /Section not found: Armor\. Headings: line 1: # Spells/)
  assert.throws(() => sliceBody(body, { from: 40 }), /past the end/)
})

test('budgets keep whole parts and whole lines', () => {
  const parts = [{ text: 'a'.repeat(50) }, { text: 'b'.repeat(80) }, { text: 'c'.repeat(30) }]
  const { included, omitted } = packByBudget(parts, 100, 5)
  assert.deepEqual(
    included.map((x) => x.text[0]),
    ['a', 'c'],
  )
  assert.deepEqual(
    omitted.map((x) => x.text[0]),
    ['b'],
  )
  assert.deepEqual(clipLines('one\ntwo\nthree', 8), { text: 'one\ntwo', lines: 2, clipped: true })
  assert.equal(clipLines('x'.repeat(50), 10).lines, 1, 'always keeps at least one line')
})

test('id suggestions find typos, partial ids and shared words', () => {
  const nodes = [
    { id: 'ashe-vale', title: 'Ashe Vale' },
    { id: 'theron', title: 'Theron' },
    { id: 'obrzed-krwi', title: 'Obrzęd krwi' },
    { id: 'npc-lowcy-nagrod', title: 'Łowcy nagród' },
  ]
  assert.deepEqual(suggestIds('therno', nodes), ['theron'])
  assert.deepEqual(suggestIds('obrzed', nodes), ['obrzed-krwi'])
  assert.deepEqual(suggestIds('npc-lowcy-nagrod-kael-i-rook', nodes), ['npc-lowcy-nagrod'])
  assert.deepEqual(suggestIds('zzz', nodes), [])
})

test('requireNode errors suggest ids; config updates keep the name', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-reading-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const p = Project.init(root, { name: 'Named' })
  p.createNode({ type: 'character', title: 'Theron' })
  assert.throws(() => p.requireNode('therno'), /Node not found: therno\. Did you mean: theron\?/)
  assert.equal(p.updateConfig({ name: undefined, kind: 'rpg' }).name, 'Named')
  assert.equal(p.config().kind, 'rpg')
})

test('live notes are cleared only when they still read what the caller saw', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-notes-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const p = Project.init(root, { name: 'Notes' })
  p.setLiveNotes('- goblin died\n')
  p.setLiveNotes('- goblin died\n- new: the mayor lied\n')
  assert.throws(
    () => p.clearLiveNotes('- goblin died'),
    (e: unknown) => e instanceof LiveNotesChangedError && e.current.includes('mayor'),
  )
  assert.match(p.liveNotes(), /mayor/, 'unseen notes survive')
  p.clearLiveNotes('- goblin died\n- new: the mayor lied')
  assert.equal(p.liveNotes(), '')
  p.clearLiveNotes('stale') // nothing left to clear is not an error
})
