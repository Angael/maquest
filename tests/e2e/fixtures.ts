import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { _electron } from '@playwright/test'
import { test as base, expect, type Page } from '@playwright/test'
import { Project } from '../../packages/core/src/index'

const require = createRequire(path.resolve('apps/desktop/package.json'))

export const test = base.extend<{ desktop: { page: Page; project: Project; ids: string[] } }>({
  desktop: async ({ playwright }, use, testInfo) => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-e2e-'))
    const project = Project.init(path.join(temporary, 'project'), { name: 'Playwright fixture' })
    const ids = ['Hall', 'Cellar'].map((title) => project.createNode({ type: 'location', title }).id)
    project.setLayout({ [ids[0]]: { x: 100, y: 100 }, [ids[1]]: { x: 450, y: 100 } })
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_RENDERER_URL
    let electron: Awaited<ReturnType<typeof _electron.launch>> | undefined
    try {
      electron = await playwright._electron.launch({
        executablePath: require('electron'),
        args: [
          path.resolve('apps/desktop'),
          ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : []),
          `--user-data-dir=${path.join(temporary, 'profile')}`,
          project.root,
        ],
        env,
      })
      const page = await electron.firstWindow()
      await page.context().tracing.start({ screenshots: true, snapshots: true })
      await expect(page.locator('.react-flow__node').filter({ hasText: 'Hall' })).toBeVisible()
      await use({ page, project, ids })
      if (testInfo.status !== testInfo.expectedStatus) {
        await page.screenshot({ path: testInfo.outputPath('failure.png') })
        await page.context().tracing.stop({ path: testInfo.outputPath('trace.zip') })
      } else await page.context().tracing.stop()
    } finally {
      await electron?.close()
      fs.rmSync(temporary, { recursive: true, force: true })
    }
  },
})

export { expect }
