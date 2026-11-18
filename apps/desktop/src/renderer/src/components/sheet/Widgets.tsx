import { nodeLinkProps } from '../../lib/nodeLink'
import { createElement, memo, useId, useMemo, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'
import type { FieldDef, StoryNode } from '@maquest/core/schema'
import {
  CLOCK_MAX,
  PIPS_MAX,
  RADAR_MAX,
  SCORE_DOTS_MAX,
  displayText,
  fieldLabel,
  formatNumber,
  isEmptyValue,
  normalizeName,
  listItems,
  meterValue,
  noted,
  numberText,
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
import { findIcon, useTypes } from '../../lib/styles'
import { cn } from '../ui'
import { Clamp, fullOnHover, numberSize, useLimit } from '../fit'
import { Records } from './Records'

/*
 * Read views of fields. Each widget is quiet chrome around the value: numbers large and tabular, labels as small
 * eyebrows, and the field's accent (its color, else the node type's) only in fills, rings and thin highlights.
 * Meters, ratings, clocks and toggles can be set with a click right here; everything else edits with the pencil.
 * Any value fits however it was written: long text folds behind "Show more", long lists behind "Show all", chips and
 * labels cut to one line show in full on hover, numbers are shortened (1.2M, 0.3), and styles that can't draw a
 * value (40+ dots, 12+ clock segments, 12+ radar axes) fall back to bars.
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

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The style a meter draws with: its own, or a bar when the style can't draw that many dots or segments. */
function meterStyle(def: FieldDef, value: unknown) {
  const style = def.style ?? 'bar'
  const max = meterValue(def, value).max ?? 0
  if ((style === 'dots' || style === 'boxes') && max > PIPS_MAX) return 'bar'
  if (style === 'clock' && max > CLOCK_MAX) return 'bar'
  return style
}

/** Widgets laid out in the tile grid (one cell, or two for wide ones); the rest take a full row. */
const cellSpan = (def: FieldDef, value: unknown): 0 | 1 | 2 => {
  if (def.widget === 'stat' || def.widget === 'toggle') return 1
  if (def.widget !== 'meter') return 0
  const style = meterStyle(def, value)
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
      {subtitle && (
        <Clamp lines={2} className="font-serif text-base leading-6 text-fg-muted italic">
          {subtitle}
        </Clamp>
      )}
      {filled.map((s, i) => {
        const rows = s.rows.filter((r) => r.def.widget !== 'subtitle')
        if (!rows.length) return null
        return (
          <section key={`${i}:${s.title ?? ''}`} aria-label={s.title} className="space-y-3">
            {s.title && (
              <h3 className="flex items-center gap-2 text-xs font-medium text-fg-subtle">
                <span className="min-w-0 truncate" {...fullOnHover(s.title)}>
                  {s.title}
                </span>
                <span aria-hidden className="h-px min-w-6 flex-1 bg-line" />
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
          <dl key={run.rows[0].def.key} className={lines}>
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
      return (
        <Clamp lines={2} className="font-serif text-base text-fg-muted italic">
          {plainText(row.value)}
        </Clamp>
      )
    default:
      return (
        <dl className={lines}>
          <TextLine row={row} />
        </dl>
      )
  }
}

/** A field's label with its icon (the field's `icon`, a lucide name), if it has one; cut to one line. */
export function FieldLabel({ def, label = fieldLabel(def), size = 12 }: { def: FieldDef; label?: string; size?: number }) {
  const Icon = findIcon(def.icon)
  const text = (
    <span className="block min-w-0 truncate" {...fullOnHover(label)}>
      {label}
    </span>
  )
  if (!Icon) return text
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1 align-bottom">
      {createElement(Icon, { size, 'aria-hidden': true, className: 'shrink-0 text-[color-mix(in_oklab,var(--tint)_75%,var(--color-fg-subtle))]' })}
      {text}
    </span>
  )
}

export function Block({ label, children, aside, def }: { label: string; children: ReactNode; aside?: ReactNode; def?: FieldDef }) {
  return (
    <div className="min-w-0">
      {(label || aside) && (
        <div className="mb-1.5 flex items-baseline gap-2">
          {label && <span className={cn(eyebrow, 'min-w-0')}>{def ? <FieldLabel def={def} label={label} /> : <FieldText text={label} />}</span>}
          {aside && <span className="tabular ml-auto shrink-0 text-2xs text-fg-faint">{aside}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

/** Text cut to one line, in full on hover. */
const FieldText = ({ text, className }: { text: string; className?: string }) => (
  <span className={cn('block min-w-0 truncate', className)} {...fullOnHover(text)}>
    {text}
  </span>
)

/** "Label: value" lines: labels take what they need up to 40% of the width, values wrap anywhere. */
const lines = 'grid grid-cols-[fit-content(40%)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm leading-5'

function TextLine({ row }: { row: FieldRow }) {
  const { value, note } = noted(row.value)
  const shown = numberText(isMap(row.value) && 'value' in row.value ? row.value.value : row.value) ?? value
  return (
    <>
      <dt className="min-w-[72px] truncate text-fg-subtle">
        <FieldLabel def={row.def} size={13} />
      </dt>
      <dd className="min-w-0 text-fg">
        <Clamp lines={4}>
          <span title={shown !== value ? value : undefined}>{shown}</span>
          {note && <span className="text-fg-subtle"> ({note})</span>}
        </Clamp>
      </dd>
    </>
  )
}

function Stat({ row }: { row: FieldRow }) {
  const { value, note } = noted(row.value)
  const raw = isMap(row.value) && 'value' in row.value ? row.value.value : row.value
  // Numbers (and short text that starts with one, like "30 ft") read big; anything else as a line of text.
  const big = numberText(raw) ?? (toNumber(value) !== null && value.length <= 8 ? value : null)
  return (
    <div className={cn(tile, 'h-full px-3 pt-2 pb-2.5')} data-widget="stat">
      <Sheen />
      <div className={eyebrow}>
        <FieldLabel def={row.def} />
      </div>
      {big !== null ? (
        <div
          className={cn(
            'tabular mt-0.5 truncate font-serif leading-8 font-semibold tracking-[-0.01em] text-fg',
            numberSize(big, ['text-[26px]', 'text-[21px]', 'text-[17px]']),
          )}
          title={big !== value ? value : undefined}
        >
          {big}
        </div>
      ) : (
        <Clamp lines={3} className="mt-0.5 text-base leading-6 font-medium text-fg">
          {value}
        </Clamp>
      )}
      {note && (
        <Clamp lines={2} className="mt-0.5 text-2xs leading-4 text-fg-subtle">
          {note}
        </Clamp>
      )}
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
        <span className={cn(eyebrow, 'block')}>
          <FieldLabel def={row.def} />
        </span>
        {on === null ? (
          <span className="line-clamp-2 text-sm font-medium wrap-anywhere text-fg-subtle" {...fullOnHover(plainText(row.value))}>
            {plainText(row.value)}
          </span>
        ) : (
          <span className={cn('block text-sm font-medium', on ? 'text-fg' : 'text-fg-subtle')}>{on ? 'Yes' : 'No'}</span>
        )}
      </span>
    </button>
  )
}

// ---------- meters ----------

function Meter({ row, onSet }: { row: FieldRow; onSet?: (v: unknown) => void }) {
  const { def } = row
  const m = meterValue(def, row.value)
  const style = meterStyle(def, row.value)
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
  const value = m.value === null ? null : formatNumber(m.value)
  const max = m.max === null ? null : formatNumber(m.max)
  const full = `${m.value}${m.max !== null ? ` / ${m.max}` : ''}`
  const amount =
    value === null ? (
      <span className="block truncate text-sm font-medium text-fg-muted" {...fullOnHover(plainText(row.value))}>
        {plainText(row.value)}
      </span>
    ) : (
      <span className="tabular block truncate" {...fullOnHover(full)}>
        <span className={cn('font-serif leading-7 font-semibold text-fg', numberSize(value, ['text-[22px]', 'text-lg', 'text-base']))}>{value}</span>
        {max !== null && <span className="text-sm text-fg-subtle"> / {max}</span>}
      </span>
    )
  if (m.value === null || m.max === null || m.max <= 0 || style === 'bar') {
    const ratio = m.value !== null && m.max ? Math.max(0, Math.min(1, m.value / m.max)) : null
    return (
      <div className={cn(tile, 'h-full px-3 pt-2 pb-3')} data-widget="meter">
        <Sheen />
        <div className="flex items-baseline gap-2">
          <span className={cn(eyebrow, 'min-w-0 shrink')}>
            <FieldLabel def={def} />
          </span>
          <span className="ml-auto max-w-[70%] min-w-0 shrink-0">{amount}</span>
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
  const count = Math.round(m.max)
  if (style === 'ring') return <Ring label={label} value={m.value} max={m.max} />
  if (style === 'clock') return <Clock label={label} value={m.value} max={count} onSet={write} />
  return (
    <div className={cn(tile, 'h-full px-3 pt-2 pb-2.5')} data-widget="meter">
      <Sheen />
      <div className="flex items-baseline gap-2">
        <FieldText text={label} className={eyebrow} />
        <span className="tabular ml-auto shrink-0 text-xs text-fg-subtle">
          {value}/{max}
        </span>
      </div>
      <Pips label={label} value={m.value} max={count} shape={style === 'boxes' ? 'box' : 'dot'} onSet={write} className="mt-2" />
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
      {Array.from({ length: Math.max(0, Math.min(max, PIPS_MAX)) }, (_, i) => {
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

function Ring({ label, value, max }: { label: string; value: number; max: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const ratio = Math.max(0, Math.min(1, value / max))
  const shown = formatNumber(value)
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
        <div
          className={cn(
            'tabular absolute inset-2 flex items-center justify-center font-serif font-semibold text-fg',
            numberSize(shown, ['text-lg', 'text-sm', 'text-xs']),
          )}
          title={shown !== String(value) ? String(value) : undefined}
        >
          {shown}
        </div>
      </div>
      <FieldText text={label} className={cn(eyebrow, 'mt-1 max-w-full')} />
      <div className="tabular max-w-full truncate text-2xs text-fg-faint">of {formatNumber(max)}</div>
    </div>
  )
}

/** A progress clock: a circle cut into segments, filled clockwise. */
function Clock({ label, value, max: segments, onSet }: { label: string; value: number; max: number; onSet?: (n: number) => void }) {
  const max = Math.max(1, Math.min(segments, CLOCK_MAX))
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
      <FieldText text={label} className={cn(eyebrow, 'mt-1 max-w-full')} />
      <div className="tabular max-w-full truncate text-2xs text-fg-faint">
        {formatNumber(value)} / {max}
      </div>
    </div>
  )
}

// ---------- scores ----------

function Scores({ row, color, onSet }: { row: FieldRow; color: string; onSet?: (v: unknown) => void }) {
  const { def } = row
  const cells = scoreCells(def, row.value).filter((c) => c.value)
  const label = fieldLabel(def)
  // Radars need 3 to 12 axes and dots a short scale; past that, bars show the same scores.
  const wanted = def.style ?? 'grid'
  const style =
    (wanted === 'radar' && (cells.length < 3 || cells.length > RADAR_MAX)) || (wanted === 'dots' && (def.max ?? 5) > SCORE_DOTS_MAX) ? 'bars' : wanted
  const top = cells.reduce((t, c) => Math.max(t, c.number ?? 0), Math.max(def.max ?? 0, 1))
  if (style === 'radar') return <Radar label={label} cells={cells} max={def.max ?? top} min={def.min ?? 0} color={color} />
  if (style === 'bars')
    return (
      <Block def={row.def} label={label}>
        <div className="space-y-1.5" data-widget="scores">
          {cells.map((c) => {
            const ratio = c.number === null ? 0 : Math.max(0, Math.min(1, (c.number - (def.min ?? 0)) / (top - (def.min ?? 0) || 1)))
            return (
              <div key={c.key} className="grid grid-cols-[minmax(56px,120px)_1fr_auto] items-center gap-3">
                <FieldText text={c.label} className="text-xs text-fg-muted" />
                <span className="h-1.5 overflow-hidden rounded-full bg-active">
                  <span
                    className="block h-full origin-left rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--tint)_50%,var(--color-surface)),var(--tint))] transition-transform duration-300 ease-[var(--ease-out)]"
                    style={{ transform: `scaleX(${ratio})` }}
                  />
                </span>
                <span className="tabular block max-w-28 min-w-10 truncate text-right text-sm font-medium text-fg" {...fullOnHover(c.value)}>
                  {c.display}
                  {c.modifier && <span className="ml-1 text-2xs font-normal text-fg-subtle">{c.modifier}</span>}
                </span>
              </div>
            )
          })}
        </div>
      </Block>
    )
  if (style === 'dots') {
    const max = Math.min(Math.round(def.max ?? 5), SCORE_DOTS_MAX)
    const map = row.value && typeof row.value === 'object' && !Array.isArray(row.value) ? (row.value as Record<string, unknown>) : {}
    const all = scoreCells(def, row.value)
    return (
      <Block def={row.def} label={label}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-1.5" data-widget="scores">
          {all.map((c) => (
            <div key={c.key} className="flex min-w-0 items-center gap-3">
              <FieldText text={c.label} className="flex-1 text-xs text-fg-muted" />
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
            <FieldText text={c.label} className={cn(eyebrow, 'max-w-full')} />
            <div
              className={cn(
                'tabular max-w-full truncate font-serif leading-7 font-semibold text-fg',
                numberSize(c.display, ['text-[22px]', 'text-lg', 'text-sm']),
              )}
              {...fullOnHover(c.value)}
            >
              {c.display}
            </div>
            {c.modifier && (
              <div className="tabular mt-0.5 max-w-full truncate rounded-full bg-[color-mix(in_oklab,var(--tint)_16%,transparent)] px-1.5 text-2xs leading-4 font-medium text-fg-muted">
                {c.modifier}
              </div>
            )}
          </div>
        ))}
      </div>
    </Block>
  )
}

/** The radar's drawing area: the chart is 260 wide, with room at the sides for labels. */
const VIEW = { x: -20, w: 300 }

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
    <Block label={label} aside={`scale ${formatNumber(min)}–${formatNumber(max)}`}>
      <div className={cn(tile, '@container p-3')} data-widget="scores">
        <Sheen />
        <div className="grid grid-cols-1 items-center gap-x-5 gap-y-2 @[380px]:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <svg
            viewBox={`${VIEW.x} 0 ${VIEW.w} ${size}`}
            className="mx-auto w-full max-w-[300px]"
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
              // Room to the edge of the drawing, at about 6.5px per uppercase character.
              const room = anchor === 'middle' ? 2 * Math.min(x - VIEW.x, VIEW.x + VIEW.w - x) : anchor === 'start' ? VIEW.x + VIEW.w - x : x - VIEW.x
              const fit = Math.max(3, Math.floor(room / 6.5))
              return (
                <text
                  key={cell.key}
                  x={x}
                  y={y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  className="fill-fg-subtle text-[10px] font-medium tracking-[0.04em] uppercase"
                >
                  {cell.label.length > fit ? `${cell.label.slice(0, fit - 1)}…` : cell.label}
                  {cell.label.length > fit && <title>{cell.label}</title>}
                </text>
              )
            })}
          </svg>
          <ul className="space-y-1.5">
            {cells.map((cell) => (
              <li key={cell.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <FieldText text={cell.label} className="text-xs text-fg-muted" />
                <span className="tabular block max-w-28 truncate text-sm font-semibold text-fg" {...fullOnHover(cell.value)}>
                  {cell.display}
                </span>
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

/** Chips: one line each, as wide as their row at most and never wider than a short phrase; the rest on hover. */
const chipText = 'block min-w-0 truncate'
const chipWidth = 'max-w-[min(100%,20rem)]'

function Pairs({ row }: { row: FieldRow }) {
  const { visible, more } = useLimit(pairEntries(row.def, row.value), 30, { chip: true })
  return (
    <Block def={row.def} label={fieldLabel(row.def)}>
      <div className="flex flex-wrap gap-1.5" data-widget="pairs">
        {visible.map((e, i) => (
          <span
            key={`${i}:${e.key}`}
            className={cn(chipWidth, 'inline-flex h-7 items-center gap-1.5 rounded-md bg-surface px-2 text-xs shadow-[inset_0_0_0_1px_var(--color-line)]')}
          >
            <span className={cn(chipText, 'text-fg-muted')} {...fullOnHover(e.label)}>
              {e.label}
            </span>
            {e.display && (
              <span className={cn(chipText, 'tabular max-w-[60%] shrink-0 font-semibold text-fg')} {...fullOnHover(e.value)}>
                {e.display}
              </span>
            )}
          </span>
        ))}
        {more}
      </div>
    </Block>
  )
}

function Tags({ row }: { row: FieldRow }) {
  const { visible, more } = useLimit(listItems(row.value), 30, { chip: true })
  return (
    <Block def={row.def} label={fieldLabel(row.def)}>
      <div className="flex flex-wrap gap-1" data-widget="tags">
        {visible.map((t, i) => (
          <span
            key={`${i}:${t}`}
            className={cn(
              chipWidth,
              'inline-flex h-6 items-center rounded-full bg-[color-mix(in_oklab,var(--tint)_13%,var(--color-active))] px-2.5 text-xs text-fg-muted',
            )}
          >
            <span className={chipText} {...fullOnHover(t)}>
              {t}
            </span>
          </span>
        ))}
        {more}
      </div>
    </Block>
  )
}

function List({ row }: { row: FieldRow }) {
  const items = listItems(row.value, /\n/)
  const { visible, more } = useLimit(items, 20, { noun: 'items' })
  return (
    <Block def={row.def} label={fieldLabel(row.def)} aside={items.length > 20 ? items.length : undefined}>
      <ul className="space-y-1 text-sm leading-5 text-fg" data-widget="list">
        {visible.map((t, i) => (
          <li key={`${i}:${t}`} className="flex gap-2.5">
            <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--tint)] opacity-80" />
            <div className="min-w-0 flex-1">
              <Clamp lines={3}>{t}</Clamp>
            </div>
          </li>
        ))}
      </ul>
      {more && <div className="mt-1.5 pl-4">{more}</div>}
    </Block>
  )
}

const NO_NODES: StoryNode[] = []

function Refs({ row }: { row: FieldRow }) {
  const { data: nodes = NO_NODES } = useNodes()
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const types = useTypes()
  const { visible, more } = useLimit(refIds(row.value), 30, { chip: true })
  return (
    <Block def={row.def} label={fieldLabel(row.def)}>
      <div className="flex flex-wrap gap-1.5" data-widget="refs">
        {visible.map((id, i) => {
          const n = byId.get(id)
          if (!n)
            return (
              <span
                key={`${i}:${id}`}
                title={`No node with the id ${id}`}
                className={cn(
                  chipWidth,
                  'inline-flex h-7 items-center rounded-md px-2 text-xs text-fg-faint line-through shadow-[inset_0_0_0_1px_var(--color-line)]',
                )}
              >
                <span className={chipText}>{id}</span>
              </span>
            )
          const T = types.of(n.type)
          return (
            <button
              key={`${i}:${id}`}
              type="button"
              {...nodeLinkProps(id)}
              className={cn(
                chipWidth,
                'inline-flex h-7 items-center gap-1.5 rounded-md bg-surface pr-2.5 pl-2 text-xs text-fg shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-[box-shadow,background-color] duration-100 hover:bg-hover hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus-visible:ring-2 focus-visible:ring-accent/70',
              )}
            >
              <T.icon size={13} aria-hidden style={{ color: T.color }} className="shrink-0" />
              <span className={chipText} {...fullOnHover(n.title)}>
                {n.title}
              </span>
            </button>
          )
        })}
        {more}
      </div>
    </Block>
  )
}

function Table({ row }: { row: FieldRow }) {
  const { columns, rows } = tableRows(row.def, row.value)
  // The raw rows, in the same order, so numbers show formatted.
  const raw = Array.isArray(row.value) ? row.value : [row.value]
  const cell = (i: number, key: string, text: string) => {
    const r = raw[i]
    return numberText(isMap(r) ? r[key] : key === 'value' ? r : undefined) ?? text
  }
  const indexed = rows.map((r, i) => ({ r, i }))
  const { visible, more } = useLimit(indexed, 25, { noun: 'rows' })
  return (
    <Block def={row.def} label={fieldLabel(row.def)} aside={rows.length > 3 ? `${rows.length} rows` : undefined}>
      <div className="overflow-x-auto rounded-lg shadow-[inset_0_0_0_1px_var(--color-line)]" data-widget="table" data-allow-scroll>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn(eyebrow, 'px-3 py-1.5 text-left font-medium whitespace-nowrap')}>
                  <FieldText text={c.label} className="max-w-[12rem]" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ r, i }) => (
              <tr key={i} className="border-t border-line transition-colors duration-100 hover:bg-hover">
                {columns.map((c, k) => {
                  const text = r[c.key] ?? ''
                  const shown = cell(i, c.key, text)
                  return (
                    <td key={c.key} className={cn('px-3 py-1.5 align-top', k === 0 ? 'font-medium text-fg' : 'tabular text-fg-muted')}>
                      <div className="max-w-[24rem] min-w-12">
                        <Clamp lines={3}>
                          <span title={shown !== text ? text : undefined}>{shown}</span>
                        </Clamp>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && <div className="mt-1.5">{more}</div>}
    </Block>
  )
}

function QuoteBlock({ row }: { row: FieldRow }) {
  const { value, note } = noted(row.value)
  const caption = `${fieldLabel(row.def)}${note ? ` · ${note}` : ''}`
  return (
    <figure className="relative pl-5" data-widget="quote">
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0 w-0.5 rounded-full bg-[linear-gradient(var(--tint),color-mix(in_oklab,var(--tint)_20%,transparent))]"
      />
      <blockquote>
        <Clamp lines={6} className="font-serif text-prose leading-7 text-fg italic">
          {value}
        </Clamp>
      </blockquote>
      <figcaption className="mt-1 line-clamp-2 text-2xs wrap-anywhere text-fg-subtle" {...fullOnHover(caption)}>
        {caption}
      </figcaption>
    </figure>
  )
}

/** A compact one-line chip of a field for canvas cards: label and value, numbers shortened. */
export function badgeText(def: FieldDef, value: unknown): string {
  if (def.widget === 'meter') {
    const m = meterValue(def, value)
    if (m.value !== null) return `${formatNumber(m.value)}${m.max !== null ? `/${formatNumber(m.max)}` : ''}`
  }
  if (def.widget === 'toggle') return toBool(value) ? '✓' : '–'
  return numberText(isMap(value) && 'value' in value ? value.value : value) ?? (noted(value).value || displayText(value))
}
