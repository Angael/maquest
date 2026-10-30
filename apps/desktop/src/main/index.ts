import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'
import { Project } from '@maquest/core'
import { handlers, mediaPath } from './handlers'
import { setupUpdates } from './updater'

protocol.registerSchemesAsPrivileged([{ scheme: 'maquest-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0c0a09',
    title: 'Maquest',
    autoHideMenuBar: true,
    icon: path.join(import.meta.dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  // maquest-media://p/media/file.png -> <project>/media/file.png
  protocol.handle('maquest-media', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '')
    try {
      return net.fetch(pathToFileURL(mediaPath(rel)).toString(), { headers: req.headers })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })

  ipcMain.handle('api', (_e, method: keyof typeof handlers, args: unknown[]) => {
    const fn = handlers[method] as (...a: unknown[]) => unknown
    if (typeof fn !== 'function') throw new Error(`Unknown method ${String(method)}`)
    return fn(...args)
  })

  // `maquest <project-folder>` opens it directly; otherwise reopen the last used project.
  const arg = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-') && Project.isProject(a))
  const last = handlers.recent()[0]?.root
  if (arg) handlers.open(path.resolve(arg))
  else if (last) handlers.open(last)

  createWindow()
  setupUpdates()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
