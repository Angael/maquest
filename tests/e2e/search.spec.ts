import { test, expect } from './fixtures'

test('Ctrl+K searches entities and Enter jumps to the match', async ({ desktop }) => {
  const { page, ids } = desktop
  await page.keyboard.press('ControlOrMeta+k')
  const input = page.getByPlaceholder('Search everything…')
  await expect(input).toBeFocused()
  await input.fill('cellar')
  await expect(page.locator('[cmdk-item][aria-selected="true"]')).toContainText('Cellar')
  await page.keyboard.press('Enter')
  await expect(input).toBeHidden()
  await expect(page.locator(`.react-flow__node[data-id="${ids[1]}"]`)).toHaveClass(/selected/)
  await expect(page.getByRole('button', { name: 'Cellar', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('Ctrl+F opens a guideline and Escape closes the palette', async ({ desktop }) => {
  const { page } = desktop
  await page.keyboard.press('ControlOrMeta+f')
  const input = page.getByPlaceholder('Search everything…')
  await input.fill('screenplay')
  await expect(page.locator('[cmdk-item][aria-selected="true"]')).toContainText('Screenplay')
  await page.keyboard.press('Enter')
  await expect(page.locator('main input.font-serif')).toHaveValue('Screenplay')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(input).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()
})
