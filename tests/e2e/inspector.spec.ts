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
