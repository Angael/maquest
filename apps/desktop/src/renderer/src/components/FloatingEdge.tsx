import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react'
import { useUI } from '../lib/store'

/** Point where the line between two node centers leaves `node`'s rectangle. */
function intersection(node: InternalNode, other: InternalNode) {
  const w = (node.measured.width ?? 0) / 2
  const h = (node.measured.height ?? 0) / 2
  const c = { x: node.internals.positionAbsolute.x + w, y: node.internals.positionAbsolute.y + h }
  const o = {
    x: other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2,
    y: other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2,
  }
  const dx = o.x - c.x
  const dy = o.y - c.y
  const scale = Math.min(w / Math.abs(dx || 1e-6), h / Math.abs(dy || 1e-6))
  const x = c.x + dx * scale
  const y = c.y + dy * scale
  const pos = Math.abs(dx) * h > Math.abs(dy) * w ? (dx > 0 ? Position.Right : Position.Left) : dy > 0 ? Position.Bottom : Position.Top
  return { x, y, pos }
}
function attachment(node: InternalNode, other: InternalNode, side: string | null | undefined) {
  if (!side || !['top', 'right', 'bottom', 'left'].includes(side)) return intersection(node, other)
  const { x, y } = node.internals.positionAbsolute
  const width = node.measured.width ?? 224
  const height = node.measured.height ?? 80
  return {
    x: x + (side === 'left' ? 0 : side === 'right' ? width : width / 2),
    y: y + (side === 'top' ? 0 : side === 'bottom' ? height : height / 2),
    pos: side as Position,
  }
}

/** Honor saved connector sides; legacy edges attach to the facing borders. */
export function FloatingEdge({ id, source, target, sourceHandleId, targetHandleId, style, markerEnd, label, labelStyle, selected }: EdgeProps) {
  const select = useUI((state) => state.select)
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s || !t) return null
  const a = attachment(s, t, sourceHandleId)
  const b = attachment(t, s, targetHandleId)
  const [path, lx, ly] = getBezierPath({ sourceX: a.x, sourceY: a.y, sourcePosition: a.pos, targetX: b.x, targetY: b.y, targetPosition: b.pos })
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={16} />
      {label && (
        <EdgeLabelRenderer>
          <div
            role="button"
            tabIndex={0}
            aria-label={`Select connection: ${String(label)}`}
            onClick={(event) => { event.stopPropagation(); select({ kind: 'edge', id }) }}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select({ kind: 'edge', id }) } }}
            className="nodrag nopan pointer-events-auto absolute cursor-pointer rounded bg-stone-900 px-1.5 py-0.5 text-[11px] focus-visible:outline focus-visible:outline-amber-400"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, opacity: style?.opacity, outline: selected ? '1px solid currentColor' : undefined, ...labelStyle, color: labelStyle?.fill }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
