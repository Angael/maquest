import { test, expect } from './fixtures'

test.use({
  prepare: {
    run: (project) => {
      project.setTypes({
        monster: {
          label: 'Monster',
          fields: [
            'role',
            { key: 'size', widget: 'subtitle' },
            { key: 'creature', widget: 'subtitle' },
            { key: 'ac', label: 'AC', widget: 'stat', required: true, badge: true },
            { key: 'hp', label: 'HP', widget: 'meter', required: true },
            { key: 'stress', widget: 'meter', style: 'dots', max: 6 },
            {
              key: 'scores',
              label: 'Ability scores',
              widget: 'scores',
              keys: ['str', 'dex'],
              labels: { str: 'STR', dex: 'DEX' },
              modifier: { base: 10, step: 2 },
            },
            { key: 'social', widget: 'scores', style: 'radar', keys: ['charm', 'guts', 'kindness'], max: 5 },
            { key: 'saves', label: 'Saving throws', widget: 'pairs', keys: ['con', 'wis'] },
          ],
          tabs: [
            { title: 'Stats', kind: 'fields', fields: ['size', 'creature', 'ac', 'hp', 'stress', 'scores', 'social', 'saves'] },
            { title: 'Actions', kind: 'cards' },
            { title: 'Lore' },
          ],
        },
      })
      const wight = project.createNode({
        type: 'monster',
        title: 'Wight',
        fields: {
          role: 'barrow guard',
          size: 'Medium',
          creature: 'undead',
          ac: { value: 14, note: 'studded leather' },
          hp: { value: 30, max: 82 },
          stress: 2,
          scores: { str: 15, dex: 14 },
          social: { charm: 1, guts: 5, kindness: 2 },
          saves: { wis: 3 },
        },
        body: '# Actions\n\n## Reactions\n### Parry {1/round}\nAdds 2 to its AC against one melee attack.\n\n# Lore\n\nServes the lord of the barrow.\n',
      })
      project.updateBoard('main', { addNodes: [wight.id] })
      project.setLayout({ [wight.id]: { x: 100, y: 400 } })
    },
  },
})

test('fields read as a sheet of widgets, edit through a form or a click, and cards open on hover', async ({ desktop }) => {
  const { page, project } = desktop
  const card = page.locator('.react-flow__node[data-id="wight"]')
  await expect(card.locator('[data-card-badges]')).toContainText('AC14')
  await card.click()

  // Fields no tab shows stay properties under the title.
  await expect(page.getByRole('textbox', { name: 'Role', exact: true })).toHaveValue('barrow guard')
  const tabs = page.getByRole('tablist', { name: 'Sheet' })
  await expect(tabs.getByRole('tab')).toHaveText(['Stats', 'Actions', 'Lore'])
  const sheet = page.locator('[data-field-sheet]')
  await expect(sheet).toContainText('Medium · undead')
  await expect(sheet).toContainText('studded leather')
  await expect(sheet).toContainText('+2') // STR 15 → +2
  await expect(sheet.getByRole('img', { name: /Social: charm 1, guts 5, kindness 2/ })).toBeVisible()
  await expect(sheet.getByRole('meter', { name: 'HP' })).toHaveAttribute('aria-valuenow', '30')

  // Meters set with a click.
  await sheet.getByRole('button', { name: 'Set Stress to 4' }).click()
  await expect.poll(() => project.getNode('wight')?.fields.stress).toBe(4)

  await page.getByRole('button', { name: 'Edit Stats' }).click()
  const ac = page.getByRole('textbox', { name: 'AC *', exact: true })
  await ac.fill('16')
  await expect.poll(() => project.getNode('wight')?.fields.ac).toEqual({ value: 16, note: 'studded leather' })
  await page.getByRole('textbox', { name: 'Saving throws' }).fill('WIS +4, CON 5')
  await page.getByRole('textbox', { name: 'Saving throws' }).press('Enter')
  await expect.poll(() => project.getNode('wight')?.fields.saves).toEqual({ wis: 4, con: 5 })
  await page.getByRole('button', { name: 'Done editing' }).click()

  // An agent edit shows up live in the open sheet.
  project.updateNode('wight', { fields: { hp: { value: 12 } } })
  await expect(sheet.getByRole('meter', { name: 'HP' })).toHaveAttribute('aria-valuenow', '12')

  await tabs.getByRole('tab', { name: 'Actions' }).click()
  const parry = page.locator('[data-card="Parry"]')
  await expect(parry).toContainText('1/round')
  await parry.hover()
  await expect(page.getByRole('dialog')).toContainText('Adds 2 to its AC')

  project.updateNode('wight', { edits: [{ find: '### Parry {1/round}', replace: '### Parry {1/round}\n### Life Drain {recharge 5–6}' }] })
  await expect(page.locator('[data-card="Life Drain"]')).toBeVisible()

  await tabs.getByRole('tab', { name: 'Lore' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' Hates sunlight.')
  await expect.poll(() => project.getNode('wight')?.body).toContain('Serves the lord of the barrow. Hates sunlight.\n')
  expect(project.getNode('wight')?.body).toContain('### Parry {1/round}')
})

test('the problems menu lists what Maquest detected, with quick fixes and ignore', async ({ desktop }) => {
  const { page, project, ids } = desktop
  project.createNode({ type: 'character', title: 'Loner' })
  project.updateNode(ids[0], { body: 'Stairs lead to [[attic]].' })
  project.updateNode('wight', { fields: { hp: null } })
  const trigger = page.locator('[data-problems]')
  await expect(trigger).toHaveAccessibleName(/Maquest detected 1 error, 2 warnings/)
  await trigger.click()
  const list = page.getByRole('list', { name: 'Issues' })
  await expect(list).toContainText('links to [[attic]], which does not exist')
  await expect(list).toContainText('is not on any board')
  await expect(list).toContainText('lacks HP')

  await list.getByRole('button', { name: 'Add to Main' }).click()
  await expect.poll(() => project.board('main').nodes).toContain('loner')
  await list.getByRole('button', { name: 'Remove link' }).click()
  await expect.poll(() => project.getNode(ids[0])?.body).toBe('Stairs lead to attic.')

  await list.getByRole('listitem').first().hover()
  await list.getByRole('button', { name: 'Ignore for Wight' }).click()
  await expect.poll(() => project.getNode('wight')?.checks?.off).toEqual(['field-missing'])
  await expect(page.getByText('Everything checks out.')).toBeVisible()
})
