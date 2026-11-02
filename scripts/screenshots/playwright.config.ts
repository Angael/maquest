import { defineConfig } from '@playwright/test'

/** Screenshot harness (not part of `pnpm test:e2e`). Run with `pnpm screenshots`; output goes to $SHOTS_DIR. */
export default defineConfig({
  testDir: '.',
  testMatch: /capture\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  outputDir: '../../test-results/screenshots',
  reporter: 'list',
})
