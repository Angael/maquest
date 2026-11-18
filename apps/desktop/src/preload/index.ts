import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { UpdateStatus } from '../main/updater'

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
  window: (action: 'minimize' | 'toggleMaximize' | 'close' | 'isMaximized') => ipcRenderer.invoke('window', action) as Promise<boolean>,
  onMaximized: (cb: (maximized: boolean) => void) => {
    const listener = (_e: unknown, maximized: boolean) => cb(maximized)
    ipcRenderer.on('window:maximized', listener)
    return () => void ipcRenderer.removeListener('window:maximized', listener)
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
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
