import { ALL_BOARD, SUMMARY_MAX } from '../../packages/core/src/schema'
import { test, expect } from './fixtures'
import type { Locator, Page } from '@playwright/test'

/** Native drag-and-drop does not complete under Xvfb, so dispatch the HTML5 events with a shared DataTransfer. */
async function dragOnto(page: Page, source: Locator, target: Locator, side: 'before' | 'after') {
  const data = await page.evaluateHandle(() => new DataTransfer())
  const box = await target.boundingBox()
  if (!box) throw new Error('Drop target has no bounds')
  const at = {
    clientX: side === 'after' ? box.x + box.width - 2 : box.x + 2,
    clientY: side === 'after' ? box.y + box.height - 2 : box.y + 2,
    dataTransfer: data,
  }
  await source.dispatchEvent('dragstart', { dataTransfer: data })
  await target.dispatchEvent('dragover', at)
  await target.dispatchEvent('drop', at)
  await source.dispatchEvent('dragend', { dataTransfer: data })
}

test('sidebar entries reorder by drag and drop within their section', async ({ desktop }) => {
  const { page, project } = desktop
  project.createNode({ type: 'character', title: 'Aldric' })
  project.createNode({ type: 'character', title: 'Bryn' })
  const hepipi = project.createNode({ type: 'character', title: 'Hepipi' })
  const sidebar = page.locator('[data-sidebar]')
  const row = (title: string) => sidebar.getByRole('button', { name: title, exact: true })
  await expect(row('Hepipi')).toBeVisible()
  await dragOnto(page, row('Hepipi'), row('Aldric'), 'before')
  await expect.poll(() => project.listNodes({ type: 'character' }).map((n) => n.title)).toEqual(['Hepipi', 'Aldric', 'Bryn'])
  const rows = sidebar.locator(`[data-row]`).filter({ hasText: /^(Aldric|Bryn|Hepipi)$/ })
  await expect(rows).toHaveText(['Hepipi', 'Aldric', 'Bryn'])
  expect(project.getNode(hepipi.id)?.order).toBe(1)
})

test('canvases reorder by dragging their tabs', async ({ desktop }) => {
  const { page, project } = desktop
  project.createBoard({ title: 'Second' })
  const tabs = page.getByRole('tablist', { name: 'Boards' })
  await expect(tabs.getByRole('tab', { name: 'Second' })).toBeVisible()
  await dragOnto(page, tabs.getByRole('tab', { name: 'Second' }), tabs.getByRole('tab', { name: 'Main' }), 'before')
  await expect.poll(() => project.boards().map((b) => b.title)).toEqual(['Second', 'Main'])
  await expect(tabs.getByRole('tab')).toHaveText(['All', 'Second', 'Main'])
})

test('the All canvas shows every node and cannot be edited', async ({ desktop }) => {
  const { page, project, ids } = desktop
  const extra = project.createNode({ type: 'character', title: 'Off board' })
  const tabs = page.getByRole('tablist', { name: 'Boards' })
  await tabs.getByRole('tab', { name: 'All' }).click()
  for (const id of [...ids, extra.id]) await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rename board' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Delete board' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Add node (A or right-click canvas)' })).toBeHidden()
  const before = JSON.stringify(project.graph())
  const card = page.locator(`.react-flow__node[data-id="${ids[0]}"]`)
  await card.click()
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 220, box.y + 200, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.press('Delete')
  await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 20, y: 400 } })
  await expect(page.getByRole('menu')).toHaveCount(0)
  expect(await card.boundingBox()).toEqual(box)
  expect(JSON.stringify(project.graph())).toBe(before)
  expect(project.boards().some((b) => b.id === ALL_BOARD)).toBe(false)
})

test('cards render a maximum-length summary in full', async ({ desktop }) => {
  const { page, project, ids } = desktop
  const summary =
    'A weathered hall where the old guild met, its rafters scarred by fire, its floor worn smooth by boots; now home to smugglers and a very patient ghost.'
      .padEnd(SUMMARY_MAX, '!')
      .slice(0, SUMMARY_MAX)
  project.updateNode(ids[0], { summary })
  const text = page.locator(`.react-flow__node[data-id="${ids[0]}"] [data-card-summary]`)
  await expect(text).toHaveText(summary)
  // Not clipped: the element's full content height is visible.
  expect(await text.evaluate((el) => el.scrollHeight <= el.clientHeight && getComputedStyle(el).webkitLineClamp === 'none')).toBe(true)
  const box = (await text.boundingBox())!
  const card = (await page.locator(`.react-flow__node[data-id="${ids[0]}"]`).boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(card.y + card.height)
})
