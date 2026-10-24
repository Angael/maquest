import { test, expect } from './fixtures'

test('group selection, drag contents, rename, recolor and ungroup persist to disk', async ({ desktop }) => {
  const { page, project, ids } = desktop
  const card = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
  await card(ids[0]).click()
  await expect(card(ids[0])).toHaveClass(/selected/)
  await page.keyboard.press('ControlOrMeta+a')
  await expect(card(ids[0])).toHaveClass(/selected/)
  await expect(card(ids[1])).toHaveClass(/selected/)
  await page.keyboard.press('ControlOrMeta+g')
  await expect.poll(() => project.board().groups[0]?.nodes.toSorted()).toEqual(ids.toSorted())
  const group = project.board().groups[0]
  const header = page.locator(`.react-flow__node[data-id="group:${group.id}"] .group-handle`)
  await expect(header).toBeVisible()
  const before = project.board()
  const box = await header.boundingBox()
  if (!box) throw new Error('Group header has no bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => project.board().groups[0].x).not.toBe(group.x)
  const moved = project.board()
  const dx = moved.groups[0].x - group.x
  const dy = moved.groups[0].y - group.y
  for (const id of ids) {
    expect(moved.layout[id].x - before.layout[id].x).toBeCloseTo(dx)
    expect(moved.layout[id].y - before.layout[id].y).toBeCloseTo(dy)
  }
  await header.dblclick()
  await page.getByRole('textbox', { name: 'Group name' }).fill('Tavern')
  await page.getByRole('textbox', { name: 'Group name' }).press('Enter')
  await expect.poll(() => project.board().groups[0].title).toBe('Tavern')
  await page.getByRole('button', { name: 'Color emerald', exact: true }).click()
  await expect.poll(() => project.board().groups[0].color).toBe('emerald')
  await page.getByRole('button', { name: 'Ungroup Tavern', exact: true }).click()
  await expect.poll(() => project.board().groups).toEqual([])
  for (const id of ids) {
    await expect(card(id)).toBeVisible()
    expect(project.board().layout[id]).toEqual(moved.layout[id])
  }
})

test('external file edits appear on the canvas', async ({ desktop }) => {
  const { page, project, ids } = desktop
  project.updateNode(ids[0], { title: 'Renamed externally' })
  await expect(page.locator(`.react-flow__node[data-id="${ids[0]}"]`)).toContainText('Renamed externally')
})

test('canvas display controls switch modes and retain display preferences', async ({ desktop }) => {
  const { page } = desktop
  const view = page.getByRole('group', { name: 'Graph view mode' })
  const labels = page.getByRole('group', { name: 'When to show line names' })
  const references = page.getByRole('group', { name: 'How to show references' })
  await view.getByRole('button', { name: 'World / entities', exact: true }).click()
  await expect(view.getByRole('button', { name: 'World / entities', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await view.getByRole('button', { name: 'Everything', exact: true }).click()
  await labels.getByRole('button', { name: 'Always', exact: true }).click()
  await references.getByRole('button', { name: 'Lines', exact: true }).click()
  await page.reload()
  await expect(labels.getByRole('button', { name: 'Always', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(references.getByRole('button', { name: 'Lines', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await labels.getByRole('button', { name: 'On hover / focus', exact: true }).click()
  await references.getByRole('button', { name: 'Chips on cards', exact: true }).click()
  await expect(labels.getByRole('button', { name: 'On hover / focus', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(references.getByRole('button', { name: 'Chips on cards', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
