import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
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
    backgroundColor: '#161311',
    title: 'Maquest',
    autoHideMenuBar: true,
    // The renderer draws the title bar (app-integrated); macOS keeps its traffic lights inset into it.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 } } : {}),
    icon: path.join(import.meta.dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })
  // Links from notes open in the system browser, never in an app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const sendMaximized = () => win.webContents.send('window:maximized', win.isMaximized())
  win.on('maximize', sendMaximized)
  win.on('unmaximize', sendMaximized)
  win.on('enter-full-screen', sendMaximized)
  win.on('leave-full-screen', sendMaximized)
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

  ipcMain.handle('window', (event, action: 'minimize' | 'toggleMaximize' | 'close' | 'isMaximized') => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (action === 'minimize') win.minimize()
    else if (action === 'toggleMaximize') {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    } else if (action === 'close') win.close()
    return win.isMaximized()
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
