import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import { create } from 'zustand'
import Lightbox, { type ZoomRef } from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import { Button, floating, IconButton } from './ui'

const useLightbox = create<{ src: string | null }>(() => ({ src: null }))

/** Show an image full-screen with zoom and pan. */
export const openImage = (src: string) => useLightbox.setState({ src })

/** Displayed pixels per image pixel at zoom 1 (fit). */
function fitScale() {
  const img = document.querySelector<HTMLImageElement>('.yarl__slide_current .yarl__slide_image')
  if (!img?.naturalWidth || !img.clientWidth) return 1
  return img.clientWidth / img.naturalWidth
}

function ZoomBar(z: ZoomRef) {
  const { zoom } = z
  if (z.disabled) return null
  const min = Math.log2(z.minZoom)
  const max = Math.log2(z.maxZoom)
  const scale = fitScale()
  const pct = Math.round(zoom * scale * 100)
  const set = (target: number, rapid = false) => z.changeZoom(Math.min(z.maxZoom, Math.max(z.minZoom, target)), rapid)
  return (
    <div
      className={`${floating} fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 p-1 text-sm text-fg`}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <IconButton icon={ZoomOut} label="Zoom out" size="sm" tooltipSide="top" disabled={zoom <= z.minZoom} onClick={z.zoomOut} />
      <input
        type="range"
        aria-label="Zoom level"
        aria-valuetext={`${pct}%`}
        min={min}
        max={max}
        step={(max - min) / 400 || 0.01}
        value={Math.log2(zoom)}
        onChange={(e) => set(2 ** Number(e.target.value), true)}
        className="w-40 accent-[var(--color-accent)]"
      />
      <IconButton icon={ZoomIn} label="Zoom in" size="sm" tooltipSide="top" disabled={zoom >= z.maxZoom} onClick={z.zoomIn} />
      <span className="tabular w-11 text-right text-xs text-fg-muted">{pct}%</span>
      <Button size="sm" onClick={() => set(1 / scale)}>
        100%
      </Button>
      <Button size="sm" onClick={() => set(z.minZoom)}>
        <Maximize size={14} aria-hidden />
        Fit
      </Button>
    </div>
  )
}

export function ImageViewer() {
  const src = useLightbox((s) => s.src)
  return (
    <Lightbox
      open={src !== null}
      close={() => useLightbox.setState({ src: null })}
      slides={src ? [{ src }] : []}
      plugins={[Zoom]}
      zoom={{ maxZoomPixelRatio: 8, scrollToZoom: true }}
      carousel={{ finite: true }}
      render={{
        buttonPrev: () => null,
        buttonNext: () => null,
        buttonZoom: (z) => <ZoomBar key="zoom" {...z} />,
      }}
      controller={{ closeOnBackdropClick: true }}
      styles={{ container: { backgroundColor: 'oklch(0.12 0.004 60 / 0.94)' } }}
    />
  )
}
