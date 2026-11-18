import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { HARDCORE_ID, seedHardcore } from './hardcore'

test.use({ prepare: { run: seedHardcore } })

/** Set HARDCORE_SHOTS to a folder to save screenshots of each state for a visual check. */
const SHOTS = process.env.HARDCORE_SHOTS
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/**
 * What sticks out of `root` on the right, so it would scroll sideways or spill: elements, and text not clipped on the
 * way (truncated text is fine). Scroll areas meant to scroll and the canvas card's connection handles don't count.
 */
const overflowing = (root: Locator) =>
  root.evaluate((el) => {
    const edge = el.getBoundingClientRect().right + 1
    // Runs in the page, so it can't use helpers from this file.
    const skip = '[data-allow-scroll], .react-flow__handle'
    const clipped = (e: Element | null) => {
      for (let a = e; a && a !== el; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return true
      return false
    }
    const out: string[] = []
    for (const child of el.querySelectorAll('*')) {
      const r = child.getBoundingClientRect()
      if (r.width && r.right > edge && !child.closest(skip) && !clipped(child.parentElement))
        out.push(`${child.tagName.toLowerCase()}.${String(child.className).slice(0, 60)} → ${Math.round(r.right - edge)}px`)
    }
    const texts = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let t = texts.nextNode(); t; t = texts.nextNode()) {
      const range = document.createRange()
      range.selectNodeContents(t)
      const parent = t.parentElement!
      if (range.getBoundingClientRect().right > edge && !parent.closest(skip) && !clipped(parent))
        out.push(`"${t.textContent!.slice(0, 24)}" in ${parent.tagName.toLowerCase()}.${String(parent.className).slice(0, 60)}`)
    }
    const scrolls = getComputedStyle(el).overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1
    return [...out.slice(0, 10), ...(scrolls ? [`scrolls sideways by ${el.scrollWidth - el.clientWidth}px`] : [])]
  })

test('hardcore field data stays inside its widgets, and Maquest reports it', async ({ desktop }) => {
  const { page, project } = desktop
  await page.setViewportSize({ width: 1440, height: 900 })
  const card = page.locator(`.react-flow__node[data-id="${HARDCORE_ID}"]`)
  await expect(card).toBeVisible()
  await shot(page, 'canvas')

  // The card stays card-sized: a clamped title and summary, short number badges, nothing sticking out.
  const cardBox = (await card.boundingBox())!
  expect(cardBox.height).toBeLessThan(320)
  expect(await overflowing(card.locator('.story-card'))).toEqual([])
  await expect(card.locator('[data-card-badges]')).toContainText('Gold1.2e29')
  await expect(card.locator('[data-card-badges]')).toContainText('HP123M/988M')

  await card.click()
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  const sheet = page.locator('[data-field-sheet]')
  await expect(sheet).toBeVisible()
  await shot(page, 'sheet')
  expect(await overflowing(inspector)).toEqual([])

  // Numbers read short; the exact value is kept for hover.
  const stat = (name: string) => sheet.locator('[data-widget="stat"]').filter({ hasText: name })
  await expect(stat('Gold')).toContainText('1.2e29')
  await expect(stat('Weight')).toContainText('0.3')
  await expect(stat('Speed')).toContainText('−98.8M')
  // Styles that can't draw the value fall back to a bar.
  await expect(sheet.getByRole('meter', { name: 'Doom' })).toBeVisible()
  await expect(sheet.getByRole('meter', { name: 'Stress' })).toBeVisible()

  // Long text folds behind "Show more"; long lists show their first items and the rest on request.
  const dread = stat('Dread')
  await expect(dread.getByRole('button', { name: 'Show more' })).toBeVisible()
  const tall = (await dread.boundingBox())!.height
  await dread.getByRole('button', { name: 'Show more' }).click()
  expect((await dread.boundingBox())!.height).toBeGreaterThan(tall * 2)
  await dread.getByRole('button', { name: 'Show less' }).click()

  const tags = sheet.locator('[data-widget="tags"]')
  await expect(tags.locator('> span')).toHaveCount(30)
  await tags.getByRole('button', { name: '+122 more' }).click()
  await expect(tags.locator('> span')).toHaveCount(152)
  await expect(sheet.locator('[data-widget="list"] li')).toHaveCount(20)
  await expect(sheet.locator('[data-widget="table"] tbody tr')).toHaveCount(25)
  await sheet.getByRole('button', { name: 'Show all 401 rows' }).click()
  await expect(sheet.locator('[data-widget="table"] tbody tr')).toHaveCount(401)
  for (let y = 0; y < 6; y++) {
    await inspector.evaluate((el, at) => (el.scrollTop = at * 900), y)
    await shot(page, `sheet-${y}`)
  }
  expect(await overflowing(inspector)).toEqual([])

  // Records open with a page of 50, searchable across all of them.
  await page.getByRole('tablist', { name: 'Sheet' }).getByRole('tab', { name: 'Actions' }).click()
  const records = page.locator('[data-widget="records"]')
  await expect(records.locator('[data-record]')).toHaveCount(50)
  await records.getByRole('button', { name: 'Show 50 more of 451' }).click()
  await expect(records.locator('[data-record]')).toHaveCount(100)
  await records.getByRole('searchbox').fill('Action 499')
  await expect(records.locator('[data-record]')).toHaveText([/Action 499/])
  await records.getByRole('searchbox').fill('')
  await shot(page, 'actions')
  expect(await overflowing(inspector)).toEqual([])

  // The edit form stays inside the panel too.
  await page.getByRole('tablist', { name: 'Sheet' }).getByRole('tab', { name: 'Stats' }).click()
  await page.getByRole('button', { name: 'Edit Stats' }).click()
  await expect(page.locator('[data-field-form]')).toBeVisible()
  await shot(page, 'form')
  expect(await overflowing(inspector)).toEqual([])
  await page.getByRole('button', { name: 'Done editing' }).click()

  // Maquest reports what to shorten.
  const trigger = page.locator('[data-problems]')
  await trigger.click()
  const issues = page.getByRole('list', { name: 'Issues' })
  await expect(issues).toContainText('gold: 1.2345678901234568e+29 is too large to read')
  await expect(issues).toContainText('doom: max 400 is more than a clock can draw (12); use style bar')
  await expect(issues).toContainText('title is 304 chars (max 80)')
  await shot(page, 'problems')
  const rules = project.check().issues.filter((i) => i.node === HARDCORE_ID)
  expect(rules.filter((i) => i.rule === 'field-oversized').length).toBeGreaterThan(15)
  await page.keyboard.press('Escape')

  // The type's own page lists its long-labelled fields without spilling.
  await page.getByRole('button', { name: 'Types' }).click()
  await page.getByRole('button', { name: 'Monster 1 node' }).click()
  const fields = page.getByRole('list', { name: 'Defined fields' })
  await fields.scrollIntoViewIfNeeded()
  await shot(page, 'types')
  expect(await overflowing(fields.locator('xpath=ancestor::*[contains(@class,"overflow-y-auto")][1]'))).toEqual([])
})
