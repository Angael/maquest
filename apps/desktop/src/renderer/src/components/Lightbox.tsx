import { create } from 'zustand'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'

const useLightbox = create<{ src: string | null }>(() => ({ src: null }))

/** Show an image full-screen with zoom and pan. */
export const openImage = (src: string) => useLightbox.setState({ src })

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
      render={{ buttonPrev: () => null, buttonNext: () => null }}
      controller={{ closeOnBackdropClick: true }}
      styles={{ container: { backgroundColor: 'oklch(0.12 0.004 60 / 0.94)' } }}
    />
  )
}
