import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

let mapId = ''

test.use({
  prepare: {
    run: (project) => {
      const map = project.createNode({ type: 'map', title: 'Old Mill' })
      mapId = map.id
      project.setLayout({ [map.id]: { x: 100, y: 400 } })
      project.editMap(map.id, [
        { op: 'grid', set: { cols: 20, rows: 12 } },
        { op: 'add', object: { kind: 'room', id: 'hall', x: 6, y: 6, shape: { type: 'rect', w: 8, h: 6 } } },
        { op: 'token', id: 'aria', set: { name: 'Aria', x: 4.5, y: 5.5, player: true } },
      ])
    },
  },
})

/** Screen position of a map point (cells), from the map frame's on-screen box. */
async function at(page: Page, x: number, y: number) {
  const frame = page.locator('[data-map-viewport] svg > g > rect').first()
  const box = (await frame.boundingBox())!
  return { x: box.x + (x / 20) * box.width, y: box.y + (y / 12) * box.height }
}

async function drag(page: Page, from: [number, number], to: [number, number], modifiers: { alt?: boolean } = {}) {
  const a = await at(page, ...from)
  const b = await at(page, ...to)
  if (modifiers.alt) await page.keyboard.down('Alt')
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
  await page.mouse.move(b.x, b.y, { steps: 4 })
  await page.mouse.up()
  if (modifiers.alt) await page.keyboard.up('Alt')
}

test('a map node opens in the editor, draws rooms, measures and follows agent edits live', async ({ desktop: { page, project } }) => {
  await page.getByRole('button', { name: 'Open map Old Mill' }).click()
  await expect(page.getByRole('img', { name: 'Map' })).toBeVisible()
  await expect(page.locator('[data-map-viewport] [data-id="hall"]')).toBeAttached()

  // Room tool: drag a rectangle, Alt-drag cuts a hole.
  await page.keyboard.press('r')
  await drag(page, [12, 2], [17, 8])
  await expect.poll(() => project.readMap(mapId).objects.filter((o) => o.kind === 'room').length).toBe(2)
  await drag(page, [3, 4], [5, 6], { alt: true })
  await expect.poll(() => project.readMap(mapId).objects.find((o) => o.kind === 'room' && o.op === 'subtract')?.id).toBeTruthy()
  const room = project.readMap(mapId).objects.find((o) => o.id === 'room1')!
  expect(room.kind === 'room' && room.shape).toEqual({ type: 'rect', w: 5, h: 6 })

  // Ruler over cells: three cells right is 15 ft.
  await page.keyboard.press('m')
  await drag(page, [8.5, 9.5], [11.5, 9.5])
  await expect(page.getByText(/^15 ft · 3 cells$/)).toBeVisible()

  // Select tool: dragging a player token with fog on reveals what it saw.
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')
  await page.getByRole('checkbox', { name: /Fog of war/ }).check()
  await expect.poll(() => project.readMap(mapId).fog.enabled).toBe(true)
  await drag(page, [4.5, 5.5], [7.5, 5.5])
  await expect.poll(() => project.readMap(mapId).tokens[0].x).toBe(7.5)
  expect(project.readMap(mapId).fog.explored.length).toBeGreaterThan(0)

  // An agent edit shows up without reopening anything.
  project.editMap(mapId, [{ op: 'add', object: { kind: 'label', id: 'sign', x: 10, y: 1, text: 'North gate' } }])
  await expect(page.locator('[data-map-viewport] [data-id="sign"]')).toHaveText('North gate')

  // Undo goes back through the map history.
  const before = project.readMap(mapId).objects.length
  await page.locator('[data-map-viewport] [data-id="sign"]').click()
  await page.keyboard.press('Delete')
  await expect.poll(() => project.readMap(mapId).objects.length).toBe(before - 1)
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-map-viewport] [data-id="sign"]')).toBeAttached()
})

test('layers in one group swap, like a town before and after a battle', async ({ desktop: { page, project } }) => {
  project.editMap(mapId, [
    { op: 'layer', name: 'Before', group: 'battle' },
    { op: 'layer', name: 'After', group: 'battle', visible: false },
    { op: 'add', object: { kind: 'label', id: 'calm', x: 3, y: 1, text: 'Market', layers: ['layer1'] } },
    { op: 'add', object: { kind: 'label', id: 'ruin', x: 3, y: 1, text: 'Ruins', layers: ['layer2'] } },
  ])
  await page.getByRole('button', { name: 'Open map Old Mill' }).click()
  await expect(page.locator('[data-map-viewport] [data-id="calm"]')).toBeAttached()
  await expect(page.locator('[data-map-viewport] [data-id="ruin"]')).toHaveCount(0)
  await page.getByRole('group', { name: 'Swap battle' }).getByRole('button', { name: 'After' }).click()
  await expect(page.locator('[data-map-viewport] [data-id="ruin"]')).toBeAttached()
  await expect(page.locator('[data-map-viewport] [data-id="calm"]')).toHaveCount(0)
  await expect.poll(() => project.readMap(mapId).layers.map((l) => l.visible)).toEqual([false, true])
})
