import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Plus, X } from 'lucide-react'
import type { StatDef } from '@maquest/core/schema'
import {
  bonusEntries,
  formatBonuses,
  isEmptyStat,
  parseBonuses,
  scoreCells,
  statLabel,
  statRows,
  statText,
  tagList,
  toNumber,
  trackValue,
  type ResolvedSystem,
} from '@maquest/core/sheet'
import { Button, IconButton, cn } from '../ui'
import { GhostText, PropertyRow, TagInput, ghost, oneLine } from '../inspector/fields'

type Row = { def: StatDef; value: unknown; known: boolean }

const eyebrow = 'text-2xs font-medium text-fg-subtle'

/** Read view of a statblock: subtitle, key facts, score grid, then lists in the system's order. Lean, no chrome. */
export const StatBlock = memo(function StatBlock({
  system,
  stats,
  color,
}: {
  system: ResolvedSystem | undefined
  stats: Record<string, unknown>
  /** The node type's color, for the small track accents. */
  color: string
}) {
  const rows = useMemo(() => statRows(system, stats).filter((r) => !isEmptyStat(r.value)), [system, stats])
  const subtitle = rows
    .filter((r) => r.def.kind === 'subtitle')
    .map((r) => statText(r.value).value)
    .join(', ')
  const facts = rows.filter((r) => r.def.kind === 'stat' || r.def.kind === 'track')
  const rest = rows.filter((r) => !['subtitle', 'stat', 'track'].includes(r.def.kind))
  return (
    <div className="space-y-4" data-statblock>
      {subtitle && <p className="font-serif text-base text-fg-muted italic">{subtitle}</p>}
      {facts.length > 0 && (
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-3 gap-y-3">
          {facts.map((r) => (r.def.kind === 'track' ? <Track key={r.def.key} row={r} color={color} /> : <Fact key={r.def.key} row={r} />))}
        </dl>
      )}
      {rest.map((r) =>
        r.def.kind === 'scores' ? (
          <Scores key={r.def.key} row={r} />
        ) : r.def.kind === 'line' ? (
          <p key={r.def.key} className="text-sm leading-5 text-fg-muted">
            <span className="font-medium text-fg">{statLabel(r.def)}</span> {statText(r.value).value}
            {statText(r.value).note && <span className="text-fg-subtle"> ({statText(r.value).note})</span>}
          </p>
        ) : (
          <Chips key={r.def.key} row={r} />
        ),
      )}
    </div>
  )
})

function Fact({ row }: { row: Row }) {
  const { value, note } = statText(row.value)
  return (
    <div className="min-w-0">
      <dt className={eyebrow}>{statLabel(row.def)}</dt>
      <dd className="tabular mt-0.5 text-base leading-6 font-medium break-words text-fg">{value}</dd>
      {note && <dd className="text-xs leading-4 text-fg-subtle">{note}</dd>}
    </div>
  )
}

function Track({ row, color }: { row: Row; color: string }) {
  const { value, max } = trackValue(row.def, row.value)
  const ratio = value !== null && max ? Math.max(0, Math.min(1, value / max)) : null
  return (
    <div className="min-w-0">
      <dt className={eyebrow}>{statLabel(row.def)}</dt>
      <dd className="tabular mt-0.5 text-base leading-6 font-medium text-fg">
        {value ?? statText(row.value).value}
        {max !== null && <span className="text-sm font-normal text-fg-subtle"> / {max}</span>}
      </dd>
      {ratio !== null && (
        <dd className="mt-1 h-1 overflow-hidden rounded-full bg-active" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: color }} />
        </dd>
      )}
    </div>
  )
}

function Scores({ row }: { row: Row }) {
  const cells = scoreCells(row.def, row.value).filter((c) => c.value)
  return (
    <div>
      <div className={cn(eyebrow, 'mb-1.5')}>{statLabel(row.def)}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5">
        {cells.map((c) => (
          <div key={c.key} className="rounded-md bg-surface px-1 py-1.5 text-center shadow-[inset_0_0_0_1px_var(--color-line)]">
            <div className="text-2xs font-medium tracking-[0.04em] text-fg-subtle">{c.label}</div>
            <div className="tabular text-base leading-6 font-semibold text-fg">{c.value}</div>
            {c.modifier && <div className="tabular text-xs leading-4 text-fg-muted">{c.modifier}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Chips({ row }: { row: Row }) {
  const items = row.def.kind === 'bonuses' ? bonusEntries(row.def, row.value).map((e) => `${e.label} ${e.value}`.trim()) : tagList(row.value)
  return (
    <div>
      <div className={cn(eyebrow, 'mb-1')}>{statLabel(row.def)}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((t) => (
          <span key={t} className="tabular inline-flex h-6 items-center rounded-md bg-active px-2 text-xs text-fg-muted">
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------- editing ----------

const SAVE_DELAY = 400

/** Value typed as text: numbers stay numbers in the file. */
const typed = (s: string): string | number => (/^[+-]?\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : s)

/**
 * Edit form generated from the system: one row per stat in its order, inputs shaped by kind, plus stats the node
 * has outside the system. Changes are saved per key after a short pause.
 */
export function StatForm({
  system,
  stats,
  onSave,
}: {
  system: ResolvedSystem | undefined
  stats: Record<string, unknown>
  /** Saves a patch: changed keys, null removing one. */
  onSave: (patch: Record<string, unknown>) => void
}) {
  const [draft, setDraft] = useState(stats)
  const pending = useRef<Record<string, unknown>>({})
  const save = useDebouncedCallback(() => {
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length) onSave(patch)
  }, SAVE_DELAY)
  useEffect(() => () => save.flush(), [save])
  // Take outside changes (agents, undo) for keys not being edited right now.
  useEffect(() => {
    setDraft((d) => {
      const next = { ...stats }
      for (const k of Object.keys(pending.current)) next[k] = d[k]
      return next
    })
  }, [stats])
  const set = (key: string, value: unknown) => {
    const empty = isEmptyStat(value)
    setDraft((d) => {
      const next = { ...d }
      if (empty) delete next[key]
      else next[key] = value
      return next
    })
    pending.current = { ...pending.current, [key]: empty ? null : value }
    save()
  }
  const rows = statRows(system, draft)
  const known = rows.filter((r) => r.known || system === undefined)
  const extra = system ? rows.filter((r) => !r.known) : []
  return (
    <div className="space-y-0.5" data-stat-form>
      {known.map((r) => (
        <StatInput key={r.def.key} row={r} onChange={(v) => set(r.def.key, v)} removable={!system} onRemove={() => set(r.def.key, null)} />
      ))}
      {extra.length > 0 && <div className="pt-2 pb-0.5 text-xs text-fg-faint">Not in {system!.label}</div>}
      {extra.map((r) => (
        <StatInput key={r.def.key} row={r} onChange={(v) => set(r.def.key, v)} removable onRemove={() => set(r.def.key, null)} />
      ))}
      <AddStat taken={rows.map((r) => r.def.key)} onAdd={(key) => set(key, '?')} />
    </div>
  )
}

function StatInput({ row, onChange, removable, onRemove }: { row: Row; onChange: (v: unknown) => void; removable: boolean; onRemove: () => void }) {
  const id = useId()
  const { def, value } = row
  const label = (
    <span title={def.hint ? `${def.key}: ${def.hint}` : def.key}>
      {statLabel(def)}
      {def.required && <span className="text-fg-faint"> *</span>}
    </span>
  )
  const remove = removable && (
    <IconButton
      icon={X}
      label={`Remove ${statLabel(def)}`}
      size="sm"
      className="ml-0.5 self-start opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100"
      onClick={onRemove}
    />
  )
  switch (def.kind) {
    case 'scores': {
      const cells = scoreCells(def, value)
      const map = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
      return (
        <div className="group/row py-1">
          <div className="flex h-7 items-center text-xs text-fg-subtle">
            {label}
            {remove}
          </div>
          <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1">
            {cells.map((c) => (
              <label key={c.key} className="flex flex-col items-center gap-0.5">
                <span className="text-2xs text-fg-subtle">{c.label}</span>
                <input
                  aria-label={`${statLabel(def)} ${c.label}`}
                  inputMode="numeric"
                  value={c.value}
                  className={cn(ghost, 'tabular h-7 bg-surface text-center shadow-[inset_0_0_0_1px_var(--color-line)]')}
                  onChange={(e) => onChange({ ...map, [c.key]: e.target.value.trim() === '' ? null : typed(e.target.value) })}
                />
              </label>
            ))}
          </div>
        </div>
      )
    }
    case 'track': {
      const t = trackValue(def, value)
      const write = (v: number | null, max: number | null) =>
        onChange(v === null && max === null ? null : max === null || max === def.max ? v : { value: v, max })
      return (
        <PropertyRow label={label} htmlFor={id}>
          <input
            id={id}
            inputMode="numeric"
            aria-label={`${statLabel(def)} current`}
            value={t.value ?? ''}
            placeholder="—"
            className={cn(ghost, 'tabular h-7 w-16')}
            onChange={(e) => write(toNumber(e.target.value), t.max)}
          />
          <span className="px-1 text-fg-faint">/</span>
          <input
            inputMode="numeric"
            aria-label={`${statLabel(def)} maximum`}
            value={t.max ?? ''}
            placeholder="max"
            className={cn(ghost, 'tabular h-7 w-16')}
            onChange={(e) => write(t.value, toNumber(e.target.value))}
          />
          {remove}
        </PropertyRow>
      )
    }
    case 'bonuses':
      return (
        <PropertyRow label={label} htmlFor={id}>
          <CommitText
            id={id}
            value={formatBonuses(def, value)}
            placeholder="Name +2, Other 1"
            onCommit={(s) => onChange(s.trim() ? withKnownKeys(def, parseBonuses(s)) : null)}
          />
          {remove}
        </PropertyRow>
      )
    case 'tags':
      return (
        <PropertyRow label={label} htmlFor={id}>
          <TagInput id={id} tags={tagList(value)} onChange={(tags) => onChange(tags)} />
          {remove}
        </PropertyRow>
      )
    default: {
      const t = statText(value)
      const write = (v: string, note: string) => onChange(note.trim() ? { value: typed(v), note } : v.trim() ? typed(v) : null)
      return (
        <PropertyRow label={label} htmlFor={id}>
          <GhostText
            id={id}
            value={t.value}
            placeholder={def.hint ? `e.g. ${def.hint}` : 'Empty'}
            onChange={(e) => write(oneLine(e.target.value), t.note ?? '')}
          />
          {def.kind === 'stat' && (
            <GhostText
              aria-label={`${statLabel(def)} note`}
              value={t.note ?? ''}
              placeholder="Add note"
              className={cn(
                'max-w-[45%] text-fg-muted',
                !t.note && 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus:opacity-100',
              )}
              onChange={(e) => write(t.value, oneLine(e.target.value))}
            />
          )}
          {remove}
        </PropertyRow>
      )
    }
  }
}

/** "INT +6" typed for a stat with labels { int: "INT" } is stored under the system's key "int". */
function withKnownKeys(def: StatDef, parsed: Record<string, number | string>) {
  const keys = [...(def.keys ?? []), ...Object.keys(def.labels ?? {})]
  const match = (k: string) => keys.find((x) => x.toLowerCase() === k.toLowerCase() || def.labels?.[x]?.toLowerCase() === k.toLowerCase()) ?? k
  return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [match(k), v]))
}

/** Text parsed on commit (blur or Enter), so half-typed values aren't rewritten while typing. */
function CommitText({ id, value, placeholder, onCommit }: { id: string; value: string; placeholder: string; onCommit: (s: string) => void }) {
  const [text, setText] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value)
  }, [value])
  return (
    <GhostText
      id={id}
      value={text}
      placeholder={placeholder}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setText(oneLine(e.target.value))}
      onBlur={() => {
        focused.current = false
        if (text !== value) onCommit(text)
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

function AddStat({ taken, onAdd }: { taken: string[]; onAdd: (key: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const key = name.trim().toLowerCase().replaceAll(/\s+/g, '-')
  const valid = /^[\p{L}\p{N}_-]+$/u.test(key) && !taken.includes(key)
  const commit = () => {
    if (valid) onAdd(key)
    setName('')
    setAdding(false)
  }
  if (!adding)
    return (
      <Button size="sm" className="-ml-2 mt-1 gap-1 px-2 font-normal text-fg-faint hover:text-fg-muted" onClick={() => setAdding(true)}>
        <Plus size={13} aria-hidden /> Add stat
      </Button>
    )
  return (
    <div className="flex h-7 items-center gap-2">
      <input
        autoFocus
        aria-label="New stat key"
        placeholder="Stat key…"
        value={name}
        autoComplete="off"
        spellCheck={false}
        className={cn(ghost, 'h-7 w-[120px] shrink-0 bg-surface px-1.5 text-xs shadow-[inset_0_0_0_1px_var(--color-line-strong)]')}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setName('')
            setAdding(false)
          }
        }}
        onBlur={commit}
      />
      <span className="text-xs text-fg-faint">{name && !valid ? 'Taken or invalid' : 'Enter to add'}</span>
    </div>
  )
}
