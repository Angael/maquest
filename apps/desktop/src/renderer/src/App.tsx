import { ReactFlowProvider } from '@xyflow/react'
import { useCurrent, useLiveProject } from './lib/queries'
import { useUI } from './lib/store'
import { StartScreen } from './components/StartScreen'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'
import { Backlog } from './components/Backlog'
import { Guidelines } from './components/Guidelines'
import { Types } from './components/Types'
import { InspectorPanel } from './components/InspectorPanel'
import { CommandPalette } from './components/CommandPalette'
import { UpdateToast } from './components/UpdateToast'
import { SyncToast } from './components/SyncToast'
import { Toaster } from 'sonner'
import { ImageViewer } from './components/Lightbox'
import { useDeleteShortcut } from './lib/deletion'
import { LiveNotesPanel } from './components/LiveNotes'
import { InspectorTabs } from './components/InspectorTabs'

export function App() {
  return (
    <>
      <UpdateToast />
      <Toaster theme="dark" position="bottom-right" />
      <Main />
    </>
  )
}

function Main() {
  useLiveProject()
  useDeleteShortcut()
  const { data: current, isLoading } = useCurrent()
  const view = useUI((s) => s.view)
  const selection = useUI((s) => s.selection)

  if (isLoading) return null
  if (!current) return <StartScreen />

  return (
    <ReactFlowProvider>
      <SyncToast root={current.root} />
      <ImageViewer />
      <div className="flex h-full flex-col">
        <CommandPalette />
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="relative min-w-0 flex-1">
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
            <LiveNotesPanel />
          </main>
          {selection && view !== 'guidelines' && view !== 'types' && (
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
