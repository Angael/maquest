import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { ArrowDown, ArrowUp, ChevronRight, Plus, X } from 'lucide-react'
import { itemFields, type FieldDef } from '@maquest/core/schema'
import {
  fieldLabel,
  formatPairs,
  isEmptyValue,
  listItems,
  meterValue,
  noted,
  parsePairs,
  refIds,
  scoreCells,
  tableRows,
  toBool,
  toNumber,
  type FieldRow,
  type FieldSection,
} from '@maquest/core/sheet'
import { Button, IconButton, cn } from '../ui'
import { GhostSelect, GhostText, PropertyRow, TagInput, ghost, oneLine } from '../inspector/fields'

const SAVE_DELAY = 400
const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Value typed as text: numbers stay numbers in the file. */
const typed = (s: string): string | number => (/^[+-]?\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : s)

/**
 * A field patch for the server, which merges maps one level deep: sub-keys a new map no longer has are sent as null
 * so they go away too.
 */
export function fieldPatch(old: unknown, next: unknown): unknown {
  if (isEmptyValue(next)) return null
  if (!isMap(old) || !isMap(next)) return next
  const out: Record<string, unknown> = { ...next }
  for (const k of Object.keys(old)) if (!(k in next)) out[k] = null
  return out
}

/**
 * Edit form of a fields tab: its sections with one input per field, shaped by the widget. Changes are saved per key
 * after a short pause; outside changes (agents, undo) show up for keys not being edited.
 */
export function FieldForm({
  sections,
  values,
  onSave,
}: {
  sections: readonly FieldSection[]
  values: Record<string, unknown>
  /** Saves a patch: changed keys, null removing one. */
  onSave: (patch: Record<string, unknown>) => void
}) {
  const [draft, setDraft] = useState(values)
  const pending = useRef<Record<string, unknown>>({})
  const save = useDebouncedCallback(() => {
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length) onSave(patch)
  }, SAVE_DELAY)
  useEffect(() => () => save.flush(), [save])
  useEffect(() => {
    setDraft((d) => {
      const next = { ...values }
      for (const k of Object.keys(pending.current)) next[k] = d[k]
      return next
    })
  }, [values])
  const set = (key: string, value: unknown) => {
    pending.current = { ...pending.current, [key]: fieldPatch(values[key], value) }
    setDraft((d) => ({ ...d, [key]: value }))
    save()
  }
  return (
    <div className="space-y-4" data-field-form>
      {sections.map((s, i) => (
        <div key={`${i}:${s.title ?? ''}`} className="space-y-0.5">
          {s.title && <div className="pb-1 text-xs font-medium text-fg-subtle">{s.title}</div>}
          {s.fields.map((def) => (
            <FieldInput key={def.key} row={{ def, value: draft[def.key], known: true }} onChange={(v) => set(def.key, v)} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** One field as an inspector property row, its input shaped by the widget. */
export function FieldInput({
  row,
  onChange,
  onRemove,
  autoFocus,
}: {
  row: FieldRow
  onChange: (v: unknown) => void
  onRemove?: () => void
  autoFocus?: boolean
}) {
  const id = useId()
  const { def, value } = row
  const label = (
    <span title={def.hint ? `${def.key}: ${def.hint}` : def.key} className="truncate">
      {fieldLabel(def)}
      {def.required && <span className="text-fg-faint"> *</span>}
    </span>
  )
  const remove = onRemove && (
    <IconButton
      icon={X}
      label={`Remove ${fieldLabel(def)}`}
      size="sm"
      className="ml-0.5 self-start opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100"
      onClick={onRemove}
    />
  )
  const placeholder = def.hint ? `e.g. ${def.hint}` : 'Empty'
  const map = isMap(value) ? value : {}
  switch (def.widget) {
    case 'records':
      return <RecordsInput def={def} value={value} label={label} remove={remove} onChange={onChange} />
    case 'scores': {
      const cells = scoreCells(def, value)
      return (
        <div className="group/row py-1">
          <div className="flex h-7 items-center text-xs text-fg-subtle">
            {label}
            {remove}
          </div>
          <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1">
            {cells.map((c) => (
              <label key={c.key} className="flex min-w-0 flex-col items-center gap-0.5">
                <span className="max-w-full truncate text-2xs text-fg-subtle">{c.label}</span>
                <input
                  aria-label={`${fieldLabel(def)} ${c.label}`}
                  inputMode="numeric"
                  value={c.value}
                  className={cn(ghost, 'tabular h-7 bg-surface text-center shadow-[inset_0_0_0_1px_var(--color-line)]')}
                  onChange={(e) => {
                    const next = { ...map }
                    if (e.target.value.trim() === '') delete next[c.key]
                    else next[c.key] = typed(e.target.value)
                    onChange(next)
                  }}
                />
              </label>
            ))}
          </div>
          {!def.keys?.length && (
            <CommitText
              id={`${id}-keys`}
              className="mt-1 text-xs"
              value={cells.map((c) => `${c.label} ${c.value}`.trim()).join(', ')}
              placeholder="Name 3, Other 2"
              onCommit={(s) => onChange(s.trim() ? parsePairs(s) : null)}
            />
          )}
        </div>
      )
    }
    case 'meter': {
      const m = meterValue(def, value)
      const write = (v: number | null, max: number | null) =>
        onChange(v === null && max === null ? null : max === null || max === def.max ? v : { value: v, max })
      return (
        <PropertyRow label={label} htmlFor={id}>
          <input
            id={id}
            autoFocus={autoFocus}
            inputMode="numeric"
            aria-label={`${fieldLabel(def)} current`}
            value={m.value ?? ''}
            placeholder="—"
            className={cn(ghost, 'tabular h-7 w-16')}
            onChange={(e) => write(toNumber(e.target.value), m.max)}
          />
          <span className="px-1 text-fg-faint">/</span>
          <input
            inputMode="numeric"
            aria-label={`${fieldLabel(def)} maximum`}
            value={m.max ?? ''}
            placeholder="max"
            className={cn(ghost, 'tabular h-7 w-16')}
            onChange={(e) => write(m.value, toNumber(e.target.value))}
          />
          {remove}
        </PropertyRow>
      )
    }
    case 'toggle': {
      const on = toBool(value)
      return (
        <PropertyRow label={label} htmlFor={id}>
          <GhostSelect
            id={id}
            value={on === null ? '' : on ? 'yes' : 'no'}
            muted={on === null}
            options={[
              { value: '', label: 'Not set' },
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ]}
            onValueChange={(v) => onChange(v === '' ? null : v === 'yes')}
          />
          {remove}
        </PropertyRow>
      )
    }
    case 'pairs':
      return (
        <PropertyRow label={label} htmlFor={id}>
          <CommitText
            id={id}
            value={formatPairs(def, value)}
            placeholder="Name +2, Other 1"
            onCommit={(s) => onChange(s.trim() ? withKnownKeys(def, parsePairs(s), Object.keys(map)) : null)}
          />
          {remove}
        </PropertyRow>
      )
    case 'tags':
    case 'refs': {
      const items = def.widget === 'refs' ? refIds(value) : listItems(value)
      return (
        <PropertyRow label={label} htmlFor={id}>
          {def.options && def.widget === 'tags' ? (
            <OptionChips options={def.options} value={items} onChange={(tags) => onChange(tags.length ? tags : null)} />
          ) : (
            <TagInput id={id} tags={items} onChange={(tags) => onChange(tags.length ? tags : null)} />
          )}
          {remove}
        </PropertyRow>
      )
    }
    case 'list':
      return (
        <PropertyRow label={label} htmlFor={id}>
          <CommitText
            id={id}
            multiline
            value={listItems(value, /\n/).join('\n')}
            placeholder="One item per line"
            onCommit={(s) => {
              const items = s
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean)
              onChange(items.length ? items : null)
            }}
          />
          {remove}
        </PropertyRow>
      )
    case 'table': {
      const { columns, rows } = tableRows(def, value)
      const head = columns.map((c) => c.key)
      return (
        <PropertyRow label={label} htmlFor={id}>
          <div className="w-full min-w-0">
            <CommitText
              id={id}
              multiline
              value={rows.map((r) => head.map((k) => r[k] ?? '').join(' | ')).join('\n')}
              placeholder={head.length ? head.join(' | ') : 'name | value'}
              onCommit={(s) => {
                const keys = head.length ? head : ['name', 'value']
                const next = s
                  .split('\n')
                  .filter((l) => l.trim())
                  .map((l) => Object.fromEntries(l.split('|').flatMap((cell, k) => (cell.trim() && keys[k] ? [[keys[k], typed(cell.trim())]] : []))))
                onChange(next.length ? next : null)
              }}
            />
            {head.length > 0 && <div className="px-1.5 pt-0.5 text-2xs text-fg-faint">One row per line: {head.join(' | ')}</div>}
          </div>
          {remove}
        </PropertyRow>
      )
    }
    case 'quote':
      return (
        <PropertyRow label={label} htmlFor={id}>
          <GhostText
            id={id}
            autoFocus={autoFocus}
            value={noted(value).value}
            placeholder={placeholder}
            onChange={(e) => onChange(oneLine(e.target.value) || null)}
          />
          {remove}
        </PropertyRow>
      )
    case 'stat': {
      const t = noted(value)
      const write = (v: string, note: string) => onChange(note.trim() ? { value: typed(v), note } : v.trim() ? typed(v) : null)
      return (
        <PropertyRow label={label} htmlFor={id}>
          <GhostText id={id} autoFocus={autoFocus} value={t.value} placeholder={placeholder} onChange={(e) => write(oneLine(e.target.value), t.note ?? '')} />
          <GhostText
            aria-label={`${fieldLabel(def)} note`}
            value={t.note ?? ''}
            placeholder="Add note"
            className={cn('max-w-[45%] text-fg-muted', !t.note && 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus:opacity-100')}
            onChange={(e) => write(t.value, oneLine(e.target.value))}
          />
          {remove}
        </PropertyRow>
      )
    }
    default: {
      if (def.options)
        return (
          <PropertyRow label={label} htmlFor={id}>
            <GhostSelect
              id={id}
              value={noted(value).value}
              muted={isEmptyValue(value)}
              options={[
                { value: '', label: 'Not set' },
                ...def.options.map((o) => ({ value: o, label: o })),
                ...(isEmptyValue(value) || def.options.includes(noted(value).value)
                  ? []
                  : [{ value: noted(value).value, label: `${noted(value).value} (not an option)` }]),
              ]}
              onValueChange={(v) => onChange(v || null)}
            />
            {remove}
          </PropertyRow>
        )
      const text = typeof value === 'string' || typeof value === 'number' || value === undefined || value === null
      return (
        <PropertyRow label={label} htmlFor={id}>
          {text ? (
            <GhostText id={id} autoFocus={autoFocus} value={noted(value).value} placeholder={placeholder} onChange={(e) => onChange(oneLine(e.target.value))} />
          ) : (
            <span className="truncate px-1.5 text-sm text-fg-muted" title="Structured value: edit it in its tab or through an agent">
              {noted(value).value}
            </span>
          )}
          {remove}
        </PropertyRow>
      )
    }
  }
}

/** Choice chips for tags with fixed options: click to toggle each. */
function OptionChips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1 py-1">
      {[...options, ...value.filter((v) => !options.includes(v))].map((o) => {
        const on = value.includes(o)
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
            className={cn(
              'inline-flex h-6 items-center rounded-full px-2.5 text-xs outline-none transition-[background-color,color,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-accent/70',
              on
                ? 'bg-accent-soft text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
                : 'text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-hover hover:text-fg',
            )}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

/** "INT +6" typed for a field with labels { int: "INT" }, or a value that already has "int", is stored under "int". */
function withKnownKeys(def: FieldDef, parsed: Record<string, number | string>, existing: string[] = []) {
  const keys = [...(def.keys ?? []), ...Object.keys(def.labels ?? {}), ...existing]
  const match = (k: string) => keys.find((x) => x.toLowerCase() === k.toLowerCase() || def.labels?.[x]?.toLowerCase() === k.toLowerCase()) ?? k
  return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [match(k), v]))
}

/** Text parsed on commit (blur, or Enter on one line), so half-typed values aren't rewritten while typing. */
function CommitText({
  id,
  value,
  placeholder,
  onCommit,
  multiline,
  className,
}: {
  id: string
  value: string
  placeholder: string
  onCommit: (s: string) => void
  multiline?: boolean
  className?: string
}): ReactNode {
  const [text, setText] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value)
  }, [value])
  const props = {
    id,
    value: text,
    placeholder,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false
      if (text !== value) onCommit(text)
    },
  }
  if (multiline)
    return (
      <textarea
        {...props}
        rows={2}
        className={cn(ghost, 'block resize-none py-1 leading-5 [field-sizing:content]', className)}
        onChange={(e) => setText(e.target.value)}
      />
    )
  return (
    <GhostText
      {...props}
      className={className}
      onChange={(e) => setText(oneLine(e.target.value))}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/**
 * A records field as a list of small forms: each record folds to its name (open to edit its facts and text), with
 * buttons to move and remove it, and one to add a record.
 */
function RecordsInput({
  def,
  value,
  label,
  remove,
  onChange,
}: {
  def: FieldDef
  value: unknown
  label: ReactNode
  remove: ReactNode
  onChange: (v: unknown) => void
}) {
  const list = Array.isArray(value) ? (value as unknown[]) : []
  const [open, setOpen] = useState<Set<number>>(() => new Set())
  const titleKey = def.titleKey ?? 'name'
  const textKey = def.textKey ?? 'text'
  // Every item field but the name and description, which have their own inputs.
  const facts = itemFields(def).fields.filter((f) => f.key !== titleKey && f.key !== textKey)
  const group = def.groupBy ? facts.find((f) => f.key === def.groupBy) : undefined
  const write = (next: unknown[]) => onChange(next.length ? next : null)
  const setItem = (i: number, key: string, v: unknown) => {
    const cur = isMap(list[i]) ? (list[i] as Record<string, unknown>) : {}
    const rec = { ...cur }
    if (isEmptyValue(v)) delete rec[key]
    else rec[key] = v
    write(list.map((r, k) => (k === i ? rec : r)))
  }
  const move = (i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    write(next)
    setOpen((o) => new Set([...o].map((k) => (k === i ? j : k === j ? i : k))))
  }
  const toggle = (i: number) => setOpen((o) => (o.has(i) ? new Set([...o].filter((k) => k !== i)) : new Set([...o, i])))
  return (
    <div className="group/row py-1" data-records-input>
      <div className="flex h-7 items-center gap-1 text-xs text-fg-subtle">
        {label}
        <span className="tabular text-fg-faint">{list.length || ''}</span>
        {remove}
      </div>
      <ul className="space-y-1">
        {list.map((raw, i) => {
          const rec = isMap(raw) ? raw : {}
          const name = typeof rec[titleKey] === 'string' || typeof rec[titleKey] === 'number' ? String(rec[titleKey]) : ''
          const expanded = open.has(i)
          return (
            <li key={i} className="rounded-md bg-surface shadow-[inset_0_0_0_1px_var(--color-line)]">
              <div className="flex items-center gap-1 pr-1 pl-0.5">
                <IconButton
                  icon={ChevronRight}
                  label={expanded ? `Fold ${name || 'record'}` : `Edit ${name || 'record'}`}
                  size="sm"
                  aria-expanded={expanded}
                  className={cn('transition-transform duration-150', expanded && 'rotate-90')}
                  onClick={() => toggle(i)}
                />
                <input
                  aria-label={`${fieldLabel(def)} ${i + 1} name`}
                  value={name}
                  placeholder="Name"
                  className={cn(ghost, 'h-8 min-w-0 flex-1 font-medium')}
                  onChange={(e) => setItem(i, titleKey, oneLine(e.target.value))}
                />
                {group && !expanded && <span className="max-w-[35%] truncate text-2xs text-fg-subtle">{noted(rec[group.key]).value}</span>}
                <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={i === list.length - 1} onClick={() => move(i, 1)} />
                <IconButton
                  icon={X}
                  label={`Remove ${name || 'record'}`}
                  size="sm"
                  onClick={() => {
                    write(list.filter((_, k) => k !== i))
                    setOpen((o) => new Set([...o].filter((k) => k !== i).map((k) => (k > i ? k - 1 : k))))
                  }}
                />
              </div>
              {expanded && (
                <div className="border-t border-line px-2 pt-1 pb-2">
                  {facts.map((f) => (
                    <FieldInput key={f.key} row={{ def: f, value: rec[f.key], known: true }} onChange={(v) => setItem(i, f.key, v)} />
                  ))}
                  <textarea
                    aria-label={`${name || 'Record'} description`}
                    value={typeof rec[textKey] === 'string' ? (rec[textKey] as string) : ''}
                    placeholder="Description (markdown)"
                    rows={2}
                    className={cn(ghost, 'mt-1 block w-full resize-none py-1 leading-5 [field-sizing:content]')}
                    onChange={(e) => setItem(i, textKey, e.target.value)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className="mt-1"
        onClick={() => {
          write([...list, { [titleKey]: '' }])
          setOpen((o) => new Set([...o, list.length]))
        }}
      >
        <Plus size={13} aria-hidden /> Add {fieldLabel(def).toLowerCase().replace(/s$/, '')}
      </Button>
    </div>
  )
}
