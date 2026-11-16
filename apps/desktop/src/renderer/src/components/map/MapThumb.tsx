import { memo, useMemo } from 'react'
import { renderMap } from '@maquest/core/map'
import { mediaUrl } from '../../lib/api'
import { useMap } from '../../lib/queries'
import { toReact } from './svgReact'
import { cn } from '../ui'

/** A map's picture (no tokens or fog) for cards and the inspector; refreshes live with the file. */
export const MapThumb = memo(function MapThumb({ id, className }: { id: string; className?: string }) {
  const { data: doc } = useMap(id)
  const svg = useMemo(
    () => (doc ? toReact({ ...renderMap(doc, { imageHref: mediaUrl, tokens: false, idPrefix: `thumb-${id}-`, width: '100%', height: '100%' }).svg }) : null),
    [doc, id],
  )
  if (!doc) return <div className={cn('aspect-[3/2] bg-app', className)} />
  return (
    <div className={cn('overflow-hidden bg-app', className)} style={{ aspectRatio: `${doc.grid.cols} / ${doc.grid.rows}` }}>
      {svg}
    </div>
  )
})
