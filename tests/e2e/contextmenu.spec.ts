import { test, expect } from './fixtures'

test('right-clicking a card opens its menu without selecting it, and the status submenu saves', async ({ desktop }) => {
  const { page, project, ids } = desktop
  const card = page.locator(`.react-flow__node[data-id="${ids[0]}"]`)
  await card.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Card actions' })
  await expect(menu).toBeVisible()
  await expect(card).not.toHaveClass(/selected/)
  await expect(card).toHaveAttribute('data-context-target', '')
  await menu.getByRole('menuitem', { name: 'Status' }).hover()
  await page.getByRole('menuitemradio', { name: 'Draft' }).click()
  await expect.poll(() => project.getNode(ids[0])?.status).toBe('draft')
  await expect(menu).toBeHidden()
  await expect(card).not.toHaveAttribute('data-context-target')

  // Escape closes a menu without acting.
  await card.click({ button: 'right' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
})

test('sidebar rows rename in place from the menu and with F2', async ({ desktop }) => {
  const { page, project, ids } = desktop
  const row = page.locator(`[data-row="${ids[0]}"]`)
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const field = page.getByRole('textbox', { name: 'Name' })
  await expect(field).toBeFocused()
  await field.fill('Great hall')
  await field.press('Enter')
  await expect.poll(() => project.getNode(ids[0])?.title).toBe('Great hall')
  await expect(page.locator(`[data-row="${ids[0]}"]`)).toBeFocused()

  await page.keyboard.press('F2')
  await page.getByRole('textbox', { name: 'Name' }).fill('Ignored')
  await page.keyboard.press('Escape')
  await expect(page.locator(`[data-row="${ids[0]}"]`)).toContainText('Great hall')
  expect(project.getNode(ids[0])?.title).toBe('Great hall')
})

test('group frames have a menu to rename, recolor and ungroup', async ({ desktop }) => {
  const { page, project, ids } = desktop
  await page.locator(`.react-flow__node[data-id="${ids[0]}"]`).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+g')
  await expect.poll(() => project.board().groups.length).toBe(1)
  const group = project.board().groups[0]
  const header = page.locator(`.react-flow__node[data-id="group:${group.id}"] .group-handle`)
  await header.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const field = page.getByRole('textbox', { name: 'Group name' })
  await expect(field).toBeFocused()
  await field.fill('Keep')
  await field.press('Enter')
  await expect.poll(() => project.board().groups[0].title).toBe('Keep')
  await header.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Color' }).hover()
  await page.getByRole('menuitemradio', { name: 'Rose' }).click()
  await expect.poll(() => project.board().groups[0].color).toBe('rose')
  await header.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Ungroup' }).click()
  await expect.poll(() => project.board().groups).toEqual([])
})

test('board tabs have their own menu acting on the clicked board', async ({ desktop }) => {
  const { page, project } = desktop
  const tab = page.locator('[data-board-tab]').first()
  await tab.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  const field = page.getByRole('textbox', { name: 'Board name' })
  await expect(field).toBeFocused()
  await field.fill('Act one')
  await field.press('Enter')
  await expect.poll(() => project.board().title).toBe('Act one')
})

test('text fields keep the native edit menu instead of the app menu', async ({ desktop }) => {
  const { page, ids } = desktop
  await page.locator(`.react-flow__node[data-id="${ids[0]}"]`).click()
  const title = page.locator(`[data-node-title="${ids[0]}"]`)
  await title.click({ button: 'right' })
  await expect(page.locator('[data-context-menu]')).toHaveCount(0)
})
