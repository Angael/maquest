import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, MoreHorizontal, X, type LucideIcon } from 'lucide-react'
import { useUI } from '../../lib/store'
import { IconButton, Menu, Tooltip, cn } from '../ui'

/** Copies `text`; returns a flag that stays true briefly for inline "copied" feedback. */
export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return [
    copied,
    (text) => {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1200)
      })
    },
  ]
}

/** Compact first row of the inspector: kind (icon + label in its color), id, actions menu and close. */
export function InspectorHeader({
  icon: Icon,
  label,
  color,
  id,
  menu,
}: {
  icon: LucideIcon
  label: string
  color?: string
  /** Copyable identifier shown after the label. */
  id?: string
  /** Menu items for the "…" actions menu. */
  menu: ReactNode
}) {
  const select = useUI((s) => s.select)
  const [copied, copy] = useCopy()
  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 pr-2 pl-4">
      <Icon size={14} aria-hidden className={cn('shrink-0', !color && 'text-fg-subtle')} style={color ? { color } : undefined} />
      <span className="shrink-0 text-xs font-medium" style={color ? { color } : undefined}>
        {label}
      </span>
      {id && (
        <Tooltip content={copied ? 'Copied' : 'Copy ID'}>
          <button
            type="button"
            aria-label={`Copy ID ${id}`}
            translate="no"
            onClick={() => copy(id)}
            className="group/id -my-1 flex min-w-0 items-center gap-1 rounded px-1 py-1 font-mono text-2xs text-fg-faint outline-none hover:bg-hover hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <span className="truncate">{id}</span>
            {copied && <Check size={11} className="shrink-0 text-success" aria-hidden />}
          </button>
        </Tooltip>
      )}
      <span role="status" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
      <div className="ml-auto flex shrink-0 items-center">
        <Menu align="end" trigger={<IconButton icon={MoreHorizontal} label="More actions" size="sm" />}>
          {menu}
        </Menu>
        <IconButton icon={X} label="Close inspector" shortcut="Esc" size="sm" onClick={() => select(null)} />
      </div>
    </div>
  )
}
