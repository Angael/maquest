import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain, screen, type BrowserWindow, type Rectangle } from 'electron'

export type WindowState = { bounds?: Rectangle; maximized?: boolean }

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')
const isRect = (r: unknown): r is Rectangle =>
  !!r && typeof r === 'object' && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite((r as Record<string, unknown>)[k]))

/** Overlap of two rectangles in px² (0 when they don't touch). */
const overlap = (a: Rectangle, b: Rectangle) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/**
 * Where the window was last time. Keeps the size but drops the position when too little of the window would land on
 * any current display (an unplugged monitor), so the OS centers it instead.
 */
export function savedWindowState(displays: readonly Rectangle[] = screen.getAllDisplays().map((d) => d.workArea)): WindowState {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as { bounds?: unknown; maximized?: unknown }
    if (!isRect(saved.bounds)) return { maximized: saved.maximized === true }
    const { x, y, width, height } = saved.bounds
    const visible = displays.some((d) => overlap(d, saved.bounds as Rectangle) >= Math.min(width * height, 160 * 120))
    return { bounds: visible ? { x, y, width, height } : ({ width, height } as Rectangle), maximized: saved.maximized === true }
  } catch {
    return {}
  }
}

/** Saves the window's normal (unmaximized) bounds and maximized state whenever it is about to close. */
export function rememberWindowState(win: BrowserWindow) {
  win.on('close', () => {
    try {
      const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() }
      fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
      fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2))
    } catch {
      /* Losing the window position is harmless. */
    }
  })
}

let quitting = false
app.on('before-quit', () => {
  quitting = true
})
const ready = new Map<number, () => void>()
ipcMain.on('app:close-ready', (event) => ready.get(event.sender.id)?.())

/**
 * Asks the renderer to save pending edits before the window closes (or the app quits), then closes for real. A renderer
 * that is gone or does not answer within `timeout` doesn't keep the window open.
 */
export function saveBeforeClose(win: BrowserWindow, timeout = 3000) {
  const contents = win.webContents
  let allowed = false
  let asked = false
  const finish = () => {
    if (allowed) return
    allowed = true
    ready.delete(contents.id)
    if (win.isDestroyed()) return
    if (quitting) app.quit()
    else win.close()
  }
  win.on('close', (event) => {
    if (allowed || contents.isDestroyed() || contents.isCrashed()) return
    event.preventDefault()
    // A cancelled quit (macOS) or a second click on close just waits for the first request.
    if (asked) return
    asked = true
    ready.set(contents.id, finish)
    setTimeout(finish, timeout)
    contents.send('app:before-close')
  })
  win.on('closed', () => ready.delete(contents.id))
}
