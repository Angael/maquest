import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Command } from 'cmdk'
import { BookMarked, LayoutDashboard, Search } from 'lucide-react'
import { refsOf } from '@maquest/core/schema'
import { useBoard, useGraph, useGuidelines, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { useTypes } from '../lib/styles'
import { rankItems } from '../lib/search'
import { Kbd } from './ui'

const close = () => useUI.getState().setPaletteOpen(false)

/** Ctrl+K / Ctrl+F: jump to any node, board or guideline. Keyboard-driven, so it opens and closes without animation. */
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

function Palette() {
  const { data: nodes = [] } = useNodes()
  const { data: graph } = useGraph()
  const types = useTypes()
  const { data: guidelines = [] } = useGuidelines()
  const current = useBoard()
  const [search, setSearch] = useState('')
  // The highlighted item, remembered only for the query it was picked under.
  const [picked, setPicked] = useState({ search: '', value: '' })

  const entities = useMemo(() => rankItems(nodes, search, (n) => [n.title, n.summary ?? '', ...n.tags]), [nodes, search])
  const boards = useMemo(() => rankItems(graph?.boards ?? [], search, (b) => [b.title]), [graph, search])
  const guides = useMemo(() => rankItems(guidelines, search, (g) => [g.title, g.id]), [guidelines, search])
  const first = entities[0] ? `node:${entities[0].id}` : boards[0] ? `board:${boards[0].id}` : guides[0] ? `guideline:${guides[0].id}` : ''
  // A new query always highlights its best match.
  const selected = picked.search === search && picked.value ? picked.value : first

  const goNode = (id: string) => {
    const ui = useUI.getState()
    close()
    if (nodes.find((n) => n.id === id)?.type === 'idea') {
      ui.setView('backlog')
      ui.select({ kind: 'node', id })
      return
    }
    const board = current && refsOf(current, id).length ? current : graph?.boards.find((b) => refsOf(b, id).length)
    ui.focusNode(id, board?.id)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[14vh]" onMouseDown={close}>
      <Command
        label="Search"
        loop
        shouldFilter={false}
        value={selected}
        onValueChange={(value) => setPicked({ search, value })}
        className="flex max-h-[min(560px,72vh)] w-[600px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl bg-panel shadow-[var(--shadow-popover)]"
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
            placeholder="Search everything…"
            className="h-12 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-faint focus-visible:outline-none!"
          />
        </div>
        <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1.5 [&_[cmdk-list-sizer]]:pt-0">
          <Command.Empty className="px-3 py-8 text-center text-sm text-fg-subtle">No matches for “{search}”</Command.Empty>
          {entities.length > 0 && (
            <Command.Group heading="Entities" className={groupClass}>
              {entities.map((n) => {
                const S = types.of(n.type)
                return (
                  <Command.Item key={n.id} value={`node:${n.id}`} onSelect={() => goNode(n.id)} className={itemClass}>
                    <S.icon size={14} style={{ color: S.color }} className="shrink-0" aria-hidden />
                    <span className="max-w-[60%] shrink-0 truncate">{n.title}</span>
                    {n.summary && <span className="min-w-0 flex-1 truncate text-xs text-fg-faint">{n.summary}</span>}
                    <Kind>{S.label}</Kind>
                  </Command.Item>
                )
              })}
            </Command.Group>
          )}
          {boards.length > 0 && (
            <Command.Group heading="Boards" className={groupClass}>
              {boards.map((b) => (
                <Command.Item
                  key={b.id}
                  value={`board:${b.id}`}
                  className={itemClass}
                  onSelect={() => {
                    close()
                    useUI.getState().setView('canvas')
                    useUI.getState().setBoard(b.id)
                  }}
                >
                  <LayoutDashboard size={14} className="shrink-0 text-fg-subtle" aria-hidden />
                  <span className="truncate">{b.title}</span>
                  <Kind>Board</Kind>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {guides.length > 0 && (
            <Command.Group heading="Guidelines" className={groupClass}>
              {guides.map((g) => (
                <Command.Item
                  key={g.id}
                  value={`guideline:${g.id}`}
                  className={itemClass}
                  onSelect={() => {
                    close()
                    useUI.getState().setView('guidelines')
                    useUI.getState().setGuideline(g.id)
                  }}
                >
                  <BookMarked size={14} className="shrink-0 text-fg-subtle" aria-hidden />
                  <span className="truncate">{g.title}</span>
                  <Kind>Guideline</Kind>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <div className="flex h-9 shrink-0 items-center gap-4 border-t border-line px-4 text-2xs text-fg-subtle" aria-hidden>
          <Hint keys={['↑', '↓']}>Navigate</Hint>
          <Hint keys={['↵']}>Open</Hint>
          <Hint keys={['Esc']}>Close</Hint>
        </div>
      </Command>
    </div>
  )
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
