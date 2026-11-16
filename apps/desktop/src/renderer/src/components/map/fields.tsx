import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Fill } from '@maquest/core/map'
import { Input, cn } from '../ui'
import { ColorInput, TextureSelect } from './MapToolbar'

/*
 * Compact fields for the map panels. Number fields are text inputs: native number inputs step from their `min`
 * (min 0.25, step 1 gave 1.25, 2.25…) and spin on wheel. Here ↑/↓ step from the current value (Shift ×10,
 * Alt ÷10), Enter or blur commits typed text, Esc reverts, and dragging the label scrubs the value.
 */

const decimals = (n: number) => (Number.isInteger(n) ? 0 : (String(n).split('.')[1]?.length ?? 0))
const roundTo = (n: number, places: number) => Number(n.toFixed(Math.min(6, places)))
const show = (n: number) => String(roundTo(n, 2))

type NumProps = {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  className?: string
  /** Width class of the label (default fits short words). */
  labelClass?: string
}

/** Text that follows `value` from outside unless the field is being edited (focus stays while ↑/↓ commit). */
function useSynced<T>(value: T, format: (v: T) => string) {
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(format(value))
  const formatted = format(value)
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(formatted)
  }, [formatted])
  return [text, setText, ref] as const
}

export function NumField({ label, value, onChange, step = 0.5, min, max, suffix, className, labelClass }: NumProps) {
  const [text, setText, ref] = useSynced(value, show)
  const scrub = useRef<{ x: number; value: number; moved: boolean } | null>(null)
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  const commit = (n: number) => {
    const next = clamp(n)
    setText(show(next))
    if (next !== value) onChange(next)
  }
  const nudge = (by: number) => {
    const places = Math.max(decimals(step), decimals(Math.abs(by)), 2)
    const typed = Number(text.replace(',', '.'))
    commit(roundTo((text.trim() && Number.isFinite(typed) ? typed : value) + by, places))
  }
  const done = () => {
    const n = Number(text.replace(',', '.'))
    if (text.trim() !== '' && Number.isFinite(n)) commit(n)
    else setText(show(value))
  }
  return (
    <label className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <span
        className={cn('shrink-0 cursor-ew-resize truncate text-xs text-fg-subtle select-none', labelClass ?? 'w-12')}
        title="Drag to change"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          scrub.current = { x: e.clientX, value, moved: false }
        }}
        onPointerMove={(e) => {
          const s = scrub.current
          if (!s) return
          const steps = Math.round((e.clientX - s.x) / 6)
          if (!steps && !s.moved) return
          s.moved = true
          setText(show(clamp(roundTo(s.value + steps * step, Math.max(decimals(step), 2)))))
        }}
        onPointerUp={() => {
          const s = scrub.current
          scrub.current = null
          if (s?.moved) done()
        }}
      >
        {label}
      </span>
      <Input
        ref={ref}
        inputMode="decimal"
        spellCheck={false}
        value={text}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setText(show(value))
            e.currentTarget.blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const by = step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1)
            nudge(e.key === 'ArrowUp' ? by : -by)
          } else return
          e.stopPropagation()
        }}
        className="tabular h-6 min-w-0 px-1.5 text-xs"
      />
      {suffix && <span className="shrink-0 text-xs text-fg-faint">{suffix}</span>}
    </label>
  )
}

type TextProps = { label: string; value: string; onChange: (v: string) => void; field?: string; labelClass?: string; placeholder?: string }
export function TextField({ label, value, onChange, field, labelClass, placeholder }: TextProps) {
  const [text, setText, ref] = useSynced(value, (v) => v)
  return (
    <label className="flex min-w-0 items-center gap-1.5">
      <span className={cn('shrink-0 truncate text-xs text-fg-subtle', labelClass ?? 'w-12')}>{label}</span>
      <Input
        ref={ref}
        data-map-field={field}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onChange(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setText(value)
            e.currentTarget.blur()
          }
        }}
        className="h-6 min-w-0 px-1.5 text-xs"
      />
    </label>
  )
}

export function Toggle({ label, checked, onChange, className }: { label: string; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={cn('flex h-6 cursor-pointer items-center gap-2 text-xs text-fg-muted', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  )
}

/** A labelled row of controls. */
export function Row({ label, children, labelClass }: { label: string; children: ReactNode; labelClass?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={cn('shrink-0 truncate text-xs text-fg-subtle', labelClass ?? 'w-12')}>{label}</span>
      {children}
    </div>
  )
}

export function FillRow({ label, fill, onChange, labelClass }: { label: string; fill: Fill; onChange: (f: Fill) => void; labelClass?: string }) {
  return (
    <Row label={label} labelClass={labelClass}>
      <ColorInput label={`${label} color`} value={fill.color ?? '#888888'} onChange={(color) => onChange({ ...fill, color })} />
      <TextureSelect label={`${label} texture`} value={fill.texture} onChange={(texture) => onChange({ ...fill, texture })} className="min-w-0 flex-1" />
    </Row>
  )
}

export function Section({ title, children, action, className }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-line px-3 py-3 last:border-b-0', className)}>
      <div className="mb-2 flex h-6 items-center justify-between gap-2">
        <h3 className="truncate text-xs font-medium text-fg-subtle">{title}</h3>
        {action}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}
