import path from 'node:path'
import { BrowserWindow, shell } from 'electron'

const players = new Map<string, BrowserWindow>()

/** Loads the renderer, optionally with query parameters (e.g. the player view of a map). */
export function loadRenderer(win: BrowserWindow, query: Record<string, string> = {}) {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    void win.loadURL(url.toString())
  } else void win.loadFile(path.join(import.meta.dirname, '../renderer/index.html'), { query })
}

/** Links from notes open in the system browser, never in an app window. */
export function externalLinks(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

/**
 * A plain window with only the players' view of a map: no GM tools and nothing the fog hides, so it can go on a
 * second screen or be shared. One window per map; opening it again focuses it.
 */
export function openPlayerWindow(id: string) {
  const open = players.get(id)
  if (open && !open.isDestroyed()) {
    if (open.isMinimized()) open.restore()
    open.focus()
    return
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 400,
    minHeight: 300,
    backgroundColor: '#0c0b0a',
    title: 'Maquest: players',
    autoHideMenuBar: true,
    icon: path.join(import.meta.dirname, '../../resources/icon.png'),
    webPreferences: { preload: path.join(import.meta.dirname, '../preload/index.mjs'), sandbox: false },
  })
  externalLinks(win)
  players.set(id, win)
  win.on('closed', () => players.delete(id))
  loadRenderer(win, { player: id })
}

/** Closes every player window (when the project closes or changes). */
export function closePlayerWindows() {
  for (const w of players.values()) if (!w.isDestroyed()) w.close()
  players.clear()
}
