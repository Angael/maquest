import { useEffect, useRef, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'maquest-inspector-width'
const DEFAULT_WIDTH = 440

export function InspectorPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null)
  const [preferred, setPreferred] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY))
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_WIDTH
    } catch { return DEFAULT_WIDTH }
  })
  const [maximum, setMaximum] = useState(DEFAULT_WIDTH)
  const minimum = Math.min(280, maximum)
  const width = Math.max(minimum, Math.min(preferred, maximum))

  useEffect(() => {
    const container = panel.current?.parentElement
    if (!container) return
    const measure = () => {
      const sidebar = container.querySelector('aside')
      setMaximum(Math.max(0, container.clientWidth - (sidebar?.getBoundingClientRect().width ?? 256) - Math.min(320, container.clientWidth * 0.4)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const resize = (next: number) => {
    const bounded = Math.round(Math.max(minimum, Math.min(next, maximum)))
    setPreferred(bounded)
    try { localStorage.setItem(STORAGE_KEY, String(bounded)) } catch { /* Storage may be unavailable. */ }
  }

  return (
    <div ref={panel} className="relative flex min-h-0 shrink-0" style={{ width }}>
      <div
        role="separator"
        aria-label="Resize inspector"
        aria-orientation="vertical"
        aria-controls="project-inspector"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={width}
        aria-valuetext={`${Math.round(width)} pixels`}
        tabIndex={0}
        title="Drag to resize · Arrow keys adjust · Home / End"
        className="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none outline-none before:absolute before:inset-y-0 before:left-[3px] before:w-px before:bg-transparent hover:before:bg-amber-500/70 focus-visible:before:w-0.5 focus-visible:before:bg-amber-400"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { pointer: event.pointerId, x: event.clientX, width }
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointer !== event.pointerId) return
          resize(drag.current.width + drag.current.x - event.clientX)
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointer !== event.pointerId) return
          drag.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => { drag.current = null }}
        onLostPointerCapture={() => { drag.current = null }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 40 : 10
          if (event.key === 'ArrowLeft') resize(width + step)
          else if (event.key === 'ArrowRight') resize(width - step)
          else if (event.key === 'Home') resize(minimum)
          else if (event.key === 'End') resize(maximum)
          else return
          event.preventDefault()
        }}
      />
      {children}
    </div>
  )
}
