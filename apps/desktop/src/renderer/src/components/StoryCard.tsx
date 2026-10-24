import { memo } from 'react'
import { Handle, Position, useConnection, type Node, type NodeProps } from '@xyflow/react'
import clsx from 'clsx'
import { Pin, PinOff, Search } from 'lucide-react'
import { useAction } from '../lib/queries'
import type { EdgeType, NodeType, StoryNode } from '@maquest/core/schema'
import { useUI } from '../lib/store'
import { ClockDial } from './ClockDial'
import { api, isVideo, mediaUrl } from '../lib/api'
import { EDGE_STYLE, NODE_STYLE } from '../lib/styles'

/** A reference edge (involves, located-at, …) drawn as a chip on its source card. */
export type CardRef = { edge: string; type: EdgeType; id: string; title: string; nodeType: NodeType }
export type CardData = { node: StoryNode; emphasis?: 'neighbor' | 'dimmed'; refs?: CardRef[]; clues?: number }

/** Grab points only; the stored edge has no handle ids because edges float. */
const sides = [Position.Top, Position.Right, Position.Bottom, Position.Left]

export const StoryCard = memo(function StoryCard({ data, selected }: NodeProps<Node<CardData>>) {
  const n = data.node
  const S = NODE_STYLE[n.type]
  const cover = n.src ?? n.media[0]
  const isMedia = n.type === 'media'
  const update = useAction(api.updateNode)
  const connecting = useConnection((c) => c.inProgress && c.fromNode.id !== n.id)
  const select = useUI((s) => s.select)
  const clock = n.clock

  return (
    <div
      className={clsx(
        'group relative rounded-lg border bg-stone-900 shadow-lg transition-[opacity,box-shadow]',
        isMedia ? 'w-64' : 'w-56',
        selected ? 'shadow-amber-500/20 ring-2 ring-amber-400/70' : 'border-stone-800',
        data.emphasis === 'neighbor' && !selected && 'ring-1 ring-amber-200/40 shadow-amber-500/10',
        data.emphasis === 'dimmed' && 'opacity-65',
      )}
      style={{ borderColor: selected ? undefined : `${S.color}55` }}
    >
      {sides.map((p) => (
        <Handle key={p} type="source" position={p} className="card-grip" />
      ))}
      {/* Easy-connect: while a line is dragged the whole card is the drop target; edges float to the facing borders. */}
      <Handle type="target" position={Position.Top} isConnectableStart={false} className={clsx('card-drop', connecting && 'card-drop--active')} />
      <button
        type="button"
        className={clsx('nodrag nopan absolute top-1 right-1 z-10 rounded bg-stone-950/90 p-1.5 text-stone-400 hover:text-amber-300 focus-visible:opacity-100 focus-visible:outline-amber-400', n.pinned ? 'text-amber-400' : 'opacity-0 group-hover:opacity-100')}
        title={n.pinned ? 'Unpin from auto-layout' : 'Pin position during auto-layout'}
        aria-label={n.pinned ? `Unpin ${n.title}` : `Pin ${n.title}`}
        aria-pressed={!!n.pinned}
        disabled={update.isPending}
        onClick={(event) => { event.stopPropagation(); update.mutate([n.id, { pinned: !n.pinned }]) }}
      >
        {n.pinned ? <Pin size={12} /> : <PinOff size={12} />}
      </button>
      {update.error && <div role="alert" className="px-2 py-1 text-xs text-red-300">{update.error.message}</div>}
      {cover &&
        (isVideo(cover) ? (
          <video src={mediaUrl(cover)} className="pointer-events-none max-h-40 w-full rounded-t-lg bg-black object-cover" muted loop autoPlay={isMedia} />
        ) : (
          <img src={mediaUrl(cover)} className="max-h-40 w-full rounded-t-lg object-cover" draggable={false} />
        ))}
      {(!isMedia || !cover) && (
        <div className="px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase" style={{ color: S.color }}>
            <S.icon size={12} /> {S.label}
            {n.status && <span className="ml-auto rounded bg-stone-800 px-1 text-stone-400 normal-case">{n.status}</span>}
          </div>
          <div className="mt-0.5 font-serif text-[15px] leading-snug text-stone-100">{n.title}</div>
          {(n.summary || n.fields.role) && <div className="mt-1 line-clamp-2 text-xs text-stone-400">{n.summary || n.fields.role}</div>}
          {(clock || data.clues !== undefined) && (
            <div className="mt-1.5 flex items-center gap-2 text-[11px]">
              {clock && <span className="flex items-center gap-1 text-stone-400" title={clock.steps[clock.filled - 1] ?? undefined}><ClockDial size={clock.size} filled={clock.filled} radius={9} />{clock.filled}/{clock.size}</span>}
              {data.clues !== undefined && (
                <span className={clsx('flex items-center gap-1 rounded px-1', data.clues >= 3 ? 'bg-teal-950 text-teal-300' : 'bg-amber-950 text-amber-300')}
                  title={data.clues >= 3 ? 'Three-clue rule satisfied' : `Three-clue rule: only ${data.clues} clue${data.clues === 1 ? '' : 's'} point here`}>
                  <Search size={11} /> {data.clues}/3 clues
                </span>
              )}
            </div>
          )}
          {!!data.refs?.length && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {data.refs.map((r) => {
                const T = NODE_STYLE[r.nodeType]
                return (
                  <button key={r.edge} type="button" title={`${r.type} → ${r.title}`}
                    className="nodrag flex max-w-full items-center gap-1 truncate rounded-full border bg-stone-950 px-1.5 py-px text-[10px] text-stone-300 hover:text-stone-50"
                    style={{ borderColor: `${EDGE_STYLE[r.type].color}66` }}
                    onClick={(event) => { event.stopPropagation(); select({ kind: 'node', id: r.id }) }}>
                    <T.icon size={10} style={{ color: T.color }} className="shrink-0" /><span className="truncate">{r.title}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      {isMedia && cover && <div className="truncate px-2 py-1 text-[11px] text-stone-400">{n.title}</div>}
    </div>
  )
})
