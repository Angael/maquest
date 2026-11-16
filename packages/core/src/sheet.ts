/**
 * Entity sheets: field values and their widgets, records, and the tabs of a node. Browser-safe (no Node imports), so
 * the app renders exactly what the MCP server and the checks see. Nothing here knows any game or genre: types define
 * their fields and tabs in maquest.json.
 */
import { itemFields, type FieldDef, type StoryNode, type TabDef, type TypeInfo, type Widget } from './schema'

// ---------- values ----------

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Whether a value counts as missing: nothing, blank text, an empty list, or a map of missing values. */
export const isEmptyValue = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && !v.trim()) ||
  (Array.isArray(v) && !v.some((x) => !isEmptyValue(x))) ||
  (isMap(v) && !Object.values(v).some((x) => !isEmptyValue(x)))

/** Any value as plain text: lists joined with commas, maps as "key value" pairs. */
export const plainText = (v: unknown): string =>
  v === undefined || v === null
    ? ''
    : typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : Array.isArray(v)
          ? v.map(plainText).join(', ')
          : Object.entries(v as object)
              .map(([k, x]) => `${k} ${plainText(x)}`)
              .join(', ')

/** A field's display label: its label, else its key in sentence case. */
export const fieldLabel = (def: Pick<FieldDef, 'key' | 'label'>) => def.label ?? def.key.charAt(0).toUpperCase() + def.key.slice(1).replaceAll(/[-_]/g, ' ')

/** A text-like value as value plus optional note: `40`, `"30 ft"`, or `{ value: 40, note: "9d6+9" }`. */
export function noted(v: unknown): { value: string; note?: string } {
  if (isMap(v) && ('value' in v || 'note' in v)) {
    const note = plainText(v.note).trim()
    return { value: plainText(v.value), ...(note && { note }) }
  }
  return { value: plainText(v) }
}

/** Number in a value like 14, "14", "+2" or "−1"; null when there is none. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const m = /^\s*([+\-−]?\d+(?:[.,]\d+)?)/.exec(v)
    if (m) return Number(m[1].replace('−', '-').replace(',', '.'))
  }
  if (isMap(v) && 'value' in v) return toNumber(v.value)
  return null
}

/** Signed number with a real minus sign: +2, −1, +0. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0')

/** Yes/no of a toggle value; null when it isn't one. */
export function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['yes', 'true', 'y', '1', 'on', 'tak', 'ja', 'oui', 'sí', 'si', 'da'].includes(s)) return true
    if (['no', 'false', 'n', '0', 'off', 'nie', 'nein', 'non', 'ne'].includes(s)) return false
  }
  return null
}

/** A meter as current/max: `5`, `"5/9"`, or `{ value: 5, max: 9 }`; max falls back to the field's. */
export function meterValue(def: Pick<FieldDef, 'max'>, v: unknown): { value: number | null; max: number | null } {
  if (isMap(v)) return { value: toNumber(v.value), max: toNumber(v.max) ?? def.max ?? null }
  if (typeof v === 'string' && v.includes('/')) {
    const [a, b] = v.split('/')
    return { value: toNumber(a), max: toNumber(b) ?? def.max ?? null }
  }
  return { value: toNumber(v), max: def.max ?? null }
}

export type ScoreCell = { key: string; label: string; value: string; number: number | null; modifier?: string }

/** Score cells in the field's key order, then any extra keys; with the field's modifier when it has one. */
export function scoreCells(def: Pick<FieldDef, 'keys' | 'labels' | 'modifier'>, v: unknown): ScoreCell[] {
  const o = isMap(v) ? v : {}
  const keys = [...(def.keys ?? []), ...Object.keys(o).filter((k) => !def.keys?.includes(k))]
  return keys.map((key) => {
    const raw = o[key]
    const number = toNumber(raw)
    const m = def.modifier
    return {
      key,
      label: def.labels?.[key] ?? key,
      value: plainText(raw),
      number,
      ...(m && number !== null && { modifier: signed(Math.floor((number - m.base) / m.step)) }),
    }
  })
}

/** Named values ("Stealth +6"): from a map, a list, or text like "Stealth +6, History 4". */
export function pairEntries(def: Pick<FieldDef, 'labels' | 'signed'>, v: unknown): { key: string; label: string; value: string }[] {
  const show = (x: unknown) => (typeof x === 'number' && def.signed !== false ? signed(x) : plainText(x))
  const label = (k: string) => def.labels?.[k] ?? k
  if (isMap(v)) return Object.entries(v).map(([key, x]) => ({ key, label: label(key), value: show(x) }))
  const items = Array.isArray(v) ? v.map(plainText) : typeof v === 'string' ? v.split(/[,;·]/) : []
  return items
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(.*?)\s*([+\-−]?\d+%?)$/.exec(s)
      return m && m[1] ? { key: m[1], label: label(m[1]), value: m[2] } : { key: s, label: s, value: '' }
    })
}

/** Parses "Stealth +6, History 4" into { Stealth: 6, History: 4 } (parts without a number stay text). */
export function parsePairs(text: string): Record<string, number | string> {
  const out: Record<string, number | string> = {}
  for (const part of text.split(/[,;·]/)) {
    const s = part.trim()
    if (!s) continue
    const m = /^(.*?)[\s:]*([+\-−]?\d+)$/.exec(s)
    if (m && m[1].trim()) out[m[1].trim()] = Number(m[2].replace('−', '-'))
    else out[s] = ''
  }
  return out
}

/** Pairs back as editable text. */
export const formatPairs = (def: Pick<FieldDef, 'signed'>, v: unknown) =>
  pairEntries({ signed: def.signed }, v)
    .map((e) => (e.value ? `${e.label} ${e.value.replace('−', '-')}` : e.label))
    .join(', ')

/** Items of a list-like value: a list, or text split at commas (tags) or lines (lists). */
export function listItems(v: unknown, split: RegExp = /[,;]/): string[] {
  if (Array.isArray(v)) return v.map(plainText).filter(Boolean)
  if (typeof v === 'string')
    return v
      .split(split)
      .map((s) => s.trim())
      .filter(Boolean)
  if (isMap(v)) return Object.entries(v).map(([k, x]) => `${k} ${plainText(x)}`.trim())
  return v === undefined || v === null ? [] : [plainText(v)]
}

/** Node ids of a refs value: a list or comma-separated text, with or without [[brackets]]. */
export const refIds = (v: unknown) => listItems(v).map((s) => s.replace(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/, '$1').trim())

/** Table rows and columns: the field's columns first, then other keys the rows use. */
export function tableRows(def: Pick<FieldDef, 'keys' | 'labels'>, v: unknown): { columns: { key: string; label: string }[]; rows: Record<string, string>[] } {
  const raw = Array.isArray(v) ? v : isMap(v) ? [v] : []
  const rows = raw.map((r) => (isMap(r) ? Object.fromEntries(Object.entries(r).map(([k, x]) => [k, plainText(x)])) : { value: plainText(r) }))
  const keys = [...(def.keys ?? [])]
  for (const r of rows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k)
  return { columns: keys.map((key) => ({ key, label: def.labels?.[key] ?? key })), rows }
}

/** A widget that fits a value without a definition. */
export function inferWidget(value: unknown): Widget {
  if (typeof value === 'boolean') return 'toggle'
  if (Array.isArray(value)) return value.some(isMap) ? 'table' : 'tags'
  if (isMap(value)) {
    if ('value' in value || 'note' in value) return 'max' in value ? 'meter' : 'stat'
    const nums = Object.values(value).filter((v) => typeof v === 'number').length
    return nums && nums === Object.keys(value).length && nums >= 3 ? 'scores' : 'pairs'
  }
  return 'text'
}

/** One line of text for any field value, for agents and compact UI. */
export function fieldSummary(def: FieldDef, v: unknown): string {
  switch (def.widget) {
    case 'scores':
      return scoreCells(def, v)
        .filter((c) => c.value)
        .map((c) => `${c.label} ${c.value}${c.modifier ? ` (${c.modifier})` : ''}`)
        .join(', ')
    case 'pairs':
      return pairEntries(def, v)
        .map((e) => `${e.label} ${e.value}`.trim())
        .join(', ')
    case 'tags':
    case 'refs':
      return listItems(v).join(', ')
    case 'list':
      return listItems(v, /\n/).join('; ')
    case 'toggle': {
      const b = toBool(v)
      return b === null ? plainText(v) : b ? 'yes' : 'no'
    }
    case 'meter': {
      const m = meterValue(def, v)
      return m.value === null ? plainText(v) : `${m.value}${m.max !== null ? `/${m.max}` : ''}`
    }
    case 'table': {
      const { columns, rows } = tableRows(def, v)
      return rows.map((r) => columns.map((c) => r[c.key] ?? '').join(' | ')).join('; ')
    }
    case 'records': {
      const groups = recordGroups(def, recordList(def, v))
      return groups.map((g) => `${g.title ? `${g.title}: ` : ''}${g.records.map((r) => r.name).join(', ')}`).join('; ')
    }
    default: {
      const t = noted(v)
      return t.note ? `${t.value} (${t.note})` : t.value
    }
  }
}

const outOfRange = (def: Pick<FieldDef, 'min' | 'max'>, n: number, what = 'value') =>
  def.min !== undefined && n < def.min
    ? `${what} ${n} is below the minimum ${def.min}`
    : def.max !== undefined && n > def.max
      ? `${what} ${n} is over the maximum ${def.max}`
      : null

/** Why a value doesn't fit its field (shape, options, range), or null when it does. */
export function fieldProblem(def: FieldDef, v: unknown): string | null {
  if (isEmptyValue(v)) return null
  const allowed = (s: string) => !def.options || def.options.some((o) => normalizeName(o) === normalizeName(s))
  const choices = () => `one of ${def.options!.join(', ')}`
  switch (def.widget) {
    case 'scores': {
      if (!isMap(v)) return `expected a map like { ${(def.keys ?? ['a', 'b']).slice(0, 2).join(': 1, ')}: 1 }`
      const bad = Object.entries(v).filter(([, x]) => toNumber(x) === null && !isEmptyValue(x))
      if (bad.length) return `not numbers: ${bad.map(([k]) => k).join(', ')}`
      for (const [k, x] of Object.entries(v)) {
        const n = toNumber(x)
        const problem = n === null ? null : outOfRange(def, n, k)
        if (problem) return problem
      }
      return null
    }
    case 'meter': {
      const m = meterValue(def, v)
      if (m.value === null) return 'expected a number, "current/max", or { value, max }'
      if (m.max !== null && m.value > m.max) return `value ${m.value} is over the maximum ${m.max}`
      return def.min !== undefined && m.value < def.min ? `value ${m.value} is below the minimum ${def.min}` : null
    }
    case 'stat': {
      if (isMap(v) && !('value' in v || 'note' in v)) return 'expected text, a number, or { value, note }'
      const n = toNumber(v)
      return n === null || (typeof v === 'string' && !/^\s*[+\-−]?\d+(?:[.,]\d+)?\s*$/.test(v)) ? null : outOfRange(def, n)
    }
    case 'toggle':
      return toBool(v) === null ? 'expected yes or no (true/false)' : null
    case 'table':
      return Array.isArray(v) && v.every((r) => isMap(r) || isEmptyValue(r)) ? null : 'expected a list of rows like [{ name: …, … }]'
    case 'records':
      return recordProblems(def, v).slice(0, 3).join('; ') || null
    case 'tags': {
      const bad = listItems(v).filter((t) => !allowed(t))
      return bad.length ? `${bad.join(', ')} not ${choices()}` : null
    }
    case 'pairs':
    case 'list':
    case 'refs':
      return null
    default:
      if (isMap(v) || Array.isArray(v)) return 'expected text'
      return allowed(plainText(v)) ? null : `expected ${choices()}`
  }
}

/** Lowercase, accent-free form of a name, for matching labels, aliases and titles across scripts. */
export function normalizeName(s: string) {
  return s
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .replaceAll(/[łŁ]/g, 'l')
    .replaceAll(/[øØ]/g, 'o')
    .replaceAll(/[đĐ]/g, 'd')
    .replaceAll('ß', 'ss')
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The field a stray key stands for (by its label or an alias), when the key isn't the field's own. */
export function fieldForKey(fields: readonly FieldDef[], key: string): FieldDef | undefined {
  if (fields.some((f) => f.key === key)) return undefined
  const want = normalizeName(key)
  return fields.find((f) => [f.key, f.label ?? '', ...(f.aliases ?? [])].some((n) => n && normalizeName(n) === want))
}

export type FieldRow = { def: FieldDef; value: unknown; /** Defined by the type (not a free-form key). */ known: boolean }

/** Rows for the given fields, in order, with the node's values. */
export const fieldRows = (defs: readonly FieldDef[], values: Record<string, unknown> = {}): FieldRow[] =>
  defs.map((def) => ({ def, value: values[def.key], known: true }))

/** Free-form keys of a node (ones its type doesn't define), with widgets that fit their values. */
export function extraRows(type: Pick<SheetType, 'fields'>, values: Record<string, unknown> = {}): FieldRow[] {
  return Object.entries(values)
    .filter(([key]) => !type.fields.some((f) => f.key === key))
    .map(([key, value]) => ({ def: { key, widget: inferWidget(value) }, value, known: false }))
}

/** Merges a fields patch: null removes a key; maps merge one level deep (null removes a sub-key). */
export function mergeValues(cur: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...cur }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete out[k]
    else if (isMap(v) && isMap(out[k])) {
      const merged: Record<string, unknown> = { ...(out[k] as Record<string, unknown>) }
      for (const [sk, sv] of Object.entries(v)) {
        if (sv === null) delete merged[sk]
        else merged[sk] = sv
      }
      out[k] = merged
    } else out[k] = v
  }
  return out
}

// ---------- body sections ----------

export type BodySection = {
  /** Heading text; null for content before the first H1. */
  title: string | null
  /** The raw heading line (absent for the intro). */
  heading?: string
  /** Lines after the heading up to the next H1. */
  lines: string[]
}

/** Splits a body at its H1 headings (outside code fences). Joining the sections gives the body back exactly. */
export function splitSections(body: string): BodySection[] {
  const lines = body.split('\n')
  const out: BodySection[] = [{ title: null, lines: [] }]
  let fence: string | null = null
  for (const line of lines) {
    const f = /^\s*(```|~~~)/.exec(line)
    if (f) fence = fence === null ? f[1] : fence === f[1] ? null : fence
    const h = !f && fence === null ? /^#\s+(.+?)\s*#*\s*$/.exec(line) : null
    if (h) out.push({ title: h[1], heading: line, lines: [] })
    else out.at(-1)!.lines.push(line)
  }
  return out
}

export const joinSections = (sections: readonly BodySection[]) =>
  sections.flatMap((s) => (s.heading === undefined ? s.lines : [s.heading, ...s.lines])).join('\n')

/** Section text without the blank lines around it. */
export const sectionText = (s: BodySection) =>
  s.lines
    .join('\n')
    .replace(/^\s*\n/, '')
    .trimEnd()

/** The body with section `index` replaced by `text`, normalized to one blank line after the heading. */
export function replaceSection(body: string, index: number, text: string): string {
  const sections = splitSections(body)
  const s = sections[index]
  if (!s) return body
  const last = index === sections.length - 1
  const content = text.trim()
  s.lines = s.heading === undefined ? (content ? [...content.split('\n'), ...(last ? [] : [''])] : []) : ['', ...(content ? [...content.split('\n'), ''] : [])]
  return joinSections(sections)
}

/** Writes a prose tab's text: its section, or a new `# title` section at the end when the body has none yet. */
export function writeTab(body: string, tab: { title: string; section: number }, text: string): string {
  if (tab.section >= 0) return replaceSection(body, tab.section, text)
  if (!text.trim()) return body
  return `${body.trimEnd()}${body.trim() ? '\n\n' : ''}# ${tab.title}\n\n${text.trim()}\n`
}

// ---------- sheet tabs ----------

export type FieldSection = { title?: string; fields: FieldDef[] }

/** What a sheet needs from a type: its fields and tabs. */
export type SheetType = { fields: readonly FieldDef[]; tabs: readonly TabDef[] }

export type SheetTab =
  | { kind: 'fields'; key: string; title: string; sections: FieldSection[] }
  /** `section` is the body section's index, or -1 for a tab of the type that the body doesn't have yet. */
  | { kind: 'prose'; key: string; title: string; section: number; text: string }

/** Whether a heading names a tab (by title or alias). */
export const tabMatches = (def: Pick<TabDef, 'title' | 'aliases'>, title: string) =>
  [def.title, ...(def.aliases ?? [])].some((t) => normalizeName(t) === normalizeName(title))

/**
 * The fields each fields tab shows, by tab title: the listed fields or sections, or for a tab that lists none, every
 * field of the type that no other fields tab lists.
 */
export function fieldLayout(type: SheetType): Map<string, FieldSection[]> {
  const byKey = new Map(type.fields.map((f) => [f.key, f]))
  const pick = (keys: readonly string[]) => keys.flatMap((k) => byKey.get(k) ?? [])
  const tabs = type.tabs.filter((t) => t.kind === 'fields')
  const listed = new Set(tabs.flatMap((t) => [...(t.fields ?? []), ...(t.sections ?? []).flatMap((s) => s.fields)]))
  const out = new Map<string, FieldSection[]>()
  for (const t of tabs) {
    if (t.sections)
      out.set(t.title, [...(t.fields ? [{ fields: pick(t.fields) }] : []), ...t.sections.map((s) => ({ title: s.title, fields: pick(s.fields) }))])
    else if (t.fields) out.set(t.title, [{ fields: pick(t.fields) }])
    else out.set(t.title, [{ fields: type.fields.filter((f) => !listed.has(f.key)) }])
  }
  return out
}

/** The tab a field shows in, if any. */
export function tabOfField(type: SheetType, key: string): string | undefined {
  for (const [title, sections] of fieldLayout(type)) if (sections.some((s) => s.fields.some((f) => f.key === key))) return title
  return undefined
}

/**
 * Fields shown as properties under the title: the type's fields that no fields tab shows, then the node's free-form
 * keys.
 */
export function propertyRows(type: SheetType, values: Record<string, unknown> = {}): FieldRow[] {
  const placed = new Set([...fieldLayout(type).values()].flatMap((sections) => sections.flatMap((s) => s.fields.map((f) => f.key))))
  return [
    ...fieldRows(
      type.fields.filter((f) => !placed.has(f.key)),
      values,
    ),
    ...extraRows(type, values),
  ]
}

/**
 * The tabs of a node, in the type's order: fields tabs always, prose tabs when the body has their section.
 * The text before the first heading is "Overview", ahead of the body tabs; sections the type doesn't name follow at
 * the end. Without fields tabs, a body needs at least two H1 sections to get tabs, so plain documents stay one editor.
 */
export function sheetTabs(body: string, type: SheetType = { fields: [], tabs: [] }): SheetTab[] {
  const sections = splitSections(body)
  const layout = fieldLayout(type)
  const withHeading = sections.map((s, i) => ({ s, i })).filter((x) => x.s.heading !== undefined)
  const used = new Set<number>()
  const out: SheetTab[] = []
  const intro = sectionText(sections[0])
  const keys = new Set<string>()
  // Prose tabs are keyed by title, so a tab keeps its key when its section is written for the first time.
  const keyOf = (title: string) => {
    const base = `p:${normalizeName(title)}`
    let key = base
    for (let n = 2; keys.has(key); n++) key = `${base}~${n}`
    keys.add(key)
    return key
  }
  let introAt = -1
  for (const def of type.tabs) {
    if (def.kind === 'fields') {
      out.push({ kind: 'fields', key: `fields:${def.title}`, title: def.title, sections: layout.get(def.title) ?? [] })
      continue
    }
    if (introAt < 0) introAt = out.length
    let found = false
    for (const { s, i } of withHeading) {
      if (used.has(i) || !tabMatches(def, s.title!)) continue
      used.add(i)
      found = true
      out.push({ kind: 'prose', key: keyOf(s.title!), title: s.title!, section: i, text: sectionText(s) })
    }
    // The type's tabs show on every node, empty until written, so each node offers the same sheet.
    if (!found) out.push({ kind: 'prose', key: keyOf(def.title), title: def.title, section: -1, text: '' })
  }
  for (const { s, i } of withHeading) if (!used.has(i)) out.push({ kind: 'prose', key: keyOf(s.title!), title: s.title!, section: i, text: sectionText(s) })
  if (intro)
    out.splice(introAt < 0 ? out.filter((t) => t.kind === 'fields').length : introAt, 0, {
      kind: 'prose',
      key: 'intro',
      title: 'Overview',
      section: 0,
      text: intro,
    })
  if (!type.tabs.length && withHeading.length < 2) return []
  return out
}

const sameValue = (a: unknown, b: unknown) => normalizeName(plainText(a)) === normalizeName(plainText(b))

/**
 * Whether a field needs a value among `values` (a node's fields or one record): `required`, or every condition of
 * `requiredWhen` holds (text compared ignoring case and accents; a list means any of its values).
 */
export function isRequired(def: Pick<FieldDef, 'required' | 'requiredWhen'>, values: Record<string, unknown>): boolean {
  if (def.required) return true
  if (!def.requiredWhen) return false
  return Object.entries(def.requiredWhen).every(([key, want]) => {
    const have = values[key]
    if (isEmptyValue(have)) return false
    return (Array.isArray(want) ? want : [want]).some((w) => sameValue(have, w))
  })
}

// ---------- records ----------

export type RecordEntry = {
  /** Position in the list. */
  index: number
  /** Display name; a [[link]] in it is resolved to `ref`. */
  name: string
  /** Node id from a [[link]] name. */
  ref?: string
  /** The group (value of the groupBy key), if the field groups. */
  group?: string
  /** Markdown description. */
  text: string
  /** The record's own values, by item key. */
  values: Record<string, unknown>
}
export type RecordGroup = { title?: string; records: RecordEntry[] }

const LINK = /^\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*(.*)$/

/** The records of a records field, in order (entries that aren't maps are skipped). */
export function recordList(def: FieldDef, v: unknown): RecordEntry[] {
  if (!Array.isArray(v)) return []
  const title = def.titleKey ?? 'name'
  const text = def.textKey ?? 'text'
  return v.flatMap((raw, index) => {
    if (!isMap(raw)) return []
    let name = plainText(raw[title]).trim()
    let ref: string | undefined
    const link = LINK.exec(name)
    if (link) {
      ref = link[1].trim()
      name = `${(link[2] ?? link[1]).trim()}${link[3] ? ` ${link[3]}` : ''}`
    }
    const group = def.groupBy ? plainText(raw[def.groupBy]).trim() || undefined : undefined
    return [{ index, name, ...(ref && { ref }), ...(group && { group }), text: plainText(raw[text]).trim(), values: raw }]
  })
}

/** Records by group: groups in the order of the groupBy field's options, then others as they first appear. */
export function recordGroups(def: FieldDef, records: readonly RecordEntry[]): RecordGroup[] {
  if (!def.groupBy) return records.length ? [{ records: [...records] }] : []
  const order = itemFields(def).fields.find((f) => f.key === def.groupBy)?.options ?? []
  const groups = new Map<string, RecordEntry[]>()
  for (const o of order) groups.set(normalizeName(o), [])
  const titles = new Map(order.map((o) => [normalizeName(o), o]))
  for (const r of records) {
    const key = normalizeName(r.group ?? '')
    if (!titles.has(key)) titles.set(key, r.group ?? '')
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups].filter(([, rs]) => rs.length).map(([key, rs]) => ({ ...(titles.get(key) && { title: titles.get(key) }), records: rs }))
}

/** The item fields shown as facts next to a record's name: all but its name, description and group. */
export function recordFacts(def: FieldDef): FieldDef[] {
  const skip = new Set([def.titleKey ?? 'name', def.textKey ?? 'text', def.groupBy])
  return itemFields(def).fields.filter((f) => !skip.has(f.key))
}

/** Everything wrong with a records value: its shape, then each record against the item fields. */
export function recordProblems(def: FieldDef, v: unknown): string[] {
  if (isEmptyValue(v)) return []
  if (!Array.isArray(v)) return ['expected a list of records like [{ name: …, text: … }]']
  const fields = itemFields(def).fields
  const known = new Set(fields.map((f) => f.key))
  const out: string[] = []
  v.forEach((raw, i) => {
    const name = isMap(raw) ? plainText(raw[def.titleKey ?? 'name']).trim() : ''
    const at = `#${i + 1}${name ? ` (${name})` : ''}`
    if (!isMap(raw)) {
      out.push(`${at} is not a record`)
      return
    }
    const missing = fields.filter((f) => isRequired(f, raw) && isEmptyValue(raw[f.key])).map((f) => f.key)
    if (missing.length) out.push(`${at} lacks ${missing.join(', ')}`)
    const unknown = Object.keys(raw).filter((k) => !known.has(k))
    if (unknown.length) out.push(`${at} has keys the item doesn't define: ${unknown.join(', ')} (item: ${[...known].join(', ')})`)
    for (const f of fields) {
      const problem = fieldProblem(f, raw[f.key])
      if (problem) out.push(`${at} ${f.key}: ${problem}`)
    }
  })
  return out
}

/** One record as a markdown line: "- **Name** (fact, fact) — description". */
export function recordLine(def: FieldDef, r: RecordEntry): string {
  const facts = recordFacts(def)
    .filter((f) => !isEmptyValue(r.values[f.key]))
    .map((f) => fieldSummary(f, r.values[f.key]))
  const name = r.ref ? `[[${r.ref}${r.name !== r.ref ? `|${r.name}` : ''}]]` : r.name
  return `- **${name}**${facts.length ? ` (${facts.join(', ')})` : ''}${r.text ? ` — ${r.text.replaceAll(/\s*\n\s*/g, ' ')}` : ''}`
}

/** A records value as markdown: "## Group" headings and one line per record. */
export function recordsText(def: FieldDef, v: unknown): string {
  return recordGroups(def, recordList(def, v))
    .map((g) => [...(g.title ? [`## ${g.title}`] : []), ...g.records.map((r) => recordLine(def, r))].join('\n'))
    .join('\n\n')
}

/** Library node titles → nodes (types marked `library`), by normalized title. */
export function libraryIndex(nodes: readonly StoryNode[], types: readonly Pick<TypeInfo, 'id' | 'library'>[]): Map<string, StoryNode> {
  const lib = new Set(types.filter((t) => t.library).map((t) => t.id))
  const out = new Map<string, StoryNode>()
  for (const n of nodes) if (lib.has(n.type)) out.set(normalizeName(n.title), n)
  return out
}

/** The node a record refers to: its [[link]], else a library node with the same name. */
export function libraryNode(r: Pick<RecordEntry, 'name' | 'ref'>, library: Map<string, StoryNode>, byId: Map<string, StoryNode>): StoryNode | undefined {
  if (r.ref) return byId.get(r.ref)
  return library.get(normalizeName(r.name))
}

/** The text of a fields tab, for checks scoped to it: one "Label: value" line per field, records as markdown. */
export function fieldsTabText(sections: readonly FieldSection[], values: Record<string, unknown>): string {
  return sections
    .flatMap((s) => s.fields)
    .filter((f) => !isEmptyValue(values[f.key]))
    .map((f) => (f.widget === 'records' ? recordsText(f, values[f.key]) : `${fieldLabel(f)}: ${fieldSummary(f, values[f.key])}`))
    .join('\n')
}
