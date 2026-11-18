import type { Project } from '../../packages/core/src/index'

/*
 * "Hardcore" sheet data: what an agent with no sense of scale might write. Every widget gets values that are too long,
 * too many, too big, too small or one word that never ends. The app must still lay them out tidily, and the checks
 * must report them.
 */

const WORD = `Pneumonoultramicroscopicsilicovolcanoconiosis${'Ultra'.repeat(40)}`
const PARAGRAPH = `The ward was raised in the third age by the Lanternwrights, who bound it to the bells of the old tower and swore that no fire would pass the gate while one of them still lived. ${'It held for nine hundred years, through siege and flood and plague, until the last of them died alone in the cellar beneath the chapel. '.repeat(12)}`
const many = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i))

export const HARDCORE_ID = 'leviathan'

export function seedHardcore(project: Project) {
  project.setTypes({
    monster: {
      label: 'Monster',
      fields: [
        'role',
        { key: 'epithet', widget: 'subtitle' },
        { key: 'origin', widget: 'subtitle' },
        { key: 'motto', widget: 'quote' },
        { key: 'lore', label: `Lore ${WORD}` },
        { key: 'habitat' },
        { key: 'gold', widget: 'stat', badge: true },
        { key: 'mass', widget: 'stat' },
        { key: 'weight', widget: 'stat' },
        { key: 'speed', widget: 'stat', badge: true },
        { key: 'dread', label: 'Dread of the drowned kings of the abyssal trench', widget: 'stat' },
        { key: 'alert', label: 'Alert', widget: 'toggle' },
        { key: 'hp', label: 'HP', widget: 'meter', badge: true },
        { key: 'stress', widget: 'meter', style: 'dots' },
        { key: 'doom', widget: 'meter', style: 'clock' },
        { key: 'fury', widget: 'meter', style: 'ring' },
        { key: 'hunger', widget: 'meter', style: 'boxes' },
        { key: 'scores', widget: 'scores' },
        { key: 'bars', widget: 'scores', style: 'bars' },
        { key: 'radar', widget: 'scores', style: 'radar', max: 5 },
        { key: 'standing', widget: 'scores', style: 'dots', max: 100 },
        { key: 'skills', widget: 'pairs' },
        { key: 'traits', widget: 'tags' },
        { key: 'deeds', widget: 'list' },
        { key: 'allies', widget: 'refs' },
        { key: 'loot', widget: 'table', keys: ['item', 'value', 'note'] },
        {
          key: 'actions',
          widget: 'records',
          groupBy: 'kind',
          item: [{ key: 'kind', required: true }, 'cost', { key: 'tags', widget: 'tags' }, { key: 'uses', widget: 'meter' }],
        },
      ],
      tabs: [
        {
          title: 'Stats',
          kind: 'fields',
          sections: [
            { fields: ['epithet', 'origin', 'gold', 'mass', 'weight', 'speed', 'dread', 'alert', 'hp', 'stress', 'doom', 'fury', 'hunger'] },
            { title: `Abilities ${WORD}`, fields: ['lore', 'habitat', 'scores', 'bars', 'radar', 'standing', 'skills'] },
            { title: 'Story', fields: ['motto', 'traits', 'deeds', 'allies', 'loot'] },
          ],
        },
        { title: 'Actions', kind: 'fields', fields: ['actions'] },
        { title: `Notes of the very long-winded chronicler ${WORD}` },
      ],
    },
  })
  const node = project.createNode({
    id: HARDCORE_ID,
    type: 'monster',
    title: `Leviathan of the Endless Drowned Deep, Devourer of Fleets, ${WORD}`,
    summary: `${WORD} ${PARAGRAPH}`,
    tags: [WORD, ...many(30, (i) => `tag-${i}`)],
    fields: {
      role: PARAGRAPH,
      epithet: WORD,
      origin: PARAGRAPH,
      motto: { value: `${PARAGRAPH} ${WORD}`, note: WORD },
      lore: `${WORD} ${PARAGRAPH}`,
      habitat: 'https://example.com/a/very/long/link/that/keeps/going/and/going/and/never/stops/to/breathe/at/all/ever/again',
      gold: 1.2345678901234568e29,
      mass: 0.00000000123,
      weight: 0.30000000000000004,
      speed: { value: -98765432.123456, note: PARAGRAPH },
      dread: PARAGRAPH,
      alert: PARAGRAPH,
      hp: { value: 123456789, max: 987654321 },
      stress: { value: 5000, max: 9999 },
      doom: { value: 37, max: 400 },
      fury: { value: 1234567.891, max: 99999999 },
      hunger: '3/1000000',
      scores: Object.fromEntries(many(40, (i) => [i === 0 ? WORD : `score ${i}`, i === 1 ? 1e21 : i === 2 ? -0.000004 : 10 + i * 1234.5678])),
      bars: Object.fromEntries(many(30, (i) => [i === 0 ? WORD : `bar ${i}`, i === 0 ? 99999999999 : i * 3.14159])),
      radar: Object.fromEntries(many(24, (i) => [i === 0 ? WORD : `axis number ${i}`, (i % 5) + 0.123456])),
      standing: Object.fromEntries(many(8, (i) => [i === 0 ? WORD : `House ${i}`, i * 13])),
      skills: Object.fromEntries(many(80, (i) => [i === 0 ? WORD : `Skill ${i} with a rather long name`, i === 1 ? 12345678901234 : i])),
      traits: [WORD, PARAGRAPH, ...many(150, (i) => `trait ${i}`)],
      deeds: [WORD, PARAGRAPH, ...many(300, (i) => `Deed number ${i}`)],
      allies: [WORD, ...many(60, (i) => `missing-ally-${i}`)],
      loot: [
        { item: WORD, value: 1e21, note: PARAGRAPH },
        ...many(400, (i) => ({ item: `Item ${i}`, value: i * 1.1111111, note: i % 50 === 0 ? PARAGRAPH : 'ok' })),
      ],
      actions: [
        { name: WORD, kind: WORD, cost: PARAGRAPH, tags: [WORD, ...many(40, (i) => `t${i}`)], uses: { value: 7, max: 1e9 }, text: `${WORD}\n\n${PARAGRAPH}` },
        ...many(500, (i) => ({ name: `Action ${i}`, kind: `Kind ${i % 3}`, cost: String(i), text: i % 100 === 0 ? PARAGRAPH : 'Hits hard.' })),
      ],
    },
    body: `# Notes of the very long-winded chronicler ${WORD}\n\n${PARAGRAPH}\n`,
  })
  project.updateBoard('main', { addNodes: [node.id] })
  project.setLayout({ [node.id]: { x: 100, y: 400 } })
  return node
}
