import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { cn } from './ui'

/*
 * Keeping any value inside its widget, however an agent wrote it. Text that runs long is clamped to a few lines with
 * "Show more"; lists past a sensible length show their first items and "Show all N"; text cut to one line shows in full
 * on hover. Nothing is ever hidden without a way to see it.
 */

/** One ResizeObserver for every clamp on screen. */
const callbacks = new WeakMap<Element, () => void>()
let observer: ResizeObserver | undefined
function watch(el: Element, check: () => void) {
  observer ??= new ResizeObserver((entries) => {
    for (const e of entries) callbacks.get(e.target)?.()
  })
  callbacks.set(el, check)
  observer.observe(el)
  return () => {
    observer?.unobserve(el)
    callbacks.delete(el)
  }
}

/** Shows an element's full text as a native tooltip on hover, but only while it is cut off. */
export const fullOnHover = (text: string) => ({
  onMouseEnter: (e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget
    const cut = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
    if (cut) el.title = text
    else el.removeAttribute('title')
  },
})

const toggle =
  'rounded-sm text-2xs font-medium text-fg-subtle outline-none transition-colors duration-100 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70'

/**
 * Text (or rich content) cut to `lines` lines, with "Show more" when it overflows. Plain text ends in an ellipsis;
 * `rich` content (markdown) fades out instead, since line-clamp can't count lines across blocks.
 */
export function Clamp({
  lines,
  rich,
  className,
  style,
  children,
}: {
  lines: number
  rich?: boolean
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setCut(el.scrollHeight > el.clientHeight + 1)
    check()
    return watch(el, check)
  }, [open, children])
  const clamp: CSSProperties | undefined = open
    ? undefined
    : rich
      ? { maxHeight: `${lines}lh`, overflow: 'hidden', ...(cut && { maskImage: 'linear-gradient(to bottom, #000 calc(100% - 1lh), transparent)' }) }
      : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' }
  return (
    <>
      <div ref={ref} className={cn('min-w-0 wrap-anywhere', className)} style={{ ...style, ...clamp }}>
        {children}
      </div>
      {(cut || open) && (
        <button type="button" aria-expanded={open} className={cn(toggle, 'mt-0.5 block')} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
}

/**
 * The first `limit` of `items` until "Show all" is pressed (or `page` more at a time), and never fewer than `atLeast`.
 * `more` is the button (null when everything fits): a chip for chip rows, a text button under lists and tables.
 */
export function useLimit<T>(items: readonly T[], limit: number, opts: { noun?: string; chip?: boolean; page?: number; atLeast?: number } = {}) {
  const [expanded, setShown] = useState(limit)
  const shown = Math.max(expanded, opts.atLeast ?? 0)
  const hidden = items.length - shown
  // A few extra items aren't worth a button.
  const fits = items.length <= limit + Math.ceil(limit / 5)
  if (fits) return { visible: items, more: null }
  const all = hidden <= 0
  const next = opts.page ? Math.min(opts.page, hidden) : hidden
  const label = all
    ? 'Show fewer'
    : opts.chip
      ? `+${hidden} more`
      : opts.page && next < hidden
        ? `Show ${next} more of ${hidden}`
        : `Show all ${items.length}${opts.noun ? ` ${opts.noun}` : ''}`
  const more = (
    <button
      type="button"
      aria-expanded={all}
      onClick={() => setShown(all ? limit : shown + next)}
      className={cn(
        toggle,
        'tabular',
        opts.chip && 'inline-flex h-6 shrink-0 items-center rounded-full px-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-hover',
      )}
    >
      {label}
    </button>
  )
  return { visible: all ? items : items.slice(0, shown), more }
}

/** Font size for a number in a tile by how long it reads, so short values stay big and long ones still fit. */
export function numberSize(text: string, sizes: readonly [string, string, string]) {
  const n = [...text].length
  return n <= 4 ? sizes[0] : n <= 6 ? sizes[1] : sizes[2]
}
