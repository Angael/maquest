import { app, BrowserWindow, ipcMain } from 'electron'
import updater from 'electron-updater'

const { autoUpdater } = updater

/** Background update lifecycle as shown to the renderer; `from` is the running version, `to` the release being fetched. */
export type UpdateStatus =
  | { state: 'downloading'; from: string; to: string; percent: number }
  | { state: 'ready'; from: string; to: string }
  | { state: 'failed'; from: string; to: string; reason: string }

function send(status: UpdateStatus) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:status', status)
}

/** Checks GitHub Releases on launch, downloads in the background and installs on quit unless the user restarts sooner. */
export function setupUpdates() {
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())
  // Dev runs, the checkout launcher and e2e tests are not packaged. On Linux only the AppImage can replace itself;
  // tar.gz installs must be updated by hand, which the release notes and README point out.
  if (!app.isPackaged || (process.platform === 'linux' && !process.env.APPIMAGE)) return
  const from = app.getVersion()
  let to: string | undefined
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', ({ version }) => {
    to = version
    send({ state: 'downloading', from, to, percent: 0 })
  })
  autoUpdater.on('download-progress', ({ percent }) => {
    if (to) send({ state: 'downloading', from, to, percent })
  })
  autoUpdater.on('update-downloaded', ({ version }) => send({ state: 'ready', from, to: version }))
  autoUpdater.on('error', (err) => {
    console.error('Update failed:', err.message)
    // Only a failed download is worth surfacing; a failed check (offline, rate limit) stays silent.
    if (to) send({ state: 'failed', from, to, reason: err.message })
  })
  void autoUpdater.checkForUpdates().catch(() => {})
}
