import { createElement, memo, useId, useMemo, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'
import type { FieldDef, StoryNode } from '@maquest/core/schema'
import {
  fieldLabel,
  isEmptyValue,
  normalizeName,
  listItems,
  meterValue,
  noted,
  pairEntries,
  plainText,
  refIds,
  scoreCells,
  tableRows,
  toBool,
  toNumber,
  type FieldRow,
  type FieldSection,
} from '@maquest/core/sheet'
import { useNodes } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { findIcon, useTypes } from '../../lib/styles'
import { cn } from '../ui'
import { Records } from './Records'

/*
 * Read views of fields. Each widget is quiet chrome around the value: numbers large and tabular, labels as small
 * eyebrows, and the field's accent (its color, else the node type's) only in fills, rings and thin highlights.
 * Meters, ratings, clocks and toggles can be set with a click right here; everything else edits with the pencil.
 */

/** Changes one field's value (null clears it). */
export type SetField = (key: string, value: unknown) => void

export const eyebrow = 'text-2xs font-medium tracking-[0.06em] text-fg-subtle uppercase'
const tile =
  'relative min-w-0 overflow-hidden rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--color-line)] bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_oklab,var(--tint)_11%,transparent),transparent_62%)]'
/** A one-pixel tinted highlight along a tile's top edge. */
const Sheen = () => (
  <span
    aria-hidden
    className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--tint)_55%,transparent),transparent)]"
  />
)
export const tint = (color: string): CSSProperties => ({ '--tint': color }) as CSSProperties

/** Widgets laid out in the tile grid (one cell, or two for wide ones); the rest take a full row. */
const cellSpan = (def: FieldDef, value: unknown): 0 | 1 | 2 => {
  if (def.widget === 'stat' || def.widget === 'toggle') return 1
  if (def.widget !== 'meter') return 0
  const style = def.style ?? 'bar'
  if (style === 'ring' || style === 'clock') return 1
  if (style === 'bar') return 2
  const max = meterValue(def, value).max ?? 0
  return max > 6 ? 2 : 1
}

/**
 * The fields of a fields tab: subtitle fields as one line on top, then each section with its tiles packed in a
 * grid and wider widgets (scores, tables, lists…) in full rows, all in the configured order.
 */
export const FieldSheet = memo(function FieldSheet({
  sections,
  values,
  color,
  onSet,
}: {
  sections: readonly FieldSection[]
  values: Record<string, unknown>
  /** The node type's color, the default accent. */
  color: string
  onSet?: SetField
}) {
  const filled = sections.map((s) => ({
    ...s,
    rows: s.fields.map((def) => ({ def, value: values[def.key], known: true })).filter((r) => !isEmptyValue(r.value)),
  }))
  const subtitle = filled
    .flatMap((s) => s.rows)
    .filter((r) => r.def.widget === 'subtitle')
    .map((r) => plainText(r.value))
    .join(' · ')
  return (
    <div className="space-y-6" data-field-sheet style={tint(color)}>
      {subtitle && <p className="font-serif text-base leading-6 text-fg-muted italic">{subtitle}</p>}
      {filled.map((s, i) => {
        const rows = s.rows.filter((r) => r.def.widget !== 'subtitle')
        if (!rows.length) return null
        return (
          <section key={`${i}:${s.title ?? ''}`} aria-label={s.title} className="space-y-3">
            {s.title && (
              <h3 className="flex items-center gap-2 text-xs font-medium text-fg-subtle">
                {s.title}
                <span aria-hidden className="h-px flex-1 bg-line" />
              </h3>
            )}
            <Rows rows={rows} color={color} onSet={onSet} section={s.title} />
          </section>
        )
      })}
    </div>
  )
})

/** Rows in order, consecutive tiles gathered into one grid and consecutive text lines into one list. */
function Rows({ rows, color, onSet, section }: { rows: FieldRow[]; color: string; onSet?: SetField; section?: string }) {
  const runs: { kind: 'tiles' | 'lines' | 'block'; rows: FieldRow[] }[] = []
  for (const r of rows) {
    const kind = cellSpan(r.def, r.value) ? 'tiles' : r.def.widget === 'text' ? 'lines' : 'block'
    const last = runs.at(-1)
    if (last && last.kind === kind && kind !== 'block') last.rows.push(r)
    else runs.push({ kind, rows: [r] })
  }
  return (
    <>
      {runs.map((run) =>
        run.kind === 'tiles' ? (
          <div key={run.rows[0].def.key} className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
            {run.rows.map((r) => (
              <div key={r.def.key} className={cn(cellSpan(r.def, r.value) === 2 && 'col-span-2')} style={r.def.color ? tint(r.def.color) : undefined}>
                <Widget row={r} color={r.def.color ?? color} onSet={onSet} />
              </div>
            ))}
          </div>
        ) : run.kind === 'lines' ? (
          <dl key={run.rows[0].def.key} className="grid grid-cols-[minmax(72px,max-content)_1fr] gap-x-4 gap-y-1.5 text-sm leading-5">
            {run.rows.map((r) => (
              <TextLine key={r.def.key} row={r} />
            ))}
          </dl>
        ) : (
          <div key={run.rows[0].def.key} style={run.rows[0].def.color ? tint(run.rows[0].def.color) : undefined}>
            <Widget row={run.rows[0]} color={run.rows[0].def.color ?? color} onSet={onSet} section={section} />
          </div>
        ),
      )}
    </>
  )
}

/** One field's read view by its widget. */
export function Widget({ row, color, onSet, section }: { row: FieldRow; color: string; onSet?: SetField; section?: string }) {
  const set = onSet && ((v: unknown) => onSet(row.def.key, v))
  // A block named like its section doesn't repeat the name.
  if (section && normalizeName(section) === normalizeName(fieldLabel(row.def))) row = { ...row, def: { ...row.def, label: '' } }
  switch (row.def.widget) {
    case 'stat':
      return <Stat row={row} />
    case 'toggle':
      return <Toggle row={row} onSet={set} />
    case 'meter':
      return <Meter row={row} onSet={set} />
    case 'scores':
      return <Scores row={row} color={color} onSet={onSet && ((v) => onSet(row.def.key, v))} />
    case 'pairs':
      return <Pairs row={row} />
    case 'tags':
      return <Tags row={row} />
    case 'list':
      return <List row={row} />
    case 'refs':
      return <Refs row={row} />
    case 'table':
      return <Table row={row} />
    case 'records':
      return <Records row={row} onSet={set} />
    case 'quote':
      return <QuoteBlock row={row} />
    case 'subtitle':
      return <p className="font-serif text-base text-fg-muted italic">{plainText(row.value)}</p>
    default:
      return (
        <dl className="grid grid-cols-[minmax(72px,max-content)_1fr] gap-x-4 text-sm leading-5">
          <TextLine row={row} />
        </dl>
      )
  }
}

/** A field's label with its icon (the field's `icon`, a lucide name), if it has one. */
export function FieldLabel({ def, label = fieldLabel(def), size = 12 }: { def: FieldDef; label?: string; size?: number }) {
  const Icon = findIcon(def.icon)
  if (!Icon) return <>{label}</>
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {createElement(Icon, { size, 'aria-hidden': true, className: 'shrink-0 text-[color-mix(in_oklab,var(--tint)_75%,var(--color-fg-subtle))]' })}
      <span className="truncate">{label}</span>
    </span>
  )
}

export function Block({ label, children, aside, def }: { label: string; children: ReactNode; aside?: ReactNode; def?: FieldDef }) {
  return (
    <div className="min-w-0">
      {(label || aside) && (
        <div className="mb-1.5 flex items-baseline gap-2">
          {label && <span className={eyebrow}>{def ? <FieldLabel def={def} label={label} /> : label}</span>}
          {aside && <span className="ml-auto text-2xs text-fg-faint">{aside}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

function TextLine({ row }: { row: FieldRow }) {
  const { value, note } = noted(row.value)
  return (
    <>
      <dt className="truncate text-fg-subtle">
        <FieldLabel def={row.def} size={13} />
      </dt>
      <dd className="min-w-0 break-words text-fg">
        {value}
        {note && <span className="text-fg-subtle"> ({note})</span>}
      </dd>
    </>
  )
}

function Stat({ row }: { row: FieldRow }) {
  const { value, note } = noted(row.value)
  const numeric = toNumber(value) !== null && value.length <= 8
  return (
    <div className={cn(tile, 'h-full px-3 pt-2 pb-2.5')} data-widget="stat">
      <Sheen />
      <div className={cn(eyebrow, 'truncate')}>
        <FieldLabel def={row.def} />
      </div>
      <div
        className={cn(
          'mt-0.5 break-words text-fg',
          numeric ? 'tabular font-serif text-[26px] leading-8 font-semibold tracking-[-0.01em]' : 'text-base leading-6 font-medium',
        )}
      >
        {value}
      </div>
      {note && <div className="mt-0.5 text-2xs leading-4 text-fg-subtle">{note}</div>}
    </div>
  )
}

function Toggle({ row, onSet }: { row: FieldRow; onSet?: (v: unknown) => void }) {
  const on = toBool(row.value)
  const Icon = on ? Check : Minus
  return (
    <button
      type="button"
      disabled={!onSet}
      aria-pressed={!!on}
      aria-label={`${fieldLabel(row.def)}: ${on ? 'yes' : 'no'}`}
      onClick={() => onSet?.(!on)}
      data-widget="toggle"
      className={cn(
        tile,
        'flex h-full w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-[box-shadow] duration-100 enabled:hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus-visible:ring-2 focus-visible:ring-accent/70',
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-150',
          on ? 'bg-[var(--tint)] text-app' : 'text-fg-faint shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]',
        )}
      >
        <Icon size={13} strokeWidth={2.5} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={cn(eyebrow, 'block truncate')}>
          <FieldLabel def={row.def} />
        </span>
        <span className={cn('block text-sm font-medium', on ? 'text-fg' : 'text-fg-subtle')}>{on === null ? plainText(row.value) : on ? 'Yes' : 'No'}</span>
      </span>
    </button>
  )
}

// ---------- meters ----------

function Meter({ row, onSet }: { row: FieldRow; onSet?: (v: unknown) => void }) {
  const { def } = row
  const m = meterValue(def, row.value)
  const style = def.style ?? 'bar'
  const label = fieldLabel(def)
  /** Writes a new current value in the shape the value already has. */
  const write =
    onSet &&
    ((n: number) => {
      const v = row.value
      if (v && typeof v === 'object' && !Array.isArray(v)) onSet({ ...(v as object), value: n })
      else if (typeof v === 'string' && v.includes('/')) onSet(`${n}/${m.max}`)
      else onSet(n)
    })
  const amount = (
    <span className="tabular">
      <span className="font-serif text-[22px] leading-7 font-semibold text-fg">{m.value ?? plainText(row.value)}</span>
      {m.max !== null && <span className="text-sm text-fg-subtle"> / {m.max}</span>}
    </span>
  )
  if (m.value === null || m.max === null || m.max <= 0 || style === 'bar') {
    const ratio = m.value !== null && m.max ? Math.max(0, Math.min(1, m.value / m.max)) : null
    return (
      <div className={cn(tile, 'h-full px-3 pt-2 pb-3')} data-widget="meter">
        <Sheen />
        <div className="flex items-baseline gap-2">
          <span className={cn(eyebrow, 'truncate')}>
            <FieldLabel def={def} />
          </span>
          <span className="ml-auto">{amount}</span>
        </div>
        {ratio !== null && (
          <div
            role="meter"
            aria-label={label}
            aria-valuenow={m.value ?? undefined}
            aria-valuemin={0}
            aria-valuemax={m.max ?? undefined}
            className="relative mt-2 h-2 overflow-hidden rounded-full bg-active"
          >
            <div
              className="h-full origin-left rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--tint)_55%,var(--color-surface)),var(--tint))] shadow-[0_0_12px_-2px_var(--tint)] transition-transform duration-300 ease-[var(--ease-out)]"
              style={{ transform: `scaleX(${ratio})` }}
            />
            {m.max !== null && m.max <= 24 && m.max > 1 && (
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(${100 / m.max}% - 1px), var(--color-panel) calc(${100 / m.max}% - 1px) ${100 / m.max}%)`,
                }}
              />
            )}
          </div>
        )}
      </div>
    )
  }
  const max = Math.min(Math.round(m.max), 40)
  if (style === 'ring') return <Ring label={label} value={m.value} max={m.max} amount={amount} />
  if (style === 'clock') return <Clock label={label} value={m.value} max={Math.min(max, 12)} onSet={write} />
  return (
    <div className={cn(tile, 'h-full px-3 pt-2 pb-2.5')} data-widget="meter">
      <Sheen />
      <div className="flex items-baseline gap-2">
        <span className={cn(eyebrow, 'truncate')}>{label}</span>
        <span className="tabular ml-auto text-xs text-fg-subtle">
          {m.value}/{m.max}
        </span>
      </div>
      <Pips label={label} value={m.value} max={max} shape={style === 'boxes' ? 'box' : 'dot'} onSet={write} className="mt-2" />
    </div>
  )
}

/**
 * A row of dots or boxes, filled up to `value`. With `onSet`, each is a button: clicking one sets the value to it,
 * clicking the last filled one takes one away.
 */
export function Pips({
  label,
  value,
  max,
  shape,
  onSet,
  className,
}: {
  label: string
  value: number
  max: number
  shape: 'dot' | 'box'
  onSet?: (n: number) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={`${label}: ${value} of ${max}`} className={cn('flex flex-wrap gap-1', className)}>
      {Array.from({ length: max }, (_, i) => {
        const on = i < value
        const pip = cn(
          'block transition-[background-color,box-shadow,transform] duration-150 ease-[var(--ease-out)]',
          shape === 'dot' ? 'size-3 rounded-full' : 'size-3.5 rounded-[3px]',
          on ? 'bg-[var(--tint)] shadow-[0_0_8px_-2px_var(--tint)]' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]',
        )
        if (!onSet) return <span key={i} aria-hidden className={pip} />
        return (
          <button
            key={i}
            type="button"
            aria-label={`Set ${label} to ${i + 1 === value ? i : i + 1}`}
            onClick={() => onSet(i + 1 === value ? i : i + 1)}
            className="-m-0.5 rounded-full p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent/70 [&:active>span]:scale-90"
          >
            <span className={pip} />
          </button>
        )
      })}
    </div>
  )
}

function Ring({ label, value, max, amount }: { label: string; value: number; max: number; amount: ReactNode }) {
  const r = 26
  const c = 2 * Math.PI * r
  const ratio = Math.max(0, Math.min(1, value / max))
  return (
    <div className={cn(tile, 'flex h-full flex-col items-center px-2 pt-2.5 pb-2')} data-widget="meter">
      <Sheen />
      <div className="relative size-16">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-active)" strokeWidth="5" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="var(--tint)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - ratio)}
            className="transition-[stroke-dashoffset] duration-500 ease-[var(--ease-out)] [filter:drop-shadow(0_0_4px_color-mix(in_oklab,var(--tint)_60%,transparent))]"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center [&_.font-serif]:text-lg [&_.text-sm]:hidden">{amount}</div>
      </div>
      <div className={cn(eyebrow, 'mt-1 max-w-full truncate')}>{label}</div>
      <div className="tabular text-2xs text-fg-faint">of {max}</div>
    </div>
  )
}

/** A progress clock: a circle cut into segments, filled clockwise. */
function Clock({ label, value, max, onSet }: { label: string; value: number; max: number; onSet?: (n: number) => void }) {
  const size = 64
  const r = 28
  const c = size / 2
  const at = (i: number) => {
    const a = (i / max) * 2 * Math.PI - Math.PI / 2
    return `${c + r * Math.cos(a)} ${c + r * Math.sin(a)}`
  }
  return (
    <div className={cn(tile, 'flex h-full flex-col items-center px-2 pt-2.5 pb-2')} data-widget="meter">
      <Sheen />
      <svg viewBox={`0 0 ${size} ${size}`} className="size-16" role="group" aria-label={`${label}: ${value} of ${max}`}>
        <circle cx={c} cy={c} r={r} fill="var(--color-active)" />
        {Array.from({ length: max }, (_, i) => {
          const on = i < value
          const next = i + 1 === value ? i : i + 1
          return (
            <path
              key={i}
              d={`M ${c} ${c} L ${at(i)} A ${r} ${r} 0 0 1 ${at(i + 1)} Z`}
              fill={on ? 'var(--tint)' : 'transparent'}
              stroke="var(--color-surface)"
              strokeWidth="2"
              className={cn('outline-none transition-[fill] duration-150', onSet && 'cursor-pointer hover:opacity-80 focus-visible:opacity-70')}
              {...(onSet && {
                role: 'button',
                tabIndex: 0,
                'aria-label': `Set ${label} to ${next}`,
                onClick: () => onSet(next),
                onKeyDown: (e: KeyboardEvent) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  onSet(next)
                },
              })}
            />
          )
        })}
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-line-strong)" strokeWidth="1.5" />
      </svg>
      <div className={cn(eyebrow, 'mt-1 max-w-full truncate')}>{label}</div>
      <div className="tabular text-2xs text-fg-faint">
        {value} / {max}
      </div>
    </div>
  )
}

// ---------- scores ----------

function Scores({ row, color, onSet }: { row: FieldRow; color: string; onSet?: (v: unknown) => void }) {
  const { def } = row
  const cells = scoreCells(def, row.value).filter((c) => c.value)
  const label = fieldLabel(def)
  const style = def.style ?? 'grid'
  const top = Math.max(def.max ?? 0, ...cells.map((c) => c.number ?? 0), 1)
  if (style === 'radar' && cells.length >= 3) return <Radar label={label} cells={cells} max={def.max ?? top} min={def.min ?? 0} color={color} />
  if (style === 'bars' || (style === 'radar' && cells.length < 3))
    return (
      <Block def={row.def} label={label}>
        <div className="space-y-1.5" data-widget="scores">
          {cells.map((c) => {
            const ratio = c.number === null ? 0 : Math.max(0, Math.min(1, (c.number - (def.min ?? 0)) / (top - (def.min ?? 0) || 1)))
            return (
              <div key={c.key} className="grid grid-cols-[minmax(56px,120px)_1fr_auto] items-center gap-3">
                <span className="truncate text-xs text-fg-muted">{c.label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-active">
                  <span
                    className="block h-full origin-left rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--tint)_50%,var(--color-surface)),var(--tint))] transition-transform duration-300 ease-[var(--ease-out)]"
                    style={{ transform: `scaleX(${ratio})` }}
                  />
                </span>
                <span className="tabular w-10 text-right text-sm font-medium text-fg">
                  {c.value}
                  {c.modifier && <span className="ml-1 text-2xs font-normal text-fg-subtle">{c.modifier}</span>}
                </span>
              </div>
            )
          })}
        </div>
      </Block>
    )
  if (style === 'dots') {
    const max = Math.min(Math.round(def.max ?? 5), 20)
    const map = row.value && typeof row.value === 'object' && !Array.isArray(row.value) ? (row.value as Record<string, unknown>) : {}
    const all = scoreCells(def, row.value)
    return (
      <Block def={row.def} label={label}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-1.5" data-widget="scores">
          {all.map((c) => (
            <div key={c.key} className="flex min-w-0 items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{c.label}</span>
              <Pips label={c.label} value={c.number ?? 0} max={max} shape="dot" onSet={onSet && ((n) => onSet({ ...map, [c.key]: n }))} />
            </div>
          ))}
        </div>
      </Block>
    )
  }
  return (
    <Block def={row.def} label={label}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5" data-widget="scores">
        {cells.map((c) => (
          <div key={c.key} className={cn(tile, 'flex flex-col items-center px-1 pt-1.5 pb-2')}>
            <Sheen />
            <div className={cn(eyebrow, 'max-w-full truncate')}>{c.label}</div>
            <div className="tabular font-serif text-[22px] leading-7 font-semibold text-fg">{c.value}</div>
            {c.modifier && (
              <div className="tabular mt-0.5 rounded-full bg-[color-mix(in_oklab,var(--tint)_16%,transparent)] px-1.5 text-2xs leading-4 font-medium text-fg-muted">
                {c.modifier}
              </div>
            )}
          </div>
        ))}
      </div>
    </Block>
  )
}

/** A spider chart of scores: rings at quarters of the scale, the values as a filled shape, labels around. */
function Radar({ label, cells, max, min, color }: { label: string; cells: ReturnType<typeof scoreCells>; max: number; min: number; color: string }) {
  const n = cells.length
  const size = 260
  const c = size / 2
  const r = 84
  const angle = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2
  const point = (i: number, ratio: number) => [c + r * ratio * Math.cos(angle(i)), c + r * ratio * Math.sin(angle(i))] as const
  const ratio = (v: number | null) => (v === null ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min || 1))))
  const shape = cells.map((cell, i) => point(i, ratio(cell.number)).join(',')).join(' ')
  const gradient = `radar-${useId().replaceAll(/[^\w-]/g, '')}`
  return (
    <Block label={label} aside={`scale ${min}–${max}`}>
      <div className={cn(tile, '@container p-3')} data-widget="scores">
        <Sheen />
        <div className="grid grid-cols-1 items-center gap-x-5 gap-y-2 @[340px]:grid-cols-[minmax(0,220px)_1fr]">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="mx-auto w-full max-w-[260px]"
            role="img"
            aria-label={`${label || 'Scores'}: ${cells.map((x) => `${x.label} ${x.value}`).join(', ')}`}
          >
            <defs>
              <radialGradient id={gradient} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={color} stopOpacity="0.08" />
                <stop offset="100%" stopColor={color} stopOpacity="0.32" />
              </radialGradient>
            </defs>
            {[0.25, 0.5, 0.75, 1].map((q) => (
              <polygon
                key={q}
                points={cells.map((_, i) => point(i, q).join(',')).join(' ')}
                fill="none"
                stroke={q === 1 ? 'var(--color-line-strong)' : 'var(--color-line)'}
                strokeWidth="1"
              />
            ))}
            {cells.map((_, i) => {
              const [x, y] = point(i, 1)
              return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--color-line)" strokeWidth="1" />
            })}
            <polygon
              points={shape}
              fill={`url(#${gradient})`}
              stroke={color}
              strokeWidth="1.75"
              strokeLinejoin="round"
              className="[filter:drop-shadow(0_0_6px_color-mix(in_oklab,var(--tint)_45%,transparent))]"
            />
            {cells.map((cell, i) => {
              const [x, y] = point(i, ratio(cell.number))
              return <circle key={cell.key} cx={x} cy={y} r="3" fill={color} stroke="var(--color-surface)" strokeWidth="1.5" />
            })}
            {cells.map((cell, i) => {
              const [x, y] = point(i, 1.24)
              const cos = Math.cos(angle(i))
              const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end'
              return (
                <text
                  key={cell.key}
                  x={x}
                  y={y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  className="fill-fg-subtle text-[10px] font-medium tracking-[0.04em] uppercase"
                >
                  {cell.label}
                </text>
              )
            })}
          </svg>
          <ul className="space-y-1.5">
            {cells.map((cell) => (
              <li key={cell.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="truncate text-xs text-fg-muted">{cell.label}</span>
                <span className="tabular text-sm font-semibold text-fg">{cell.value}</span>
                <span className="col-span-2 h-1 overflow-hidden rounded-full bg-active">
                  <span
                    className="block h-full origin-left rounded-full bg-[var(--tint)] transition-transform duration-300 ease-[var(--ease-out)]"
                    style={{ transform: `scaleX(${ratio(cell.number)})` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Block>
  )
}

// ---------- lists ----------

function Pairs({ row }: { row: FieldRow }) {
  return (
    <Block def={row.def} label={fieldLabel(row.def)}>
      <div className="flex flex-wrap gap-1.5" data-widget="pairs">
        {pairEntries(row.def, row.value).map((e) => (
          <span key={e.key} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-surface px-2 text-xs shadow-[inset_0_0_0_1px_var(--color-line)]">
            <span className="text-fg-muted">{e.label}</span>
            {e.value && <span className="tabular font-semibold text-fg">{e.value}</span>}
          </span>
        ))}
      </div>
    </Block>
  )
}

function Tags({ row }: { row: FieldRow }) {
  return (
    <Block def={row.def} label={fieldLabel(row.def)}>
      <div className="flex flex-wrap gap-1" data-widget="tags">
        {listItems(row.value).map((t) => (
          <span
            key={t}
            className="inline-flex h-6 items-center rounded-full bg-[color-mix(in_oklab,var(--tint)_13%,var(--color-active))] px-2.5 text-xs text-fg-muted"
          >
            {t}
          </span>
        ))}
      </div>
    </Block>
  )
}

function List({ row }: { row: FieldRow }) {
  return (
    <Block def={row.def} label={fieldLabel(row.def)}>
      <ul className="space-y-1 text-sm leading-5 text-fg" data-widget="list">
        {listItems(row.value, /\n/).map((t, i) => (
          <li key={`${i}:${t}`} className="flex gap-2.5">
            <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--tint)] opacity-80" />
            <span className="min-w-0">{t}</span>
          </li>
        ))}
      </ul>
    </Block>
  )
}

const NO_NODES: StoryNode[] = []

function Refs({ row }: { row: FieldRow }) {
  const { data: nodes = NO_NODES } = useNodes()
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const types = useTypes()
  const select = useUI((s) => s.select)
  return (
    <Block def={row.def} label={fieldLabel(row.def)}>
      <div className="flex flex-wrap gap-1.5" data-widget="refs">
        {refIds(row.value).map((id) => {
          const n = byId.get(id)
          if (!n)
            return (
              <span
                key={id}
                title="No node with this id"
                className="inline-flex h-7 items-center rounded-md px-2 text-xs text-fg-faint line-through shadow-[inset_0_0_0_1px_var(--color-line)]"
              >
                {id}
              </span>
            )
          const T = types.of(n.type)
          return (
            <button
              key={id}
              type="button"
              onClick={() => select({ kind: 'node', id })}
              className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md bg-surface pr-2.5 pl-2 text-xs text-fg shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-[box-shadow,background-color] duration-100 hover:bg-hover hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <T.icon size={13} aria-hidden style={{ color: T.color }} className="shrink-0" />
              <span className="truncate">{n.title}</span>
            </button>
          )
        })}
      </div>
    </Block>
  )
}

function Table({ row }: { row: FieldRow }) {
  const { columns, rows } = tableRows(row.def, row.value)
  return (
    <Block def={row.def} label={fieldLabel(row.def)} aside={rows.length > 3 ? `${rows.length} rows` : undefined}>
      <div className="overflow-x-auto rounded-lg shadow-[inset_0_0_0_1px_var(--color-line)]" data-widget="table">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn(eyebrow, 'px-3 py-1.5 text-left font-medium whitespace-nowrap')}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line transition-colors duration-100 hover:bg-hover">
                {columns.map((c, k) => (
                  <td key={c.key} className={cn('px-3 py-1.5 align-top', k === 0 ? 'font-medium text-fg' : 'tabular text-fg-muted')}>
                    {r[c.key] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  )
}

function QuoteBlock({ row }: { row: FieldRow }) {
  const { value, note } = noted(row.value)
  return (
    <figure className="relative pl-5" data-widget="quote">
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0 w-0.5 rounded-full bg-[linear-gradient(var(--tint),color-mix(in_oklab,var(--tint)_20%,transparent))]"
      />
      <blockquote className="font-serif text-prose leading-7 text-fg italic">{value}</blockquote>
      <figcaption className="mt-1 text-2xs text-fg-subtle">
        {fieldLabel(row.def)}
        {note && ` · ${note}`}
      </figcaption>
    </figure>
  )
}

/** A compact one-line chip of a field for canvas cards: label and value. */
export function badgeText(def: FieldDef, value: unknown): string {
  if (def.widget === 'meter') {
    const m = meterValue(def, value)
    if (m.value !== null) return `${m.value}${m.max !== null ? `/${m.max}` : ''}`
  }
  if (def.widget === 'toggle') return toBool(value) ? '✓' : '–'
  return noted(value).value || plainText(value)
}
