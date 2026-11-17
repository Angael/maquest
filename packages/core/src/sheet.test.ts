import assert from 'node:assert/strict'
import test from 'node:test'
import { FieldDef, projectTypes, typeProblems, type TypeDef } from './schema'
import {
  fieldForKey,
  fieldLayout,
  fieldProblem,
  fieldSizeProblems,
  fieldSummary,
  formatNumber,
  numberText,
  isRequired,
  joinSections,
  meterValue,
  noted,
  pairEntries,
  parsePairs,
  propertyRows,
  recordGroups,
  recordList,
  recordProblems,
  recordsText,
  refIds,
  replaceSection,
  scoreCells,
  sheetTabs,
  splitSections,
  tableRows,
  writeTab,
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

test('tabs: the type order, fields tabs always, aliases, others after, plain documents untouched', () => {
  const type = {
    fields: [field({ key: 'hp', widget: 'meter' })],
    tabs: [
      { title: 'Stats', kind: 'fields' as const },
      { title: 'Historia', kind: 'prose' as const },
      { title: 'Abilities', kind: 'prose' as const, aliases: ['Zdolności'] },
    ],
  }
  const tabs = sheetTabs(IGNATZ, type)
  assert.deepEqual(
    tabs.map((t) => [t.kind, t.title]),
    [
      ['fields', 'Stats'],
      ['prose', 'Historia'],
      ['prose', 'Zdolności'],
      ['prose', 'Stats'],
    ],
  )
  // A plain document (one H1 after an intro) stays a single editor.
  assert.deepEqual(sheetTabs('Leads to the hall.\n\n# Flooded\n'), [])
  assert.equal(sheetTabs('# One\na\n# Two\nb').length, 2)
  // Intro text is the Overview, ahead of the body tabs.
  assert.deepEqual(
    sheetTabs('Hello.\n\n# Historia\nx', type).map((t) => t.title),
    ['Stats', 'Overview', 'Historia', 'Abilities'],
  )
  // The type's prose tabs show even when the body lacks them; writing one adds its section.
  const prose = { fields: [], tabs: [{ title: 'History', kind: 'prose' as const }] }
  const empty = sheetTabs('', prose)
  assert.deepEqual(
    empty.map((t) => [t.title, t.kind === 'prose' && t.section]),
    [['History', -1]],
  )
  const written = writeTab('', empty[0] as { title: string; section: number }, 'Born in the marsh.')
  assert.equal(written, '# History\n\nBorn in the marsh.\n')
  assert.equal(sheetTabs(written, prose)[0].key, empty[0].key)
  assert.equal(writeTab('x', { title: 'History', section: -1 }, '  '), 'x')
})

test('requiredWhen: required only when other values match, in nodes and in records', () => {
  const level = field({ key: 'level', widget: 'stat', requiredWhen: { kind: ['Spell', 'Cantrip'] } })
  assert.equal(isRequired(level, { kind: 'spell' }), true)
  assert.equal(isRequired(level, { kind: 'Feature' }), false)
  assert.equal(isRequired(level, {}), false)
  const def = field({ key: 'abilities', widget: 'records', item: [{ key: 'kind', options: ['Spell', 'Feature'] }, level] })
  assert.deepEqual(
    recordProblems(def, [
      { name: 'Shield', kind: 'Spell' },
      { name: 'Rage', kind: 'Feature' },
    ]),
    ['#1 (Shield) lacks level'],
  )
})

test('records: a list of flat maps with an item schema, grouped by an item field and checked record by record', () => {
  const def = field({
    key: 'abilities',
    widget: 'records',
    groupBy: 'kind',
    item: [
      { key: 'kind', options: ['Traits', 'Actions', 'Spells'], required: true },
      { key: 'level', widget: 'stat', min: 0, max: 9 },
      'cost',
      { key: 'used', widget: 'toggle' },
    ],
  })
  const value = [
    { name: 'Fireball', kind: 'Spells', level: 3, cost: 'action', text: 'Boom.' },
    { name: 'Keen Smell', kind: 'traits', text: 'Advantage on smell.' },
    { name: '[[fly|Fly]]', kind: 'Spells', level: 3 },
    { name: 'Bite', kind: 'Actions', text: '1d6.' },
  ]
  const list = recordList(def, value)
  assert.deepEqual(
    recordGroups(def, list).map((g) => [g.title, g.records.map((r) => r.name)]),
    [
      ['Traits', ['Keen Smell']],
      ['Actions', ['Bite']],
      ['Spells', ['Fireball', 'Fly']],
    ],
  )
  assert.equal(list[2].ref, 'fly')
  assert.equal(fieldSummary(def, value), 'Traits: Keen Smell; Actions: Bite; Spells: Fireball, Fly')
  assert.equal(
    recordsText(def, value),
    '## Traits\n- **Keen Smell** — Advantage on smell.\n\n## Actions\n- **Bite** — 1d6.\n\n## Spells\n- **Fireball** (3, action) — Boom.\n- **[[fly|Fly]]** (3)',
  )
  assert.deepEqual(recordProblems(def, value), [])
  assert.deepEqual(recordProblems(def, [{ kind: 'Spells', level: 12, range: '60 ft' }, 'Bless', { name: 'Hide', kind: 'Bonus' }]), [
    '#1 lacks name',
    "#1 has keys the item doesn't define: range (item: name, kind, level, cost, used, text)",
    '#1 level: value 12 is over the maximum 9',
    '#2 is not a record',
    '#3 (Hide) kind: expected one of Traits, Actions, Spells',
  ])
  assert.match(fieldProblem(def, { name: 'x' })!, /expected a list of records/)
  // Records can't nest, and only records fields have an item.
  assert.match(
    typeProblems({ types: { character: { fields: [{ key: 'a', widget: 'records', item: [{ key: 'b', widget: 'records' }] }] } } })[0].message,
    /a item: field b: records can't hold records/,
  )
  assert.ok(!FieldDef.safeParse({ key: 'a', item: ['b'] }).success)
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

const shown = (ns: number[]) => ns.map(formatNumber)

test('numbers display short: two decimals, compact millions, exponents for extremes, text as written', () => {
  assert.deepEqual(shown([0, 14, -3, 1492, 123456, 0.30000000000000004, 3.14159, 0.00123]), ['0', '14', '−3', '1492', '123456', '0.3', '3.14', '0.00123'])
  assert.deepEqual(shown([1234567, -98765432.1, 1e9, 1.5e12, 1.2345e29, 0.000004, Infinity]), ['1.2M', '−98.8M', '1B', '1.5T', '1.2e29', '4e−6', '∞'])
  assert.deepEqual(['+2', '-1', '1,5', '1,000', '007', '12345678901', '3.14159', 'two'].map(numberText), [
    '+2',
    '−1',
    '1,5',
    '1,000',
    '007',
    '12.3B',
    '3.14',
    null,
  ])
  const cells = scoreCells(field({ key: 's', widget: 'scores', modifier: { base: 10, step: 2 } }), { str: 1e21, dex: 14.123456 })
  assert.deepEqual(
    cells.map((c) => [c.value, c.display, c.modifier]),
    [
      ['1e+21', '1e21', '+5e20'],
      ['14.123456', '14.12', '+2'],
    ],
  )
})

test('size: oversized text, items, words, numbers and styles are reported per widget', () => {
  const word = 'x'.repeat(60)
  const size = (f: Record<string, unknown>, v: unknown) => fieldSizeProblems(field(f), v)
  assert.deepEqual(size({ key: 'ac', widget: 'stat' }, { value: 14, note: 'studded leather' }), [])
  assert.deepEqual(size({ key: 'ac', widget: 'stat' }, 'fourteen, or sixteen with a shield and the blessing'), ['value is 51 chars (max 24)'])
  assert.deepEqual(size({ key: 'gold', widget: 'stat' }, 1e21), ['1e+21 is too large to read; use a bigger unit'])
  assert.deepEqual(size({ key: 'w', widget: 'stat' }, 0.30000000000000004), ['0.30000000000000004 has 17 decimals; round it to 2'])
  assert.deepEqual(size({ key: 'role' }, `a ${word} b`), ['a 60-char word ("xxxxxxxxxxxxxxxxxxx…") can\'t wrap'])
  assert.deepEqual(size({ key: 'role' }, 'see https://example.com/a/very/long/path/that/goes/on/and/on/for/ever/and/ever'), [])
  assert.deepEqual(
    size(
      { key: 'traits', widget: 'tags' },
      Array.from({ length: 30 }, (_, i) => (i ? `t${i}` : 'a tag that is really a whole sentence')),
    ),
    ['30 tags (max 24)', 'a tag is over 32 chars ("a tag that is really a…")'],
  )
  assert.deepEqual(size({ key: 'stress', widget: 'meter', style: 'dots' }, { value: 3, max: 100 }), ['max 100 is more than dots can draw (40); use style bar'])
  assert.deepEqual(size({ key: 'doom', widget: 'meter', style: 'clock' }, '3/24'), ['max 24 is more than a clock can draw (12); use style bar'])
  assert.match(
    size({ key: 'social', widget: 'scores', style: 'radar' }, Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`k${i}`, i])))[0],
    /14 axes are more than a radar can draw/,
  )
  const moves = field({ key: 'moves', widget: 'records', item: ['cost', { key: 'tags', widget: 'tags' }] })
  assert.deepEqual(fieldSizeProblems(moves, [{ name: 'Bite', cost: 1.23456, tags: ['ok'] }]), ['#1 (Bite) cost: 1.23456 has 5 decimals; round it to 2'])
  // At most three problems, then a count.
  assert.deepEqual(
    size(
      { key: 'gear', widget: 'table' },
      Array.from({ length: 120 }, (_, i) => ({ a: word, b: 1e30, [`c${i}`]: 1 })),
    ).at(-1),
    '+1 more',
  )
})
