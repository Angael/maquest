import { useId, useState } from 'react'
import clsx from 'clsx'
import { ChevronRight, Plus } from 'lucide-react'
import type { NodeType, OutlineNode } from '@maquest/core/schema'
import { NODE_DRAG_TYPE, useCreateNode, useRevealNode } from '../lib/actions'
import { useNodes, useOutline } from '../lib/queries'
import { useUI } from '../lib/store'
import { NODE_STYLE } from '../lib/styles'

const CHILD: Partial<Record<NodeType, NodeType>> = { story: 'chapter', chapter: 'scene' }

function useFocus() {
  const reveal = useRevealNode()
  const { select, view } = useUI()
  return (id: string) => (view === 'canvas' ? reveal(id) : select({ kind: 'node', id }))
}

function Row({
  id,
  type,
  title,
  depth,
  open,
  onToggle,
  onAdd,
}: {
  id: string
  type: NodeType
  title: string
  depth: number
  open?: boolean
  onToggle?: () => void
  onAdd?: () => void
}) {
  const selected = useUI((s) => s.selection?.kind === 'node' && s.selection.id === id)
  const focus = useFocus()
  const S = NODE_STYLE[type]
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      aria-pressed={selected}
      aria-expanded={onToggle ? open : undefined}
      className={clsx(
        'group flex h-7 cursor-pointer items-center gap-1 rounded pr-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60',
        selected ? 'bg-stone-800 text-stone-100' : 'text-stone-300 hover:bg-stone-900',
      )}
      style={{ paddingLeft: 4 + depth * 14 }}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(NODE_DRAG_TYPE, id)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={(event) => {
        event.currentTarget.focus()
        focus(id)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          focus(id)
        }
        if (event.key === 'ArrowRight' && !open) {
          event.preventDefault()
          onToggle?.()
        }
        if (event.key === 'ArrowLeft' && open) {
          event.preventDefault()
          onToggle?.()
        }
      }}
    >
      <span
        className="w-4"
        onClick={(e) => {
          e.stopPropagation()
          onToggle?.()
        }}
      >
        {onToggle && <ChevronRight size={14} className={clsx('text-stone-500 transition-transform', open && 'rotate-90')} />}
      </span>
      <S.icon size={14} style={{ color: S.color }} className="shrink-0" />
      <span className="truncate">{title}</span>
      {onAdd && (
        <button
          title={`Add ${CHILD[type]}`}
          className="ml-auto hidden rounded p-0.5 text-stone-500 group-hover:block hover:text-stone-100"
          onClick={(e) => {
            e.stopPropagation()
            onAdd()
          }}
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  )
}

function Tree({ node, depth }: { node: OutlineNode; depth: number }) {
  const [open, setOpen] = useState(true)
  const create = useCreateNode()
  const child = CHILD[node.type]
  return (
    <>
      <Row
        id={node.id}
        type={node.type}
        title={node.title}
        depth={depth}
        open={open}
        onToggle={node.children.length ? () => setOpen(!open) : undefined}
        onAdd={
          child
            ? () => {
                setOpen(true)
                void create(child, { parent: node.id })
              }
            : undefined
        }
      />
      {open && node.children.map((c) => <Tree key={c.id} node={c} depth={depth + 1} />)}
    </>
  )
}

function Section({ title, type, children }: { title: string; type: NodeType; children: React.ReactNode }) {
  const create = useCreateNode()
  const [open, setOpen] = useState(true)
  const contentId = useId()
  return (
    <div className="mb-3">
      <div className="group flex items-center px-2 py-1 text-[11px] font-medium tracking-wider text-stone-500 uppercase">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          className="flex min-w-0 flex-1 items-center gap-1 rounded text-left uppercase outline-none hover:text-stone-200 focus-visible:ring-1 focus-visible:ring-amber-500/60"
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRight size={14} className={clsx('shrink-0 transition-transform', open && 'rotate-90')} />
          {title}
        </button>
        <button
          type="button"
          title={`New ${type}`}
          className="ml-auto rounded p-0.5 outline-none hover:bg-stone-800 hover:text-stone-200 focus-visible:ring-1 focus-visible:ring-amber-500/60"
          onClick={() => {
            setOpen(true)
            void create(type)
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      <div id={contentId} hidden={!open}>
        {children}
      </div>
    </div>
  )
}

export function Sidebar() {
  const { data: outline } = useOutline()
  const { data: nodes } = useNodes()
  const of = (t: NodeType) => nodes?.filter((n) => n.type === t) ?? []

  return (
    <aside data-sidebar className="w-64 max-w-[30vw] shrink-0 overflow-y-auto border-r border-stone-800 bg-stone-950 p-2">
      <Section title="Stories" type="story">
        {outline?.map((s) => (
          <Tree key={s.id} node={s} depth={0} />
        ))}
        {!outline?.length && <div className="px-2 text-xs text-stone-600">No stories yet</div>}
      </Section>
      {(['character', 'location', 'faction', 'item', 'note'] as const).map((t) => (
        <Section key={t} title={NODE_STYLE[t].plural} type={t}>
          {of(t).map((n) => (
            <Row key={n.id} id={n.id} type={t} title={n.title} depth={0} />
          ))}
        </Section>
      ))}
    </aside>
  )
}
