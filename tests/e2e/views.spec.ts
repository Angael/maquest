import { test, expect } from './fixtures'

test('captures an idea in the backlog, promotes it and deletes another', async ({ desktop }) => {
  const { page, project } = desktop
  await page.getByRole('button', { name: 'Backlog', exact: true }).click()
  await expect(page.getByText('No ideas yet')).toBeVisible()

  const capture = page.getByRole('textbox', { name: 'New idea' })
  await expect(capture).toBeFocused()
  await capture.fill('The innkeeper is the lost heir')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('textbox', { name: 'Details' })).toBeFocused()
  await page.keyboard.type('She hides the signet ring.')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(capture).toBeFocused()
  await expect.poll(() => project.listNodes().find((n) => n.type === 'idea')?.title).toBe('The innkeeper is the lost heir')
  const ideas = page.getByRole('list', { name: 'Ideas' })
  await expect(ideas).toContainText('She hides the signet ring.')

  await capture.fill('A storm closes the pass')
  await page.getByRole('button', { name: /Add idea/ }).click()
  await expect(ideas.getByRole('listitem')).toHaveCount(2)

  // Clicking an idea selects it in the inspector.
  await ideas.getByRole('button', { name: 'A storm closes the pass', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('A storm closes the pass')

  await ideas.getByRole('button', { name: 'Promote “The innkeeper is the lost heir”' }).click()
  await page.getByRole('menuitem', { name: 'Character' }).click()
  await expect.poll(() => project.listNodes().find((n) => n.title === 'The innkeeper is the lost heir')?.type).toBe('character')

  await ideas.getByRole('listitem').filter({ hasText: 'A storm closes the pass' }).hover()
  await ideas.getByRole('button', { name: 'Delete idea' }).click()
  await expect.poll(() => project.listNodes().some((n) => n.title === 'A storm closes the pass')).toBe(false)
  await expect(page.getByText('No ideas yet')).toBeVisible()
})

test('turns a guideline off and creates a custom one', async ({ desktop }) => {
  const { page, project } = desktop
  await page.getByRole('button', { name: 'Guidelines', exact: true }).click()
  await page.getByRole('button', { name: 'Theme', exact: true }).click()
  await page.getByRole('switch', { name: 'Theme: on' }).click()
  await expect.poll(() => project.guideline('theme')?.disabled).toBe(true)
  await expect(page.getByText('This guideline is off')).toBeVisible()
  await page.getByRole('button', { name: 'Turn on' }).click()
  await expect.poll(() => project.guideline('theme')?.disabled).toBeFalsy()

  await page.getByRole('button', { name: 'New guideline' }).click()
  await page.getByRole('textbox', { name: 'Guideline name' }).fill('Combat pacing')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect.poll(() => project.guideline('combat-pacing')?.source).toBe('custom')
  await expect(page.locator('main input.font-serif')).toHaveValue('Combat pacing')

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete guideline…' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => project.guideline('combat-pacing')).toBeNull()
})
