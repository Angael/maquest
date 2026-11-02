import { memo, useMemo } from 'react'
import { ArrowLeft, ArrowRight, Pencil, X } from 'lucide-react'
import type { StoryNode } from '@maquest/core/schema'
import { api } from '../../lib/api'
import { useAction, useGraph } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { EDGE_STYLE, useTypes } from '../../lib/styles'
import { IconButton } from '../ui'
import { SectionHeading } from './fields'

const reveal = 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100'

/** Child nodes in order. */
export const Contains = memo(function Contains({ items }: { items: StoryNode[] }) {
  const select = useUI((s) => s.select)
  const types = useTypes()
  if (!items.length) return null
  return (
    <section aria-label="Contains">
      <SectionHeading count={items.length}>Contains</SectionHeading>
      <ul className="-mx-1.5">
        {items.map((c) => {
          const S = types.of(c.type)
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => select({ kind: 'node', id: c.id })}
                className="flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left text-sm text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <S.icon size={14} aria-hidden className="shrink-0" style={{ color: S.color }} />
                {c.order != null && <span className="tabular w-4 shrink-0 text-xs text-fg-faint">{c.order}</span>}
                <span className="truncate">{c.title}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
})

/** Lines to and from a node: type (in its line color), direction, the other node; edit/remove on hover. */
export const Connections = memo(function Connections({ id, byId }: { id: string; byId: ReadonlyMap<string, StoryNode> }) {
  const { data: graph } = useGraph()
  const select = useUI((s) => s.select)
  const removeEdge = useAction(api.removeEdge)
  const types = useTypes()
  const all = graph?.edges
  const edges = useMemo(() => (all ?? []).filter((e) => e.source === id || e.target === id), [all, id])
  return (
    <section aria-label="Connections">
      <SectionHeading count={edges.length}>Connections</SectionHeading>
      {edges.length === 0 && <p className="text-xs text-fg-faint">Drag from a card’s edge on the canvas to connect it.</p>}
      <ul className="-mx-1.5">
        {edges.map((e) => {
          const out = e.source === id
          const other = byId.get(out ? e.target : e.source)
          const color = EDGE_STYLE[e.type].color
          const S = other && types.of(other.type)
          const Dir = out ? ArrowRight : ArrowLeft
          return (
            <li key={e.id} className="group/row flex h-7 items-center gap-2 rounded-md pr-0.5 pl-1.5 hover:bg-hover">
              <span className="flex w-[88px] shrink-0 items-center gap-1 text-xs" style={{ color }}>
                <Dir size={12} aria-label={out ? 'to' : 'from'} className="shrink-0" />
                <span className="truncate">{e.type}</span>
              </span>
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 rounded text-left text-sm text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70"
                onClick={() => select({ kind: 'node', id: other?.id ?? (out ? e.target : e.source) })}
              >
                {S && <S.icon size={13} aria-hidden className="shrink-0" style={{ color: S.color }} />}
                <span className="truncate">{other?.title ?? (out ? e.target : e.source)}</span>
              </button>
              {e.label && <span className="min-w-0 truncate text-xs text-fg-faint italic">“{e.label}”</span>}
              <span className="ml-auto flex shrink-0">
                <IconButton icon={Pencil} label="Edit connection" size="sm" className={reveal} onClick={() => select({ kind: 'edge', id: e.id })} />
                <IconButton icon={X} label="Remove connection" size="sm" className={reveal} onClick={() => removeEdge.mutate([e.id])} />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
})
