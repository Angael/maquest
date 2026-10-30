import { contextBridge, ipcRenderer, webUtils } from 'electron'

const bridge = {
  invoke: (method: string, args: unknown[]) => ipcRenderer.invoke('api', method, args),
  onChanged: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('project:changed', listener)
    return () => void ipcRenderer.removeListener('project:changed', listener)
  },
  onUpdateReady: (cb: (version: string) => void) => {
    const listener = (_e: unknown, version: string) => cb(version)
    ipcRenderer.on('update:ready', listener)
    return () => void ipcRenderer.removeListener('update:ready', listener)
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
  /** Absolute path of a File dropped from the OS. */
  pathForFile: (file: File) => webUtils.getPathForFile(file),
}

export type Bridge = typeof bridge

contextBridge.exposeInMainWorld('maquest', bridge)
