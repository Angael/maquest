import { test, expect } from './fixtures'

test('adds a custom type, restyles it with the icon picker and files a note under it', async ({ desktop }) => {
  const { page, project } = desktop
  await page.getByRole('button', { name: 'Types' }).click()
  await page.getByRole('textbox', { name: 'New type id' }).fill('Monster')
  await page.getByRole('button', { name: 'Add type' }).click()
  await expect.poll(() => project.types().find((t) => t.id === 'monster')?.dir).toBe('monsters')

  await page.getByRole('textbox', { name: 'Search icons' }).fill('skull')
  await page.getByRole('option', { name: 'skull', exact: true }).click()
  await page.getByRole('button', { name: 'Color #ef4444' }).click()
  await expect.poll(() => project.config().types?.monster).toEqual({ icon: 'skull', color: '#ef4444' })

  const name = page.getByRole('textbox', { name: 'Type name' })
  await name.fill('Beast')
  await name.blur()
  await expect.poll(() => project.type('monster').label).toBe('Beast')

  const note = project.createNode({ type: 'note', title: 'Ash Wraith' })
  project.updateNode(note.id, { type: 'monster' })
  await expect(page.locator('[data-sidebar]')).toContainText('Beasts')
  await expect(page.locator('[data-sidebar] [data-row="ash-wraith"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled()
})

test('renames a built-in type', async ({ desktop }) => {
  const { page, project } = desktop
  await page.getByRole('button', { name: 'Types' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Character' }).click()
  const plural = page.getByRole('textbox', { name: 'Type plural' })
  await plural.fill('Heroes')
  await plural.blur()
  await expect.poll(() => project.type('character').plural).toBe('Heroes')
  await expect(page.locator('[data-sidebar]')).toContainText('Heroes')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect.poll(() => project.config().types).toBeUndefined()
})
