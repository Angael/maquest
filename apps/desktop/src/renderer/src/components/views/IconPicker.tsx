import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { Search } from 'lucide-react'
import { ICON_NAMES, iconFor } from '../../lib/styles'
import { Input, cn } from '../ui'

const ICON_LIMIT = 240
/** One tooltip shared by every icon in the grid (detached triggers), instead of hundreds of tooltip roots. */
const iconTip = BaseTooltip.createHandle<string>()

/** Searchable lucide icon grid. Filtering is deferred and the grid memoized so typing stays instant. */
export function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (icon: string) => void }) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const matches = useMemo(() => {
    const q = deferred.trim().toLowerCase().replaceAll(/\s+/g, '-')
    const list = q ? ICON_NAMES.filter((n) => n.includes(q)) : ICON_NAMES
    return list.toSorted((a, b) => Number(!a.startsWith(q)) - Number(!b.startsWith(q)) || a.length - b.length)
  }, [deferred])
  const shown = useMemo(() => matches.slice(0, ICON_LIMIT), [matches])
  const pick = useCallback((name: string) => onChange(name), [onChange])

  return (
    <div className="overflow-hidden rounded-lg bg-surface/50 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="relative border-b border-line p-2">
        <Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-fg-faint" />
        <Input
          type="search"
          aria-label="Search icons"
          placeholder={`Search ${ICON_NAMES.length.toLocaleString()} icons…`}
          spellCheck={false}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>
      <IconGrid names={shown} value={value} color={color} onPick={pick} />
      <div className="flex h-8 items-center gap-2 border-t border-line px-3 text-2xs text-fg-faint" aria-live="polite">
        <span className="flex-1 truncate">
          {!matches.length
            ? 'No icons match. Try a broader word, like “animal” or “arrow”.'
            : matches.length > ICON_LIMIT
              ? `Showing ${ICON_LIMIT} of ${matches.length.toLocaleString()}. Search to narrow down.`
              : `${matches.length} ${matches.length === 1 ? 'icon' : 'icons'}`}
        </span>
        <span className="truncate">
          Current: <span className="font-mono text-fg-subtle">{value}</span>
        </span>
      </div>
      <BaseTooltip.Root handle={iconTip}>
        {({ payload }) => (
          <BaseTooltip.Portal>
            <BaseTooltip.Positioner side="top" sideOffset={6} className="z-[70]">
              <BaseTooltip.Popup className="tooltip-motion rounded-md bg-raised px-2 py-1 font-mono text-2xs text-fg shadow-[var(--shadow-popover)]">
                {payload}
              </BaseTooltip.Popup>
            </BaseTooltip.Positioner>
          </BaseTooltip.Portal>
        )}
      </BaseTooltip.Root>
    </div>
  )
}

const IconGrid = memo(function IconGrid({ names, value, color, onPick }: { names: string[]; value: string; color: string; onPick: (name: string) => void }) {
  return (
    <div
      role="listbox"
      aria-label="Icons"
      className="grid max-h-60 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-0.5 overflow-y-auto overscroll-contain p-2"
    >
      {names.map((name) => {
        const Icon = iconFor(name)
        const on = name === value
        return (
          <BaseTooltip.Trigger
            key={name}
            handle={iconTip}
            payload={name}
            delay={300}
            render={
              <button
                type="button"
                role="option"
                aria-selected={on}
                aria-label={name}
                onClick={() => onPick(name)}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/70',
                  on ? 'bg-active shadow-[inset_0_0_0_1.5px_currentColor]' : 'text-fg-subtle hover:bg-hover hover:text-fg',
                )}
                style={on ? { color } : undefined}
              />
            }
          >
            <Icon size={18} aria-hidden />
          </BaseTooltip.Trigger>
        )
      })}
    </div>
  )
})
