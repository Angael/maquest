import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useReactFlow } from '@xyflow/react'
import { BookMarked, LayoutDashboard, Search } from 'lucide-react'
import { refsOf } from '@maquest/core/schema'
import { useBoard, useGraph, useGuidelines, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { useTypes } from '../lib/styles'
import { paletteFilter } from '../lib/search'

const itemClass =
  'flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm text-stone-300 data-[selected=true]:bg-stone-800 data-[selected=true]:text-stone-100'

/** Ctrl+K / Ctrl+F: jump to any node, board or guideline. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const { data: nodes = [] } = useNodes()
  const { data: graph } = useGraph()
  const types = useTypes()
  const { data: guidelines = [] } = useGuidelines()
  const current = useBoard()
  const flow = useReactFlow()

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || (key !== 'k' && key !== 'f')) return
      // Leave Ctrl+F to the markdown editor's own search.
      if (key === 'f' && event.target instanceof Element && event.target.closest('.cm-editor')) return
      event.preventDefault()
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])

  if (!open) return null

  const goNode = (id: string) => {
    const ui = useUI.getState()
    setOpen(false)
    if (nodes.find((n) => n.id === id)?.type === 'idea') {
      ui.setView('backlog')
      ui.select({ kind: 'node', id })
      return
    }
    const boards = graph?.boards ?? []
    const board = current && refsOf(current, id).length ? current : boards.find((b) => refsOf(b, id).length)
    ui.setView('canvas')
    if (board && board.id !== current?.id) ui.setBoard(board.id)
    ui.select({ kind: 'node', id })
    const pos = board && board.layout[refsOf(board, id)[0]]
    // Let the canvas mount / switch boards before moving the viewport.
    if (pos) setTimeout(() => void flow.setCenter(pos.x + 128, pos.y + 90, { zoom: 1.1, duration: 400 }), 50)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[15vh]" onMouseDown={() => setOpen(false)}>
      <Command
        label="Search"
        loop
        filter={paletteFilter}
        className="w-[560px] overflow-hidden rounded-lg border border-stone-700 bg-stone-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-stone-800 px-3">
          <Search size={16} className="text-stone-500" />
          <Command.Input autoFocus placeholder="Search everything…" className="h-11 flex-1 bg-transparent text-sm text-stone-100 outline-none" />
        </div>
        <Command.List className="max-h-[50vh] overflow-y-auto p-1">
          <Command.Empty className="p-3 text-sm text-stone-500">No results.</Command.Empty>
          <Command.Group heading="Entities" className="text-[11px] text-stone-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            {nodes.map((n) => {
              const S = types.of(n.type)
              return (
                <Command.Item key={n.id} value={`node:${n.id}`} keywords={[n.title, S.label, ...n.tags]} onSelect={() => goNode(n.id)} className={itemClass}>
                  <S.icon size={14} style={{ color: S.color }} className="shrink-0" />
                  <span className="max-w-[65%] shrink-0 truncate">{n.title}</span>
                  {n.summary && <span className="min-w-0 flex-1 truncate text-xs text-stone-500">{n.summary}</span>}
                  <span className="ml-auto shrink-0 text-xs text-stone-500">{S.label}</span>
                </Command.Item>
              )
            })}
          </Command.Group>
          <Command.Group heading="Boards" className="text-[11px] text-stone-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            {graph?.boards.map((b) => (
              <Command.Item
                key={b.id}
                value={`board:${b.id}`}
                keywords={[b.title, 'board']}
                className={itemClass}
                onSelect={() => {
                  setOpen(false)
                  useUI.getState().setView('canvas')
                  useUI.getState().setBoard(b.id)
                }}
              >
                <LayoutDashboard size={14} className="shrink-0 text-stone-400" />
                <span className="truncate">{b.title}</span>
                <span className="ml-auto shrink-0 text-xs text-stone-500">Board</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Guidelines" className="text-[11px] text-stone-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            {guidelines.map((g) => (
              <Command.Item
                key={g.id}
                value={`guideline:${g.id}`}
                keywords={[g.title, g.id, 'guideline']}
                className={itemClass}
                onSelect={() => {
                  setOpen(false)
                  useUI.getState().setView('guidelines')
                  useUI.getState().setGuideline(g.id)
                }}
              >
                <BookMarked size={14} className="shrink-0 text-stone-400" />
                <span className="truncate">{g.title}</span>
                <span className="ml-auto shrink-0 text-xs text-stone-500">Guideline</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}
