import { memo } from 'react'
import { ViewportPortal } from '@xyflow/react'
import { PHASE_WIDTH, type Board } from '@maquest/core/schema'

/** Phase columns drawn in flow coordinates behind the cards; a card's phase is the column it sits in. */
export const PhaseLanes = memo(function PhaseLanes({ phases, layout }: { phases: Board['phases']; layout: Board['layout'] }) {
  if (!phases.length) return null
  const ys = Object.values(layout).map((p) => p.y)
  const top = (ys.length ? Math.min(...ys) : 0) - 120
  const height = Math.max(1600, (ys.length ? Math.max(...ys) : 0) - top + 600)
  return (
    <ViewportPortal>
      {phases.map((phase, i) => (
        <div
          key={phase.id}
          className={`canvas-phase pointer-events-none absolute ${i % 2 ? 'canvas-phase--odd' : ''}`}
          style={{ transform: `translate(${i * PHASE_WIDTH}px, ${top}px)`, width: PHASE_WIDTH, height }}
        >
          <div className="flex items-baseline gap-2 px-5 py-4 font-serif text-2xl text-fg-faint">
            <span className="tabular text-lg text-fg-faint/70">{i + 1}</span>
            {phase.title}
          </div>
        </div>
      ))}
    </ViewportPortal>
  )
})
