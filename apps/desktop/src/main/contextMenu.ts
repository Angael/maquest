import fs from 'node:fs'
import path from 'node:path'
import { app, clipboard, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions, type Session } from 'electron'
import { editMenu, mediaRel, type EditAction, type EditItem } from './editMenu'
import { mediaPath } from './handlers'

/** App settings that live outside any project (userData/settings.json). */
type Settings = { spellcheck?: boolean }

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

function readSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as Settings
  } catch {
    return {}
  }
}

function writeSettings(patch: Settings) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch }, null, 2))
}

/** Applies the saved "Check spelling while typing" choice to a session (on by default, as in Chromium). */
export function applySpellcheck(session: Session) {
  session.setSpellCheckerEnabled(readSettings().spellcheck ?? true)
}

/**
 * The OS menu for text fields, selections, links and images. Maquest's own menus (cards, rows, tabs…) are drawn by the
 * renderer and cancel the DOM event, so Electron only reports right clicks nobody else handled.
 */
export function attachContextMenu(win: BrowserWindow) {
  const contents = win.webContents
  contents.on('context-menu', (_event, params) => {
    const items = editMenu(params, { spellcheck: contents.session.isSpellCheckerEnabled() })
    if (!items.length) return
    const run = (action: EditAction, arg?: string) => {
      switch (action) {
        case 'replace':
          return arg && contents.replaceMisspelling(arg)
        case 'learn':
          return arg && contents.session.addWordToSpellCheckerDictionary(arg)
        case 'spellcheck': {
          const on = !contents.session.isSpellCheckerEnabled()
          contents.session.setSpellCheckerEnabled(on)
          return writeSettings({ spellcheck: on })
        }
        case 'undo':
        case 'redo':
        case 'cut':
        case 'copy':
        case 'paste':
        case 'selectAll':
          return contents[action]()
        case 'search':
          return contents.send('menu:command', { command: 'search', text: arg })
        case 'openLink':
          return arg && void shell.openExternal(arg)
        case 'copyLink':
          return arg && void clipboard.writeText(arg.replace(/^mailto:/i, ''))
        case 'viewImage':
          return contents.send('menu:command', { command: 'viewImage', url: arg })
        case 'copyImage':
          return contents.copyImageAt(params.x, params.y)
        case 'revealImage':
          return arg && shell.showItemInFolder(mediaPath(mediaRel(arg)))
      }
    }
    const template = items.map(
      (item: EditItem): MenuItemConstructorOptions =>
        item.type === 'separator'
          ? { type: 'separator' }
          : item.type === 'checkbox'
            ? { type: 'checkbox', label: item.label, checked: item.checked, click: () => run(item.action) }
            : {
                label: item.label,
                enabled: item.enabled ?? true,
                accelerator: item.accelerator,
                registerAccelerator: false,
                click: () => run(item.action, item.arg),
              },
    )
    // Keyboard-opened menus (Menu key, Shift+F10) appear at the caret; mouse menus at the pointer.
    const at = params.menuSourceType === 'keyboard' ? { x: params.x, y: params.y } : {}
    Menu.buildFromTemplate(template).popup({ window: win, ...at })
  })
}
