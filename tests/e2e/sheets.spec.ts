import { test, expect } from './fixtures'

test.use({
  prepare: {
    run: (project) => {
      project.setTypes({ monster: { label: 'Monster', system: 'dnd-2024', tabs: [{ title: 'Actions', kind: 'abilities' }, { title: 'Lore' }] } })
      const wight = project.createNode({
        type: 'monster',
        title: 'Wight',
        stats: { size: 'Medium', creature: 'undead', ac: { value: 14, note: 'studded leather' }, hp: 82, scores: { str: 15, dex: 14 }, saves: { wis: 3 } },
        body: '# Actions\n\n## Reactions\n### Parry {1/round}\nAdds 2 to its AC against one melee attack.\n\n# Lore\n\nServes the lord of the barrow.\n',
      })
      project.updateBoard('main', { addNodes: [wight.id] })
      project.setLayout({ [wight.id]: { x: 100, y: 400 } })
    },
  },
})

test('a statblock reads as a sheet, edits through its form, and ability cards open on hover', async ({ desktop }) => {
  const { page, project } = desktop
  const card = page.locator('.react-flow__node[data-id="wight"]')
  await expect(card.locator('[data-card-stats]')).toContainText('AC14')
  await card.click()

  const tabs = page.getByRole('tablist', { name: 'Sheet' })
  await expect(tabs.getByRole('tab')).toHaveText(['Stats', 'Actions', 'Lore'])
  const block = page.locator('[data-statblock]')
  await expect(block).toContainText('Medium, undead')
  await expect(block).toContainText('studded leather')
  await expect(block).toContainText('+2') // STR 15 → +2

  await page.getByRole('button', { name: 'Edit statblock' }).click()
  const ac = page.getByRole('textbox', { name: 'AC *', exact: true })
  await ac.fill('16')
  await expect.poll(() => project.getNode('wight')?.stats?.ac).toEqual({ value: 16, note: 'studded leather' })
  await page.getByRole('textbox', { name: 'Saving throws' }).fill('WIS +4, CON 5')
  await page.getByRole('textbox', { name: 'Saving throws' }).press('Enter')
  await expect.poll(() => project.getNode('wight')?.stats?.saves).toEqual({ wis: 4, con: 5 })
  await page.getByRole('button', { name: 'Done editing' }).click()

  await tabs.getByRole('tab', { name: 'Actions' }).click()
  const parry = page.locator('[data-ability="Parry"]')
  await expect(parry).toContainText('1/round')
  await parry.hover()
  await expect(page.getByRole('dialog')).toContainText('Adds 2 to its AC')

  // An agent edit shows up live in the open sheet.
  project.updateNode('wight', { edits: [{ find: '### Parry {1/round}', replace: '### Parry {1/round}\n### Life Drain {recharge 5–6}' }] })
  await expect(page.locator('[data-ability="Life Drain"]')).toBeVisible()

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
  project.updateNode('wight', { stats: { hp: null } })
  const trigger = page.locator('[data-problems]')
  await expect(trigger).toHaveAccessibleName(/Maquest detected 1 error, 2 warnings/)
  await trigger.click()
  const list = page.getByRole('list', { name: 'Issues' })
  await expect(list).toContainText('links to [[attic]], which does not exist')
  await expect(list).toContainText('is not on any board')
  await expect(list).toContainText('statblock lacks HP')

  await list.getByRole('button', { name: 'Add to Main' }).click()
  await expect.poll(() => project.board('main').nodes).toContain('loner')
  await list.getByRole('button', { name: 'Remove link' }).click()
  await expect.poll(() => project.getNode(ids[0])?.body).toBe('Stairs lead to attic.')

  await list.getByRole('listitem').first().hover()
  await list.getByRole('button', { name: 'Ignore for Wight' }).click()
  await expect.poll(() => project.getNode('wight')?.checks?.off).toEqual(['stat-missing'])
  await expect(page.getByText('Everything checks out.')).toBeVisible()
})
