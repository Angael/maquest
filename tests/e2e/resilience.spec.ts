import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test, expect } from '@playwright/test'
import { Project } from '../../packages/core/src/index'

const require = createRequire(path.resolve('apps/desktop/package.json'))

test('a project that fails to open on launch still starts the app and offers a prompt for the agent', async ({ playwright }) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-e2e-'))
  const profile = path.join(temporary, 'profile')
  const good = Project.init(path.join(temporary, 'good'), { name: 'Healthy project' })
  good.createNode({ type: 'location', title: 'Hall' })
  const broken = Project.init(path.join(temporary, 'broken'), { name: 'Broken project' })
  // A config an older or newer Maquest can't read: opening it throws.
  fs.writeFileSync(path.join(broken.root, 'maquest.json'), '{ "name": 42, "kind": "opera" }')
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'recent.json'), JSON.stringify([broken.root, good.root]))

  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const electron = await playwright._electron.launch({
    executablePath: require('electron'),
    args: [path.resolve('apps/desktop'), ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : []), `--user-data-dir=${profile}`],
    env,
  })
  try {
    const page = await electron.firstWindow()
    const problem = page.getByRole('heading', { name: 'Couldn’t open your last project' })
    await expect(problem).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Copy prompt for your agent' }).first().click()
    await expect.poll(() => electron.evaluate(({ clipboard }) => clipboard.readText())).toContain('gh issue create --repo Angael/maquest')
    expect(await electron.evaluate(({ clipboard }) => clipboard.readText())).toContain(broken.root)

    // The broken project stays listed (by folder name) and the healthy one still opens.
    await expect(page.getByRole('button', { name: /^broken/ })).toContainText('Can’t read settings')
    await page.getByRole('button', { name: /^Healthy project/ }).click()
    await expect(page.getByRole('button', { name: 'Project: Healthy project' })).toBeVisible()
  } finally {
    await electron.close()
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})
