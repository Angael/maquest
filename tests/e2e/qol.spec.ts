import { test, expect } from './fixtures'

const PALETTE = 'Search everything or type a command…'

test('the palette runs commands, searches text and creates nodes', async ({ desktop }) => {
  const { page, project, ids } = desktop
  project.updateNode(ids[1], { body: 'Water seeps past the rusted sluice gate.' })
  const input = page.getByPlaceholder(PALETTE)

  await page.keyboard.press('ControlOrMeta+k')
  await input.fill('keyboard shortcuts')
  await expect(page.locator('[cmdk-item][aria-selected="true"]')).toContainText('Keyboard shortcuts')
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.keyboard.press('ControlOrMeta+/')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('ControlOrMeta+/')
  await expect(dialog).toBeHidden()

  await page.keyboard.press('ControlOrMeta+k')
  await input.fill('sluice')
  const inText = page.locator('[cmdk-group]').filter({ hasText: 'In text' })
  await expect(inText.locator('[cmdk-item]')).toContainText('Cellar')
  await inText.locator('[cmdk-item]').first().click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Cellar')

  await page.keyboard.press('ControlOrMeta+k')
  await input.fill('Mira Vale')
  await page.locator('[cmdk-item]').filter({ hasText: 'New character “Mira Vale”' }).click()
  await expect.poll(() => project.listNodes().find((n) => n.title === 'Mira Vale')?.type).toBe('character')
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Mira Vale')
})

test('Alt+arrows walk back and forward through viewed nodes; Ctrl+number switches views', async ({ desktop }) => {
  const { page, ids } = desktop
  const title = page.getByRole('textbox', { name: 'Title' })
  await page.locator(`.react-flow__node[data-id="${ids[0]}"]`).click()
  await expect(title).toHaveValue('Hall')
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  await expect(title).toHaveValue('Cellar')
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(title).toHaveValue('Hall')
  await page.keyboard.press('Alt+ArrowRight')
  await expect(title).toHaveValue('Cellar')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(title).toHaveValue('Hall')

  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 300 } })
  await page.keyboard.press('ControlOrMeta+3')
  await expect(page.getByRole('button', { name: 'Backlog', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('ControlOrMeta+1')
  await expect(page.getByRole('button', { name: 'Canvas', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('the backlog filters by words and tags, and Ctrl+Z undoes there', async ({ desktop }) => {
  const { page, project } = desktop
  project.createNode({ type: 'idea', title: 'The innkeeper is the lost heir', tags: ['twist'] })
  project.createNode({ type: 'idea', title: 'A storm closes the pass' })
  project.createNode({ type: 'idea', title: 'Wolves follow the caravan' })
  await page.keyboard.press('ControlOrMeta+3')
  const ideas = page.getByRole('list', { name: 'Ideas' }).getByRole('listitem')
  await expect(ideas).toHaveCount(3)
  const filter = page.getByRole('searchbox', { name: 'Filter ideas' })
  await filter.fill('#twist')
  await expect(ideas).toHaveCount(1)
  await expect(ideas).toContainText('lost heir')
  await filter.fill('storm pass')
  await expect(ideas).toHaveCount(1)
  await filter.fill('dragons')
  await expect(page.getByText('No ideas match “dragons”.')).toBeVisible()
  await filter.press('Escape')
  await expect(ideas).toHaveCount(3)

  const capture = page.getByRole('textbox', { name: 'New idea' })
  await capture.fill('A bell rings at midnight')
  await capture.press('Enter')
  await expect(ideas).toHaveCount(4)
  await capture.press('Escape')
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => project.listNodes().some((n) => n.title === 'A bell rings at midnight')).toBe(false)
  await expect(ideas).toHaveCount(3)
})

test('the document footer counts words and steps to the next chapter', async ({ desktop }) => {
  const { page, project } = desktop
  const story = project.createNode({ type: 'story', title: 'Saga', template: false })
  project.createNode({ type: 'chapter', title: 'First light', parent: story.id, body: 'One two three four five.' })
  project.createNode({ type: 'chapter', title: 'Second wind', parent: story.id, body: 'Six seven.' })
  const sidebar = page.getByRole('complementary', { name: 'Project' })
  await sidebar.getByRole('button', { name: 'First light', exact: true }).click()
  const footer = page.locator('footer[aria-label="Document details"]')
  await expect(footer).toContainText('5 words')
  await footer.getByRole('button', { name: 'Next: Second wind' }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Second wind')
  await expect(footer).toContainText('2 words')

  await sidebar.getByRole('button', { name: 'Saga', exact: true }).click()
  await expect(footer).toContainText('7 words with its 2 chapters')
})

test('[[ suggests nodes to link and the tag field suggests project tags', async ({ desktop }) => {
  const { page, project, ids } = desktop
  project.updateNode(ids[0], { tags: ['haunted'] })
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Cellar')

  await page.locator('.cm-content').click()
  await page.keyboard.type('Stairs up to [[hal')
  const option = page.locator('.cm-tooltip-autocomplete li', { hasText: 'Hall' })
  await expect(option).toHaveAttribute('aria-selected', 'true')
  // CodeMirror ignores Enter for a moment after the list opens, so fast typing never picks by accident.
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await expect.poll(() => project.getNode(ids[1])?.body).toContain(`[[${ids[0]}]]`)

  await page.getByRole('combobox', { name: 'Tags' }).fill('hau')
  await page.getByRole('option', { name: 'haunted' }).click()
  await expect.poll(() => project.getNode(ids[1])?.tags).toEqual(['haunted'])
})

test('sidebar rows have a context menu and remember being collapsed', async ({ desktop }) => {
  const { page, project } = desktop
  const sidebar = page.getByRole('complementary', { name: 'Project' })
  await sidebar.getByRole('button', { name: 'Cellar', exact: true }).click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect.poll(() => project.listNodes().filter((n) => n.type === 'location').length).toBe(3)

  const section = sidebar.getByRole('button', { name: /^Locations/ })
  await section.click()
  await expect(section).toHaveAttribute('aria-expanded', 'false')
  await expect(sidebar.getByRole('button', { name: 'Hall', exact: true })).toBeHidden()
  await page.reload()
  await expect(sidebar.getByRole('button', { name: /^Locations/ })).toHaveAttribute('aria-expanded', 'false')
})

test('typing right before closing the project still saves', async ({ desktop }) => {
  const { page, project, ids } = desktop
  await page.locator(`.react-flow__node[data-id="${ids[0]}"]`).click()
  await page.locator('.cm-content').click()
  await page.keyboard.type('Dust on every shelf.')
  await page.getByRole('button', { name: /^Project:/ }).click()
  await page.getByRole('menuitem', { name: 'Close project' }).click()
  await expect(page.getByRole('button', { name: /Open folder/ }).first()).toBeVisible()
  expect(project.getNode(ids[0])?.body).toContain('Dust on every shelf.')
})
