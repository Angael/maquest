/**
 * Screenshot harness: seeds a rich demo project ("The Ember Crown"), launches the built Electron app and captures the
 * important UI states as PNGs into $SHOTS_DIR (default .screenshots/current). Run with `pnpm screenshots`.
 *
 * Each state is captured independently; a failing selector is logged and the run continues. Selectors each state
 * depends on (update these after a redesign):
 *   setup        .react-flow__node (card presence), button "Fit View" (React Flow controls)
 *   01 start     TopBar button "Project: …" > menuitem "Close project"; text "Recent"
 *   02 canvas    Escape to clear selection, button "Fit View"
 *   03 scene     card .react-flow__node[data-id=<id>]; aside "Inspector"
 *   04 character card click; aside "Inspector"
 *   05 edge      button "Select connection: <label>" (FloatingEdge label); group "When to show line names" > "Always" fallback
 *   06 tabs      middle-click on cards; tablist "Open nodes"
 *   07 filter    button "Advanced" (aria-expanded) inside the top-right filter panel
 *   08 add menu  button[title^="Add node"] (aria-haspopup=menu); menu "Add node"
 *   09 context   right-click on a card; role=menu
 *   10 palette   Ctrl/Cmd+K; placeholder "Search everything…"
 *   11-13 views  TopBar nav buttons "Backlog" / "Guidelines" / "Types"; guideline list button by title; Types listitem "Clue"
 *   14 live      Ctrl/Cmd+J; region "Live notes"
 *   15 agent     TopBar button "Agent"
 *   16 boards    tablist "Boards" > tab "Act II: The Siege"
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { seedEmberCrown, seedRecents } from './seed'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(path.join(ROOT, 'apps/desktop/package.json'))
const OUT = path.resolve(ROOT, process.env.SHOTS_DIR ?? '.screenshots/current')
const SIZE = { width: 1440, height: 900 }

test('capture UI states', async ({ playwright }) => {
  fs.mkdirSync(OUT, { recursive: true })
  // A fixed folder keeps the paths shown on the start screen identical between runs.
  const temporary = path.join(os.tmpdir(), 'maquest-shots')
  fs.rmSync(temporary, { recursive: true, force: true })
  fs.mkdirSync(temporary, { recursive: true })
  const profile = path.join(temporary, 'profile')
  const { project, ids } = seedEmberCrown(path.join(temporary, 'the-ember-crown'))
  seedRecents(temporary, profile, project.root)
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL

  const failed: string[] = []
  const done: string[] = []
  let electron: ElectronApplication | undefined
  try {
    electron = await playwright._electron.launch({
      executablePath: require('electron'),
      args: [path.join(ROOT, 'apps/desktop'), ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : []), `--user-data-dir=${profile}`, project.root],
      env,
    })
    const page = await electron.firstWindow()
    await electron.evaluate(({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.unmaximize()
      win.setContentSize(size.width, size.height)
      win.center()
    }, SIZE)
    await page.setViewportSize(SIZE).catch(() => {})
    const card = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
    await expect(card(ids.s1.id)).toBeVisible({ timeout: 30_000 })
    await hideCaret(page)

    const shot = async (name: string, run: () => Promise<void>) => {
      try {
        await run()
        await settle(page)
        await page.screenshot({ path: path.join(OUT, `${name}.png`) })
        done.push(name)
      } catch (error) {
        failed.push(name)
        console.warn(`[screenshots] ${name} failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
      } finally {
        await reset(page)
      }
    }

    await shot('02-canvas', async () => {
      await fitView(page)
    })

    await shot('03-canvas-node-selected-inspector', async () => {
      await card(ids.s1.id).click({ position: { x: 40, y: 16 } })
      await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible()
    })

    await shot('04-inspector-character', async () => {
      await card(ids.vess.id).click({ position: { x: 40, y: 16 } })
      await expect(page.getByRole('complementary', { name: 'Inspector' }))
        .toContainText('Clear her family debt', { timeout: 5000 })
        .catch(() => {})
      await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible()
    })

    await shot('05-inspector-edge', async () => {
      const label = page.getByRole('button', { name: 'Select connection: old partners' })
      await card(ids.vess.id).click({ position: { x: 40, y: 16 } })
      if (!(await label.isVisible().catch(() => false))) {
        await page.getByRole('group', { name: 'When to show line names' }).getByRole('button', { name: 'Always', exact: true }).click()
      }
      await label.click()
      await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible()
    })
    // Restore the default line-name mode in case the fallback switched it.
    await page
      .getByRole('group', { name: 'When to show line names' })
      .getByRole('button', { name: 'On hover / focus', exact: true })
      .click()
      .catch(() => {})

    await shot('06-inspector-tabs', async () => {
      for (const id of [ids.vess.id, ids.maelis.id, ids.ash.id]) await card(id).click({ button: 'middle', position: { x: 40, y: 16 } })
      await card(ids.s2.id).click({ position: { x: 40, y: 16 } })
      await expect(page.getByRole('tablist', { name: 'Open nodes' }).getByRole('tab')).toHaveCount(4)
    })
    // Close the pinned tabs again so later shots start clean (the tab strip only renders while the inspector is open).
    await card(ids.s2.id)
      .click({ position: { x: 40, y: 16 } })
      .catch(() => {})
    for (const title of ['Vess Coldwater', 'Maelis of the Embers', 'Brother Ash']) {
      await page
        .getByRole('button', { name: `Close ${title}` })
        .click({ timeout: 2000 })
        .catch(() => {})
    }
    await reset(page)

    await shot('07-canvas-filter-advanced', async () => {
      await page.getByRole('button', { name: 'Advanced' }).click()
      await expect(page.getByRole('button', { name: 'Advanced' })).toHaveAttribute('aria-expanded', 'true')
    })
    // The panel keeps its own state; collapse it again.
    await page
      .getByRole('button', { name: 'Advanced', expanded: true })
      .click({ timeout: 2000 })
      .catch(() => {})

    await shot('08-canvas-add-menu', async () => {
      await page.getByTitle(/^Add node/).click()
      await expect(page.getByRole('menu', { name: 'Add node' })).toBeVisible()
    })

    await shot('09-canvas-context-menu', async () => {
      await card(ids.s2.id).click({ button: 'right', position: { x: 60, y: 40 } })
      await expect(page.getByRole('menu')).toBeVisible()
    })

    await shot('10-command-palette', async () => {
      await page.keyboard.press('ControlOrMeta+k')
      const input = page.getByPlaceholder('Search everything…')
      await expect(input).toBeVisible()
      await input.pressSequentially('ember', { delay: 20 })
    })

    await shot('11-backlog', async () => {
      await page.getByRole('button', { name: /^Backlog/ }).click()
      await expect(page.getByText('A heist inside the vault').first()).toBeVisible()
    })

    await shot('12-guidelines', async () => {
      await page.getByRole('button', { name: 'Guidelines', exact: true }).click()
      await page.getByRole('button', { name: /Ember Crown: tone & table rules/ }).click()
      await expect(page.getByText('hope survives').first()).toBeVisible()
    })

    await shot('13-types', async () => {
      await page.getByRole('button', { name: 'Types', exact: true }).click()
      await page.getByRole('listitem').filter({ hasText: 'Clue' }).first().click()
      await expect(page.getByRole('textbox', { name: 'Type name' })).toHaveValue('Clue')
    })

    await shot('14-live-notes', async () => {
      await page.keyboard.press('ControlOrMeta+j')
      await expect(page.getByRole('region', { name: 'Live notes' })).toContainText('Session 4')
    })

    await shot('15-agent-popover', async () => {
      await page.getByRole('button', { name: 'Agent', exact: true }).click()
      await expect(page.getByText('Work with your AI agent')).toBeVisible()
    })
    await page
      .getByRole('button', { name: 'Agent', exact: true })
      .click({ timeout: 2000 })
      .catch(() => {})

    await shot('16-board-tabs', async () => {
      await page.getByRole('tablist', { name: 'Boards' }).getByRole('tab', { name: 'Act II: The Siege' }).click()
      await expect(card(ids.lantern.id)).toBeVisible()
      await fitView(page)
    })
    await page
      .getByRole('tablist', { name: 'Boards' })
      .getByRole('tab', { name: 'Main' })
      .click({ timeout: 2000 })
      .catch(() => {})

    // Last, so the project stays open for the canvas shots: close it to show the start screen with Recent entries.
    await shot('01-start-screen', async () => {
      await page.getByRole('button', { name: /^Project:/ }).click()
      await page.getByRole('menuitem', { name: 'Close project' }).click()
      await expect(page.getByText('Recent', { exact: true })).toBeVisible()
      await page.mouse.move(0, 0)
    })
  } finally {
    await electron?.close().catch(() => {})
    fs.rmSync(temporary, { recursive: true, force: true })
    console.log(`[screenshots] wrote ${done.length} file(s) to ${OUT}`)
    if (failed.length) console.warn(`[screenshots] failed: ${failed.join(', ')}`)
  }
})

async function hideCaret(page: Page) {
  await page.addStyleTag({ content: '* { caret-color: transparent !important; } .cm-cursor, .cm-dropCursor { display: none !important; }' })
}

/** Waits for fonts, transitions and React Flow to settle. */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.waitForTimeout(600)
}

async function fitView(page: Page) {
  await page.getByRole('button', { name: 'Fit View' }).click({ timeout: 3000 })
  await page.waitForTimeout(500)
}

/** Back to a neutral state: canvas view, no popovers, nothing selected. */
async function reset(page: Page) {
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape')
  await page
    .getByRole('button', { name: 'Canvas', exact: true })
    .click({ timeout: 2000 })
    .catch(() => {})
  await page
    .getByRole('button', { name: 'Close', exact: true })
    .click({ timeout: 500 })
    .catch(() => {})
  await page
    .getByRole('button', { name: 'Close live notes' })
    .click({ timeout: 500 })
    .catch(() => {})
  await page.mouse.move(5, 300)
}
