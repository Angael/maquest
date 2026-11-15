import assert from 'node:assert/strict'
import test from 'node:test'
import { FieldDef, projectTypes, typeProblems, type TypeDef } from './schema'
import {
  fieldForKey,
  fieldLayout,
  fieldProblem,
  fieldSummary,
  joinSections,
  meterValue,
  noted,
  pairEntries,
  parseCards,
  parsePairs,
  propertyRows,
  refIds,
  replaceSection,
  scoreCells,
  sheetTabs,
  splitSections,
  tableRows,
} from './sheet'

const field = (f: Record<string, unknown>) => FieldDef.parse(f)

const IGNATZ = `# Stats
**Small humanoid**

# Zdolności
## Akcje
- **Multiattack** — 3× Arcane Burst.
- **Arcane Burst** (+6, 120 ft) — trafienie 16 (3d8+3) force.

## 2 / dzień
### [[fireball|Fireball]] {krąg 4, akcja}
Wersja kampanii.

### Invisibility
Istota ma Invisible.

\`\`\`
# not a tab
\`\`\`

# Historia
Przyjezdny z Waterdeep.
`

test('sections split at H1 headings outside code fences and join back exactly', () => {
  const sections = splitSections(IGNATZ)
  assert.deepEqual(
    sections.map((s) => s.title),
    [null, 'Stats', 'Zdolności', 'Historia'],
  )
  assert.equal(joinSections(sections), IGNATZ)
})

test('replacing a section keeps the others and one blank line after the heading', () => {
  const body = replaceSection(IGNATZ, 3, 'Nowa historia.')
  assert.match(body, /# Historia\n\nNowa historia\.\n$/)
  assert.ok(body.startsWith('# Stats\n**Small humanoid**'))
  const middle = replaceSection('# A\none\n# B\ntwo', 1, 'uno')
  assert.equal(middle, '# A\n\nuno\n\n# B\ntwo')
})

test('tabs: the type order, fields tabs always, cards by config, others after, plain documents untouched', () => {
  const type = {
    fields: [field({ key: 'hp', widget: 'meter' })],
    tabs: [
      { title: 'Stats', kind: 'fields' as const },
      { title: 'Historia', kind: 'prose' as const },
      { title: 'Abilities', kind: 'cards' as const, aliases: ['Zdolności'] },
    ],
  }
  const tabs = sheetTabs(IGNATZ, type)
  assert.deepEqual(
    tabs.map((t) => [t.kind, t.title]),
    [
      ['fields', 'Stats'],
      ['prose', 'Historia'],
      ['cards', 'Zdolności'],
      ['prose', 'Stats'],
    ],
  )
  // Nothing is a cards tab unless the type says so.
  assert.deepEqual(
    sheetTabs(IGNATZ).map((t) => t.kind),
    ['prose', 'prose', 'prose'],
  )
  // A plain document (one H1 after an intro) stays a single editor.
  assert.deepEqual(sheetTabs('Leads to the hall.\n\n# Flooded\n'), [])
  assert.equal(sheetTabs('# One\na\n# Two\nb').length, 2)
  // Intro text is the Overview, ahead of the body tabs.
  assert.deepEqual(
    sheetTabs('Hello.\n\n# Historia\nx', type).map((t) => t.title),
    ['Stats', 'Overview', 'Historia'],
  )
})

test('cards: groups, headings with meta and links, bullets with bold names', () => {
  const tab = sheetTabs(IGNATZ, { fields: [], tabs: [{ title: 'Zdolności', kind: 'cards' }] }).find((t) => t.kind === 'cards')!
  const { groups } = parseCards(tab.kind === 'cards' ? tab.text : '')
  assert.deepEqual(
    groups.map((g) => [g.title, g.cards.map((a) => a.name)]),
    [
      [null, []],
      ['Akcje', ['Multiattack', 'Arcane Burst']],
      ['2 / dzień', ['Fireball', 'Invisibility']],
    ],
  )
  const [burst] = groups[1].cards.slice(1)
  assert.deepEqual(burst.meta, ['+6', '120 ft'])
  assert.equal(burst.text, 'trafienie 16 (3d8+3) force.')
  const fireball = groups[2].cards[0]
  assert.equal(fireball.ref, 'fireball')
  assert.deepEqual(fireball.meta, ['krąg 4', 'akcja'])
  assert.equal(fireball.text, 'Wersja kampanii.')
  assert.match(groups[2].cards[1].text, /^Istota ma Invisible\.[\s\S]*not a tab/)
})

test('types: extends merges fields by key, omit drops them, and bad definitions are reported', () => {
  const types: Record<string, TypeDef> = {
    character: {
      fields: ['role', { key: 'hp', widget: 'meter', required: true }, { key: 'speed', widget: 'stat' }],
      tabs: [{ title: 'Stats', kind: 'fields' }],
    },
    monster: {
      extends: 'character',
      fields: [
        { key: 'speed', label: 'Szybkość' },
        { key: 'cr', widget: 'stat' },
      ],
      omit: ['role'],
    },
    loop: { extends: 'loop' },
    broken: {
      fields: [
        { key: 'x', widget: 'nope' },
        { key: 'y', widget: 'meter', style: 'radar' },
      ],
      tabs: [{ title: 'S', kind: 'fields', fields: ['zzz'] }],
    },
  }
  const monster = projectTypes({ types }).find((t) => t.id === 'monster')!
  assert.deepEqual(
    monster.fields.map((f) => [f.key, f.widget, f.label]),
    [
      ['hp', 'meter', undefined],
      ['speed', 'stat', 'Szybkość'],
      ['cr', 'stat', undefined],
    ],
  )
  assert.deepEqual(monster.tabs, types.character.tabs)
  const problems = typeProblems({ types }).map((p) => `${p.type}: ${p.message}`)
  assert.ok(problems.some((p) => p.startsWith('loop: extends itself')))
  assert.ok(problems.some((p) => p.startsWith('broken: field x')))
  assert.ok(problems.some((p) => p.startsWith('broken: field y: style')))
  assert.ok(problems.some((p) => p.includes('tab S lists fields the type does not define: zzz')))
  assert.equal(fieldForKey(monster.fields, 'Szybkość')?.key, 'speed')
  assert.equal(fieldForKey(monster.fields, 'speed'), undefined)
})

test('layout: fields tabs take listed fields or sections, a bare one takes the rest; the others are properties', () => {
  const type = {
    fields: ['role', 'hp', 'ac', 'charm', 'guts'].map((key) => field({ key })),
    tabs: [
      { title: 'Combat', kind: 'fields' as const, fields: ['hp', 'ac'] },
      { title: 'Social', kind: 'fields' as const, sections: [{ title: 'Stats', fields: ['charm'] }] },
    ],
  }
  const layout = fieldLayout(type)
  assert.deepEqual(
    layout.get('Social')!.map((s) => [s.title, s.fields.map((f) => f.key)]),
    [['Stats', ['charm']]],
  )
  assert.deepEqual(
    propertyRows(type, { guts: 3, mood: 'grim' }).map((r) => [r.def.key, r.known]),
    [
      ['role', true],
      ['guts', true],
      ['mood', false],
    ],
  )
  const rest = fieldLayout({ ...type, tabs: [...type.tabs, { title: 'Other', kind: 'fields' as const }] }).get('Other')!
  assert.deepEqual(
    rest[0].fields.map((f) => f.key),
    ['role', 'guts'],
  )
})

test('values: notes, scores with modifiers, pairs, meters, tables and refs', () => {
  assert.deepEqual(noted({ value: 12, note: '15 z Mage Armor' }), { value: '12', note: '15 z Mage Armor' })
  const cells = scoreCells({ keys: ['str', 'dex'], labels: { str: 'STR' }, modifier: { base: 10, step: 2 } }, { str: 9, dex: 14 })
  assert.deepEqual(
    cells.map((c) => [c.label, c.value, c.modifier]),
    [
      ['STR', '9', '−1'],
      ['dex', '14', '+2'],
    ],
  )
  assert.deepEqual(
    pairEntries({}, { int: 6, wis: -1 }).map((e) => e.value),
    ['+6', '−1'],
  )
  assert.deepEqual(parsePairs('Arcana +6, History 6, Stealth -1'), { Arcana: 6, History: 6, Stealth: -1 })
  assert.deepEqual(meterValue({ max: 9 }, '3/9'), { value: 3, max: 9 })
  assert.deepEqual(refIds(['[[mira|Mira]]', 'theron']), ['mira', 'theron'])
  assert.deepEqual(
    tableRows({ keys: ['name'] }, [{ name: 'Dagger', dmg: '1d4' }]).columns.map((c) => c.key),
    ['name', 'dmg'],
  )
  assert.equal(fieldSummary(field({ key: 'hp', widget: 'meter' }), { value: 3, max: 9 }), '3/9')
})

test('problems: shapes, choices and ranges by widget', () => {
  assert.equal(fieldProblem(field({ key: 'scores', widget: 'scores' }), { str: 'strong' }), 'not numbers: str')
  assert.equal(fieldProblem(field({ key: 'social', widget: 'scores', max: 5 }), { charm: 7 }), 'charm 7 is over the maximum 5')
  assert.equal(fieldProblem(field({ key: 'stress', widget: 'meter', max: 9 }), 12), 'value 12 is over the maximum 9')
  assert.equal(fieldProblem(field({ key: 'ac', widget: 'stat' }), '12 (15 with mage armor)'), null)
  assert.equal(fieldProblem(field({ key: 'level', widget: 'stat', min: 1, max: 20 }), 0), 'value 0 is below the minimum 1')
  assert.equal(fieldProblem(field({ key: 'arcana', options: ['Fool', 'Magician'] }), 'magician'), null)
  assert.equal(fieldProblem(field({ key: 'arcana', options: ['Fool', 'Magician'] }), 'Tower'), 'expected one of Fool, Magician')
  assert.equal(fieldProblem(field({ key: 'flag', widget: 'toggle' }), 'maybe'), 'expected yes or no (true/false)')
  assert.equal(fieldProblem(field({ key: 'gear', widget: 'table' }), 'sword'), 'expected a list of rows like [{ name: …, … }]')
})
