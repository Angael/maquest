import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  useInternalNode,
  type ConnectionLineComponentProps,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react'
import { inferConnectionType } from '../lib/connections'
import { useUI } from '../lib/store'
import type { CardData } from './StoryCard'
import { useCanvasHover } from './canvas/hover'
import { cn } from './ui'

type Rect = { x: number; y: number; width: number; height: number }
export type FloatingData = {
  color: string
  /** Perpendicular shift so A→B and B→A don't overlap. */
  offset?: number
  /** Hide the name until the line is hovered, selected or focused. */
  hideLabel?: boolean
}
export type FloatingFlowEdge = Edge<FloatingData, 'floating'>

const rect = (node: InternalNode): Rect => ({
  ...node.internals.positionAbsolute,
  width: node.measured.width ?? 0,
  height: node.measured.height ?? 0,
})

/** Point where the line from `box`'s center toward `toward` leaves the box, plus the side it leaves through. */
function border(box: Rect, toward: { x: number; y: number }) {
  const w = box.width / 2
  const h = box.height / 2
  const c = { x: box.x + w, y: box.y + h }
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (!dx && !dy) return { ...c, pos: Position.Top }
  const scale = Math.min(dx ? w / Math.abs(dx) : Infinity, dy ? h / Math.abs(dy) : Infinity)
  const pos = Math.abs(dx) * h > Math.abs(dy) * w ? (dx > 0 ? Position.Right : Position.Left) : dy > 0 ? Position.Bottom : Position.Top
  return { x: c.x + dx * scale, y: c.y + dy * scale, pos }
}

const OPPOSITE = { [Position.Left]: Position.Right, [Position.Right]: Position.Left, [Position.Top]: Position.Bottom, [Position.Bottom]: Position.Top }
const center = (box: Rect) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

/** Bezier between the facing borders of two boxes; the same geometry drives saved edges and the drag preview. */
export function floatingPath(from: Rect, to: Rect | { x: number; y: number }, offset = 0) {
  const box = 'width' in to
  const a = border(from, box ? center(to) : to)
  const b = box ? border(to, center(from)) : { ...to, pos: OPPOSITE[a.pos] }
  if (offset) {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = (-(b.y - a.y) / len) * offset
    const ny = ((b.x - a.x) / len) * offset
    a.x += nx
    a.y += ny
    b.x += nx
    b.y += ny
  }
  return getBezierPath({ sourceX: a.x, sourceY: a.y, sourcePosition: a.pos, targetX: b.x, targetY: b.y, targetPosition: b.pos })
}

export const FloatingEdge = memo(function FloatingEdge({ id, source, target, style, markerEnd, label, selected, data }: EdgeProps<FloatingFlowEdge>) {
  const select = useUI((state) => state.select)
  // Only lines whose hover state flips re-render; the canvas component never sees hover.
  const hovered = useCanvasHover((h) => h.edge === id || h.node === source || h.node === target)
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s || !t) return null
  const [path, lx, ly] = floatingPath(rect(s), rect(t), data?.offset)
  const showLabel = !!label && (!data?.hideLabel || selected || hovered)
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={16} />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            role="button"
            tabIndex={0}
            aria-label={`Select connection: ${String(label)}`}
            onClick={(event) => {
              event.stopPropagation()
              select({ kind: 'edge', id })
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                select({ kind: 'edge', id })
              }
            }}
            className={cn(
              'nodrag nopan pointer-events-auto absolute flex h-5 cursor-pointer items-center rounded-full bg-raised px-2 text-2xs whitespace-nowrap text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)] outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70',
              selected && 'text-fg shadow-[0_0_0_1.5px_var(--color-accent)]',
            )}
            // Hovered or selected labels rise above cards (nodes and labels share one stacking context).
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, opacity: style?.opacity, zIndex: hovered || selected ? 5000 : undefined }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

/** Drag preview that matches the final floating edge and names the type the drop will create. */
export function FloatingConnectionLine({ fromNode, toNode, toX, toY, connectionStatus }: ConnectionLineComponentProps) {
  const connectType = useUI((state) => state.connectType)
  const over = toNode && toNode.id !== fromNode.id ? toNode : null
  const [path] = floatingPath(rect(fromNode), over ? rect(over) : { x: toX, y: toY })
  const invalid = connectionStatus === 'invalid'
  const type =
    connectType !== 'auto' ? connectType : over ? inferConnectionType((fromNode.data as CardData).node.type, (over.data as CardData).node.type) : null
  const text = invalid ? 'Already connected or same card' : (type ?? 'Drop on a card')
  const color = invalid ? 'var(--color-danger)' : 'var(--color-accent)'
  return (
    <g>
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeDasharray="6 4" />
      <text
        x={toX + 12}
        y={toY - 10}
        fontSize={11}
        fontWeight={500}
        fill={color}
        paintOrder="stroke"
        stroke="var(--color-app)"
        strokeWidth={4}
        strokeLinejoin="round"
      >
        {text}
      </text>
    </g>
  )
}
