import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, session } from 'electron'
import { installCrashHandlers, logError, showCrash, watchRenderer } from './crash'
import { Project } from '@maquest/core'
import { handlers, mediaPath, openOnLaunch } from './handlers'
import { setupUpdates } from './updater'
import { externalLinks, loadRenderer } from './windows'
import { rememberWindowState, saveBeforeClose, savedWindowState } from './windowState'
import { applySpellcheck, attachContextMenu } from './contextMenu'

installCrashHandlers()

/** Startup steps the window doesn't need: a failure is logged and the app starts anyway. */
function step(where: string, run: () => void) {
  try {
    run()
  } catch (error) {
    logError(where, error)
  }
}

protocol.registerSchemesAsPrivileged([{ scheme: 'maquest-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])

function createWindow() {
  const saved = savedWindowState()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    ...saved.bounds,
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
  if (saved.maximized) win.maximize()
  externalLinks(win)
  rememberWindowState(win)
  saveBeforeClose(win)
  attachContextMenu(win)
  const sendMaximized = () => win.webContents.send('window:maximized', win.isMaximized())
  win.on('maximize', sendMaximized)
  win.on('unmaximize', sendMaximized)
  win.on('enter-full-screen', sendMaximized)
  win.on('leave-full-screen', sendMaximized)
  watchRenderer(
    win,
    () => loadRenderer(win),
    () => handlers.current()?.root,
  )
  loadRenderer(win)
}

async function start() {
  await app.whenReady()
  // The app is dark only; native menus and dialogs follow.
  nativeTheme.themeSource = 'dark'
  step('Setting up spellcheck', () => applySpellcheck(session.defaultSession))
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

  // Read synchronously by the preload, before the renderer starts.
  ipcMain.on('app:info', (event) => {
    event.returnValue = { version: app.getVersion(), packaged: app.isPackaged }
  })

  ipcMain.handle('api', (_e, method: keyof typeof handlers, args: unknown[]) => {
    const fn = handlers[method] as (...a: unknown[]) => unknown
    if (typeof fn !== 'function') throw new Error(`Unknown method ${String(method)}`)
    return fn(...args)
  })

  // `maquest <project-folder>` opens it directly; otherwise reopen the last used project.
  // A project that fails to open must not keep the window from showing: the start screen reports it instead.
  step('Choosing the project to open', () => {
    const arg = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-') && Project.isProject(a))
    const last = handlers.recent()[0]?.root
    if (arg) openOnLaunch(path.resolve(arg))
    else if (last) openOnLaunch(last)
  })

  // Updates first: a broken release must still be able to update itself to the fix.
  step('Setting up updates', setupUpdates)
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
}

start().catch(async (error: unknown) => {
  await showCrash('Maquest failed to start', error, { actions: ['quit'] })
  app.exit(1)
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
