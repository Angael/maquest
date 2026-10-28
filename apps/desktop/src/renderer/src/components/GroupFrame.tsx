import { memo, useState } from 'react'
import { NodeResizeControl, NodeToolbar, Position, ResizeControlVariant, type ControlPosition, type Node, type NodeProps } from '@xyflow/react'
import clsx from 'clsx'
import { Ungroup } from 'lucide-react'
import { GROUP_COLORS, GROUP_HEADER, type Group, type GroupColor, type Rect } from '@maquest/core/schema'

export const GROUP_STYLE: Record<GroupColor, { border: string; fill: string; text: string }> = {
  stone: { border: '#78716c', fill: 'rgb(120 113 108 / 0.07)', text: '#d6d3d1' },
  amber: { border: '#f59e0b', fill: 'rgb(245 158 11 / 0.06)', text: '#fcd34d' },
  emerald: { border: '#10b981', fill: 'rgb(16 185 129 / 0.06)', text: '#6ee7b7' },
  sky: { border: '#0ea5e9', fill: 'rgb(14 165 233 / 0.06)', text: '#7dd3fc' },
  violet: { border: '#8b5cf6', fill: 'rgb(139 92 246 / 0.07)', text: '#c4b5fd' },
  rose: { border: '#f43f5e', fill: 'rgb(244 63 94 / 0.06)', text: '#fda4af' },
}

export type GroupData = {
  group: Group
  /** What the group holds (cards, subgroups, padding and title bar); resizing never cuts into it. */
  content: Rect | null
  count: number
  select: () => void
  rename: (title: string) => void
  recolor: (color: GroupColor) => void
  ungroup: () => void
  resized: (rect: Rect) => void
}
export type GroupFlowNode = Node<GroupData, 'frame'>

const LINES: ControlPosition[] = ['top', 'right', 'bottom', 'left']
const CORNERS: ControlPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

/** Smallest size for a resize from `position`: dragged edges stop at the content, the opposite edges stay put. */
function minSize(group: Group, content: Rect | null, position: ControlPosition) {
  let width = 160
  let height = GROUP_HEADER + 40
  if (content) {
    width = Math.max(width, position.includes('left') ? group.x + group.width - content.x : content.x + content.width - group.x)
    height = Math.max(height, position.includes('top') ? group.y + group.height - content.y : content.y + content.height - group.y)
  }
  return { minWidth: width, minHeight: height }
}

/** Bordered area behind cards. Only the title bar and resize handles take the pointer; the body stays canvas. */
export const GroupFrame = memo(function GroupFrame({ data, selected }: NodeProps<GroupFlowNode>) {
  const { group } = data
  const style = GROUP_STYLE[group.color]
  const [title, setTitle] = useState<string | null>(null)
  const commit = () => {
    if (title?.trim() && title.trim() !== group.title) data.rename(title.trim())
    setTitle(null)
  }
  return (
    <div
      className={clsx('h-full w-full rounded-xl border-2', selected ? 'border-solid' : 'border-dashed')}
      style={{ borderColor: selected ? '#fbbf24' : `${style.border}99`, background: style.fill }}
    >
      {selected &&
        [...LINES, ...CORNERS].map((position) => (
          <NodeResizeControl
            key={position}
            position={position}
            variant={LINES.includes(position) ? ResizeControlVariant.Line : ResizeControlVariant.Handle}
            className="group-interactive"
            color="#fbbf24"
            {...minSize(group, data.content, position)}
            onResizeEnd={(_, p) => data.resized({ x: p.x, y: p.y, width: p.width, height: p.height })}
          />
        ))}
      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        align="end"
        style={{ zIndex: 10 }}
        className="flex items-center gap-1 rounded-md border border-stone-700 bg-stone-900 p-1 shadow-xl"
      >
        {GROUP_COLORS.map((c) => (
          <button
            key={c}
            aria-label={`Color ${c}`}
            aria-pressed={group.color === c}
            className={clsx('h-4 w-4 rounded-full border-2', group.color === c ? 'border-stone-100' : 'border-transparent')}
            style={{ background: GROUP_STYLE[c].border }}
            onClick={() => data.recolor(c)}
          />
        ))}
        <div className="mx-0.5 h-4 w-px bg-stone-700" />
        <button
          aria-label={`Ungroup ${group.title}`}
          title="Remove the frame, keep its cards (Delete)"
          className="rounded p-0.5 text-stone-400 hover:text-red-400"
          onClick={data.ungroup}
        >
          <Ungroup size={14} />
        </button>
      </NodeToolbar>
      <div
        className="group-handle group-interactive flex cursor-grab items-center gap-2 rounded-t-xl px-3 active:cursor-grabbing"
        style={{ height: GROUP_HEADER, color: style.text }}
        onPointerDown={data.select}
        onDoubleClick={() => setTitle(group.title)}
        title="Drag to move the group with its cards · double-click to rename"
      >
        {title === null ? (
          <span className="truncate font-serif text-lg">{group.title}</span>
        ) : (
          <input
            autoFocus
            aria-label="Group name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setTitle(null)
            }}
            className="nodrag min-w-0 flex-1 rounded bg-stone-900 px-1.5 py-0.5 font-serif text-lg text-stone-100 outline-amber-400"
          />
        )}
        <span className="shrink-0 text-[11px] text-stone-500">{data.count}</span>
      </div>
    </div>
  )
})
