import { memo, type CSSProperties } from 'react'
import { Handle, Position, useConnection, type Node, type NodeProps } from '@xyflow/react'
import { Maximize2, Pin, Search } from 'lucide-react'
import { openImage } from './Lightbox'
import { useAction } from '../lib/queries'
import type { EdgeType, NodeType, StoryNode } from '@maquest/core/schema'
import { useUI } from '../lib/store'
import { ClockDial } from './ClockDial'
import { api, isVideo, mediaUrl } from '../lib/api'
import { STATUS_STYLE, useTypes } from '../lib/styles'
import { cn } from './ui'

/** A reference edge (involves, located-at, …) drawn as a chip on its source card. */
export type CardRef = { edge: string; type: EdgeType; id: string; title: string; nodeType: NodeType }
export type CardData = { node: StoryNode; emphasis?: 'neighbor' | 'dimmed'; refs?: CardRef[]; clues?: number }

/** Grab points only; the stored edge has no handle ids because edges float. */
const sides = [Position.Top, Position.Right, Position.Bottom, Position.Left]

/** Small square buttons revealed on hover / focus; they keep their space so nothing shifts. */
const reveal =
  'nodrag nopan inline-flex size-5 shrink-0 items-center justify-center rounded text-fg-faint outline-none transition-[opacity,color,background-color] duration-100 hover:bg-hover hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/70 group-hover:opacity-100'

export const StoryCard = memo(function StoryCard({ data, selected }: NodeProps<Node<CardData>>) {
  const n = data.node
  const types = useTypes()
  const S = types.of(n.type)
  const cover = n.src ?? n.media[0]
  const isMedia = n.type === 'media'
  const update = useAction(api.updateNode)
  const connecting = useConnection((c) => c.inProgress && c.fromNode.id !== n.id)
  const select = useUI((s) => s.select)
  const clock = n.clock
  const status = n.status ? STATUS_STYLE[n.status] : null
  const summary = n.summary || n.fields.role

  const pin = (
    <button
      type="button"
      className={cn(reveal, n.pinned ? 'text-accent-text opacity-100' : 'opacity-0')}
      title={n.pinned ? 'Pinned: auto-layout leaves it in place. Click to unpin.' : 'Pin: keep in place during auto-layout'}
      aria-label={n.pinned ? `Unpin ${n.title}` : `Pin ${n.title}`}
      aria-pressed={!!n.pinned}
      disabled={update.isPending}
      onClick={(event) => {
        event.stopPropagation()
        update.mutate([n.id, { pinned: !n.pinned }])
      }}
    >
      <Pin size={12} aria-hidden className={n.pinned ? 'fill-current' : undefined} />
    </button>
  )

  return (
    <div
      data-emphasis={data.emphasis}
      className={cn('story-card group relative rounded-lg bg-surface', isMedia ? 'w-72' : 'w-64', selected && 'story-card--selected')}
      style={{ '--type-color': S.color } as CSSProperties}
    >
      {sides.map((p) => (
        <Handle key={p} type="source" position={p} className="card-grip" />
      ))}
      {/* Easy-connect: while a line is dragged the whole card is the drop target; edges float to the facing borders. */}
      <Handle type="target" position={Position.Top} isConnectableStart={false} className={cn('card-drop', connecting && 'card-drop--active')} />
      {cover &&
        (isVideo(cover) ? (
          <video src={mediaUrl(cover)} className="pointer-events-none block max-h-40 w-full rounded-t-lg bg-app object-cover" muted loop autoPlay={isMedia} />
        ) : (
          <div className="relative">
            <img
              src={mediaUrl(cover)}
              alt=""
              className="block max-h-40 w-full rounded-t-lg object-cover"
              draggable={false}
              onDoubleClick={() => openImage(mediaUrl(cover))}
            />
            <button
              type="button"
              className={cn(reveal, 'absolute top-1.5 right-1.5 size-6 bg-app/80 text-fg-muted opacity-0 backdrop-blur-sm hover:bg-app/90')}
              title="View full size"
              aria-label={`View ${n.title} full size`}
              onClick={(event) => (event.stopPropagation(), openImage(mediaUrl(cover)))}
            >
              <Maximize2 size={12} aria-hidden />
            </button>
          </div>
        ))}
      {isMedia && cover ? (
        <div className="flex h-8 items-center gap-1.5 pr-1.5 pl-2.5">
          <S.icon size={12} aria-hidden className="shrink-0 text-(--type-color)" />
          <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{n.title}</span>
          {pin}
        </div>
      ) : (
        <div className="px-3 pt-2 pb-2.5">
          <div className="flex h-5 items-center gap-1.5">
            <S.icon size={12} aria-hidden className="shrink-0 text-(--type-color)" />
            <span className="min-w-0 flex-1 truncate text-[10px] font-medium tracking-[0.06em] text-fg-subtle uppercase">{S.label}</span>
            {status && (
              <span className="inline-flex h-4 shrink-0 items-center gap-1 rounded-full bg-hover px-1.5 text-[10px] font-medium text-fg-subtle">
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: status.color }} />
                {status.label}
              </span>
            )}
            {pin}
          </div>
          <div className="mt-1 font-serif text-[15px] leading-snug font-medium text-pretty text-fg">{n.title}</div>
          {summary && (
            <div data-card-summary className="mt-1 text-xs leading-[1.45] break-words text-fg-muted">
              {summary}
            </div>
          )}
          {(clock || data.clues !== undefined) && (
            <div className="mt-2 flex items-center gap-1.5 text-2xs">
              {clock && (
                <span
                  className="tabular inline-flex h-5 items-center gap-1 rounded bg-hover pr-1.5 pl-1 text-fg-muted"
                  title={clock.steps[clock.filled - 1] ?? undefined}
                >
                  <ClockDial size={clock.size} filled={clock.filled} radius={6} />
                  {clock.filled}/{clock.size}
                </span>
              )}
              {data.clues !== undefined && (
                <span
                  className={cn('tabular inline-flex h-5 items-center gap-1 rounded px-1.5', data.clues >= 3 ? 'card-clues--ok' : 'card-clues--low')}
                  title={data.clues >= 3 ? 'Three-clue rule satisfied' : `Three-clue rule: only ${data.clues} clue${data.clues === 1 ? '' : 's'} point here`}
                >
                  <Search size={11} aria-hidden /> {data.clues}/3 clues
                </span>
              )}
            </div>
          )}
          {!!data.refs?.length && (
            <div className="mt-2 flex flex-wrap gap-1">
              {data.refs.map((r) => {
                const T = types.of(r.nodeType)
                return (
                  <button
                    key={r.edge}
                    type="button"
                    title={`${r.type} → ${r.title}`}
                    className="nodrag inline-flex h-5 max-w-full items-center gap-1 rounded-full bg-app/50 px-1.5 text-[10px] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)] outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70"
                    onClick={(event) => {
                      event.stopPropagation()
                      select({ kind: 'node', id: r.id })
                    }}
                  >
                    <T.icon size={10} aria-hidden style={{ color: T.color }} className="shrink-0" />
                    <span className="truncate">{r.title}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      {update.error && (
        <div role="alert" className="px-3 pb-2 text-2xs text-danger">
          {update.error.message}
        </div>
      )}
    </div>
  )
})
