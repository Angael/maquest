import { useEffect, type RefObject } from 'react'
import { useReactFlow } from '@xyflow/react'

/**
 * Middle drag pans regardless of held modifiers (xyflow refuses to pan with Ctrl held).
 */
export function useCanvasNavigation(ref: RefObject<HTMLElement | null>) {
  const flow = useReactFlow()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let pan: { id: number; x: number; y: number } | null = null

    const panBy = (dx: number, dy: number) => {
      const v = flow.getViewport()
      void flow.setViewport({ x: v.x - dx, y: v.y - dy, zoom: v.zoom })
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 1 || !(e.target as Element).closest('.react-flow')) return
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY }
      el.classList.add('canvas-panning')
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!pan || e.pointerId !== pan.id) return
      panBy(pan.x - e.clientX, pan.y - e.clientY)
      pan.x = e.clientX
      pan.y = e.clientY
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!pan || e.pointerId !== pan.id) return
      pan = null
      el.classList.remove('canvas-panning')
    }

    el.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [ref, flow])
}
