import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize } from 'lucide-react'
import { renderMap } from '@maquest/core/map'
import { mediaUrl } from '../../lib/api'
import { useLiveProject, useMap, useNode } from '../../lib/queries'
import { IconButton, TooltipProvider, cn, floating } from '../ui'
import { toReact } from './svgReact'

type View = { x: number; y: number; s: number }

/**
 * The players' window: one map exactly as the players see it (fog opaque, hidden tokens left out, no GM markers),
 * refreshed live whenever the GM or an agent changes the map. Players can pan and zoom; nothing else.
 */
export function PlayerView({ id }: { id: string }) {
  useLiveProject()
  const { data: doc, error } = useMap(id)
  const node = useNode(id)
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View | null>(null)
  const drag = useRef<{ x: number; y: number; view: View } | null>(null)

  useEffect(() => {
    document.title = node ? `${node.title} · players` : 'Maquest: players'
  }, [node])

  const scene = useMemo(
    () => (doc ? renderMap(doc, { mode: 'export', imageHref: mediaUrl, fog: 'player', lighting: 'player', idPrefix: `pv-${id}-` }) : null),
    [doc, id],
  )
  const content = useMemo(() => scene?.svg.children.map((c, i) => toReact(c, i)), [scene])

  const cols = doc?.grid.cols ?? 0
  const rows = doc?.grid.rows ?? 0
  const fit = useCallback(() => {
    const r = host.current?.getBoundingClientRect()
    if (!r?.width || !cols) return
    const s = Math.min((r.width - 32) / cols, (r.height - 32) / rows)
    setView({ s, x: (r.width - cols * s) / 2, y: (r.height - rows * s) / 2 })
  }, [cols, rows])
  useEffect(() => {
    if (!view) fit()
  }, [fit, view])
  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [fit])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setView((c) => {
        if (!c) return c
        const s = Math.min(400, Math.max(2, c.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))))
        const mx = e.clientX - r.left
        const my = e.clientY - r.top
        return { s, x: mx - ((mx - c.x) / c.s) * s, y: my - ((my - c.y) / c.s) * s }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <TooltipProvider>
      <div
        ref={host}
        data-player-view
        className="fixed inset-0 cursor-grab overflow-hidden bg-app select-none active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (!view) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, view }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (d) setView({ ...d.view, x: d.view.x + e.clientX - d.x, y: d.view.y + e.clientY - d.y })
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onDoubleClick={fit}
      >
        {error && <div className="flex h-full items-center justify-center p-8 text-sm text-fg-subtle">{(error as Error).message}</div>}
        {/* Nothing renders before the map and its fog are ready, so players never glimpse the uncovered map. */}
        {view && content && (
          <svg className="absolute inset-0 h-full w-full" role="img" aria-label={node?.title ?? 'Map'}>
            <g transform={`translate(${view.x} ${view.y}) scale(${view.s})`}>{content}</g>
          </svg>
        )}
        <div className={cn(floating, 'absolute right-3 bottom-3 p-0.5 opacity-40 transition-opacity duration-100 hover:opacity-100')}>
          <IconButton icon={Maximize} label="Fit map to window" tooltipSide="left" onClick={fit} onPointerDown={(e) => e.stopPropagation()} />
        </div>
      </div>
    </TooltipProvider>
  )
}
