import clsx from 'clsx'
import { X } from 'lucide-react'
import { useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { useTypes } from '../lib/styles'

/** Pinned nodes (middle-click a card) for flipping between e.g. several stat blocks; the viewed node shows as a preview tab. */
export function InspectorTabs() {
  const { tabs, selection, select, closeTab, openTab } = useUI()
  const { data: nodes = [] } = useNodes()
  const types = useTypes()
  const active = selection?.kind === 'node' ? selection.id : null
  const shown = active && !tabs.includes(active) ? [...tabs, active] : tabs
  const live = shown.filter((id) => nodes.some((n) => n.id === id))
  if (!tabs.length) return null
  return (
    <div role="tablist" aria-label="Open nodes" className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-l border-stone-800 bg-stone-950 px-1 pt-1">
      {live.map((id) => {
        const node = nodes.find((n) => n.id === id)!
        const S = types.of(node.type)
        const pinned = tabs.includes(id)
        return (
          <div
            key={id}
            className={clsx(
              'group flex max-w-44 shrink-0 items-center gap-1 rounded-t-md border border-b-0 px-2 py-1 text-xs',
              id === active ? 'border-stone-700 bg-stone-900 text-stone-100' : 'border-transparent text-stone-400 hover:text-stone-200',
            )}
          >
            <button
              role="tab"
              aria-selected={id === active}
              title={pinned ? node.title : `${node.title} (double-click to keep open)`}
              className={clsx('flex min-w-0 items-center gap-1', !pinned && 'italic')}
              onClick={() => select({ kind: 'node', id })}
              onDoubleClick={() => openTab(id)}
              onAuxClick={(e) => e.button === 1 && pinned && closeTab(id)}
            >
              <S.icon size={12} style={{ color: S.color }} className="shrink-0" />
              <span className="truncate">{node.title}</span>
            </button>
            {pinned && (
              <button aria-label={`Close ${node.title}`} className="shrink-0 rounded text-stone-500 hover:text-stone-100" onClick={() => closeTab(id)}>
                <X size={12} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
