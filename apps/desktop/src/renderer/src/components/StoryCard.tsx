import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import clsx from 'clsx'
import { Pin, PinOff } from 'lucide-react'
import { useAction } from '../lib/queries'
import type { StoryNode } from '@maquest/core/schema'
import { api, isVideo, mediaUrl } from '../lib/api'
import { NODE_STYLE } from '../lib/styles'

export type CardData = { node: StoryNode; emphasis?: 'neighbor' | 'dimmed' }

const sides = [Position.Top, Position.Right, Position.Bottom, Position.Left]

export const StoryCard = memo(function StoryCard({ data, selected }: NodeProps<Node<CardData>>) {
  const n = data.node
  const S = NODE_STYLE[n.type]
  const cover = n.src ?? n.media[0]
  const isMedia = n.type === 'media'
  const update = useAction(api.updateNode)

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
        <Handle key={p} id={p} type="source" position={p} className="!size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
      ))}
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
        </div>
      )}
      {isMedia && cover && <div className="truncate px-2 py-1 text-[11px] text-stone-400">{n.title}</div>}
    </div>
  )
})
