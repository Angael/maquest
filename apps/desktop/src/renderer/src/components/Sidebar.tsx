import { createContext, memo, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import type { NodeType, OutlineNode, StoryNode } from '@maquest/core/schema'
import { NODE_DRAG_TYPE, useCreateNode, useRevealNode } from '../lib/actions'
import { api } from '../lib/api'
import { useAction, useNodes, useOutline } from '../lib/queries'
import { useUI } from '../lib/store'
import { useTypes, type TypeStyle } from '../lib/styles'
import { IconButton, cn } from './ui'

/** Row being dragged in the sidebar, so siblings of the same type can show where it would land. */
let draggedRow: { id: string; type: NodeType } | null = null

const CHILD: Partial<Record<NodeType, NodeType>> = { story: 'chapter', chapter: 'scene' }
/** Left padding of a depth-0 row and the indent per tree level, in px. */
const PAD = 4
const INDENT = 12
const MIN_WIDTH = 180
const MAX_WIDTH = 440

type Actions = {
  focus: (id: string) => void
  create: (type: NodeType, parent?: string) => void
  move: (type: NodeType, target: string, dragged: string, after: boolean) => void
}
/** Stable callbacks shared by every row, so rows don't each subscribe to React Flow and the queries. */
const ActionsContext = createContext<Actions | null>(null)
const useActions = () => useContext(ActionsContext)!

/** Moves keyboard focus to the previous/next visible row. */
function focusSibling(from: HTMLElement, step: 1 | -1) {
  const rows = [...(from.closest('[data-sidebar]')?.querySelectorAll<HTMLElement>('[data-row]') ?? [])].filter((r) => r.offsetParent !== null)
  rows[rows.indexOf(from) + step]?.focus()
}

const Row = memo(function Row({
  id,
  type,
  title,
  depth,
  style,
  open,
  onToggle,
  reorderable,
}: {
  id: string
  type: NodeType
  title: string
  depth: number
  style: TypeStyle
  open?: boolean
  onToggle?: () => void
  /** Rows of the same section can be reordered by dragging. */
  reorderable?: boolean
}) {
  const [dropAt, setDropAt] = useState<'before' | 'after' | null>(null)
  const selected = useUI((s) => s.selection?.kind === 'node' && s.selection.id === id)
  const actions = useActions()
  const child = CHILD[type]
  const Icon = style.icon
  const canDrop = () => reorderable && draggedRow && draggedRow.type === type && draggedRow.id !== id
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      aria-pressed={selected}
      aria-expanded={onToggle ? open : undefined}
      className={cn(
        'group/row relative flex h-7 cursor-default items-center gap-1.5 rounded-md pr-1 text-sm outline-none select-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-accent)] focus-visible:outline-none!',
        selected ? 'bg-active text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
        dropAt === 'before' && 'shadow-[inset_0_2px_0_var(--color-accent)]',
        dropAt === 'after' && 'shadow-[inset_0_-2px_0_var(--color-accent)]',
      )}
      data-row={id}
      style={{ paddingLeft: PAD + depth * INDENT }}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(NODE_DRAG_TYPE, id)
        event.dataTransfer.effectAllowed = 'copyMove'
        draggedRow = { id, type }
      }}
      onDragEnd={() => {
        draggedRow = null
      }}
      onDragOver={(event) => {
        if (!canDrop()) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const rect = event.currentTarget.getBoundingClientRect()
        setDropAt(event.clientY > rect.top + rect.height / 2 ? 'after' : 'before')
      }}
      onDragLeave={() => setDropAt(null)}
      onDrop={(event) => {
        setDropAt(null)
        if (!canDrop() || !draggedRow) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        actions.move(type, id, draggedRow.id, event.clientY > rect.top + rect.height / 2)
        draggedRow = null
      }}
      onClick={(event) => {
        event.currentTarget.focus()
        actions.focus(id)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') actions.focus(id)
        else if (event.key === 'ArrowDown') focusSibling(event.currentTarget, 1)
        else if (event.key === 'ArrowUp') focusSibling(event.currentTarget, -1)
        else if (event.key === 'ArrowRight' && onToggle && !open) onToggle()
        else if (event.key === 'ArrowLeft' && onToggle && open) onToggle()
        else return
        event.preventDefault()
      }}
    >
      {/* Indent guides: one hairline under each ancestor's chevron. */}
      {Array.from({ length: depth }, (_, level) => (
        <span key={level} aria-hidden className="absolute inset-y-0 w-px bg-line" style={{ left: PAD + level * INDENT + 7.5 }} />
      ))}
      <span
        aria-hidden
        className="flex size-4 shrink-0 items-center justify-center rounded-[4px] text-fg-faint hover:text-fg"
        onClick={(e) => {
          if (!onToggle) return
          e.stopPropagation()
          onToggle()
        }}
      >
        {onToggle && <ChevronRight size={12} className={cn('transition-transform duration-100', open && 'rotate-90')} />}
      </span>
      <Icon size={14} style={{ color: style.color }} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {child && (
        <IconButton
          icon={Plus}
          size="sm"
          label={`Add ${child}`}
          tooltipSide="right"
          className="size-5 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            actions.create(child, id)
          }}
        />
      )}
    </div>
  )
})

function Tree({ node, depth, styleOf }: { node: OutlineNode; depth: number; styleOf: (t: NodeType) => TypeStyle }) {
  const [open, setOpen] = useState(true)
  const toggle = useCallback(() => setOpen((o) => !o), [])
  return (
    <>
      <Row
        id={node.id}
        type={node.type}
        title={node.title}
        depth={depth}
        style={styleOf(node.type)}
        open={open}
        onToggle={node.children.length ? toggle : undefined}
      />
      {open && node.children.map((c) => <Tree key={c.id} node={c} depth={depth + 1} styleOf={styleOf} />)}
    </>
  )
}

function Section({ title, type, count, children }: { title: string; type: NodeType; count: number; children: ReactNode }) {
  const actions = useActions()
  const [open, setOpen] = useState(true)
  const contentId = useId()
  return (
    <section className="mb-2" aria-label={title}>
      <div className="group/section flex h-7 items-center pr-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-xs font-medium text-fg-subtle outline-none hover:text-fg-muted focus-visible:shadow-[inset_0_0_0_1px_var(--color-accent)] focus-visible:outline-none!"
          style={{ paddingLeft: PAD }}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-fg-faint">
            <ChevronRight size={12} aria-hidden className={cn('transition-transform duration-100', open && 'rotate-90')} />
          </span>
          <span className="truncate">{title}</span>
          {count > 0 && <span className="tabular font-normal text-fg-faint">{count}</span>}
        </button>
        <IconButton
          icon={Plus}
          size="sm"
          label={`New ${type}`}
          tooltipSide="right"
          className="size-5 opacity-0 group-focus-within/section:opacity-100 group-hover/section:opacity-100 focus-visible:opacity-100"
          onClick={() => {
            setOpen(true)
            actions.create(type)
          }}
        />
      </div>
      <div id={contentId} hidden={!open}>
        {count === 0 ? (
          <div className="flex h-6 items-center text-xs text-fg-faint" style={{ paddingLeft: PAD + 22 }}>
            None yet
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

export function Sidebar() {
  const open = useUI((s) => s.sidebarOpen)
  const width = useUI((s) => s.sidebarWidth)
  const { data: outline } = useOutline()
  const { data: nodes } = useNodes()
  const types = useTypes()
  const reorder = useAction(api.reorder)
  const create = useCreateNode()
  const reveal = useRevealNode()
  const select = useUI((s) => s.select)

  const byType = useMemo(() => {
    const map = new Map<NodeType, StoryNode[]>()
    for (const n of nodes ?? []) map.set(n.type, [...(map.get(n.type) ?? []), n])
    return map
  }, [nodes])
  const sections = useMemo(() => [...types.list.filter((t) => t.entity), types.of('note')], [types])

  // Rows only see stable callbacks; the latest closures live in a ref.
  const latest = useRef({ create, reveal, select, byType, reorder })
  useEffect(() => {
    latest.current = { create, reveal, select, byType, reorder }
  })
  const actions = useMemo<Actions>(
    () => ({
      focus: (id) => (useUI.getState().view === 'canvas' ? latest.current.reveal(id) : latest.current.select({ kind: 'node', id })),
      create: (type, parent) => void latest.current.create(type, { parent }),
      /** Drag-and-drop within a section: rewrites the order of that type's nodes. */
      move: (type, target, dragged, after) => {
        const ids = (latest.current.byType.get(type) ?? []).map((n) => n.id).filter((id) => id !== dragged)
        ids.splice(ids.indexOf(target) + (after ? 1 : 0), 0, dragged)
        latest.current.reorder.mutate([ids])
      },
    }),
    [],
  )

  return (
    <aside
      id="project-sidebar"
      data-sidebar
      aria-label="Project"
      hidden={!open}
      className="relative shrink-0 border-r border-line bg-panel"
      style={{ width, maxWidth: '40vw' }}
    >
      <ActionsContext.Provider value={actions}>
        <div className="h-full overflow-y-auto px-1.5 py-2">
          <Section title="Stories" type="story" count={outline?.length ?? 0}>
            {outline?.map((s) => (
              <Tree key={s.id} node={s} depth={0} styleOf={types.of} />
            ))}
          </Section>
          {sections.map((t) => (
            <Section key={t.id} title={t.plural} type={t.id} count={byType.get(t.id)?.length ?? 0}>
              {byType.get(t.id)?.map((n) => (
                <Row key={n.id} id={n.id} type={t.id} title={n.title} depth={0} style={t} reorderable />
              ))}
            </Section>
          ))}
        </div>
      </ActionsContext.Provider>
      <ResizeHandle width={width} />
    </aside>
  )
}

/** Drag (or arrow keys) to resize; the width is applied to the DOM while dragging and saved on release. */
function ResizeHandle({ width }: { width: number }) {
  const drag = useRef<{ pointer: number; x: number; width: number; next: number } | null>(null)
  const clamp = (w: number) => Math.round(Math.max(MIN_WIDTH, Math.min(w, MAX_WIDTH)))
  const save = (w: number) => useUI.getState().setSidebarWidth(clamp(w))
  return (
    <div
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-controls="project-sidebar"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none outline-none before:absolute before:inset-y-0 before:left-[3px] before:w-px before:bg-transparent before:transition-colors before:duration-100 hover:before:bg-line-strong focus-visible:before:w-0.5 focus-visible:before:bg-accent active:before:bg-accent"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointer: event.pointerId, x: event.clientX, width, next: width }
      }}
      onPointerMove={(event) => {
        const d = drag.current
        if (d?.pointer !== event.pointerId) return
        d.next = clamp(d.width + event.clientX - d.x)
        const aside = event.currentTarget.parentElement
        if (aside) aside.style.width = `${d.next}px`
      }}
      onLostPointerCapture={() => {
        if (drag.current) save(drag.current.next)
        drag.current = null
      }}
      onDoubleClick={() => save(248)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 40 : 10
        if (event.key === 'ArrowLeft') save(width - step)
        else if (event.key === 'ArrowRight') save(width + step)
        else return
        event.preventDefault()
      }}
    />
  )
}
