import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import {
  Project,
  writeAgentFiles,
  entityOf,
  freeRefKey,
  onBoard,
  type CreateNodeInput,
  type EdgeType,
  type EdgeHandle,
  type GuidelineScope,
  type NodeFilter,
  type ProjectConfig,
  type ProjectKind,
  type UpdateNodeInput,
  type BoardPatch,
  type GroupInput,
  type GroupPatch,
  type LayoutExtras,
  type Position,
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
  const script = app.isPackaged ? path.join(process.resourcesPath, 'mcp', 'index.js') : path.resolve(app.getAppPath(), '../../packages/mcp/dist/index.js')
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
  /** Removes only the recent entry; project files are left untouched. */
  removeRecent: (root: string) => {
    fs.writeFileSync(
      recentFile(),
      JSON.stringify(
        readRecent().filter((p) => p !== root),
        null,
        2,
      ),
    )
  },
  /** Moves a project folder to the OS trash (recoverable) and drops it from the recent list. */
  trash: async (root: string) => {
    if (!Project.isProject(root)) throw new Error(`Not a Maquest project: ${root}`)
    if (current?.root === path.resolve(root)) handlers.close()
    await shell.trashItem(root)
    fs.writeFileSync(
      recentFile(),
      JSON.stringify(
        readRecent().filter((p) => p !== root),
        null,
        2,
      ),
    )
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
      const folder = create?.name.replaceAll(/[/\\:]/g, '-')
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
  createNode: (input: CreateNodeInput, position?: Position, board?: string, group?: string) =>
    history.record(p(), () => {
      const node = p().createNode(input)
      // A new node lands only on the board it was created from.
      if (position) p().setLayout({ [node.id]: position }, board, group ? { assign: { [node.id]: group } } : {})
      else p().updateBoard(p().board(board).id, { addNodes: [node.id] })
      return node
    }),
  /** Duplicates nodes (and edges among them) at an offset; one undo step. `ids` may be card keys. Returns the new ids. */
  duplicateNodes: (ids: string[], offset: Position, board?: string) =>
    history.record(p(), () => {
      const project = p()
      // The first selected card of each node decides where its copy lands.
      const cards = new Map<string, string>()
      for (const key of ids) if (!cards.has(entityOf(key))) cards.set(entityOf(key), key)
      const sources = [...cards.keys()].map((id) => project.getNode(id)).filter((n): n is NonNullable<typeof n> => !!n)
      const layout = project.board(board).layout
      const copies = new Map<string, string>()
      // Parents before children so copied children attach to copied parents.
      const depth = (n: (typeof sources)[number]): number =>
        n.parent && sources.some((s) => s.id === n.parent) ? 1 + depth(sources.find((s) => s.id === n.parent)!) : 0
      for (const n of sources.toSorted((a, b) => depth(a) - depth(b))) {
        const parent = n.parent && (copies.get(n.parent) ?? (project.getNode(n.parent) ? n.parent : undefined))
        const copy = project.createNode({
          type: n.type,
          title: n.title,
          body: n.body,
          parent: parent || undefined,
          status: n.status,
          summary: n.summary,
          tags: n.tags,
          pinned: n.pinned,
          media: n.media,
          src: n.src,
          fields: n.fields,
          clock: n.clock,
          template: false,
        })
        copies.set(n.id, copy.id)
        const at = layout[cards.get(n.id)!]
        const group = project.board(board).groups.find((g) => g.nodes.includes(cards.get(n.id)!))
        if (at) project.setLayout({ [copy.id]: { x: at.x + offset.x, y: at.y + offset.y } }, board, group ? { assign: { [copy.id]: group.id } } : {})
        else project.updateBoard(project.board(board).id, { addNodes: [copy.id] })
      }
      for (const e of project.graph().edges) {
        const source = copies.get(e.source)
        const target = copies.get(e.target)
        if (source && target) project.addEdge({ source, target, type: e.type, label: e.label, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })
      }
      return [...copies.values()]
    }),
  /**
   * Adds one more card per key (a reference to the same node) to a board, at an offset from where the key sits on
   * `from`. Never copies nodes. One undo step; returns the new card keys.
   */
  placeNodes: (keys: string[], offset: Position, board?: string, from?: string) =>
    history.record(p(), () => {
      const project = p()
      const target = project.board(board)
      const source = from ? project.board(from) : target
      const positions: Record<string, Position> = {}
      const unplaced: string[] = []
      for (const key of keys) {
        const id = entityOf(key)
        if (!project.getNode(id)) continue
        const at = source.layout[key]
        if (!at) {
          if (!onBoard(target, id)) unplaced.push(id)
          continue
        }
        positions[freeRefKey(target, id, new Set(Object.keys(positions)))] = { x: at.x + offset.x, y: at.y + offset.y }
      }
      if (Object.keys(positions).length) project.setLayout(positions, target.id)
      if (unplaced.length) project.updateBoard(target.id, { addNodes: unplaced })
      return [...Object.keys(positions), ...unplaced]
    }),
  updateNode: (id: string, patch: UpdateNodeInput) => history.record(p(), () => p().updateNode(id, patch)),
  deleteNodes: (ids: string[], recursive?: boolean) =>
    history.record(p(), () => ids.flatMap((id) => (p().getNode(id) ? p().deleteNode(id, { recursive }) : []))),
  reorder: (ids: string[]) => history.record(p(), () => p().reorder(ids)),
  outline: () => p().outline(),
  graph: () => p().graph(),
  addEdge: (e: { source: string; target: string; type?: EdgeType; label?: string; sourceHandle?: EdgeHandle; targetHandle?: EdgeHandle }) =>
    history.record(p(), () => p().addEdge(e)),
  updateEdge: (
    id: string,
    patch: { type?: EdgeType; label?: string; source?: string; target?: string; sourceHandle?: EdgeHandle; targetHandle?: EdgeHandle },
  ) => history.record(p(), () => p().updateEdge(id, patch)),
  removeEdge: (id: string) => history.record(p(), () => p().removeEdge(id)),
  setLayout: (pos: Record<string, Position>, board?: string, extras?: LayoutExtras) => history.record(p(), () => p().setLayout(pos, board, extras)),
  createGroup: (board: string, input: GroupInput) => history.record(p(), () => p().createGroup(board, input)),
  updateGroup: (board: string, id: string, patch: GroupPatch) => history.record(p(), () => p().updateGroup(board, id, patch)),
  deleteGroup: (board: string, id: string) => history.record(p(), () => p().deleteGroup(board, id)),
  createBoard: (input: { title: string; nodes?: string[]; phases?: string[] }) => history.record(p(), () => p().createBoard(input)),
  updateBoard: (id: string, patch: BoardPatch & { phase?: string }) => history.record(p(), () => p().updateBoard(id, patch)),
  reorderBoards: (ids: string[]) => history.record(p(), () => p().reorderBoards(ids)),
  deleteBoard: (id: string) => history.record(p(), () => p().deleteBoard(id)),
  history: () => {
    p()
    return history.status()
  },
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
  setGuideline: (id: string, patch: { title?: string; body?: string; scope?: GuidelineScope; disabled?: boolean }) => p().setGuideline(id, patch),
  resetGuideline: (id: string) => p().resetGuideline(id),
  importMedia: (absPath: string) => p().importMedia(absPath),
  writeMedia: (name: string, data: Uint8Array) => p().writeMedia(name, data),
  listMedia: () => p().listMedia(),
}

export type Handlers = typeof handlers

export function mediaPath(rel: string) {
  return p().resolve(rel)
}
