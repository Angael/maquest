import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  BookMarked,
  Check,
  ChevronDown,
  Copy,
  FolderOpen,
  FolderSearch,
  GitBranch,
  Lightbulb,
  LoaderCircle,
  LogOut,
  Map as MapIcon,
  Network,
  PanelLeft,
  Search,
  Shapes,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useCurrent, useNodes, useRecent } from '../lib/queries'
import { useUI, type View } from '../lib/store'
import { Button, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator, Popover, Separator, Shortcut, cn } from './ui'
import { Logo, TitleBar } from './TitleBar'
import { syncProject } from './SyncToast'
import { ProblemsMenu } from './Problems'
import { contextMenu } from './ContextMenu'
import { NodeMenu } from './menus/NodeMenu'

/** Modifier key label for shortcut hints. */
export const MOD = window.maquest.platform === 'darwin' ? '⌘' : 'Ctrl'

const VIEWS: { id: View; label: string; icon: typeof Network }[] = [
  { id: 'canvas', label: 'Canvas', icon: Network },
  { id: 'maps', label: 'Maps', icon: MapIcon },
  { id: 'backlog', label: 'Backlog', icon: Lightbulb },
  { id: 'guidelines', label: 'Guidelines', icon: BookMarked },
  { id: 'types', label: 'Types', icon: Shapes },
]

export function TopBar() {
  return (
    <TitleBar>
      <ProjectMenu />
      <SidebarToggle />
      <Separator vertical className="mx-0.5" />
      <ViewTabs />
      <div className="ml-auto flex items-center gap-1 pr-1">
        <ProblemsMenu />
        <SearchTrigger />
        <GitSyncButton />
        <AgentPopover />
      </div>
    </TitleBar>
  )
}

/** Forgets everything tied to the open project, so the next one (or the start screen) starts clean. */
function useLeaveProject() {
  const qc = useQueryClient()
  /** `open` switches to another project and resolves falsy when nothing changed (a cancelled folder picker); without it the project closes. */
  return async (open?: () => Promise<unknown>) => {
    if (open) {
      if (!(await open())) return
    } else await api.close()
    useUI.setState({ selection: null, selectedNodeIds: [], tabs: [], viewSelections: {}, guideline: null, board: 'main', storyScope: null })
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'app' })
    if (!open) qc.setQueryData(['app', 'current'], null)
    await qc.invalidateQueries({ queryKey: ['app'] })
  }
}

function ProjectMenu() {
  const { data: current } = useCurrent()
  const { data: recent } = useRecent()
  const leave = useLeaveProject()
  const others = recent?.filter((r) => r.root !== current?.root).slice(0, 6) ?? []
  return (
    <Menu
      trigger={
        <button
          type="button"
          aria-label={`Project: ${current?.config.name ?? ''}`}
          className="flex h-7 max-w-64 min-w-0 items-center gap-2 rounded-md pr-1.5 pl-1 text-sm font-medium text-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent transition-colors duration-100 hover:bg-hover data-[popup-open]:bg-active"
        >
          <Logo className="size-5 shrink-0" />
          <span className="truncate">{current?.config.name}</span>
          <ChevronDown size={14} className="shrink-0 text-fg-subtle" aria-hidden />
        </button>
      }
      className="w-64"
    >
      <MenuItem icon={FolderSearch} onClick={() => void api.reveal()}>
        Show in file manager
      </MenuItem>
      <MenuItem icon={FolderOpen} onClick={() => void leave(() => api.pickFolder())}>
        Open folder…
      </MenuItem>
      {others.length > 0 && (
        <>
          <MenuSeparator />
          <MenuLabel>Switch to</MenuLabel>
          {others.map((r) => (
            <MenuItem key={r.root} onClick={() => void leave(() => api.open(r.root))}>
              {r.config.name}
            </MenuItem>
          ))}
        </>
      )}
      <MenuSeparator />
      <MenuItem icon={LogOut} onClick={() => void leave()}>
        Close project
      </MenuItem>
    </Menu>
  )
}

function SidebarToggle() {
  const open = useUI((s) => s.sidebarOpen)
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        const ui = useUI.getState()
        ui.setSidebarOpen(!ui.sidebarOpen)
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])
  return (
    <IconButton
      icon={PanelLeft}
      label={open ? 'Hide sidebar' : 'Show sidebar'}
      shortcut={`${MOD}+B`}
      aria-expanded={open}
      aria-controls="project-sidebar"
      onClick={() => useUI.getState().setSidebarOpen(!open)}
    />
  )
}

const tabClass = (on: boolean) =>
  cn(
    'flex h-7 items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent transition-colors duration-100',
    on ? 'bg-active text-fg' : 'text-fg-subtle hover:bg-hover hover:text-fg',
  )

function ViewTabs() {
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const { data: nodes } = useNodes()
  const ideas = useMemo(() => nodes?.reduce((count, n) => count + (n.type === 'idea' ? 1 : 0), 0) ?? 0, [nodes])
  return (
    <nav aria-label="Views" className="flex min-w-0 items-center gap-0.5">
      {VIEWS.map(({ id, label, icon: Icon }) => {
        const on = view === id
        return (
          <span key={id} className="contents">
            <button type="button" aria-current={on ? 'page' : undefined} onClick={() => setView(id)} className={tabClass(on)}>
              <Icon size={14} aria-hidden className={on ? 'text-fg-muted' : undefined} />
              <span className="max-w-40 truncate">{label}</span>
              {id === 'backlog' && ideas > 0 && (
                <span className="tabular -mr-0.5 ml-0.5 rounded-[4px] bg-active px-1 text-2xs leading-4 text-fg-muted">{ideas}</span>
              )}
            </button>
            {id === 'maps' && <MapTabs />}
          </span>
        )
      })}
    </nav>
  )
}

/** One tab per open map, right after Maps; middle click or the cross closes it. */
function MapTabs() {
  const maps = useUI((s) => s.maps)
  const current = useUI((s) => (s.view === 'map' ? s.map : null))
  const { data: nodes } = useNodes()
  const titles = useMemo(() => new Map(nodes?.map((n) => [n.id, n.title])), [nodes])
  // Maps deleted on disk (or by an agent) lose their tab.
  useEffect(() => {
    if (!nodes) return
    for (const id of maps) if (!titles.has(id)) useUI.getState().closeMap(id)
  }, [maps, nodes, titles])
  return maps
    .filter((id) => titles.has(id))
    .map((id) => {
      const on = current === id
      const title = titles.get(id)!
      const open = maps.filter((m) => titles.has(m))
      const at = open.indexOf(id)
      const close = (ids: string[]) => ids.forEach((m) => useUI.getState().closeMap(m))
      const menu = () => (
        <NodeMenu id={id} open={() => useUI.getState().openMap(id)}>
          <MenuItem icon={X} onClick={() => close([id])}>
            Close
          </MenuItem>
          <MenuItem disabled={open.length < 2} onClick={() => close(open.filter((m) => m !== id))}>
            Close others
          </MenuItem>
          <MenuItem disabled={at >= open.length - 1} onClick={() => close(open.slice(at + 1))}>
            Close tabs to the right
          </MenuItem>
          <MenuItem onClick={() => close(open)}>Close all maps</MenuItem>
        </NodeMenu>
      )
      return (
        <div
          key={id}
          {...contextMenu(menu, { label: `${title} tab` })}
          className={cn(tabClass(on), 'group/tab gap-1 pr-0.5')}
          onAuxClick={(e) => e.button === 1 && useUI.getState().closeMap(id)}
          onMouseDown={(e) => e.button === 1 && e.preventDefault()}
        >
          <button
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => useUI.getState().openMap(id)}
            className="flex h-full min-w-0 items-center gap-1.5 outline-none"
          >
            <MapIcon size={14} aria-hidden className={cn('shrink-0', on ? 'text-accent-text' : undefined)} />
            <span className="max-w-36 truncate">{title}</span>
          </button>
          <IconButton
            icon={X}
            size="sm"
            label={`Close ${title}`}
            className={cn('size-5 opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100', on && 'opacity-100')}
            onClick={() => useUI.getState().closeMap(id)}
          />
        </div>
      )
    })
}

function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={() => useUI.getState().setPaletteOpen(true)}
      className="mr-1 flex h-7 w-52 items-center gap-2 rounded-md bg-app/60 pr-1.5 pl-2 text-sm text-fg-faint shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent transition-[box-shadow,color] duration-100 hover:text-fg-subtle hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
    >
      <Search size={14} aria-hidden />
      Search
      <Shortcut keys={`${MOD}+K`} className="ml-auto" />
    </button>
  )
}

/** Pulls and pushes the project's git repo on demand; hidden when the folder is not a git repo. */
function GitSyncButton() {
  const { data: current } = useCurrent()
  const root = current?.root
  const qc = useQueryClient()
  const { data: isRepo } = useQuery({ queryKey: ['app', 'isGitRepo', root], queryFn: () => api.isGitRepo(), enabled: !!root })
  const [syncing, setSyncing] = useState(false)
  if (!isRepo) return null
  return (
    <IconButton
      icon={syncing ? LoaderCircle : GitBranch}
      label={syncing ? 'Syncing with git remote…' : 'Sync with git remote'}
      aria-busy={syncing}
      className={cn(syncing && '[&_svg]:animate-spin')}
      onClick={() => {
        if (syncing) return
        setSyncing(true)
        void syncProject({ manual: true, isCurrent: () => qc.getQueryData<{ root: string } | null>(['app', 'current'])?.root === root }).finally(() =>
          setSyncing(false),
        )
      }}
    />
  )
}

const AGENT_FILES = ['.mcp.json', '.codex/config.toml', '.cursor/mcp.json', 'AGENTS.md']

function AgentPopover() {
  const { data: current } = useCurrent()
  const command = `cd "${current?.root ?? ''}" && claude`
  return (
    <Popover
      className="w-[360px]"
      trigger={
        <Button className="data-[popup-open]:bg-active data-[popup-open]:text-fg">
          <Bot size={16} aria-hidden />
          Agent
        </Button>
      }
    >
      <div className="space-y-3 p-3">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-fg">Work with your AI agent</h2>
          <p className="text-xs leading-5 text-fg-subtle">
            Start Claude Code, Codex or Cursor in this folder. It picks up the Maquest tools on its own, and every edit it makes shows up here live.
          </p>
        </div>
        <CopyCommand command={command} />
        <p className="text-2xs leading-4 text-fg-faint">
          Set up by{' '}
          {AGENT_FILES.map((f, i) => (
            <span key={f}>
              <code className="font-mono text-fg-subtle">{f}</code>
              {i < AGENT_FILES.length - 1 ? ', ' : ''}
            </span>
          ))}{' '}
          in the project folder.
        </p>
      </div>
    </Popover>
  )
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <div className="flex items-start gap-1 rounded-md bg-app py-1 pr-1 pl-2.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <code className="min-w-0 flex-1 py-1 font-mono text-xs leading-4 break-all text-fg-muted">{command}</code>
      <IconButton
        icon={copied ? Check : Copy}
        size="sm"
        label={copied ? 'Copied' : 'Copy command'}
        className={cn(copied && 'text-success hover:text-success')}
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setCopied(false), 1500)
          })
        }}
      />
    </div>
  )
}
