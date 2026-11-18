import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { useReactFlow } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  FileDown,
  FileText,
  FolderOpen,
  FolderSearch,
  GitBranch,
  History,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Maximize,
  NotebookPen,
  PanelLeft,
  Plus,
  Redo2,
  Search,
  SpellCheck,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { ALLOWED_PARENTS, refsOf, type StoryNode } from '@maquest/core/schema'
import { api } from '../lib/api'
import { queryClient, useBoard, useCurrent, useGraph, useGuidelines, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { useTypes } from '../lib/styles'
import { findSnippet, normalize, rankScored, type Snippet } from '../lib/search'
import { navigate, useNavigation } from '../lib/navigation'
import { travel } from '../lib/history'
import { useCreateNode } from '../lib/actions'
import { useLeaveProject } from '../lib/project'
import { exportManuscript } from '../lib/manuscript'
import { MOD } from '../lib/shortcuts'
import { Kbd, Shortcut } from './ui'
import { openNodeTab, preventMiddleDown } from '../lib/nodeLink'
import { syncProject } from './SyncToast'
import { VIEWS } from './TopBar'
import { FIT_VIEW } from './canvas/shared'

const close = () => useUI.getState().setPaletteOpen(false)

/** Ctrl+K / Ctrl+F: jump to any node, board or guideline, or run a command. Keyboard-driven, so it opens and closes without animation. */
export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || (key !== 'k' && key !== 'f')) return
      // Leave Ctrl+F to the markdown editor's own search.
      if (key === 'f' && event.target instanceof Element && event.target.closest('.cm-editor')) return
      event.preventDefault()
      const ui = useUI.getState()
      ui.setPaletteOpen(!ui.paletteOpen)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])
  // Mounted only while open, so every opening starts with an empty query.
  return open ? <Palette /> : null
}

const itemClass =
  'flex h-8 cursor-default items-center gap-2.5 rounded-md px-2 text-sm text-fg-muted select-none data-[selected=true]:bg-active data-[selected=true]:text-fg'
const groupClass =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle'

/** One row of the palette. */
type Entry = {
  value: string
  icon: ReactNode
  title: ReactNode
  detail?: ReactNode
  kind?: ReactNode
  shortcut?: string
  run: () => void
  /** Middle click (nodes open in a new inspector tab). */
  aux?: () => void
}
type Section = { heading: string; score: number; entries: Entry[] }

type PaletteCommand = { id: string; label: string; icon: LucideIcon; shortcut?: string; keywords?: string[]; run: () => void }

/** Text matches are listed only for queries this long, and at most this many. */
const TEXT_MIN = 3
const TEXT_MAX = 30
/** Node types the palette can create from a query. */
const CREATE_SKIP = new Set(['media', 'chapter', 'scene'])

function Palette() {
  const { data: nodes = [] } = useNodes()
  const { data: graph } = useGraph()
  const types = useTypes()
  const { data: guidelines = [] } = useGuidelines()
  const current = useBoard()
  const recent = useNavigation((s) => s.recent)
  const commands = useCommands()
  const create = useCreateFromPalette()
  const [search, setSearch] = useState('')
  // The highlighted item, remembered only for the query it was picked under.
  const [picked, setPicked] = useState({ search: '', value: '' })

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const titles = useMemo(() => new Map(nodes.map((n) => [n.id, n.title])), [nodes])
  /** Bodies, normalized once per change, for the full-text group. */
  const bodies = useMemo(() => nodes.map((n) => ({ node: n, text: normalize(n.body) })), [nodes])

  const goNode = (id: string) => {
    const ui = useUI.getState()
    close()
    if (byId.get(id)?.type === 'idea') {
      ui.setView('backlog')
      ui.select({ kind: 'node', id })
      return
    }
    if (byId.get(id)?.type === 'map') return ui.openMap(id)
    const board = current && refsOf(current, id).length ? current : graph?.boards.find((b) => refsOf(b, id).length)
    ui.focusNode(id, board?.id)
  }

  const nodeEntry = (n: StoryNode, prefix: string, detail: ReactNode = n.summary): Entry => {
    const S = types.of(n.type)
    return {
      value: `${prefix}:${n.id}`,
      icon: <S.icon size={14} style={{ color: S.color }} className="shrink-0" aria-hidden />,
      title: n.title,
      detail,
      kind: S.label,
      run: () => goNode(n.id),
      aux: () => {
        close()
        openNodeTab(n.id)
      },
    }
  }

  const query = search.trim()
  const sections: Section[] = []
  const recentNodes = query ? [] : recent.flatMap((id) => byId.get(id) ?? []).slice(0, 6)
  if (recentNodes.length) sections.push({ heading: 'Recent', score: 100, entries: recentNodes.map((n) => nodeEntry(n, 'recent')) })

  const entities = rankScored(nodes, search, (n) => [n.title, n.summary ?? '', ...n.tags])
  const shown = new Set(entities.map((e) => e.item.id))
  const hidden = new Set(recentNodes.map((n) => n.id))
  sections.push({
    heading: 'Entities',
    score: entities[0]?.score ?? 0,
    entries: entities.filter((e) => !hidden.has(e.item.id)).map((e) => nodeEntry(e.item, 'node')),
  })

  const ranked = rankScored(commands, search, (c) => [c.label, ...(c.keywords ?? [])])
  sections.push({
    heading: 'Commands',
    // Without a query, commands come after everything else.
    score: query ? (ranked[0]?.score ?? 0) : 0.9,
    entries: ranked.map(({ item: c }) => ({
      value: `command:${c.id}`,
      icon: <c.icon size={14} className="shrink-0 text-fg-subtle" aria-hidden />,
      title: c.label,
      shortcut: c.shortcut,
      run: () => {
        close()
        c.run()
      },
    })),
  })

  if (query.length >= TEXT_MIN) {
    const q = normalize(query)
    const matches: Entry[] = []
    for (const { node, text } of bodies) {
      if (matches.length >= TEXT_MAX) break
      if (shown.has(node.id) || !text.includes(q)) continue
      const snippet = findSnippet(node.body, query, titles)
      if (snippet) matches.push(nodeEntry(node, 'text', <SnippetText snippet={snippet} />))
    }
    sections.push({ heading: 'In text', score: 0.5, entries: matches })
  }

  const boards = rankScored(graph?.boards ?? [], search, (b) => [b.title])
  sections.push({
    heading: 'Boards',
    score: boards[0]?.score ?? 0,
    entries: boards.map(({ item: b }) => ({
      value: `board:${b.id}`,
      icon: <LayoutDashboard size={14} className="shrink-0 text-fg-subtle" aria-hidden />,
      title: b.title,
      kind: 'Board',
      run: () => {
        close()
        useUI.getState().setView('canvas')
        useUI.getState().setBoard(b.id)
      },
    })),
  })

  const guides = rankScored(guidelines, search, (g) => [g.title, g.id])
  sections.push({
    heading: 'Guidelines',
    score: guides[0]?.score ?? 0,
    entries: guides.map(({ item: g }) => ({
      value: `guideline:${g.id}`,
      icon: <BookMarked size={14} className="shrink-0 text-fg-subtle" aria-hidden />,
      title: g.title,
      kind: 'Guideline',
      run: () => {
        close()
        useUI.getState().setView('guidelines')
        useUI.getState().setGuideline(g.id)
      },
    })),
  })

  // "Create “query”" unless the query already names a node or clearly asks for a command.
  const exact = entities.some((e) => normalize(e.item.title) === normalize(query))
  if (query && !exact && (ranked[0]?.score ?? 0) < 8)
    sections.push({
      heading: 'Create',
      score: 0.1,
      entries: types.list
        .filter((t) => !CREATE_SKIP.has(t.id))
        .map((t) => ({
          value: `create:${t.id}`,
          icon: <Plus size={14} className="shrink-0" style={{ color: t.color }} aria-hidden />,
          title: (
            <>
              New {t.label.toLowerCase()} <span className="text-fg">“{query}”</span>
            </>
          ),
          kind: t.id === 'idea' ? 'Backlog' : t.label,
          run: () => {
            close()
            void create(t.id, query)
          },
        })),
    })

  const visible = sections.filter((s) => s.entries.length).toSorted((a, b) => b.score - a.score)
  const first = visible[0]?.entries[0]?.value ?? ''
  // A new query always highlights its best match.
  const selected = picked.search === search && picked.value ? picked.value : first

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[14vh]" onMouseDown={close}>
      <Command
        label="Search"
        loop
        shouldFilter={false}
        value={selected}
        onValueChange={(value) => setPicked({ search, value })}
        className="flex max-h-[min(560px,72vh)] w-[640px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl bg-panel shadow-[var(--shadow-popover)]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-fg-subtle" aria-hidden />
          <Command.Input
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Search everything or type a command…"
            className="h-12 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-faint focus-visible:outline-none!"
          />
        </div>
        <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1.5 [&_[cmdk-list-sizer]]:pt-0">
          <Command.Empty className="px-3 py-8 text-center text-sm text-fg-subtle">No matches for “{search}”</Command.Empty>
          {visible.map((section) => (
            <Command.Group key={section.heading} heading={section.heading} className={groupClass}>
              {section.entries.map((entry) => (
                <Command.Item
                  key={entry.value}
                  value={entry.value}
                  onSelect={entry.run}
                  onMouseDown={entry.aux ? preventMiddleDown : undefined}
                  onAuxClick={
                    entry.aux
                      ? (e) => {
                          if (e.button === 1) entry.aux!()
                        }
                      : undefined
                  }
                  className={itemClass}
                >
                  {entry.icon}
                  <span className="max-w-[60%] shrink-0 truncate">{entry.title}</span>
                  {entry.detail && <span className="min-w-0 flex-1 truncate text-xs text-fg-faint">{entry.detail}</span>}
                  {entry.shortcut && <Shortcut keys={entry.shortcut} className="ml-auto shrink-0 pl-2" />}
                  {entry.kind && <Kind>{entry.kind}</Kind>}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
        <div className="flex h-9 shrink-0 items-center gap-4 border-t border-line px-4 text-2xs text-fg-subtle" aria-hidden>
          <Hint keys={['↑', '↓']}>Navigate</Hint>
          <Hint keys={['↵']}>Open</Hint>
          <Hint keys={['Esc']}>Close</Hint>
          <span className="ml-auto text-fg-faint">Middle-click opens a node in a new tab</span>
        </div>
      </Command>
    </div>
  )
}

function SnippetText({ snippet }: { snippet: Snippet }) {
  return (
    <>
      {snippet.before}
      {snippet.match && <mark className="rounded-[2px] bg-accent-soft px-px text-fg-muted">{snippet.match}</mark>}
      {snippet.after}
    </>
  )
}

/** Creates a node named after the query where it can be seen: ideas in the backlog, maps in their tab, the rest on the canvas. */
function useCreateFromPalette() {
  const createOnCanvas = useCreateNode()
  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' })
  return async (type: string, title?: string) => {
    const ui = useUI.getState()
    try {
      if (type === 'idea') {
        const node = await api.createNode({ type: 'idea', title: title || 'New idea' })
        await refresh()
        ui.setView('backlog')
        ui.select({ kind: 'node', id: node.id })
        return
      }
      if (type === 'map') {
        const node = await api.createMap(title || 'New map')
        await refresh()
        ui.openMap(node.id)
        return
      }
      // New scenes and chapters go into the selected chapter or story (or next to the selected one).
      const nodes = queryClient.getQueryData<StoryNode[]>(['nodes']) ?? []
      const selected = ui.selection?.kind === 'node' ? nodes.find((n) => n.id === ui.selection!.id) : undefined
      const allowed = type === 'chapter' || type === 'scene' ? ALLOWED_PARENTS[type] : undefined
      const parent = !selected || !allowed ? undefined : allowed.includes(selected.type) ? selected.id : selected.type === type ? selected.parent : undefined
      if (ui.view !== 'canvas' && ui.view !== 'backlog') ui.setView('canvas')
      useUI.setState((s) => ({ hiddenNodes: s.hiddenNodes.filter((t) => t !== type), storyScope: null }))
      await createOnCanvas(type, { title: title || undefined, parent })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }
}

/** Everything the palette can run, for the current state (toggles say what they will do). */
function useCommands(): PaletteCommand[] {
  const types = useTypes()
  const flow = useReactFlow()
  const leave = useLeaveProject()
  const create = useCreateFromPalette()
  const { data: current } = useCurrent()
  const root = current?.root
  const { data: isRepo } = useQuery({ queryKey: ['app', 'isGitRepo', root], queryFn: () => api.isGitRepo(), enabled: !!root })
  const { data: nodes } = useNodes()
  const state = useUI(
    useShallow((s) => ({
      sidebarOpen: s.sidebarOpen,
      liveNotesOpen: s.liveNotesOpen,
      minimap: s.minimap,
      spellcheck: s.spellcheck,
      selected: s.selection?.kind === 'node' ? s.selection.id : null,
    })),
  )
  const ui = useUI.getState()
  const selected = state.selected ? nodes?.find((n) => n.id === state.selected) : undefined
  const canBack = useNavigation((s) => s.back.length > 0)
  const canForward = useNavigation((s) => s.forward.length > 0)

  const list: PaletteCommand[] = [
    ...VIEWS.map((v, i) => ({
      id: `view:${v.id}`,
      label: `Go to ${v.label}`,
      icon: v.icon,
      shortcut: `${MOD}+${i + 1}`,
      keywords: ['view', 'switch', 'open'],
      run: () => useUI.getState().setView(v.id),
    })),
    ...types.list
      .filter((t) => t.id !== 'media')
      .map((t) => ({
        id: `new:${t.id}`,
        label: `New ${t.label.toLowerCase()}`,
        icon: Plus,
        keywords: ['create', 'add', t.plural],
        run: () => void create(t.id),
      })),
    ...(selected && (selected.type === 'story' || selected.type === 'chapter' || selected.type === 'scene')
      ? [
          {
            id: 'export',
            label: `Export “${selected.title}” as Markdown…`,
            icon: FileDown,
            keywords: ['manuscript', 'compile', 'save', 'download'],
            run: () => void exportManuscript(selected.id),
          },
        ]
      : []),
    { id: 'undo', label: 'Undo', icon: Undo2, shortcut: `${MOD}+Z`, run: () => travel('undo') },
    { id: 'redo', label: 'Redo', icon: Redo2, shortcut: `${MOD}+Shift+Z`, run: () => travel('redo') },
    ...(canBack ? [{ id: 'back', label: 'Back', icon: ArrowLeft, keywords: ['previous', 'history'], run: () => navigate(-1) }] : []),
    ...(canForward ? [{ id: 'forward', label: 'Forward', icon: ArrowRight, keywords: ['next', 'history'], run: () => navigate(1) }] : []),
    {
      id: 'sidebar',
      label: state.sidebarOpen ? 'Hide sidebar' : 'Show sidebar',
      icon: PanelLeft,
      shortcut: `${MOD}+B`,
      run: () => ui.setSidebarOpen(!state.sidebarOpen),
    },
    {
      id: 'live-notes',
      label: state.liveNotesOpen ? 'Hide live notes' : 'Show live notes',
      icon: NotebookPen,
      shortcut: `${MOD}+J`,
      run: () => ui.setLiveNotesOpen(!state.liveNotesOpen),
    },
    {
      id: 'minimap',
      label: state.minimap ? 'Hide minimap' : 'Show minimap',
      icon: MapIcon,
      keywords: ['canvas', 'overview'],
      run: () => ui.setMinimap(!state.minimap),
    },
    {
      id: 'fit',
      label: 'Fit canvas to screen',
      icon: Maximize,
      keywords: ['zoom', 'view', 'all'],
      run: () => {
        useUI.getState().setView('canvas')
        // After the canvas is visible again.
        requestAnimationFrame(() => void flow.fitView({ ...FIT_VIEW, duration: 300 }))
      },
    },
    {
      id: 'spellcheck',
      label: state.spellcheck ? 'Turn spellcheck off' : 'Turn spellcheck on',
      icon: SpellCheck,
      keywords: ['spelling', 'dictionary'],
      run: () => ui.setSpellcheck(!state.spellcheck),
    },
    { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, shortcut: `${MOD}+/`, keywords: ['keys', 'help'], run: () => ui.setShortcutsOpen(true) },
    { id: 'recent', label: 'Clear recent nodes', icon: History, keywords: ['history'], run: () => useNavigation.setState({ recent: [] }) },
    { id: 'reveal', label: 'Show project folder', icon: FolderSearch, keywords: ['files', 'finder', 'explorer'], run: () => void api.reveal() },
    ...(selected
      ? [{ id: 'file', label: `Open “${selected.title}” file`, icon: FileText, keywords: ['markdown', 'editor'], run: () => void api.openFile(selected.path) }]
      : []),
    { id: 'open', label: 'Open folder…', icon: FolderOpen, shortcut: `${MOD}+O`, keywords: ['project'], run: () => void leave(() => api.pickFolder()) },
    ...(isRepo
      ? [{ id: 'sync', label: 'Sync with git remote', icon: GitBranch, keywords: ['pull', 'push'], run: () => void syncProject({ manual: true }) }]
      : []),
    { id: 'close', label: 'Close project', icon: LogOut, run: () => void leave() },
  ]
  return list
}

const Kind = ({ children }: { children: ReactNode }) => <span className="ml-auto shrink-0 pl-2 text-2xs text-fg-faint">{children}</span>

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
      {children}
    </span>
  )
}
