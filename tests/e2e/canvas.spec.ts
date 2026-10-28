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

test('boards are independent: remove keeps the entity, paste places a reference, duplicate copies', async ({ desktop }) => {
  const { page, project, ids } = desktop
  const card = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
  const main = project.board().id
  // Copy a reference, switch to a new board and paste it there.
  await card(ids[0]).click()
  await page.keyboard.press('ControlOrMeta+c')
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await page.getByRole('textbox', { name: 'New board name' }).fill('Arc')
  await page.getByRole('textbox', { name: 'New board name' }).press('Enter')
  await expect(page.getByRole('tab', { name: 'Arc' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  const pane = page.locator('.react-flow__pane')
  await pane.click({ button: 'right', position: { x: 300, y: 300 } })
  await page.getByRole('menuitem', { name: /Paste reference/ }).click()
  await expect(card(ids[0])).toBeVisible()
  expect(project.listNodes()).toHaveLength(2)
  expect(project.board('arc').nodes).toEqual([ids[0]])
  // Adding a node here does not add it to the first board.
  await pane.click({ button: 'right', position: { x: 120, y: 600 } })
  await page.getByRole('menuitem', { name: 'Character' }).click()
  await expect.poll(() => project.listNodes().length).toBe(3)
  const created = project.listNodes().find((n) => n.type === 'character')!.id
  expect(project.board(main).nodes).not.toContain(created)
  // Removing from this board keeps the entity and its place on the first board.
  await card(ids[0]).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Remove from board/ }).click()
  await expect.poll(() => project.board('arc').nodes).not.toContain(ids[0])
  expect(project.getNode(ids[0])).not.toBeNull()
  expect(project.board(main).nodes).toContain(ids[0])
  // Duplicate creates a new entity.
  await card(created).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Duplicate/ }).click()
  await expect.poll(() => project.listNodes().length).toBe(4)
  expect(project.board('arc').nodes).toHaveLength(2)
  // Copy and paste on the same board adds a second card for the same entity.
  await card(created).click()
  await page.keyboard.press('ControlOrMeta+c')
  await page.keyboard.press('ControlOrMeta+v')
  await expect(card(`${created}~2`)).toBeVisible()
  expect(project.listNodes()).toHaveLength(4)
  // Delete on the canvas removes only that card.
  await page.keyboard.press('Delete')
  await expect(card(`${created}~2`)).toHaveCount(0)
  await expect(card(created)).toBeVisible()
  expect(project.getNode(created)).not.toBeNull()
  // Delete in the sidebar deletes the entity.
  const copy = project.listNodes().find((n) => n.type === 'character' && n.id !== created)!.id
  await page
    .locator('[data-sidebar]')
    .getByRole('button', { name: project.getNode(copy)!.title, exact: true })
    .last()
    .click()
  await expect(page.locator('[data-sidebar]').getByRole('button', { pressed: true })).toHaveCount(1)
  await page.keyboard.press('Delete')
  await expect.poll(() => project.listNodes().length).toBe(3)
  expect(project.listNodes().filter((n) => n.type === 'character')).toHaveLength(1)
})

test('dragging a sidebar entry onto the canvas adds another card', async ({ desktop }) => {
  const { page, project, ids } = desktop
  const title = project.getNode(ids[0])!.title
  const pane = page.locator('.react-flow__pane')
  const box = await pane.boundingBox()
  if (!box) throw new Error('Canvas has no bounds')
  // Native drag-and-drop does not complete under Xvfb, so dispatch the HTML5 events with a shared DataTransfer.
  const data = await page.evaluateHandle(() => new DataTransfer())
  const at = { clientX: box.x + 60, clientY: box.y + 60, dataTransfer: data }
  await page.locator('[data-sidebar]').getByRole('button', { name: title, exact: true }).dispatchEvent('dragstart', { dataTransfer: data })
  await pane.dispatchEvent('dragover', at)
  await pane.dispatchEvent('drop', at)
  await expect.poll(() => project.board().nodes?.filter((key) => key.startsWith(ids[0])).length).toBe(2)
})

test('clicking a sidebar entry pans an off-screen card into view', async ({ desktop }) => {
  const { page, project, ids } = desktop
  const card = page.locator(`.react-flow__node[data-id="${ids[0]}"]`)
  const pane = page.locator('.react-flow__pane')
  const box = await pane.boundingBox()
  if (!box) throw new Error('Canvas has no bounds')
  // Middle-drag pans; push the card far off screen.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(box.x + box.width / 2 + 3000, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up({ button: 'middle' })
  await expect(card).not.toBeInViewport()
  await page
    .locator('[data-sidebar]')
    .getByRole('button', { name: project.getNode(ids[0])!.title, exact: true })
    .click()
  await expect(card).toBeInViewport()
  await expect(card).toHaveClass(/selected/)
})
