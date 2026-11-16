import { useEffect, type RefObject } from 'react'
import { useReactFlow, useStoreApi } from '@xyflow/react'

/** How long a detected touchpad gesture keeps later wheel events classified as touchpad. */
const GESTURE_STICKY_MS = 500

/**
 * Canvas navigation that xyflow can't express:
 * - Middle drag pans regardless of held modifiers (Ctrl/Shift/Alt included).
 * - Touchpad two-finger scroll pans; pinch (ctrl-wheel) zooms.
 * - Mouse wheel zooms around the pointer; Shift+wheel pans horizontally.
 */
export function useCanvasNavigation(ref: RefObject<HTMLElement | null>) {
  const flow = useReactFlow()
  const store = useStoreApi()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let lastTouchpad = -Infinity
    let pan: { id: number; x: number; y: number } | null = null

    const isTouchpad = (e: WheelEvent) => {
      if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false // Line/page deltas come from wheels.
      const now = e.timeStamp
      // Touchpads send fractional or small deltas and often both axes; wheels send coarse notches on one axis.
      const fine = e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 40
      if (fine) lastTouchpad = now
      return now - lastTouchpad < GESTURE_STICKY_MS
    }

    const zoomAt = (clientX: number, clientY: number, factor: number) => {
      const { minZoom, maxZoom } = store.getState()
      const { x, y, zoom } = flow.getViewport()
      const next = Math.min(maxZoom, Math.max(minZoom, zoom * factor))
      const rect = el.getBoundingClientRect()
      const px = clientX - rect.left
      const py = clientY - rect.top
      void flow.setViewport({ x: px - ((px - x) * next) / zoom, y: py - ((py - y) * next) / zoom, zoom: next })
    }

    const panBy = (dx: number, dy: number) => {
      const v = flow.getViewport()
      void flow.setViewport({ x: v.x - dx, y: v.y - dy, zoom: v.zoom })
    }

    const onWheel = (e: WheelEvent) => {
      const target = e.target as Element
      if (target.closest('.nowheel') || !target.closest('.react-flow')) return
      e.preventDefault()
      e.stopPropagation()
      const scale = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 400 : 1
      const dx = e.deltaX * scale
      const dy = e.deltaY * scale
      const touchpad = isTouchpad(e)
      if (e.ctrlKey || e.metaKey) {
        // Pinch arrives as ctrl-wheel with fine deltas; Ctrl+mouse wheel uses coarse ones.
        zoomAt(e.clientX, e.clientY, Math.pow(2, -dy * (touchpad ? 0.01 : 0.002)))
      } else if (touchpad) {
        panBy(dx, dy)
      } else if (e.shiftKey) {
        panBy(dy || dx, 0)
      } else {
        zoomAt(e.clientX, e.clientY, Math.pow(2, -dy * 0.002))
      }
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

    el.addEventListener('wheel', onWheel, { capture: true, passive: false })
    el.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      el.removeEventListener('wheel', onWheel, { capture: true })
      el.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [ref, flow, store])
}
