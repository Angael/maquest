import { app, BrowserWindow, ipcMain } from 'electron'
import updater from 'electron-updater'

const { autoUpdater } = updater

/** Checks GitHub Releases on launch, downloads in the background and installs on quit unless the user restarts sooner. */
export function setupUpdates() {
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())
  // Dev runs, the checkout launcher and e2e tests are not packaged; tar.gz builds cannot update themselves.
  if (!app.isPackaged || (process.platform === 'linux' && !process.env.APPIMAGE)) return
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', ({ version }) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:ready', version)
  })
  autoUpdater.on('error', (err) => console.error('Update check failed:', err.message))
  void autoUpdater.checkForUpdates().catch(() => {})
}
