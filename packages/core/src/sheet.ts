/**
 * Entity sheets: statblock systems, stat values, body tabs and ability cards. Browser-safe (no Node imports), so the
 * app renders exactly what the MCP server and the checks see.
 */
import { STAT_KEY, SystemDef, type StatDef, type StatKind, type StoryNode, type TabDef, type TypeInfo } from './schema'

// ---------- systems ----------

export type ResolvedSystem = { id: string; label: string; tab: string; stats: StatDef[]; preset: boolean }

const d20 = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const d20Labels = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }

/** Built-in systems. Projects can extend them (`extends`) or define their own in maquest.json `systems`. */
export const SYSTEM_PRESETS: Record<string, SystemDef> = {
  'dnd-2024': {
    label: 'D&D 5e (2024)',
    stats: [
      { key: 'size', kind: 'subtitle', hint: 'Medium', aliases: ['rozmiar'] },
      { key: 'creature', kind: 'subtitle', label: 'Type', hint: 'humanoid (elf)', aliases: ['typ', 'rasa', 'race', 'species'] },
      { key: 'class', kind: 'subtitle', label: 'Class', hint: 'Wizard 5', aliases: ['klasa'] },
      { key: 'alignment', kind: 'subtitle', hint: 'neutral' },
      { key: 'ac', kind: 'stat', label: 'AC', required: true, badge: true, hint: '15 or { value: 15, note: "natural armor" }', aliases: ['armor class', 'kp'] },
      { key: 'hp', kind: 'stat', label: 'HP', required: true, badge: true, hint: '40 or { value: 40, note: "9d6+9" }', aliases: ['hit points', 'pw'] },
      { key: 'speed', kind: 'stat', label: 'Speed', hint: '30 ft', aliases: ['szybkość', 'movement'] },
      { key: 'initiative', kind: 'stat', label: 'Initiative', hint: '+2', aliases: ['inicjatywa'] },
      { key: 'cr', kind: 'stat', label: 'CR', badge: true, hint: '6 (or "PC (Druid 11)")', aliases: ['challenge'] },
      { key: 'pb', kind: 'stat', label: 'PB', hint: '+3', aliases: ['proficiency bonus'] },
      {
        key: 'scores',
        kind: 'scores',
        label: 'Ability scores',
        keys: d20,
        labels: d20Labels,
        modifier: 'd20',
        required: true,
        hint: '{ str: 10, dex: 14, … }',
      },
      { key: 'saves', kind: 'bonuses', label: 'Saving throws', labels: d20Labels, hint: '{ int: 6, wis: 4 }' },
      { key: 'skills', kind: 'bonuses', label: 'Skills', hint: '{ Arcana: 6, History: 6 }', aliases: ['umiejętności'] },
      { key: 'resistances', kind: 'tags', label: 'Resistances' },
      { key: 'immunities', kind: 'tags', label: 'Immunities' },
      { key: 'vulnerabilities', kind: 'tags', label: 'Vulnerabilities' },
      { key: 'senses', kind: 'line', label: 'Senses', hint: 'darkvision 60 ft, passive Perception 12' },
      { key: 'languages', kind: 'line', label: 'Languages', aliases: ['języki'] },
      { key: 'spellcasting', kind: 'line', label: 'Spellcasting', hint: 'INT, save DC 14, attack +6' },
      { key: 'slots', kind: 'bonuses', label: 'Spell slots', signed: false, hint: '{ 1: 4, 2: 3, 3: 3 }', aliases: ['sloty'] },
      { key: 'gear', kind: 'line', label: 'Gear', aliases: ['ekwipunek', 'equipment'] },
    ],
  },
  pf2e: {
    label: 'Pathfinder 2e',
    stats: [
      { key: 'traits', kind: 'tags', label: 'Traits' },
      { key: 'level', kind: 'stat', label: 'Level', required: true, badge: true },
      { key: 'perception', kind: 'stat', label: 'Perception', hint: '+12; darkvision' },
      { key: 'ac', kind: 'stat', label: 'AC', required: true, badge: true },
      { key: 'hp', kind: 'stat', label: 'HP', required: true, badge: true },
      { key: 'speed', kind: 'stat', label: 'Speed' },
      { key: 'saves', kind: 'bonuses', label: 'Saves', keys: ['fort', 'ref', 'will'], labels: { fort: 'Fort', ref: 'Ref', will: 'Will' } },
      {
        key: 'attributes',
        kind: 'scores',
        label: 'Attribute modifiers',
        keys: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
        labels: { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' },
        modifier: 'none',
        required: true,
      },
      { key: 'skills', kind: 'bonuses', label: 'Skills' },
      { key: 'immunities', kind: 'tags', label: 'Immunities' },
      { key: 'resistances', kind: 'tags', label: 'Resistances' },
      { key: 'weaknesses', kind: 'tags', label: 'Weaknesses' },
      { key: 'languages', kind: 'line', label: 'Languages' },
      { key: 'items', kind: 'line', label: 'Items' },
    ],
  },
  osr: {
    label: 'OSR (B/X style)',
    stats: [
      { key: 'alignment', kind: 'subtitle' },
      { key: 'hd', kind: 'stat', label: 'HD', required: true, badge: true },
      { key: 'ac', kind: 'stat', label: 'AC', required: true, badge: true },
      { key: 'hp', kind: 'stat', label: 'HP' },
      { key: 'attack', kind: 'stat', label: 'Attack', hint: '+3 or THAC0 17' },
      { key: 'move', kind: 'stat', label: 'Move', hint: "120' (40')" },
      { key: 'morale', kind: 'stat', label: 'Morale' },
      { key: 'saves', kind: 'bonuses', label: 'Saves', signed: false, keys: ['d', 'w', 'p', 'b', 's'], labels: { d: 'D', w: 'W', p: 'P', b: 'B', s: 'S' } },
      { key: 'attributes', kind: 'scores', label: 'Attributes', keys: d20, labels: d20Labels, modifier: 'none' },
      { key: 'treasure', kind: 'line', label: 'Treasure' },
    ],
  },
  blades: {
    label: 'Blades in the Dark',
    tab: 'Sheet',
    stats: [
      { key: 'playbook', kind: 'subtitle', required: true },
      { key: 'heritage', kind: 'subtitle' },
      { key: 'stress', kind: 'track', label: 'Stress', max: 9, badge: true },
      { key: 'trauma', kind: 'tags', label: 'Trauma' },
      { key: 'harm', kind: 'line', label: 'Harm' },
      {
        key: 'actions',
        kind: 'scores',
        label: 'Action ratings',
        keys: ['hunt', 'study', 'survey', 'tinker', 'finesse', 'prowl', 'skirmish', 'wreck', 'attune', 'command', 'consort', 'sway'],
        modifier: 'none',
      },
      { key: 'vice', kind: 'line', label: 'Vice' },
      { key: 'load', kind: 'stat', label: 'Load' },
    ],
  },
  coc7: {
    label: 'Call of Cthulhu 7e',
    stats: [
      { key: 'occupation', kind: 'subtitle' },
      { key: 'age', kind: 'subtitle' },
      {
        key: 'characteristics',
        kind: 'scores',
        label: 'Characteristics',
        keys: ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu'],
        labels: { str: 'STR', con: 'CON', siz: 'SIZ', dex: 'DEX', app: 'APP', int: 'INT', pow: 'POW', edu: 'EDU' },
        modifier: 'none',
        required: true,
      },
      { key: 'hp', kind: 'track', label: 'HP', badge: true },
      { key: 'mp', kind: 'track', label: 'MP' },
      { key: 'san', kind: 'track', label: 'Sanity', max: 99, badge: true },
      { key: 'luck', kind: 'stat', label: 'Luck' },
      { key: 'move', kind: 'stat', label: 'Move' },
      { key: 'build', kind: 'stat', label: 'Build' },
      { key: 'db', kind: 'stat', label: 'Damage bonus' },
      { key: 'skills', kind: 'bonuses', label: 'Skills', signed: false, hint: '{ Spot Hidden: 60, Library Use: 70 }' },
    ],
  },
  generic: {
    label: 'Generic',
    stats: [
      { key: 'role', kind: 'subtitle' },
      { key: 'level', kind: 'stat', label: 'Level', badge: true },
      { key: 'hp', kind: 'track', label: 'HP', badge: true },
      { key: 'defense', kind: 'stat', label: 'Defense' },
      { key: 'attributes', kind: 'scores', label: 'Attributes', modifier: 'none' },
      { key: 'skills', kind: 'bonuses', label: 'Skills' },
      { key: 'traits', kind: 'tags', label: 'Traits' },
    ],
  },
}

export type SystemProblem = { system: string; message: string }

/**
 * Every system a project can use: presets plus the project's own (which override presets with the same id), with
 * `extends` applied. Invalid or circular definitions are left out and reported in `problems`.
 */
export function resolveSystems(projectSystems: Record<string, unknown> = {}): { systems: Map<string, ResolvedSystem>; problems: SystemProblem[] } {
  const defs = new Map<string, { def: SystemDef; preset: boolean }>()
  const problems: SystemProblem[] = []
  for (const [id, def] of Object.entries(SYSTEM_PRESETS)) defs.set(id, { def, preset: true })
  for (const [id, raw] of Object.entries(projectSystems)) {
    const parsed = SystemDef.safeParse(raw)
    if (parsed.success) defs.set(id, { def: parsed.data, preset: false })
    else problems.push({ system: id, message: parsed.error.issues.map((i) => `${i.path.join('.') || 'system'}: ${i.message}`).join('; ') })
  }
  const out = new Map<string, ResolvedSystem>()
  const resolve = (id: string, seen: string[]): ResolvedSystem | null => {
    const done = out.get(id)
    if (done) return done
    const entry = defs.get(id)
    if (!entry) return null
    if (seen.includes(id)) {
      problems.push({ system: id, message: `extends itself (${[...seen, id].join(' → ')})` })
      return null
    }
    const { def, preset } = entry
    let stats: StatDef[] = []
    if (def.extends) {
      const base = resolve(def.extends, [...seen, id])
      if (!base) {
        if (!defs.has(def.extends)) problems.push({ system: id, message: `extends unknown system "${def.extends}"` })
        return null
      }
      stats = base.stats.map((s) => ({ ...s }))
    }
    if (def.omit) stats = stats.filter((s) => !def.omit!.includes(s.key))
    for (const s of def.stats) {
      const i = stats.findIndex((x) => x.key === s.key)
      if (i >= 0) stats[i] = { ...stats[i], ...strip(s), kind: s.kind ?? stats[i].kind }
      else stats.push({ ...s, kind: s.kind ?? 'stat' })
    }
    const base = def.extends ? out.get(def.extends) : undefined
    const system: ResolvedSystem = { id, label: def.label ?? base?.label ?? id, tab: def.tab ?? base?.tab ?? 'Stats', stats, preset }
    out.set(id, system)
    return system
  }
  for (const id of defs.keys()) resolve(id, [])
  return { systems: out, problems }
}

function strip<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** The system id a node uses: its own `system`, else its type's. */
export const systemIdOf = (node: Pick<StoryNode, 'system'>, type?: Pick<TypeInfo, 'system'>) => node.system ?? type?.system

/** A stat's display label. */
export const statLabel = (def: Pick<StatDef, 'key' | 'label'>) => def.label ?? def.key.charAt(0).toUpperCase() + def.key.slice(1).replaceAll(/[-_]/g, ' ')

/** Stat definitions for a node's values: the system's stats in order, then any extra keys the node has. */
export function statRows(system: ResolvedSystem | undefined, stats: Record<string, unknown> = {}): { def: StatDef; value: unknown; known: boolean }[] {
  const rows = (system?.stats ?? []).map((def) => ({ def, value: stats[def.key], known: true }))
  for (const [key, value] of Object.entries(stats)) {
    if (rows.some((r) => r.def.key === key)) continue
    rows.push({ def: { key, kind: inferKind(value) }, value, known: !system })
  }
  return rows
}

/** A sensible renderer for a value without a definition. */
export function inferKind(value: unknown): StatKind {
  if (Array.isArray(value)) return 'tags'
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    if ('value' in o || 'note' in o) return 'stat'
    if ('max' in o) return 'track'
    const nums = Object.values(o).filter((v) => typeof v === 'number').length
    return nums && nums === Object.keys(o).length && nums >= 3 ? 'scores' : 'bonuses'
  }
  return typeof value === 'string' && value.length > 24 ? 'line' : 'stat'
}

// ---------- stat values ----------

export const isEmptyStat = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && !v.trim()) ||
  (Array.isArray(v) && !v.length) ||
  (typeof v === 'object' && !Array.isArray(v) && !Object.values(v as object).some((x) => !isEmptyStat(x)))

const scalar = (v: unknown): string =>
  v === undefined || v === null
    ? ''
    : typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : Array.isArray(v)
          ? v.map(scalar).join(', ')
          : Object.entries(v as object)
              .map(([k, x]) => `${k} ${scalar(x)}`)
              .join(', ')

/** A text-like stat as value plus optional note: `40`, `"30 ft"`, or `{ value: 40, note: "9d6+9" }`. */
export function statText(v: unknown): { value: string; note?: string } {
  if (v && typeof v === 'object' && !Array.isArray(v) && ('value' in v || 'note' in v)) {
    const o = v as { value?: unknown; note?: unknown }
    const note = scalar(o.note).trim()
    return { value: scalar(o.value), ...(note && { note }) }
  }
  return { value: scalar(v) }
}

/** Number in a value like 14, "14", "+2" or "−1"; null when there is none. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const m = /^\s*([+\-−]?\d+(?:\.\d+)?)/.exec(v)
    if (m) return Number(m[1].replace('−', '-'))
  }
  return null
}

/** Signed number with a real minus sign: +2, −1, 0. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0')

/** The d20 ability modifier of a score. */
export const d20Modifier = (score: number) => Math.floor((score - 10) / 2)

export type ScoreCell = { key: string; label: string; value: string; number: number | null; modifier?: string }

/** Score grid cells in the system's order, then any extra keys. */
export function scoreCells(def: Pick<StatDef, 'keys' | 'labels' | 'modifier'>, v: unknown): ScoreCell[] {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  const keys = [...(def.keys ?? []), ...Object.keys(o).filter((k) => !def.keys?.includes(k))]
  return keys.map((key) => {
    const raw = o[key]
    const number = toNumber(raw)
    return {
      key,
      label: def.labels?.[key] ?? key.toUpperCase(),
      value: scalar(raw),
      number,
      ...(def.modifier === 'd20' && number !== null && { modifier: signed(d20Modifier(number)) }),
    }
  })
}

/** Named numbers ("Arcana +6"): from a map, a list, or text like "Arcana +6, History +6". */
export function bonusEntries(def: Pick<StatDef, 'labels' | 'signed'>, v: unknown): { key: string; label: string; value: string }[] {
  const show = (x: unknown) => {
    const n = typeof x === 'number' ? x : null
    return n !== null && def.signed !== false ? signed(n) : scalar(x)
  }
  const label = (k: string) => def.labels?.[k] ?? k
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.entries(v).map(([key, x]) => ({ key, label: label(key), value: show(x) }))
  const items = Array.isArray(v) ? v.map(scalar) : typeof v === 'string' ? v.split(/[,;·]/) : []
  return items
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(.*?)\s*([+\-−]?\d+%?)$/.exec(s)
      return m && m[1] ? { key: m[1], label: label(m[1]), value: m[2] } : { key: s, label: s, value: '' }
    })
}

/** Parses "Arcana +6, History 4" into { Arcana: 6, History: 4 } (text parts stay text). */
export function parseBonuses(text: string): Record<string, number | string> {
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

/** Formats a bonus map back into editable text. */
export const formatBonuses = (def: Pick<StatDef, 'labels' | 'signed'>, v: unknown) =>
  bonusEntries({ ...def, labels: undefined }, v)
    .map((e) => (e.value ? `${e.label} ${e.value.replace('−', '-')}` : e.label))
    .join(', ')

/** Chips from a list or comma-separated text. */
export function tagList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(scalar).filter(Boolean)
  if (typeof v === 'string')
    return v
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} ${scalar(x)}`.trim())
  return v === undefined || v === null ? [] : [scalar(v)]
}

/** A track as current/max: `5`, `"5/9"`, or `{ value: 5, max: 9 }`. */
export function trackValue(def: Pick<StatDef, 'max'>, v: unknown): { value: number | null; max: number | null } {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as { value?: unknown; max?: unknown }
    return { value: toNumber(o.value), max: toNumber(o.max) ?? def.max ?? null }
  }
  if (typeof v === 'string' && v.includes('/')) {
    const [a, b] = v.split('/')
    return { value: toNumber(a), max: toNumber(b) ?? def.max ?? null }
  }
  return { value: toNumber(v), max: def.max ?? null }
}

/** One-line text of any stat value, for agents and compact UI. */
export function statSummary(def: StatDef, v: unknown): string {
  switch (def.kind) {
    case 'scores':
      return scoreCells(def, v)
        .filter((c) => c.value)
        .map((c) => `${c.label} ${c.value}${c.modifier ? ` (${c.modifier})` : ''}`)
        .join(', ')
    case 'bonuses':
      return bonusEntries(def, v)
        .map((e) => `${e.label} ${e.value}`.trim())
        .join(', ')
    case 'tags':
      return tagList(v).join(', ')
    case 'track': {
      const t = trackValue(def, v)
      return t.value === null ? scalar(v) : `${t.value}${t.max !== null ? `/${t.max}` : ''}`
    }
    default: {
      const t = statText(v)
      return t.note ? `${t.value} (${t.note})` : t.value
    }
  }
}

/** Why a value doesn't fit its stat's kind, or null when it does. */
export function statProblem(def: StatDef, v: unknown): string | null {
  if (isEmptyStat(v)) return null
  switch (def.kind) {
    case 'scores': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return `expected a map like { ${(def.keys ?? ['a', 'b']).slice(0, 2).join(': 10, ')}: 10 }`
      const bad = Object.entries(v as object).filter(([, x]) => toNumber(x) === null && !isEmptyStat(x))
      return bad.length ? `not numbers: ${bad.map(([k]) => k).join(', ')}` : null
    }
    case 'track': {
      const t = trackValue(def, v)
      if (t.value === null) return 'expected a number, "current/max", or { value, max }'
      return t.max !== null && t.value > t.max ? `value ${t.value} is over the maximum ${t.max}` : null
    }
    case 'bonuses':
    case 'tags':
      return null
    default:
      return v && typeof v === 'object' && !Array.isArray(v) && !('value' in v || 'note' in v) ? 'expected text, a number, or { value, note }' : null
  }
}

export const isStatKey = (key: string) => STAT_KEY.test(key)

/** Lowercase, accent-free form of a name, for matching labels, aliases and titles. */
export function normalizeName(s: string) {
  return s
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .replaceAll('ł', 'l')
    .replaceAll('Ł', 'l')
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The stat a legacy field name stands for (by key, label or alias), if any. */
export function statForField(system: ResolvedSystem, field: string): StatDef | undefined {
  const want = normalizeName(field)
  return system.stats.find((s) => [s.key, s.label ?? '', ...(s.aliases ?? [])].some((n) => n && normalizeName(n) === want))
}

// ---------- body tabs ----------

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

/** Default ability-like tab headings, matched case- and accent-insensitively. */
export const ABILITY_TAB_NAMES = [
  'abilities',
  'actions',
  'bonus actions',
  'reactions',
  'spells',
  'powers',
  'features',
  'traits',
  'moves',
  'feats',
  'talents',
  'techniques',
  'zdolnosci',
  'umiejetnosci',
  'zaklecia',
  'akcje',
  'cechy',
  'moce',
  'atuty',
]

export type SheetTab =
  | { kind: 'stats'; key: 'stats'; title: string }
  | { kind: 'prose' | 'abilities'; key: string; title: string; section: number; text: string }

/** Whether a heading names a tab of the given config (title or alias). */
const tabMatches = (def: TabDef, title: string) => [def.title, ...(def.aliases ?? [])].some((t) => normalizeName(t) === normalizeName(title))

/**
 * The tabs of a node: the statblock (when it has a system or stats), then its body sections. Configured tabs come
 * first in their order; other H1 sections follow. Without a statblock, a body needs at least two H1 sections to get
 * tabs, so plain documents stay one editor.
 */
export function sheetTabs(body: string, opts: { statsTitle?: string; tabs?: readonly TabDef[] } = {}): SheetTab[] {
  const sections = splitSections(body)
  const configured = opts.tabs ?? []
  const withHeading = sections.map((s, i) => ({ s, i })).filter((x) => x.s.heading !== undefined)
  const intro = sectionText(sections[0])
  const bodyTabs: SheetTab[] = []
  if (intro) bodyTabs.push({ kind: 'prose', key: 'intro', title: 'Overview', section: 0, text: intro })
  const order = (title: string) => {
    const i = configured.findIndex((d) => tabMatches(d, title))
    return i < 0 ? configured.length : i
  }
  for (const { s, i } of withHeading.toSorted((a, b) => order(a.s.title!) - order(b.s.title!))) {
    const def = configured.find((d) => tabMatches(d, s.title!))
    const kind = def?.kind ?? (ABILITY_TAB_NAMES.includes(normalizeName(s.title!)) ? 'abilities' : 'prose')
    bodyTabs.push({ kind, key: `s${i}:${s.title}`, title: s.title!, section: i, text: sectionText(s) })
  }
  const stats = opts.statsTitle !== undefined
  if (!stats && withHeading.length < 2) return []
  return [...(stats ? [{ kind: 'stats' as const, key: 'stats' as const, title: opts.statsTitle! }] : []), ...bodyTabs]
}

// ---------- abilities ----------

export type Ability = {
  name: string
  /** Node id from a [[link]] in the name. */
  ref?: string
  /** Short facts shown as chips: level, cost, range, uses. */
  meta: string[]
  /** Markdown description. */
  text: string
}
export type AbilityGroup = { title: string | null; intro: string; abilities: Ability[] }

const LINK = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/

/** "Name {a, b}" / "[[id|Name]] {a}" / "**Name**" → name, ref, meta. */
function abilityHead(raw: string): Pick<Ability, 'name' | 'ref' | 'meta'> {
  let s = raw.trim()
  let meta: string[] = []
  const braces = /\s*\{([^}]*)\}\s*$/.exec(s)
  if (braces) {
    meta = splitMeta(braces[1])
    s = s.slice(0, braces.index).trim()
  }
  s = s
    .replaceAll(/^\*+|\*+$/g, '')
    .replace(/[.:]$/, '')
    .trim()
  const link = LINK.exec(s)
  if (link) {
    const rest = s.slice(link[0].length).trim()
    return { name: (link[2] ?? link[1]).trim() + (rest ? ` ${rest}` : ''), ref: link[1].trim(), meta }
  }
  return { name: s, meta }
}

const splitMeta = (s: string) =>
  s
    .split(/[,;·|]/)
    .map((x) => x.trim())
    .filter(Boolean)

/** A bullet or paragraph that starts with a bold name (or a [[link]]): "- **Fireball** (lvl 3) — text". */
function abilityLine(line: string): Ability | null {
  const m = /^(?:[-*+]\s+)?(?:(\*{2,3})(.+?)\1|(\[\[[^\]]+\]\]))(.*)$/.exec(line)
  if (!m) return null
  const head = abilityHead(m[2] ?? m[3])
  if (!head.name) return null
  let rest = m[4].trim()
  const paren = /^\(([^)]*)\)/.exec(rest)
  if (paren) {
    head.meta = [...head.meta, ...splitMeta(paren[1])]
    rest = rest.slice(paren[0].length).trim()
  }
  rest = rest.replace(/^(?:[—–:-]|\.(?!\d))\s*/, '')
  return { ...head, text: rest }
}

/**
 * Ability cards from an abilities tab. H2 headings group (e.g. "Reactions", "1/day", "Level 2 spells"); each H3 is
 * one ability with its content as the description, `### Name {meta, …}`; bullets or paragraphs that start with a bold
 * name are abilities too, so plain statblock markdown works as is. Other text stays as the group's intro.
 */
export function parseAbilities(text: string): { intro: string; groups: AbilityGroup[] } {
  const groups: AbilityGroup[] = [{ title: null, intro: '', abilities: [] }]
  const intro: string[][] = [[]]
  let current: Ability | null = null
  let fromLine = false
  let fence: string | null = null
  const close = () => {
    if (current) current.text = current.text.trim()
    current = null
  }
  for (const line of text.split('\n')) {
    const f = /^\s*(```|~~~)/.exec(line)
    if (f) fence = fence === null ? f[1] : fence === f[1] ? null : fence
    const inFence = fence !== null || !!f
    const h = inFence ? null : /^(#{2,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (h && h[1].length === 2) {
      close()
      groups.push({ title: h[2], intro: '', abilities: [] })
      intro.push([])
      continue
    }
    if (h && h[1].length === 3) {
      close()
      current = { ...abilityHead(h[2]), text: '' }
      fromLine = false
      groups.at(-1)!.abilities.push(current)
      continue
    }
    const asLine: Ability | null = !inFence && !(current && !fromLine) ? abilityLine(line) : null
    if (asLine) {
      close()
      current = asLine
      fromLine = true
      groups.at(-1)!.abilities.push(current)
      continue
    }
    if (current && fromLine) {
      // Bullet abilities continue on indented or plain lines; a blank line, another bullet or a heading ends them.
      if (!line.trim() || /^[-*+]\s|^\d+[.)]\s|^#/.test(line)) close()
      else {
        ;(current as Ability).text += `\n${line.trim()}`
        continue
      }
    }
    if (current) (current as Ability).text += `\n${line}`
    else intro.at(-1)!.push(line)
  }
  close()
  groups.forEach((g, i) => (g.intro = intro[i].join('\n').trim()))
  return { intro: groups[0].intro, groups: groups.filter((g, i) => i === 0 || g.abilities.length || g.intro) }
}

/** Ability names → library nodes (types marked `library`), by normalized title. */
export function abilityLibrary(nodes: readonly StoryNode[], types: readonly Pick<TypeInfo, 'id' | 'library'>[]): Map<string, StoryNode> {
  const lib = new Set(types.filter((t) => t.library).map((t) => t.id))
  const out = new Map<string, StoryNode>()
  for (const n of nodes) if (lib.has(n.type)) out.set(normalizeName(n.title), n)
  return out
}

/** The library or linked node an ability refers to: its [[link]], else a library node with the same name. */
export function abilityNode(a: Pick<Ability, 'name' | 'ref'>, library: Map<string, StoryNode>, byId: Map<string, StoryNode>): StoryNode | undefined {
  if (a.ref) return byId.get(a.ref)
  return library.get(normalizeName(a.name))
}

/** Abilities of every abilities tab in a body. */
export function bodyAbilities(body: string, tabs?: readonly TabDef[]): Ability[] {
  return sheetTabs(body, { statsTitle: '', tabs })
    .filter((t) => t.kind === 'abilities')
    .flatMap((t) => (t.kind === 'abilities' ? parseAbilities(t.text).groups.flatMap((g) => g.abilities) : []))
}
