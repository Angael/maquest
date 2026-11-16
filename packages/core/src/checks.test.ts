import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Project } from './project'
import { detectedLine } from './checks'

const tmp = (statuses = false) => {
  const p = Project.init(fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-checks-')), { name: 'Checks' })
  // Most tests are about other rules; the status rule has its own test.
  if (!statuses) p.setChecks({ 'missing-status': 'off' })
  return p
}
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

test('every node should have a status (warn by default, media skipped)', () => {
  const p = tmp(true)
  const hall = p.createNode({ type: 'location', title: 'Hall' })
  const done = p.createNode({ type: 'location', title: 'Done', status: 'done' })
  p.updateBoard('main', { addNodes: [hall.id, done.id] })
  assert.deepEqual(
    p.check().issues.map((i) => [i.rule, i.node, i.severity]),
    [['missing-status', hall.id, 'warn']],
  )
  p.updateNode(hall.id, { status: 'draft' })
  assert.deepEqual(rules(p), [])
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
  p.setChecks({ 'long-body': ['error', { maxWords: 10 }], 'missing-summary': 'info', 'missing-status': 'off' })
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

test('sheets: required fields, malformed values, other names with a move fix, broken refs, legacy files', async () => {
  const p = tmp()
  p.setTypes({
    monster: {
      label: 'Monster',
      fields: [
        { key: 'cr', widget: 'stat', aliases: ['CR'], required: true },
        { key: 'ac', widget: 'stat', label: 'AC', required: true },
        { key: 'speed', label: 'Szybkość' },
        { key: 'scores', widget: 'scores', keys: ['str', 'dex'] },
        { key: 'lair', widget: 'refs' },
      ],
      tabs: [{ title: 'Stats', kind: 'fields' }],
    },
  })
  const wight = p.createNode({ type: 'monster', title: 'Wight', fields: { CR: '3', AC: '14', Szybkość: '30 ft', taktyka: 'ambush' } })
  p.updateBoard('main', { addNodes: [wight.id] })
  assert.deepEqual(rules(p, wight.id), ['field-alias', 'field-missing'])
  const missing = p.check().issues.find((i) => i.rule === 'field-missing')!
  assert.equal(missing.open, 'Stats')
  await p.applyFix(p.check().issues.find((i) => i.rule === 'field-alias')!.fixes![0])
  assert.deepEqual(p.getNode(wight.id)!.fields, { taktyka: 'ambush', cr: 3, ac: 14, speed: '30 ft' })
  assert.deepEqual(rules(p, wight.id), [])
  p.updateNode(wight.id, { fields: { scores: { str: 15, dex: 'quick' }, lair: ['crypt'] } })
  assert.deepEqual(rules(p, wight.id), ['broken-ref', 'field-invalid'])
  p.updateNode(wight.id, { fields: { scores: { dex: 14 }, lair: null } })
  assert.deepEqual(p.getNode(wight.id)?.fields.scores, { str: 15, dex: 14 })
  assert.deepEqual(rules(p, wight.id), [])
  // Files from before fields and stats were one: stats join the fields, the node's system goes away.
  fs.writeFileSync(
    path.join(p.root, 'monsters', 'ghoul.md'),
    '---\ntype: monster\ntitle: Ghoul\nsystem: dnd-2024\nfields:\n  cr: ""\nstats:\n  cr: 1\n  ac: 12\n---\n',
  )
  assert.deepEqual(p.getNode('ghoul')!.fields, { cr: 1, ac: 12 })
  p.updateNode('ghoul', { summary: 'Hungry.' })
  assert.doesNotMatch(fs.readFileSync(path.join(p.root, 'monsters', 'ghoul.md'), 'utf8'), /stats:|system:/)
  // Old settings are pointed out rather than silently ignored.
  fs.writeFileSync(path.join(p.root, 'maquest.json'), JSON.stringify({ ...p.config(), systems: { x: {} } }))
  assert.match(p.check().issues.find((i) => i.rule === 'config-invalid')!.message, /systems is no longer used/)
})

test('types: invalid fields and tabs are rejected when set and reported when hand-edited', () => {
  const p = tmp()
  assert.throws(() => p.setTypes({ monster: { fields: [{ key: 'hp', widget: 'gauge' }] } }), /types\.monster: field hp/)
  assert.throws(() => p.setTypes({ monster: { tabs: [{ title: 'Stats', kind: 'fields', fields: ['hp'] }] } }), /does not define: hp/)
  fs.writeFileSync(
    path.join(p.root, 'maquest.json'),
    JSON.stringify({ ...p.config(), types: { character: { fields: [{ key: 'hp', widget: 'meter', style: 'pie' }] } } }),
  )
  assert.match(p.check().issues.find((i) => i.rule === 'config-invalid')!.message, /types\.character: field hp: style/)
})

test('shared records: copies across sheets, and copies of a library node', () => {
  const p = tmp()
  p.setTypes({ character: { fields: [{ key: 'spells', widget: 'records', item: ['level'] }] } })
  const text = 'A bright streak flashes to a point you choose and blossoms into an explosion of flame. '.repeat(3)
  const a = p.createNode({ type: 'character', title: 'Mage', fields: { spells: [{ name: 'Fireball', text }] } })
  const b = p.createNode({ type: 'character', title: 'Priest', fields: { spells: [{ name: 'Fireball', level: 3, text }] } })
  p.updateBoard('main', { addNodes: [a.id, b.id] })
  const before = p.check().issues.filter((i) => i.rule === 'shared-record')
  assert.equal(before.length, 2)
  assert.match(before[0].hint!, /library type/)
  p.setTypes({ spell: { label: 'Spell', library: true } })
  p.createNode({ type: 'spell', title: 'Fireball', body: text })
  const after = p.check().issues.filter((i) => i.rule === 'shared-record')
  assert.deepEqual(
    after.map((i) => i.node),
    [a.id, b.id],
  )
  assert.match(after[0].message, /library node fireball/)
})

test('records are checked against their item schema; cards tabs are reported', () => {
  const p = tmp()
  p.setTypes({
    character: {
      fields: [{ key: 'moves', widget: 'records', groupBy: 'kind', item: [{ key: 'kind', options: ['Basic', 'Special'] }] }],
      tabs: [{ title: 'Moves', kind: 'fields', fields: ['moves'] }],
    },
  })
  assert.throws(() => p.setTypes({ character: { tabs: [{ title: 'Old', kind: 'cards' }] } }), /cards tabs are gone/)
  // A config written by hand with a cards tab still loads, and the tab is reported.
  const config = p.config()
  fs.writeFileSync(
    path.join(p.root, 'maquest.json'),
    JSON.stringify({
      ...config,
      types: { character: { ...config.types!.character, tabs: [...config.types!.character.tabs!, { title: 'Old', kind: 'cards' }] } },
    }),
  )
  const n = p.createNode({ type: 'character', title: 'Ash', fields: { moves: [{ name: 'Strike', kind: 'Basik' }, { text: 'no name' }] } })
  p.updateBoard('main', { addNodes: [n.id] })
  const issues = p.check().issues
  const invalid = issues.find((i) => i.rule === 'field-invalid')!
  assert.equal(invalid.message, 'moves: #1 (Strike) kind: expected one of Basic, Special; #2 lacks name')
  assert.equal(invalid.open, 'Moves')
  assert.match(issues.find((i) => i.rule === 'config-invalid')!.message, /tab Old: cards tabs are gone/)
})

test('custom checks require fields, tags and edges', () => {
  const p = tmp()
  const n = p.createNode({ type: 'character', title: 'Bram', fields: { role: '', want: 'gold' } })
  p.updateBoard('main', { addNodes: [n.id] })
  p.setChecks({}, [{ id: 'npc-basics', message: 'NPCs need a role and a place', types: ['character'], require: { fields: ['role'], edges: ['located-at'] } }])
  const issue = p.check().issues.find((i) => i.rule === 'npc-basics')!
  assert.equal(issue.severity, 'warn')
  assert.equal(issue.message, 'NPCs need a role and a place (missing fields: role; no located-at connection)')
  assert.throws(() => p.setChecks({}, [{ id: 'Bad Id', message: 'x' }]), /customChecks\[0\]/)
})

test('custom checks look inside one tab: match, forbid and allowed headings', () => {
  const p = tmp()
  p.setTypes({ character: { tabs: [{ title: 'Abilities', aliases: ['Zdolności'] }, { title: 'Tactics' }] } })
  const body = '# Zdolności\n## Traits\n- **Morale:** flees at half HP\n## As a companion\n- **Bless** (lvl 1)\n# Notes\nMorale is high.\n'
  const n = p.createNode({ type: 'character', title: 'Anselm', body })
  const clean = p.createNode({ type: 'character', title: 'Bram', body: '# Abilities\n## Traits\n- **Keen Smell** — advantage\n# Tactics\nFlees at half HP.\n' })
  p.updateBoard('main', { addNodes: [n.id, clean.id] })
  p.setChecks({}, [
    {
      id: 'abilities-only',
      message: 'Only rules in Abilities',
      types: ['character'],
      tab: 'Abilities',
      forbid: '\\*\\*(morale|tactics)',
      headings: ['Traits', 'Actions', 'Spells, level \\d'],
    },
    { id: 'tactics-tab', message: 'Fighters need tactics', types: ['character'], require: { tabs: ['Tactics'] } },
    { id: 'tactics-say-when', message: 'Say when they flee', types: ['character'], tab: 'Tactics', require: { match: 'flees' } },
  ])
  const issues = p.check().issues.filter((i) => i.node === n.id || i.node === clean.id)
  assert.deepEqual(
    issues.map((i) => `${i.node} ${i.rule}: ${i.message}`),
    [
      'anselm abilities-only: Only rules in Abilities (contains in Zdolności "**Morale"; unexpected headings in Zdolności: ## As a companion)',
      'anselm tactics-tab: Fighters need tactics (missing tabs: Tactics)',
    ],
  )
  assert.throws(() => p.setChecks({}, [{ id: 'x', message: 'x', tab: [] }]), /customChecks\[0\]/)
})

test('unreadable node files are reported', () => {
  const p = tmp()
  fs.writeFileSync(path.join(p.root, 'characters', 'broken.md'), '---\ntitle: [unclosed\n---\n')
  fs.writeFileSync(path.join(p.root, 'characters', 'wrong.md'), '---\ntype: location\ntitle: Wrong\n---\n')
  const files = p.check().issues.filter((i) => i.rule === 'invalid-file')
  assert.equal(files.length, 2)
  assert.match(files.map((i) => i.message).join('\n'), /broken\.md: frontmatter is not valid YAML[\s\S]*wrong\.md: type "location" does not belong/)
})

test('custom checks scoped to a fields tab read its fields, records as markdown', () => {
  const p = tmp()
  p.setTypes({
    character: {
      fields: [{ key: 'abilities', widget: 'records', groupBy: 'kind', item: ['kind'] }],
      tabs: [{ title: 'Abilities', kind: 'fields', fields: ['abilities'] }, { title: 'Tactics' }],
    },
  })
  const n = p.createNode({
    type: 'character',
    title: 'Anselm',
    fields: {
      abilities: [
        { name: 'Morale', kind: 'Traits', text: 'flees' },
        { name: 'Bless', kind: 'As a companion' },
      ],
    },
  })
  p.updateBoard('main', { addNodes: [n.id] })
  p.setChecks({}, [
    { id: 'abilities-only', message: 'Only rules', types: ['character'], tab: 'Abilities', forbid: '\\*\\*(morale|tactics)', headings: ['Traits', 'Actions'] },
    { id: 'has-abilities', message: 'Needs abilities', types: ['character'], require: { tabs: ['Abilities'] } },
  ])
  assert.deepEqual(
    p
      .check()
      .issues.filter((i) => (i.node === n.id && i.rule.startsWith('abilities')) || i.rule === 'has-abilities')
      .map((i) => i.message),
    ['Only rules (contains in Abilities "**Morale"; unexpected headings in Abilities: ## As a companion)'],
  )
})

test('records without a description and text fields that repeat a records group are reported', () => {
  const p = tmp()
  p.setTypes({
    character: {
      fields: [
        { key: 'spells', label: 'Zaklęcia' },
        { key: 'abilities', widget: 'records', groupBy: 'kind', item: [{ key: 'kind', options: ['Feature', 'Zaklęcia'] }] },
      ],
    },
    spell: { label: 'Spell', library: true },
  })
  p.createNode({ type: 'spell', title: 'Shield', body: '+5 AC until the start of your next turn.' })
  const n = p.createNode({
    type: 'character',
    title: 'Isolde',
    fields: {
      spells: 'Shield, Hold Person',
      abilities: [
        { name: 'Shield', kind: 'Zaklęcia' },
        { name: 'Hold Person', kind: 'Zaklęcia' },
        { name: 'Song', kind: 'Feature', text: 'Heals a bit.' },
      ],
    },
  })
  p.updateBoard('main', { addNodes: [n.id] })
  const issues = p.check().issues.filter((i) => i.node === n.id)
  assert.equal(issues.find((i) => i.rule === 'record-undescribed')?.message, 'Abilities: no description for Hold Person')
  assert.match(issues.find((i) => i.rule === 'field-duplicates-records')!.message, /Zaklęcia repeats the records in Abilities → Zaklęcia/)
})
