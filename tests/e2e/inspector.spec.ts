import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures'

test('long summaries wrap in the inspector and stay on one line when edited', async ({ desktop }) => {
  const { page, project, ids } = desktop
  const summary = 'The old cellar floods every spring, and whoever holds the key to the sluice gate decides which families keep their stores.'
  project.updateNode(ids[1], { summary })
  const card = page.locator(`.react-flow__node[data-id="${ids[1]}"]`)
  await expect(card).toContainText('The old cellar floods')
  await card.click()
  const field = page.getByRole('textbox', { name: 'Summary' })
  await expect(field).toHaveValue(summary)
  const box = await field.boundingBox()
  expect(box && box.height).toBeGreaterThan(40)
  await field.press('ControlOrMeta+End')
  await field.press('Enter')
  await field.pressSequentially(' Dry.')
  await expect.poll(() => project.getNode(ids[1])?.summary).toBe(`${summary} Dry.`)
})

test('the body editor renders markdown inline and reveals syntax on the cursor line', async ({ desktop }) => {
  const { page, project, ids } = desktop
  project.updateNode(ids[1], { body: 'Leads to [[' + ids[0] + ']] and **wet** stones.\n\n- [ ] Drain it\n\nDone.' })
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  const editor = page.locator('.cm-content')
  const chip = editor.locator('.cm-md-node')
  await expect(chip).toHaveText('Hall')
  await expect(editor.locator('.cm-md-strong')).toHaveText('wet')
  await expect(editor.locator('.cm-line').first()).toHaveText('Leads to Hall and wet stones.')

  await editor.locator('.cm-md-task').click()
  await expect.poll(() => project.getNode(ids[1])?.body).toContain('- [x] Drain it')

  await editor.locator('.cm-line').last().click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('# Flooded')
  const heading = editor.locator('.cm-md-h1')
  await expect(heading).toHaveText('# Flooded')
  await page.keyboard.press('ArrowUp')
  await expect(heading).toHaveText('Flooded')
  await expect.poll(() => project.getNode(ids[1])?.body).toContain('# Flooded')

  await chip.click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Hall')
})

test('media opens full size in a zoomable viewer', async ({ desktop }) => {
  const { page, project, ids } = desktop
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  fs.mkdirSync(path.join(project.root, 'media'), { recursive: true })
  fs.writeFileSync(path.join(project.root, 'media', 'map.png'), png)
  project.updateNode(ids[1], { media: ['media/map.png'] })
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  await page.getByTitle('View full size').first().click()
  const viewer = page.locator('.yarl__root')
  await expect(viewer.locator('img.yarl__slide_image')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
})

test('markdown tables render as tables and show raw markdown while edited', async ({ desktop }) => {
  const { page, project, ids } = desktop
  project.updateNode(ids[1], { body: 'Stats:\n\n| STR | DEX |\n|---|---:|\n| 18 (+4) | **11** |\n\nEnd.' })
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  const editor = page.locator('.cm-content')
  const table = editor.locator('.cm-md-table table')
  await expect(table.locator('th')).toHaveText(['STR', 'DEX'])
  await expect(table.locator('td')).toHaveText(['18 (+4)', '11'])
  await expect(table.locator('td strong')).toHaveText('11')

  await table.locator('td').first().click()
  await expect(table).toBeHidden()
  await expect(editor).toContainText('| 18 (+4) | **11** |')
  await page.keyboard.press('ControlOrMeta+End')
  await expect(table).toBeVisible()
})

test('properties: tag chips, custom fields and Esc to close', async ({ desktop }) => {
  const { page, project, ids } = desktop
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  const tags = page.getByRole('textbox', { name: 'Tags' })
  await tags.fill('damp, dark')
  await tags.press('Enter')
  await expect.poll(() => project.getNode(ids[1])?.tags).toEqual(['damp', 'dark'])
  await tags.press('Backspace')
  await expect.poll(() => project.getNode(ids[1])?.tags).toEqual(['damp'])
  await page.getByRole('button', { name: 'Remove tag damp' }).click()
  await expect.poll(() => project.getNode(ids[1])?.tags).toEqual([])

  await page.getByRole('button', { name: 'Add property' }).click()
  await page.getByRole('menuitem', { name: 'Field…' }).click()
  await page.getByRole('textbox', { name: 'New field name' }).fill('smell')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'smell' })).toBeFocused()
  await page.keyboard.type('Mould')
  await expect.poll(() => project.getNode(ids[1])?.fields.smell).toBe('Mould')

  // The first Esc leaves the field, the second closes the inspector.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeHidden()
})
