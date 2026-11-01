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
