import { useEffect, type CSSProperties } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useCurrent, useLiveProject, useNodes } from './lib/queries'
import { useUI } from './lib/store'
import { StartScreen } from './components/StartScreen'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'
import { Backlog } from './components/Backlog'
import { Guidelines } from './components/Guidelines'
import { Types } from './components/Types'
import { MapEditor } from './components/map/MapEditor'
import { MapList } from './components/map/MapList'
import { InspectorPanel } from './components/InspectorPanel'
import { CommandPalette } from './components/CommandPalette'
import { UpdateToast } from './components/UpdateToast'
import { SyncToast } from './components/SyncToast'
import { Toaster } from 'sonner'
import { ImageViewer, openImage } from './components/Lightbox'
import { ContextMenuHost } from './components/ContextMenu'
import { useDeleteShortcut } from './lib/deletion'
import { LiveNotesPanel } from './components/LiveNotes'
import { InspectorTabs } from './components/InspectorTabs'
import { TooltipProvider } from './components/ui'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { flushPending } from './lib/pending'
import { useHistoryShortcuts } from './lib/history'
import { useNavigationShortcuts } from './lib/navigation'
import './components/shell.css'

export function App() {
  return (
    <TooltipProvider>
      <UpdateToast />
      <Toaster theme="dark" position="bottom-right" gap={8} offset={16} className="maquest-toaster" style={{ '--width': '340px' } as CSSProperties} />
      <Main />
    </TooltipProvider>
  )
}

/** Views that show the node inspector next to them. */
const INSPECTOR_VIEWS = new Set(['canvas', 'backlog'])

function Main() {
  useLiveProject()
  useDeleteShortcut()
  useHistoryShortcuts()
  useNavigationShortcuts()
  // The main process asks before the window closes; unsaved typing is written first.
  useEffect(() => window.maquest.onBeforeClose(() => flushPending()), [])
  const { data: current, isLoading } = useCurrent()
  const view = useUI((s) => s.view)
  const selection = useUI((s) => s.selection)

  // Commands from the native text menu.
  useEffect(
    () =>
      window.maquest.onMenuCommand((c) => {
        if (c.command === 'search') useUI.getState().setPaletteOpen(true, c.text)
        else openImage(c.url)
      }),
    [],
  )

  if (isLoading) return null
  if (!current)
    return (
      <>
        <StartScreen />
        <ContextMenuHost />
      </>
    )

  return (
    <ReactFlowProvider>
      <WindowTitle project={current.config.name} />
      <SyncToast root={current.root} />
      <ImageViewer />
      <ShortcutsDialog />
      <ContextMenuHost />
      <div className="flex h-full flex-col bg-app">
        <CommandPalette />
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="relative min-w-0 flex-1 bg-app">
            {/* The canvas stays mounted so other views keep its viewport. */}
            <div
              className={view === 'canvas' ? 'absolute inset-0' : 'pointer-events-none invisible absolute inset-0 -z-10 [&_*]:invisible!'}
              aria-hidden={view !== 'canvas'}
            >
              <Canvas />
            </div>
            {view === 'backlog' && <Backlog />}
            {view === 'guidelines' && <Guidelines />}
            {view === 'types' && <Types />}
            {view === 'maps' && <MapList />}
            {view === 'map' && <MapEditor />}
            <LiveNotesPanel />
          </main>
          {selection && INSPECTOR_VIEWS.has(view) && (
            <InspectorPanel>
              <div className="flex min-h-0 w-full min-w-0 flex-col">
                <InspectorTabs />
                <Inspector key={`${selection.kind}:${selection.id}`} />
              </div>
            </InspectorPanel>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  )
}

const VIEW_TITLES: Record<string, string> = { canvas: 'Canvas', maps: 'Maps', backlog: 'Backlog', guidelines: 'Guidelines', types: 'Types' }

/** The OS window title (task switchers, docks): what is open, then the project. */
function WindowTitle({ project }: { project: string }) {
  const view = useUI((s) => s.view)
  const shown = useUI((s) => (s.view === 'map' ? s.map : s.selection?.kind === 'node' && INSPECTOR_VIEWS.has(s.view) ? s.selection.id : null))
  const { data: nodes } = useNodes()
  const title = (shown && nodes?.find((n) => n.id === shown)?.title) || VIEW_TITLES[view] || ''
  useEffect(() => {
    document.title = title ? `${title} — ${project}` : project
    return () => {
      document.title = 'Maquest'
    }
  }, [title, project])
  return null
}
