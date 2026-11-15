import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bonusEntries,
  joinSections,
  parseAbilities,
  parseBonuses,
  replaceSection,
  resolveSystems,
  scoreCells,
  sheetTabs,
  splitSections,
  statForField,
  statProblem,
  statText,
  trackValue,
} from './sheet'

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

test('tabs: statblock first, configured order, ability tabs by name', () => {
  const tabs = sheetTabs(IGNATZ, { statsTitle: 'Stats', tabs: [{ title: 'Historia', kind: 'prose' }] })
  assert.deepEqual(
    tabs.map((t) => [t.kind, t.title]),
    [
      ['stats', 'Stats'],
      ['prose', 'Historia'],
      ['prose', 'Stats'],
      ['abilities', 'Zdolności'],
    ],
  )
  // A plain document (one H1 after an intro) stays a single editor.
  assert.deepEqual(sheetTabs('Leads to the hall.\n\n# Flooded\n'), [])
  assert.equal(sheetTabs('# One\na\n# Two\nb').length, 2)
})

test('abilities: groups, headings with meta and links, bullets with bold names', () => {
  const tab = sheetTabs(IGNATZ).find((t) => t.kind === 'abilities')!
  assert.equal(tab.kind, 'abilities')
  const { groups } = parseAbilities(tab.kind === 'abilities' ? tab.text : '')
  assert.deepEqual(
    groups.map((g) => [g.title, g.abilities.map((a) => a.name)]),
    [
      [null, []],
      ['Akcje', ['Multiattack', 'Arcane Burst']],
      ['2 / dzień', ['Fireball', 'Invisibility']],
    ],
  )
  const [burst] = groups[1].abilities.slice(1)
  assert.deepEqual(burst.meta, ['+6', '120 ft'])
  assert.equal(burst.text, 'trafienie 16 (3d8+3) force.')
  const fireball = groups[2].abilities[0]
  assert.equal(fireball.ref, 'fireball')
  assert.deepEqual(fireball.meta, ['krąg 4', 'akcja'])
  assert.equal(fireball.text, 'Wersja kampanii.')
  assert.match(groups[2].abilities[1].text, /^Istota ma Invisible\.[\s\S]*not a tab/)
})

test('systems extend presets, relabel stats and report bad definitions', () => {
  const { systems, problems } = resolveSystems({
    'dnd-pl': {
      extends: 'dnd-2024',
      tab: 'Statystyki',
      stats: [
        { key: 'speed', label: 'Szybkość' },
        { key: 'ataki', kind: 'line' },
      ],
      omit: ['pb'],
    },
    loop: { extends: 'loop' },
    broken: { stats: [{ key: 'bad key!' }] },
  })
  const pl = systems.get('dnd-pl')!
  assert.equal(pl.tab, 'Statystyki')
  assert.equal(pl.stats.find((s) => s.key === 'speed')?.label, 'Szybkość')
  assert.equal(pl.stats.find((s) => s.key === 'speed')?.kind, 'stat')
  assert.ok(pl.stats.some((s) => s.key === 'ataki'))
  assert.ok(!pl.stats.some((s) => s.key === 'pb'))
  assert.deepEqual(problems.map((p) => p.system).toSorted(), ['broken', 'loop'])
  assert.equal(statForField(pl, 'Szybkość')?.key, 'speed')
  assert.equal(statForField(pl, 'CR')?.key, 'cr')
})

test('stat values: text with notes, scores with modifiers, bonuses, tracks, problems', () => {
  assert.deepEqual(statText({ value: 12, note: '15 z Mage Armor' }), { value: '12', note: '15 z Mage Armor' })
  const cells = scoreCells({ keys: ['str', 'dex'], labels: { str: 'STR' }, modifier: 'd20' }, { str: 9, dex: 14 })
  assert.deepEqual(
    cells.map((c) => [c.label, c.value, c.modifier]),
    [
      ['STR', '9', '−1'],
      ['DEX', '14', '+2'],
    ],
  )
  assert.deepEqual(
    bonusEntries({}, { int: 6, wis: -1 }).map((e) => e.value),
    ['+6', '−1'],
  )
  assert.deepEqual(parseBonuses('Arcana +6, History 6, Stealth -1'), { Arcana: 6, History: 6, Stealth: -1 })
  assert.deepEqual(trackValue({ max: 9 }, '3/9'), { value: 3, max: 9 })
  assert.equal(statProblem({ key: 'scores', kind: 'scores' }, { str: 'strong' }), 'not numbers: str')
  assert.equal(statProblem({ key: 'stress', kind: 'track', max: 9 }, 12), 'value 12 is over the maximum 9')
  assert.equal(statProblem({ key: 'ac', kind: 'stat' }, '12 (15 with mage armor)'), null)
})
