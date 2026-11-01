import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { BookMarked, LayoutDashboard, Search } from 'lucide-react'
import { refsOf } from '@maquest/core/schema'
import { useBoard, useGraph, useGuidelines, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { useTypes } from '../lib/styles'
import { rankItems } from '../lib/search'

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
  const [search, setSearch] = useState('')
  // The highlighted item, remembered only for the query it was picked under.
  const [picked, setPicked] = useState({ search: '', value: '' })

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || (key !== 'k' && key !== 'f')) return
      // Leave Ctrl+F to the markdown editor's own search.
      if (key === 'f' && event.target instanceof Element && event.target.closest('.cm-editor')) return
      event.preventDefault()
      setOpen((o) => !o)
      setSearch('')
      setPicked({ search: '', value: '' })
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])

  const entities = useMemo(() => rankItems(nodes, search, (n) => [n.title, n.summary ?? '', ...n.tags]), [nodes, search])
  const boards = useMemo(() => rankItems(graph?.boards ?? [], search, (b) => [b.title]), [graph, search])
  const guides = useMemo(() => rankItems(guidelines, search, (g) => [g.title, g.id]), [guidelines, search])
  const first = entities[0] ? `node:${entities[0].id}` : boards[0] ? `board:${boards[0].id}` : guides[0] ? `guideline:${guides[0].id}` : ''
  // A new query always highlights its best match.
  const selected = picked.search === search && picked.value ? picked.value : first

  if (!open) return null

  const goNode = (id: string) => {
    const ui = useUI.getState()
    setOpen(false)
    if (nodes.find((n) => n.id === id)?.type === 'idea') {
      ui.setView('backlog')
      ui.select({ kind: 'node', id })
      return
    }
    const board = current && refsOf(current, id).length ? current : graph?.boards.find((b) => refsOf(b, id).length)
    ui.focusNode(id, board?.id)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[15vh]" onMouseDown={() => setOpen(false)}>
      <Command
        label="Search"
        loop
        shouldFilter={false}
        value={selected}
        onValueChange={(value) => setPicked({ search, value })}
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
          <Command.Input
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Search everything…"
            className="h-11 flex-1 bg-transparent text-sm text-stone-100 outline-none"
          />
        </div>
        <Command.List className="max-h-[50vh] overflow-y-auto p-1">
          <Command.Empty className="p-3 text-sm text-stone-500">No results.</Command.Empty>
          <Command.Group heading="Entities" className="text-[11px] text-stone-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            {entities.map((n) => {
              const S = types.of(n.type)
              return (
                <Command.Item key={n.id} value={`node:${n.id}`} onSelect={() => goNode(n.id)} className={itemClass}>
                  <S.icon size={14} style={{ color: S.color }} className="shrink-0" />
                  <span className="max-w-[65%] shrink-0 truncate">{n.title}</span>
                  {n.summary && <span className="min-w-0 flex-1 truncate text-xs text-stone-500">{n.summary}</span>}
                  <span className="ml-auto shrink-0 text-xs text-stone-500">{S.label}</span>
                </Command.Item>
              )
            })}
          </Command.Group>
          <Command.Group heading="Boards" className="text-[11px] text-stone-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            {boards.map((b) => (
              <Command.Item
                key={b.id}
                value={`board:${b.id}`}
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
            {guides.map((g) => (
              <Command.Item
                key={g.id}
                value={`guideline:${g.id}`}
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
