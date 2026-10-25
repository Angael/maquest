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
import { InspectorPanel } from './components/InspectorPanel'
import { CommandPalette } from './components/CommandPalette'
import { useDeleteShortcut } from './lib/deletion'

export function App() {
  useLiveProject()
  useDeleteShortcut()
  const { data: current, isLoading } = useCurrent()
  const view = useUI((s) => s.view)
  const selection = useUI((s) => s.selection)

  if (isLoading) return null
  if (!current) return <StartScreen />

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <CommandPalette />
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="relative min-w-0 flex-1">
            {view === 'canvas' && <Canvas />}
            {view === 'backlog' && <Backlog />}
            {view === 'guidelines' && <Guidelines />}
          </main>
          {selection && view !== 'guidelines' && (
            <InspectorPanel>
              <Inspector key={`${selection.kind}:${selection.id}`} />
            </InspectorPanel>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  )
}
