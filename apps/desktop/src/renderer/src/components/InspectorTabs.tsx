import { memo, useEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { useTypes } from '../lib/styles'
import { cn } from './ui'

/** Pinned nodes (middle-click a card) for flipping between e.g. several stat blocks; the viewed node shows as a preview tab. */
export const InspectorTabs = memo(function InspectorTabs() {
  const tabs = useUI((s) => s.tabs)
  const active = useUI((s) => (s.selection?.kind === 'node' ? s.selection.id : null))
  const select = useUI((s) => s.select)
  const closeTab = useUI((s) => s.closeTab)
  const openTab = useUI((s) => s.openTab)
  const { data: nodes } = useNodes()
  const types = useTypes()
  const strip = useRef<HTMLDivElement>(null)
  const live = useMemo(() => {
    const byId = new Map((nodes ?? []).map((n) => [n.id, n]))
    const shown = active && !tabs.includes(active) ? [...tabs, active] : tabs
    return shown.flatMap((id) => {
      const node = byId.get(id)
      return node ? [node] : []
    })
  }, [nodes, tabs, active])

  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active, live.length])

  if (!tabs.length) return null
  return (
    <div
      ref={strip}
      role="tablist"
      aria-label="Open nodes"
      className="flex h-8 shrink-0 items-end gap-px overflow-x-auto overflow-y-hidden bg-app px-1 shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none]! hover:[scrollbar-width:none]! [&::-webkit-scrollbar]:hidden"
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
      }}
    >
      {live.map((node) => {
        const S = types.of(node.type)
        const pinned = tabs.includes(node.id)
        const on = node.id === active
        return (
          <div
            key={node.id}
            className={cn(
              'group/tab flex h-7 max-w-44 shrink-0 items-center gap-1 rounded-t-md pr-1 pl-2 text-xs transition-colors duration-100',
              on
                ? 'bg-panel text-fg shadow-[inset_1px_0_0_var(--color-line),inset_-1px_0_0_var(--color-line),inset_0_1px_0_var(--color-line)]'
                : 'text-fg-subtle hover:bg-hover hover:text-fg-muted',
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={on}
              title={pinned ? node.title : `${node.title} (double-click to keep open)`}
              className={cn('flex h-full min-w-0 items-center gap-1.5 outline-none focus-visible:underline', !pinned && 'italic')}
              onClick={() => select({ kind: 'node', id: node.id })}
              onDoubleClick={() => openTab(node.id)}
              onAuxClick={(e) => e.button === 1 && pinned && closeTab(node.id)}
            >
              <S.icon size={12} aria-hidden style={{ color: S.color }} className="shrink-0" />
              <span className="truncate">{node.title}</span>
            </button>
            {pinned ? (
              <button
                type="button"
                aria-label={`Close ${node.title}`}
                title={`Close ${node.title}`}
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-[3px] text-fg-faint outline-none hover:bg-hover hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/70',
                  on ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
                )}
                onClick={() => closeTab(node.id)}
              >
                <X size={11} aria-hidden />
              </button>
            ) : (
              <span className="w-1" />
            )}
          </div>
        )
      })}
    </div>
  )
})
