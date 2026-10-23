import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import {
  Project,
  writeAgentFiles,
  type CreateNodeInput,
  type EdgeType,
  type EdgeHandle,
  type GuidelineScope,
  type NodeFilter,
  type ProjectConfig,
  type ProjectKind,
  type UpdateNodeInput,
} from '@maquest/core'
import { ProjectHistory } from './history'

let current: Project | null = null
let watcher: FSWatcher | null = null
let history = new ProjectHistory()

const recentFile = () => path.join(app.getPath('userData'), 'recent.json')

function readRecent(): string[] {
  try {
    return (JSON.parse(fs.readFileSync(recentFile(), 'utf8')) as string[]).filter((p) => Project.isProject(p))
  } catch {
    return []
  }
}

function pushRecent(root: string) {
  const list = [root, ...readRecent().filter((p) => p !== root)].slice(0, 10)
  fs.mkdirSync(path.dirname(recentFile()), { recursive: true })
  fs.writeFileSync(recentFile(), JSON.stringify(list, null, 2))
}

/** How agents launch the bundled MCP server: Electron's binary running as plain Node. */
export function mcpLaunch() {
  const script = app.isPackaged
    ? path.join(process.resourcesPath, 'mcp', 'index.js')
    : path.resolve(app.getAppPath(), '../../packages/mcp/dist/index.js')
  return { command: process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

function broadcast(channel: string, payload?: unknown) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

function watch(root: string) {
  void watcher?.close()
  let timer: NodeJS.Timeout | undefined
  watcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: (p) => /(^|[/\\])(node_modules|\.git)([/\\]|$)|\.tmp$/.test(p),
  })
  watcher.on('all', () => {
    clearTimeout(timer)
    timer = setTimeout(() => broadcast('project:changed'), 80)
  })
}

function openProject(root: string) {
  current = new Project(root)
  history = new ProjectHistory()
  writeAgentFiles(current.root, mcpLaunch())
  pushRecent(current.root)
  watch(current.root)
  return { root: current.root, config: current.config() }
}

function p(): Project {
  if (!current) throw new Error('No project open')
  return current
}

export const handlers = {
  // ---- app ----
  recent: () => readRecent().map((root) => ({ root, config: new Project(root).config() })),
  current: () => (current ? { root: current.root, config: current.config() } : null),
  open: (root: string) => openProject(root),
  close: () => {
    void watcher?.close()
    current = null
    history = new ProjectHistory()
  },
  /** Moves a project folder to the OS trash (recoverable) and drops it from the recent list. */
  trash: async (root: string) => {
    if (!Project.isProject(root)) throw new Error(`Not a Maquest project: ${root}`)
    if (current?.root === path.resolve(root)) handlers.close()
    await shell.trashItem(root)
    fs.writeFileSync(recentFile(), JSON.stringify(readRecent().filter((p) => p !== root), null, 2))
  },
  /** Folder picker; initializes the folder as a project if needed. */
  pickFolder: async (create?: { name: string; kind: ProjectKind }) => {
    const r = await dialog.showOpenDialog({
      title: create ? 'Choose a folder for the new project' : 'Open Maquest project',
      properties: ['openDirectory', 'createDirectory'],
    })
    const dir = r.filePaths[0]
    if (r.canceled || !dir) return null
    if (create || !Project.isProject(dir)) {
      // An empty folder (or one already named after the project) becomes the project itself; otherwise make a subfolder.
      const folder = create?.name.replace(/[/\\:]/g, '-')
      const useDir = !create || fs.readdirSync(dir).length === 0 || path.basename(dir) === folder
      const root = useDir ? dir : path.join(dir, folder!)
      if (create && !useDir && Project.isProject(root)) throw new Error(`A project already exists at ${root}`)
      Project.init(root, { name: create?.name ?? path.basename(dir), kind: create?.kind, mcp: mcpLaunch() })
      return openProject(root)
    }
    return openProject(dir)
  },
  reveal: (rel?: string) => {
    if (rel) shell.showItemInFolder(p().resolve(rel))
    else void shell.openPath(p().root)
  },
  mcpLaunch: () => mcpLaunch(),

  // ---- project ----
  config: () => p().config(),
  updateConfig: (patch: Partial<ProjectConfig>) => p().updateConfig(patch),
  listNodes: (filter?: NodeFilter) => p().listNodes(filter),
  getNode: (id: string) => p().getNode(id),
  createNode: (input: CreateNodeInput, position?: { x: number; y: number }) => history.record(p(), () => {
    const node = p().createNode(input)
    if (position) p().setLayout({ [node.id]: position })
    return node
  }),
  updateNode: (id: string, patch: UpdateNodeInput) => history.record(p(), () => p().updateNode(id, patch)),
  deleteNodes: (ids: string[], recursive?: boolean) => history.record(p(), () => ids.flatMap((id) =>
    p().getNode(id) ? p().deleteNode(id, { recursive }) : [])),
  reorder: (ids: string[]) => history.record(p(), () => p().reorder(ids)),
  outline: () => p().outline(),
  graph: () => p().graph(),
  addEdge: (e: { source: string; target: string; type?: EdgeType; label?: string; sourceHandle?: EdgeHandle; targetHandle?: EdgeHandle }) => history.record(p(), () => p().addEdge(e)),
  updateEdge: (id: string, patch: { type?: EdgeType; label?: string; source?: string; target?: string; sourceHandle?: EdgeHandle; targetHandle?: EdgeHandle }) => history.record(p(), () => p().updateEdge(id, patch)),
  removeEdge: (id: string) => history.record(p(), () => p().removeEdge(id)),
  setLayout: (pos: Record<string, { x: number; y: number }>) => history.record(p(), () => p().setLayout(pos)),
  history: () => { p(); return history.status() },
  undo: () => {
    const status = history.undo(p())
    broadcast('project:changed')
    return status
  },
  redo: () => {
    const status = history.redo(p())
    broadcast('project:changed')
    return status
  },
  guidelines: () => p().guidelines({ includeDisabled: true }),
  defaultGuideline: (id: string) => p().defaultGuideline(id),
  setGuideline: (id: string, patch: { title?: string; body?: string; scope?: GuidelineScope; disabled?: boolean }) =>
    p().setGuideline(id, patch),
  resetGuideline: (id: string) => p().resetGuideline(id),
  importMedia: (absPath: string) => p().importMedia(absPath),
  writeMedia: (name: string, data: Uint8Array) => p().writeMedia(name, data),
  listMedia: () => p().listMedia(),
}

export type Handlers = typeof handlers

export function mediaPath(rel: string) {
  return p().resolve(rel)
}
