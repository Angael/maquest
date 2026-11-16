import path from 'node:path'
import { shell, type BrowserWindow } from 'electron'

/** Loads the renderer (dev server or built files). */
export function loadRenderer(win: BrowserWindow) {
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
}

/** Links from notes open in the system browser, never in an app window. */
export function externalLinks(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
}
