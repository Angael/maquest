import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures'

test('live notes save to live-notes.md and toggle with Ctrl+J', async ({ desktop }) => {
  const { page, project } = desktop
  await page.keyboard.press('ControlOrMeta+j')
  const panel = page.getByRole('region', { name: 'Live notes' })
  await panel.locator('.cm-content').click()
  await page.keyboard.type('Goblin stole the key')
  const file = path.join(project.root, 'live-notes.md')
  await expect.poll(() => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')).toBe('Goblin stole the key')
  // Edits from outside (an agent, git) show up while the panel is idle.
  await page.locator('.react-flow__pane').click()
  project.setLiveNotes('Handled by agent')
  await expect(panel.locator('.cm-content')).toHaveText('Handled by agent')
  await page.keyboard.press('ControlOrMeta+j')
  await expect(panel).toBeHidden()
  await page.getByRole('button', { name: /Live notes/ }).click()
  await expect(panel).toBeVisible()
  // Dragging the top-left corner grows the panel up and left.
  const before = (await panel.boundingBox())!
  await page.mouse.move(before.x + 2, before.y + 2)
  await page.mouse.down()
  await page.mouse.move(before.x - 60, before.y - 40, { steps: 4 })
  await page.mouse.up()
  const after = (await panel.boundingBox())!
  expect(after.width).toBeGreaterThan(before.width + 40)
  expect(after.height).toBeGreaterThan(before.height + 20)
})

test('switching views keeps the canvas viewport and selection', async ({ desktop }) => {
  const { page, ids } = desktop
  const viewport = page.locator('.react-flow__viewport')
  await page.locator(`.react-flow__node[data-id="${ids[0]}"]`).click()
  await page.getByRole('button', { name: 'Zoom Out' }).click()
  await page.waitForTimeout(300)
  const before = await viewport.getAttribute('style')
  await page.getByRole('button', { name: 'Backlog', exact: true }).click()
  await page.getByRole('button', { name: 'Canvas', exact: true }).click()
  expect(await viewport.getAttribute('style')).toBe(before)
  await expect(page.locator(`.react-flow__node[data-id="${ids[0]}"]`)).toHaveClass(/selected/)
})

test('a board chip in the inspector opens that canvas on the node', async ({ desktop }) => {
  const { page, project, ids } = desktop
  project.createBoard({ title: 'Second', nodes: [ids[1]] })
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  await page.getByRole('button', { name: 'Second', exact: true }).click()
  await expect(page.getByRole('tablist', { name: 'Boards' }).getByRole('tab', { name: 'Second' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator(`.react-flow__node[data-id="${ids[0]}"]`)).toHaveCount(0)
  await expect(page.locator(`.react-flow__node[data-id="${ids[1]}"]`)).toHaveClass(/selected/)
  await page.getByRole('button', { name: 'Remove from Main' }).click()
  await expect.poll(() => project.board('main').nodes?.includes(ids[1])).toBe(false)
})

test('search ranks title matches first regardless of the previous query', async ({ desktop }) => {
  const { page, project } = desktop
  project.createNode({ type: 'note', title: 'Prawda dla DM', tags: ['sekrety'] })
  project.createNode({ type: 'character', title: 'Anselm' })
  await page.keyboard.press('ControlOrMeta+k')
  const input = page.getByPlaceholder('Search everything…')
  await input.fill('prawda')
  await expect(page.locator('[cmdk-item][aria-selected="true"]')).toContainText('Prawda dla DM')
  await input.fill('ansel')
  await expect(page.locator('[cmdk-item]').first()).toContainText('Anselm')
  await expect(page.locator('[cmdk-item][aria-selected="true"]')).toContainText('Anselm')
  await expect(page.locator('[cmdk-item]').filter({ hasText: 'Prawda dla DM' })).toHaveCount(0)
})

test('links in the body editor open on click', async ({ desktop }) => {
  const { page, project, ids } = desktop
  project.updateNode(ids[1], { body: `Go to [the hall](${ids[0]}).\n\nOr [[${ids[0]}]].` })
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  const editor = page.locator('.cm-content')
  await editor.locator('.cm-md-link', { hasText: 'the hall' }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Hall')

  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  // On the line being edited the raw [[id]] shows; Ctrl+click still follows it.
  await editor.locator('.cm-line').last().click()
  await editor
    .locator('.cm-md-link')
    .last()
    .click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Hall')
})

test('the caret stays visible on a new empty line', async ({ desktop }) => {
  const { page, ids } = desktop
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('Hello')
  await page.keyboard.press('Enter')
  const [caret, scroller] = await Promise.all([page.locator('.cm-cursor').first().boundingBox(), page.locator('.cm-scroller').boundingBox()])
  expect(caret!.x).toBeGreaterThanOrEqual(scroller!.x)
})

test('other views hide the canvas behind them', async ({ desktop }) => {
  const { page, ids } = desktop
  await page.getByRole('button', { name: 'Backlog', exact: true }).click()
  await expect(page.locator(`.react-flow__node[data-id="${ids[0]}"]`)).toBeHidden()
})

test('middle click opens nodes as inspector tabs', async ({ desktop }) => {
  const { page, ids } = desktop
  await page.locator(`.react-flow__node[data-id="${ids[0]}"]`).click()
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click({ button: 'middle', position: { x: 20, y: 20 } })
  const tabs = page.getByRole('tablist', { name: 'Open nodes' })
  await expect(tabs.getByRole('tab')).toHaveText(['Hall', 'Cellar'])
  await expect(tabs.getByRole('tab', { name: 'Cellar' })).toHaveAttribute('aria-selected', 'true')
  await tabs.getByRole('tab', { name: 'Hall' }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Hall')
  await page.getByRole('button', { name: 'Close Hall' }).click()
  await expect(tabs.getByRole('tab')).toHaveText(['Cellar'])
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Cellar')
})

test('typing bare list markers line by line keeps every line', async ({ desktop }) => {
  const { page, ids } = desktop
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click()
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  for (const n of ['1.', '2.', '3.']) {
    await page.keyboard.type(n)
    await page.keyboard.press('Enter')
  }
  await expect(editor).toContainText('1.')
  await expect(editor).toContainText('2.')
  await expect(editor).toContainText('3.')
})
