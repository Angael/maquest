import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { UpdateStatus } from '../main/updater'

/** Saves pending edits before the window closes; the main process waits for the reply (with a timeout). */
let beforeClose: (() => Promise<unknown>) | null = null
ipcRenderer.on('app:before-close', () => {
  void Promise.resolve(beforeClose?.())
    .catch(() => {})
    .finally(() => ipcRenderer.send('app:close-ready'))
})

export type MenuCommand = { command: 'search'; text: string } | { command: 'viewImage'; url: string }

const bridge = {
  invoke: (method: string, args: unknown[]) => ipcRenderer.invoke('api', method, args),
  onChanged: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('project:changed', listener)
    return () => void ipcRenderer.removeListener('project:changed', listener)
  },
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => {
    const listener = (_e: unknown, status: UpdateStatus) => cb(status)
    ipcRenderer.on('update:status', listener)
    return () => void ipcRenderer.removeListener('update:status', listener)
  },
  platform: process.platform,
  appInfo: ipcRenderer.sendSync('app:info') as { version: string; packaged: boolean },
  window: (action: 'minimize' | 'toggleMaximize' | 'close' | 'isMaximized') => ipcRenderer.invoke('window', action) as Promise<boolean>,
  onMaximized: (cb: (maximized: boolean) => void) => {
    const listener = (_e: unknown, maximized: boolean) => cb(maximized)
    ipcRenderer.on('window:maximized', listener)
    return () => void ipcRenderer.removeListener('window:maximized', listener)
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
  /** Runs (and awaits) `cb` before the window closes, e.g. to flush debounced saves. One handler; a new one replaces it. */
  onBeforeClose: (cb: () => Promise<unknown>) => {
    beforeClose = cb
  },
  /** Commands from the native text menu that the renderer carries out (search the project, view an image). */
  onMenuCommand: (cb: (command: MenuCommand) => void) => {
    const listener = (_e: unknown, command: MenuCommand) => cb(command)
    ipcRenderer.on('menu:command', listener)
    return () => void ipcRenderer.removeListener('menu:command', listener)
  },
  /** Absolute path of a File dropped from the OS. */
  pathForFile: (file: File) => webUtils.getPathForFile(file),
}

export type Bridge = typeof bridge

contextBridge.exposeInMainWorld('maquest', bridge)
