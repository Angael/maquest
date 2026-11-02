import { memo, useState } from 'react'
import { NodeResizeControl, NodeToolbar, Position, ResizeControlVariant, type ControlPosition, type Node, type NodeProps } from '@xyflow/react'
import { Ungroup } from 'lucide-react'
import { GROUP_COLORS, GROUP_HEADER, type Group, type GroupColor, type Rect } from '@maquest/core/schema'
import { GROUP_STYLE } from '../lib/styles'
import { IconButton, Separator, cn, floating } from './ui'

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
      className="h-full w-full rounded-xl"
      style={{
        background: style.fill,
        boxShadow: selected ? 'inset 0 0 0 1.5px var(--color-accent)' : `inset 0 0 0 1px color-mix(in oklch, ${style.border} 38%, transparent)`,
      }}
    >
      {selected &&
        [...LINES, ...CORNERS].map((position) => (
          <NodeResizeControl
            key={position}
            position={position}
            variant={LINES.includes(position) ? ResizeControlVariant.Line : ResizeControlVariant.Handle}
            className="group-interactive"
            color="var(--color-accent)"
            {...minSize(group, data.content, position)}
            onResizeEnd={(_, p) => data.resized({ x: p.x, y: p.y, width: p.width, height: p.height })}
          />
        ))}
      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        align="end"
        offset={8}
        style={{ zIndex: 10 }}
        className={cn(floating, 'flex h-8 items-center gap-1 px-1.5')}
      >
        {GROUP_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            aria-pressed={group.color === c}
            title={c}
            className="flex size-6 items-center justify-center rounded-md outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/70"
            onClick={() => data.recolor(c)}
          >
            <span
              className="size-3.5 rounded-full"
              style={{
                background: GROUP_STYLE[c].border,
                boxShadow: group.color === c ? '0 0 0 2px var(--color-panel), 0 0 0 3.5px var(--color-fg-muted)' : undefined,
              }}
            />
          </button>
        ))}
        <Separator vertical />
        <IconButton size="sm" icon={Ungroup} label={`Ungroup ${group.title}`} shortcut="Del" tooltipSide="top" onClick={data.ungroup} />
      </NodeToolbar>
      <div
        className="group-handle group-interactive flex cursor-grab items-center gap-2 rounded-t-xl px-3.5 active:cursor-grabbing"
        style={{ height: GROUP_HEADER }}
        onPointerDown={data.select}
        onDoubleClick={() => setTitle(group.title)}
        title="Drag to move the group with its cards · double-click to rename"
      >
        {title === null ? (
          <span className="truncate font-serif text-lg font-medium" style={{ color: style.text }}>
            {group.title}
          </span>
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
            className="nodrag h-8 min-w-0 flex-1 rounded-md bg-surface px-2 font-serif text-lg text-fg shadow-[inset_0_0_0_1px_var(--color-accent)] outline-none"
          />
        )}
        <span className="tabular shrink-0 rounded-full bg-hover px-1.5 text-2xs text-fg-subtle">{data.count}</span>
      </div>
    </div>
  )
})
