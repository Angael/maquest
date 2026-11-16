import { nodeLinkProps } from '../../lib/nodeLink'
import { memo, useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { FieldDef, StoryNode } from '@maquest/core/schema'
import {
  fieldLabel,
  fieldSummary,
  isEmptyValue,
  libraryIndex,
  libraryNode,
  listItems,
  meterValue,
  normalizeName,
  recordFacts,
  recordGroups,
  recordList,
  toBool,
  type FieldRow,
  type RecordEntry,
} from '@maquest/core/sheet'
import { useNodes } from '../../lib/queries'
import { useTypes } from '../../lib/styles'
import { MarkdownPreview } from '../MarkdownEditor'
import { Popover, cn } from '../ui'
import { Block, Pips, eyebrow } from './Widgets'

/*
 * A records field: a list of same-shaped entries (abilities, spells, moves, inventory) defined by the project's item
 * schema. The list reads at a glance: groups as filter chips, a search over names and text, each record's name with
 * its facts as chips and its full description underneath. The cards style packs records into tiles whose text opens
 * on hover. Toggles and meters inside records (uses, prepared) set with a click.
 */

const NO_NODES: StoryNode[] = []
/** From this many records on, the list gets a search box and group filters. */
const SEARCH_FROM = 6

type Linked = { node: StoryNode; label: string; color: string }

/** Whether a record matches every word of a search (name, group, facts and text). */
const matches = (def: FieldDef, r: RecordEntry, words: string[]) => {
  if (!words.length) return true
  const hay = normalizeName(
    [r.name, r.group ?? '', r.text, ...recordFacts(def).map((f) => (isEmptyValue(r.values[f.key]) ? '' : fieldSummary(f, r.values[f.key])))].join(' '),
  )
  return words.every((w) => hay.includes(w))
}

export const Records = memo(function Records({ row, onSet }: { row: FieldRow; onSet?: (v: unknown) => void }) {
  const { def } = row
  const { data: nodes = NO_NODES } = useNodes()
  const types = useTypes()
  const library = useMemo(() => libraryIndex(nodes, types.list), [nodes, types])
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const records = useMemo(() => recordList(def, row.value), [def, row.value])
  const groups = useMemo(() => recordGroups(def, records), [def, records])
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const deferred = useDeferredValue(query)
  const words = normalizeName(deferred).split(' ').filter(Boolean)
  const shown = groups
    .filter((g) => group === null || g.title === group)
    .map((g) => ({ ...g, records: g.records.filter((r) => matches(def, r, words)) }))
    .filter((g) => g.records.length)
  const count = shown.reduce((n, g) => n + g.records.length, 0)
  const style = def.style ?? 'list'

  const linked = (r: RecordEntry): Linked | undefined => {
    const node = libraryNode(r, library, byId)
    if (!node) return undefined
    const T = types.of(node.type)
    return { node, label: T.label, color: T.color }
  }
  /** Sets one item key of one record; the field is saved whole. */
  const setItem =
    onSet &&
    ((index: number, key: string, value: unknown) => {
      const list = Array.isArray(row.value) ? [...row.value] : []
      const cur = list[index] as Record<string, unknown>
      const next = { ...cur }
      if (value === null) delete next[key]
      else next[key] = value
      list[index] = next
      onSet(list)
    })

  return (
    <Block def={row.def} label={fieldLabel(row.def)} aside={records.length > 1 ? `${records.length}` : undefined}>
      <div data-widget="records" className="space-y-2.5">
        {records.length >= SEARCH_FROM && (
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="relative flex h-7 min-w-[140px] flex-1 items-center">
              <Search size={13} aria-hidden className="pointer-events-none absolute left-2 text-fg-faint" />
              <input
                type="search"
                value={query}
                aria-label={`Search ${fieldLabel(def)}`}
                placeholder={`Search ${records.length}…`}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && query) {
                    e.stopPropagation()
                    setQuery('')
                  }
                }}
                className="h-7 w-full rounded-md bg-surface pr-7 pl-7 text-sm text-fg shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-100 placeholder:text-fg-faint hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus:shadow-[inset_0_0_0_1px_var(--color-accent)] [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="absolute right-1 flex size-5 items-center justify-center rounded text-fg-subtle outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <X size={12} aria-hidden />
                </button>
              )}
            </label>
            {groups.length > 1 && (
              <div role="group" aria-label={`${fieldLabel(def)} groups`} className="flex flex-wrap gap-1">
                {groups.map((g) => {
                  const on = group === g.title
                  return (
                    <button
                      key={g.title ?? ''}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setGroup(on ? null : (g.title ?? null))}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-[background-color,color,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-accent/70',
                        on
                          ? 'bg-[color-mix(in_oklab,var(--tint)_18%,var(--color-surface))] text-fg shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tint)_45%,transparent)]'
                          : 'text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-hover hover:text-fg',
                      )}
                    >
                      {g.title ?? 'Other'}
                      <span className="tabular text-fg-faint">{g.records.length}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {!count && <p className="py-2 text-sm text-fg-subtle">No {fieldLabel(def).toLowerCase()} match.</p>}
        {shown.map((g) => (
          <section key={g.title ?? ''} aria-label={g.title ?? fieldLabel(def)} className="space-y-1.5">
            {g.title && (shown.length > 1 || group === null) && (
              <h4 className={cn(eyebrow, 'flex items-center gap-2 pt-1')}>
                <span className="size-1.5 rounded-full bg-[var(--tint)]" aria-hidden />
                {g.title}
                <span className="tabular font-normal tracking-normal text-fg-faint normal-case">{g.records.length}</span>
              </h4>
            )}
            {style === 'cards' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-1.5">
                {g.records.map((r) => (
                  <RecordTile key={r.index} def={def} record={r} linked={linked(r)} words={words} setItem={setItem} />
                ))}
              </div>
            ) : (
              <ul className="overflow-hidden rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--color-line)]">
                {g.records.map((r) => (
                  <RecordRow key={r.index} def={def} record={r} linked={linked(r)} words={words} setItem={setItem} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Block>
  )
})

type SetItem = ((index: number, key: string, value: unknown) => void) | undefined

/** A name with the searched words marked. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>
  // Match on the normalized text, which keeps one character per character for the scripts names use.
  const norm = text
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[łŁ]/g, 'l')
  if (norm.length !== text.length) return <>{text}</>
  const marks: boolean[] = Array.from({ length: text.length }, () => false)
  for (const w of words) for (let at = norm.indexOf(w); at >= 0; at = norm.indexOf(w, at + 1)) marks.fill(true, at, at + w.length)
  const parts: ReactNode[] = []
  for (let i = 0; i < text.length;) {
    let j = i
    while (j < text.length && marks[j] === marks[i]) j++
    parts.push(
      marks[i] ? (
        <mark key={i} className="rounded-[2px] bg-[color-mix(in_oklab,var(--tint)_30%,transparent)] text-fg">
          {text.slice(i, j)}
        </mark>
      ) : (
        text.slice(i, j)
      ),
    )
    i = j
  }
  return <>{parts}</>
}

function RecordRow({ def, record: r, linked, words, setItem }: { def: FieldDef; record: RecordEntry; linked?: Linked; words: string[]; setItem: SetItem }) {
  // Without its own text a record shows its library node's description, so the sheet says what it does.
  const shared = linked?.node.body.trim() || linked?.node.summary?.trim()
  return (
    <li data-record={r.name} className="border-t border-line px-3 py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <RecordName record={r} linked={linked} words={words} />
        <Facts def={def} record={r} setItem={setItem} />
      </div>
      {r.text ? (
        <div className="card-text record-text text-fg-muted">
          <MarkdownPreview source={r.text} breaks />
        </div>
      ) : (
        shared && (
          <div className="card-text record-text text-fg-muted" data-library-text>
            <MarkdownPreview source={shared} breaks />
          </div>
        )
      )}
    </li>
  )
}

/** The record's name; a record that stands for a library node links to it and shows its text on hover. */
function RecordName({ record: r, linked, words }: { record: RecordEntry; linked?: Linked; words: string[] }) {
  const name = <Highlight text={r.name || 'Unnamed'} words={words} />
  if (!linked) return <span className="min-w-0 text-sm leading-6 font-semibold text-fg">{name}</span>
  return (
    <Popover
      hover
      side="left"
      align="start"
      className="w-[min(380px,calc(100vw-32px))]"
      trigger={
        <button
          type="button"
          {...nodeLinkProps(linked.node.id)}
          className="min-w-0 rounded-sm text-left text-sm leading-6 font-semibold text-fg underline decoration-[color-mix(in_oklab,var(--tint)_60%,transparent)] decoration-dotted decoration-1 underline-offset-[3px] outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          {name}
        </button>
      }
    >
      <LibraryCard linked={linked} own={r.text} />
    </Popover>
  )
}

function LibraryCard({ linked, own, name, facts }: { linked?: Linked; own: string; name?: string; facts?: ReactNode }) {
  const shared = linked?.node.body.trim()
  return (
    <div className="max-h-[min(60vh,520px)] overflow-y-auto p-3.5">
      <div className="font-serif text-lg leading-snug font-semibold text-fg">{name ?? linked?.node.title}</div>
      {(facts || linked) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {facts}
          {linked && (
            <span className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-2xs text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)]">
              <span className="size-1.5 rounded-full" style={{ background: linked.color }} aria-hidden />
              {linked.label}
            </span>
          )}
        </div>
      )}
      {linked?.node.summary && <p className="mt-2 text-sm leading-5 text-fg-muted">{linked.node.summary}</p>}
      <div className={cn('card-text mt-2', !shared && !own && 'text-sm text-fg-faint')}>
        {shared && <MarkdownPreview source={shared} breaks />}
        {own && shared && <div className={cn(eyebrow, 'mt-3 mb-1')}>On this sheet</div>}
        {own && <MarkdownPreview source={own} breaks />}
        {!shared && !own && 'No description.'}
      </div>
    </div>
  )
}

const chip = 'inline-flex min-h-5 max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-2xs leading-4'

const interactive = (f: FieldDef) => f.widget === 'toggle' || f.widget === 'meter'

/** A record's facts as chips: numbers with their label, text as is, toggles and small meters clickable. */
function Facts({ def, record: r, setItem, pick }: { def: FieldDef; record: RecordEntry; setItem: SetItem; pick?: (f: FieldDef) => boolean }) {
  const facts = recordFacts(def).filter((f) => !isEmptyValue(r.values[f.key]) && (!pick || pick(f)))
  if (!facts.length) return null
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {facts.map((f) => (
        <Fact key={f.key} def={f} value={r.values[f.key]} onSet={setItem && ((v) => setItem(r.index, f.key, v))} />
      ))}
    </span>
  )
}

function Fact({ def, value, onSet }: { def: FieldDef; value: unknown; onSet?: (v: unknown) => void }) {
  const label = fieldLabel(def)
  if (def.widget === 'toggle') {
    const on = toBool(value)
    return (
      <button
        type="button"
        aria-pressed={!!on}
        disabled={!onSet}
        onClick={() => onSet?.(!on)}
        className={cn(
          chip,
          'outline-none transition-[background-color,color,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-accent/70',
          on
            ? 'bg-[color-mix(in_oklab,var(--tint)_22%,transparent)] text-fg'
            : 'text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)] enabled:hover:text-fg',
        )}
      >
        {on && <Check size={10} strokeWidth={3} aria-hidden />}
        {label}
      </button>
    )
  }
  if (def.widget === 'meter') {
    const m = meterValue(def, value)
    if (m.value !== null && m.max !== null && m.max > 0 && m.max <= 12) {
      const write =
        onSet &&
        ((n: number) =>
          onSet(
            value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as object), value: n } : typeof value === 'string' ? `${n}/${m.max}` : n,
          ))
      return (
        <span className={cn(chip, 'shadow-[inset_0_0_0_1px_var(--color-line)]')} title={label}>
          <span className="text-fg-subtle">{label}</span>
          <Pips
            label={label}
            value={m.value}
            max={Math.round(m.max)}
            shape={def.style === 'boxes' ? 'box' : 'dot'}
            onSet={write}
            className="gap-0.5 [&_span]:size-2"
          />
        </span>
      )
    }
  }
  if (def.widget === 'tags' || def.widget === 'refs')
    return (
      <>
        {listItems(value).map((t) => (
          <span key={t} className={cn(chip, 'bg-active text-fg-muted')}>
            {t}
          </span>
        ))}
      </>
    )
  const text = fieldSummary(def, value)
  const numeric = typeof value === 'number' || /^\s*[+\-−]?\d+(?:[.,]\d+)?\s*$/.test(text)
  return (
    <span className={cn(chip, 'bg-active text-fg-muted')} title={label}>
      {numeric ? (
        <>
          <span className="text-fg-subtle">{label}</span>
          <span className="tabular font-semibold text-fg">{text}</span>
        </>
      ) : (
        <span className="min-w-0 break-words">{text}</span>
      )}
    </span>
  )
}

function RecordTile({ def, record: r, linked, words, setItem }: { def: FieldDef; record: RecordEntry; linked?: Linked; words: string[]; setItem: SetItem }) {
  const facts = recordFacts(def)
    .filter((f) => !interactive(f) && !isEmptyValue(r.values[f.key]))
    .map((f) => fieldSummary(f, r.values[f.key]))
    .join(' · ')
  const tile = (
    <button
      type="button"
      data-record={r.name}
      {...(linked ? nodeLinkProps(linked.node.id) : {})}
      className="flex h-full min-h-12 w-full min-w-0 flex-col items-start gap-1 rounded-lg bg-surface px-2.5 py-2 text-left shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-[box-shadow,background-color] duration-100 hover:bg-hover hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus-visible:ring-2 focus-visible:ring-accent/70 data-[popup-open]:bg-hover data-[popup-open]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tint)_55%,transparent)]"
    >
      <span
        className={cn(
          'text-sm leading-5 font-semibold text-fg',
          linked && 'underline decoration-[color-mix(in_oklab,var(--tint)_60%,transparent)] decoration-dotted underline-offset-[3px]',
        )}
      >
        <Highlight text={r.name || 'Unnamed'} words={words} />
      </span>
      {facts && <span className="text-2xs leading-4 text-fg-muted">{facts}</span>}
    </button>
  )
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Popover trigger={tile} hover side="left" align="start" className="w-[min(380px,calc(100vw-32px))]">
        <LibraryCard linked={linked} own={r.text} name={r.name} facts={<Facts def={def} record={r} setItem={undefined} />} />
      </Popover>
      <Facts def={def} record={r} setItem={setItem} pick={interactive} />
    </div>
  )
}
