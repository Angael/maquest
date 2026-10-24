import { spawnSync } from 'node:child_process'

const virtualDisplay = process.platform === 'linux' && process.env.MAQUEST_E2E_HEADED !== '1'
const command = virtualDisplay ? 'xvfb-run' : 'pnpm'
const args = [...(virtualDisplay ? ['-a', '-s', '-screen 0 1920x1080x24', 'pnpm'] : []), 'exec', 'playwright', 'test', ...process.argv.slice(2)]
const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
if (result.error) {
  console.error(virtualDisplay ? 'Desktop tests use an isolated display on Linux and need Xvfb. Install xvfb and rerun pnpm test:e2e.' : result.error.message)
}
process.exit(result.status ?? 1)
