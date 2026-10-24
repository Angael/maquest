import { spawnSync } from 'node:child_process'

const virtualDisplay = process.platform === 'linux' && !process.env.DISPLAY
const command = virtualDisplay ? 'xvfb-run' : 'pnpm'
const args = [...(virtualDisplay ? ['-a', 'pnpm'] : []), 'exec', 'playwright', 'test', ...process.argv.slice(2)]
const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
if (result.error) {
  console.error(virtualDisplay ? 'Desktop tests need Xvfb on Linux without DISPLAY. Install xvfb and rerun pnpm test:e2e.' : result.error.message)
}
process.exit(result.status ?? 1)
