import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Bot, FolderOpen, LogOut, Network, BookMarked, Lightbulb, Shapes } from 'lucide-react'
import { api } from '../lib/api'
import { useCurrent, useNodes } from '../lib/queries'
import { useUI, type View } from '../lib/store'
import { Button } from './ui'

export function TopBar() {
  const qc = useQueryClient()
  const { data: current } = useCurrent()
  const { data: nodes } = useNodes()
  const { view, setView, select } = useUI()
  const [agentOpen, setAgentOpen] = useState(false)
  const backlog = nodes?.filter((n) => n.type === 'idea').length ?? 0

  const tabs: { id: View; label: string; icon: typeof Network; badge?: number }[] = [
    { id: 'canvas', label: 'Canvas', icon: Network },
    { id: 'backlog', label: 'Backlog', icon: Lightbulb, badge: backlog },
    { id: 'guidelines', label: 'Guidelines', icon: BookMarked },
    { id: 'types', label: 'Types', icon: Shapes },
  ]

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-stone-800 bg-stone-950 px-3">
      <div className="font-serif text-lg text-amber-400">Maquest</div>
      <div className="text-sm text-stone-400">{current?.config.name}</div>
      <nav className="ml-4 flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm',
              view === t.id ? 'bg-stone-800 text-stone-100' : 'text-stone-400 hover:text-stone-200',
            )}
          >
            <t.icon size={15} />
            {t.label}
            {!!t.badge && <span className="rounded-full bg-pink-500/20 px-1.5 text-[11px] text-pink-300">{t.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <div className="relative">
          <Button onClick={() => setAgentOpen((o) => !o)}>
            <Bot size={16} /> Agent
          </Button>
          {agentOpen && (
            <div className="absolute top-10 right-0 z-50 w-[420px] space-y-2 rounded-lg border border-stone-700 bg-stone-900 p-4 text-sm shadow-2xl">
              <div className="font-medium text-stone-100">Work with your AI agent</div>
              <p className="text-stone-400">
                This folder already has MCP configs (<code>.mcp.json</code>, <code>.codex/config.toml</code>, <code>.cursor/mcp.json</code>) and an{' '}
                <code>AGENTS.md</code>. Start your agent inside the project folder and it will pick up the <b>maquest</b> tools automatically:
              </p>
              <pre className="overflow-x-auto rounded bg-stone-950 p-2 text-xs text-amber-200">
                cd "{current?.root}"{'\n'}claude # or codex, cursor…
              </pre>
              <p className="text-stone-500">Edits the agent makes show up here instantly.</p>
            </div>
          )}
        </div>
        <Button title="Show in file manager" onClick={() => api.reveal()}>
          <FolderOpen size={16} />
        </Button>
        <Button
          title="Close project"
          onClick={async () => {
            await api.close()
            select(null)
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'app' })
            qc.setQueryData(['app', 'current'], null)
            void qc.invalidateQueries({ queryKey: ['app'] })
          }}
        >
          <LogOut size={16} />
        </Button>
      </div>
    </header>
  )
}
