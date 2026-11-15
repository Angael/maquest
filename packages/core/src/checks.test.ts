import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Project } from './project'
import { detectedLine } from './checks'

const tmp = () => Project.init(fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-checks-')), { name: 'Checks' })
const rules = (p: Project, node?: string) =>
  p
    .check()
    .issues.filter((i) => !node || i.node === node)
    .map((i) => i.rule)

test('a fresh project with placed nodes is clean', () => {
  const p = tmp()
  const n = p.createNode({ type: 'location', title: 'Hall' })
  p.updateBoard('main', { addNodes: [n.id] })
  assert.deepEqual(p.check().issues, [])
  assert.equal(detectedLine(p.check().counts), '')
})

test('integrity: broken links, connections and cards, with fixes', async () => {
  const p = tmp()
  const hall = p.createNode({ type: 'location', title: 'Hall', body: 'See [[cellr]] and [[gone|the gone room]].' })
  const cellar = p.createNode({ type: 'location', title: 'Cellar' })
  p.updateBoard('main', { addNodes: [hall.id, cellar.id] })
  const edge = p.addEdge({ source: hall.id, target: cellar.id })
  // Delete the cellar's file by hand, as an editor or git might.
  fs.rmSync(path.join(p.root, cellar.path))
  const report = p.check()
  const links = report.issues.filter((i) => i.rule === 'broken-link')
  assert.deepEqual(
    links.map((i) => i.message),
    ['links to [[cellr]], which does not exist', 'links to [[gone]], which does not exist'],
  )
  assert.ok(report.issues.some((i) => i.rule === 'broken-connection' && i.edge === edge.id))
  assert.ok(report.issues.some((i) => i.rule === 'broken-card'))
  assert.equal(report.counts.error, 4)

  for (const i of report.issues) for (const fix of i.fixes ?? []) await p.applyFix(fix)
  assert.equal(p.getNode(hall.id)?.body, 'See cellr and the gone room.')
  assert.deepEqual(rules(p), [])
})

test('canvas: nodes on no board and empty groups; backlog ideas are exempt', async () => {
  const p = tmp()
  const loose = p.createNode({ type: 'character', title: 'Loose' })
  p.createNode({ type: 'idea', title: 'Someday' })
  const g = p.createGroup('main', { title: 'Town' })
  const report = p.check()
  assert.deepEqual(
    report.issues.map((i) => [i.rule, i.node ?? i.group]),
    [
      ['empty-group', g.id],
      ['not-on-canvas', loose.id],
    ],
  )
  for (const i of report.issues) for (const fix of i.fixes ?? []) await p.applyFix(fix)
  assert.deepEqual(rules(p), [])
  assert.equal(p.board('main').groups.length, 0)
})

test('rules are configurable and nodes can opt out', () => {
  const p = tmp()
  const n = p.createNode({ type: 'note', title: 'Long', body: 'word '.repeat(30) })
  p.updateBoard('main', { addNodes: [n.id] })
  assert.deepEqual(rules(p), [])
  p.setChecks({ 'long-body': ['error', { maxWords: 10 }], 'missing-summary': 'info' })
  assert.deepEqual(
    p.check().issues.map((i) => [i.rule, i.severity]),
    [
      ['long-body', 'error'],
      ['missing-summary', 'info'],
    ],
  )
  p.updateNode(n.id, { checks: { off: ['long-body'] } })
  assert.deepEqual(rules(p), ['missing-summary'])
  assert.throws(() => p.setChecks({ 'no-such-rule': 'warn' }), /Unknown check rule/)
  // Hand-edited invalid settings are reported instead of breaking the project.
  fs.writeFileSync(path.join(p.root, 'maquest.json'), JSON.stringify({ ...p.config(), checks: { 'long-body': 'loud' } }))
  assert.ok(p.check().issues.some((i) => i.rule === 'config-invalid'))
})

test('sheets: missing statblocks, required stats, legacy fields with a move fix', async () => {
  const p = tmp()
  p.setTypes({ monster: { label: 'Monster', system: 'dnd-2024' } })
  const wight = p.createNode({ type: 'monster', title: 'Wight', fields: { CR: '3', AC: '14', Szybkość: '30 ft', taktyka: 'ambush' } })
  p.updateBoard('main', { addNodes: [wight.id] })
  assert.deepEqual(rules(p, wight.id), ['legacy-fields', 'statblock-missing'])
  const legacy = p.check().issues.find((i) => i.rule === 'legacy-fields')!
  await p.applyFix(legacy.fixes![0])
  const moved = p.getNode(wight.id)!
  assert.deepEqual(moved.stats, { cr: 3, ac: 14, speed: '30 ft' })
  assert.deepEqual(moved.fields, { taktyka: 'ambush' })
  assert.deepEqual(rules(p, wight.id), ['stat-missing'])
  p.updateNode(wight.id, { stats: { hp: { value: 82, note: '11d8+33' }, scores: { str: 15, dex: 'quick' }, tactics: 'x' } })
  assert.deepEqual(rules(p, wight.id), ['stat-invalid', 'stat-unknown'])
  p.updateNode(wight.id, { stats: { scores: { dex: 14 }, tactics: null } })
  assert.deepEqual(p.getNode(wight.id)?.stats?.scores, { str: 15, dex: 14 })
  assert.deepEqual(rules(p, wight.id), [])
})

test('shared abilities: copies across sheets, and copies of a library node', () => {
  const p = tmp()
  const text = 'A bright streak flashes to a point you choose and blossoms into an explosion of flame. '.repeat(3)
  const a = p.createNode({ type: 'character', title: 'Mage', body: `# Spells\n### Fireball\n${text}\n# Notes\nx\n` })
  const b = p.createNode({ type: 'character', title: 'Priest', body: `# Spells\n- **Fireball** (lvl 3) — ${text}\n# Notes\ny\n` })
  p.updateBoard('main', { addNodes: [a.id, b.id] })
  const before = p.check().issues.filter((i) => i.rule === 'shared-ability')
  assert.equal(before.length, 2)
  assert.match(before[0].hint!, /library type/)
  p.setTypes({ spell: { label: 'Spell' } })
  p.createNode({ type: 'spell', title: 'Fireball', body: text })
  const after = p.check().issues.filter((i) => i.rule === 'shared-ability')
  assert.deepEqual(
    after.map((i) => i.node),
    [a.id, b.id],
  )
  assert.match(after[0].message, /library node fireball/)
})

test('custom checks require fields, stats, tags and edges', () => {
  const p = tmp()
  const n = p.createNode({ type: 'character', title: 'Bram', fields: { role: '', want: 'gold' } })
  p.updateBoard('main', { addNodes: [n.id] })
  p.setChecks({}, [{ id: 'npc-basics', message: 'NPCs need a role and a place', types: ['character'], require: { fields: ['role'], edges: ['located-at'] } }])
  const issue = p.check().issues.find((i) => i.rule === 'npc-basics')!
  assert.equal(issue.severity, 'warn')
  assert.equal(issue.message, 'NPCs need a role and a place (missing fields: role; no located-at connection)')
  assert.throws(() => p.setChecks({}, [{ id: 'Bad Id', message: 'x' }]), /customChecks\[0\]/)
})

test('unreadable node files are reported', () => {
  const p = tmp()
  fs.writeFileSync(path.join(p.root, 'characters', 'broken.md'), '---\ntitle: [unclosed\n---\n')
  fs.writeFileSync(path.join(p.root, 'characters', 'wrong.md'), '---\ntype: location\ntitle: Wrong\n---\n')
  const files = p.check().issues.filter((i) => i.rule === 'invalid-file')
  assert.equal(files.length, 2)
  assert.match(files.map((i) => i.message).join('\n'), /broken\.md: frontmatter is not valid YAML[\s\S]*wrong\.md: type "location" does not belong/)
})
