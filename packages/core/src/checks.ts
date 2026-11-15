/**
 * Maquest checks: project-wide health rules (broken links, off-canvas nodes, missing statblocks, …) configured per
 * project in maquest.json `checks` and `customChecks`. Pure: works on a snapshot of the project, so the app, the MCP
 * server and tests run exactly the same rules.
 */
import {
  ALLOWED_PARENTS,
  CustomCheck,
  RuleSetting,
  SUMMARY_MAX,
  clueCounts,
  entityOf,
  overlapWarnings,
  type Graph,
  type ProjectConfig,
  type RuleLevel,
  type Severity,
  type StoryNode,
  type TabDef,
  type TypeInfo,
} from './schema'
import {
  ABILITY_TAB_NAMES,
  abilityLibrary,
  bodyAbilities,
  isEmptyStat,
  normalizeName,
  resolveSystems,
  statForField,
  statLabel,
  statProblem,
  splitSections,
  systemIdOf,
  type ResolvedSystem,
} from './sheet'
import { suggestIds } from './project'

/** A change that fixes an issue, applied by `applyFix` (the app shows these as buttons). */
export type QuickFix =
  | { kind: 'place'; node: string; board: string }
  | { kind: 'remove-edge'; edge: string }
  | { kind: 'remove-card'; board: string; card: string }
  | { kind: 'delete-group'; board: string; group: string }
  | { kind: 'unlink'; node: string; target: string }
  | { kind: 'move-fields'; node: string; fields: Record<string, string> }
  | { kind: 'arrange'; board: string }

export type Issue = {
  rule: string
  severity: Severity
  /** The node the issue is about (most issues have one). */
  node?: string
  board?: string
  group?: string
  edge?: string
  /** What is wrong, one line. */
  message: string
  /** What to do about it, when more specific than the rule's own fix text. */
  hint?: string
  fixes?: QuickFix[]
  /** Where the app should open the node: the statblock tab, in edit mode. */
  open?: 'stats'
}

export type RuleOption = { key: string; label: string; type: 'number' | 'types' | 'tags'; default?: number | string[] }

export type RuleMeta = {
  id: string
  title: string
  category: 'integrity' | 'canvas' | 'content' | 'sheets' | 'rpg' | 'custom'
  /** Level when the project doesn't configure the rule. */
  level: RuleLevel
  /** Why it matters, one sentence. */
  description: string
  /** What to do, for agents and the app. */
  fix: string
  options?: RuleOption[]
}

export type CheckInput = {
  nodes: StoryNode[]
  graph: Graph
  config: ProjectConfig
  types: TypeInfo[]
  /** Media files that exist (media/...). */
  media: string[]
  /** Node files that could not be read, with why. */
  files: { path: string; problem: string }[]
}

export type CheckReport = {
  issues: Issue[]
  counts: Record<Severity, number>
  /** The rules as configured for this project. */
  rules: (RuleMeta & { setting: RuleLevel; values: Record<string, unknown>; custom?: boolean })[]
}

const scope: RuleOption[] = [
  { key: 'types', label: 'Only types', type: 'types' },
  { key: 'excludeTypes', label: 'Skip types', type: 'types' },
  { key: 'excludeTags', label: 'Skip tags', type: 'tags' },
]

export const RULES: RuleMeta[] = [
  {
    id: 'invalid-file',
    title: 'Unreadable node files',
    category: 'integrity',
    level: 'error',
    description: 'A markdown file in a type folder has frontmatter Maquest cannot read, so the node is invisible everywhere.',
    fix: 'Fix the frontmatter (valid YAML, a "type" matching the folder) or move the file out of the type folder.',
  },
  {
    id: 'config-invalid',
    title: 'Invalid project settings',
    category: 'integrity',
    level: 'error',
    description: 'Part of maquest.json (a statblock system, a check setting or a custom check) is invalid and is ignored.',
    fix: 'Correct the entry in maquest.json (project tool: systems, checks, customChecks).',
  },
  {
    id: 'broken-link',
    title: 'Broken links',
    category: 'integrity',
    level: 'error',
    description: 'A [[link]] points to a node that does not exist.',
    fix: 'Point the link at an existing node id, create the missing node, or remove the brackets.',
  },
  {
    id: 'broken-connection',
    title: 'Connections to missing nodes',
    category: 'integrity',
    level: 'error',
    description: 'A connection in graph.json starts or ends at a node that no longer exists.',
    fix: 'Remove the connection (connect action remove) or recreate the node.',
  },
  {
    id: 'broken-card',
    title: 'Board cards of missing nodes',
    category: 'integrity',
    level: 'error',
    description: 'A board or group lists a card whose node no longer exists.',
    fix: 'Remove the card from the board (board update removeNodes).',
  },
  {
    id: 'bad-parent',
    title: 'Invalid parents',
    category: 'integrity',
    level: 'error',
    description: 'A node names a parent that is missing or of a type it may not sit under.',
    fix: 'Set a valid parent (chapter→story, scene→chapter, note→story/chapter/scene) or detach it (parent: null).',
  },
  {
    id: 'missing-media',
    title: 'Missing media files',
    category: 'integrity',
    level: 'error',
    description: 'A node attaches or embeds a media file that is not in media/.',
    fix: 'Import the file (media import) or fix the path.',
  },
  {
    id: 'unknown-system',
    title: 'Unknown statblock systems',
    category: 'sheets',
    level: 'error',
    description: 'A type or node uses a statblock system that is neither a preset nor defined in the project.',
    fix: 'Use a preset (dnd-2024, pf2e, osr, blades, coc7, generic) or define the system in maquest.json systems.',
  },
  {
    id: 'not-on-canvas',
    title: 'Nodes on no board',
    category: 'canvas',
    level: 'warn',
    description: 'A node is not placed on any board, so it only shows up in the All view and search.',
    fix: 'Place it on a board (board place, or write with boards) where it belongs.',
    options: [{ key: 'excludeTypes', label: 'Skip types', type: 'types', default: ['idea'] }, scope[2]],
  },
  {
    id: 'empty-group',
    title: 'Empty groups',
    category: 'canvas',
    level: 'warn',
    description: 'A group frame on a board has no cards and no nested groups.',
    fix: 'Put cards in it or remove it (board ungroup).',
  },
  {
    id: 'layout-overlap',
    title: 'Overlapping groups',
    category: 'canvas',
    level: 'info',
    description: 'Groups overlap each other or cover cards that are not in them.',
    fix: 'Run board layout to tidy the board.',
  },
  {
    id: 'orphan',
    title: 'Unconnected entities',
    category: 'canvas',
    level: 'off',
    description: 'An entity has no connections and no [[links]] to or from it.',
    fix: 'Connect it to the scenes, places or people it belongs with.',
    options: scope,
  },
  {
    id: 'long-body',
    title: 'Long documents',
    category: 'content',
    level: 'warn',
    description: 'A node body is long enough to be hard to scan; long bodies usually mix lore, reference and session notes.',
    fix: 'Split it: move session notes into session logs or notes, reference text into tabs or separate nodes, and keep the core short.',
    options: [{ key: 'maxWords', label: 'Max words', type: 'number', default: 1200 }, ...scope],
  },
  {
    id: 'summary-length',
    title: 'Long summaries and cut-off titles',
    category: 'content',
    level: 'warn',
    description: `Summaries are one line on cards (under ${SUMMARY_MAX} chars); titles are short complete phrases.`,
    fix: 'Shorten the summary to one sentence and move detail into the body; finish the title.',
  },
  {
    id: 'missing-summary',
    title: 'Missing summaries',
    category: 'content',
    level: 'off',
    description: 'A node has no summary, so its card and the overview say little about it.',
    fix: 'Add a one-sentence summary.',
    options: [{ key: 'excludeTypes', label: 'Skip types', type: 'types', default: ['idea', 'media'] }, scope[0], scope[2]],
  },
  {
    id: 'todo-marker',
    title: 'Open TODOs',
    category: 'content',
    level: 'info',
    description: 'The body contains TODO, TBD, FIXME or ??? markers.',
    fix: 'Resolve the open point, or move it to the backlog as an idea.',
  },
  {
    id: 'duplicate-title',
    title: 'Duplicate titles',
    category: 'content',
    level: 'warn',
    description: 'Two nodes of the same type share a title, which makes links and search ambiguous.',
    fix: 'Merge them (delete with replaceWith) or rename one.',
  },
  {
    id: 'statblock-missing',
    title: 'Missing statblocks',
    category: 'sheets',
    level: 'warn',
    description: 'A node of a type with a statblock system has no stats yet.',
    fix: 'Fill its stats (write stats) or opt the node out (checks: { off: [statblock-missing] }).',
    options: [...scope, { key: 'tags', label: 'Only tags', type: 'tags' }],
  },
  {
    id: 'stat-missing',
    title: 'Missing required stats',
    category: 'sheets',
    level: 'warn',
    description: 'A statblock lacks values its system marks as required (e.g. AC and HP).',
    fix: 'Fill the missing stats.',
  },
  {
    id: 'stat-invalid',
    title: 'Malformed stats',
    category: 'sheets',
    level: 'warn',
    description: "A stat value doesn't fit its kind (e.g. scores that aren't numbers).",
    fix: "Rewrite the value in the stat's format (see the system's keys in overview).",
  },
  {
    id: 'stat-unknown',
    title: 'Stats outside the system',
    category: 'sheets',
    level: 'info',
    description: "A node has stats under keys its system doesn't define (often a typo or a translated key).",
    fix: "Rename the key to the system's key, or add the stat to the project's system.",
  },
  {
    id: 'legacy-fields',
    title: 'Stats kept in fields',
    category: 'sheets',
    level: 'warn',
    description: 'A node with a statblock still keeps stats (AC, HP, CR…) as free-form fields.',
    fix: 'Move them into stats (write stats, then remove the fields with null).',
  },
  {
    id: 'shared-ability',
    title: 'Copied rules text',
    category: 'sheets',
    level: 'warn',
    description: 'The same ability or spell is written out in several nodes, or copies a library node, instead of being shared.',
    fix: 'Create one library node (e.g. type "spell") with the full text and keep only the name (plus campaign-specific changes) on each sheet; same-named abilities link to it automatically.',
    options: [{ key: 'minChars', label: 'Min copied chars', type: 'number', default: 120 }],
  },
  {
    id: 'clue-minimum',
    title: 'Too few clues',
    category: 'rpg',
    level: 'warn',
    description: 'A conclusion has fewer clues pointing to it than the three-clue rule asks for.',
    fix: 'Add clue-for connections from more clues, places or people.',
    options: [{ key: 'min', label: 'Minimum clues', type: 'number', default: 3 }],
  },
]

const LEVEL_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 }

const LINKS = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g
const MEDIA_REF = /\]\((media\/[^)\s]+)\)/g
const TODO = /\b(TODO|TBD|FIXME)\b|\?\?\?/

const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const optionList = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : undefined)
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

type Setting = { level: RuleLevel; options: Record<string, unknown> }

/** Rule settings from the config; invalid ones are reported and fall back to defaults. */
function settings(config: ProjectConfig, problems: Issue[]): Map<string, Setting> {
  const out = new Map<string, Setting>()
  for (const r of RULES) out.set(r.id, { level: r.level, options: {} })
  for (const [id, raw] of Object.entries(config.checks ?? {})) {
    const parsed = RuleSetting.safeParse(raw)
    if (!out.has(id)) {
      problems.push({ rule: 'config-invalid', severity: 'error', message: `checks.${id}: unknown rule`, hint: `Rules: ${RULES.map((r) => r.id).join(', ')}` })
      continue
    }
    if (!parsed.success) {
      problems.push({ rule: 'config-invalid', severity: 'error', message: `checks.${id}: expected "error", "warn", "info", "off" or [level, { options }]` })
      continue
    }
    const v = parsed.data
    out.set(id, typeof v === 'string' ? { level: v, options: {} } : { level: v[0], options: v[1] ?? {} })
  }
  return out
}

const muted = (n: StoryNode | undefined, rule: string) => !!n?.checks?.off.some((r) => r === rule || r === '*')
const inScope = (n: StoryNode, o: Record<string, unknown>) => {
  const only = optionList(o.types)
  const skip = optionList(o.excludeTypes)
  const skipTags = optionList(o.excludeTags)
  const onlyTags = optionList(o.tags)
  return (
    (!only || only.includes(n.type)) &&
    !skip?.includes(n.type) &&
    !skipTags?.some((t) => n.tags.includes(t)) &&
    (!onlyTags || onlyTags.some((t) => n.tags.includes(t)))
  )
}

/** Runs every enabled rule over a project snapshot. */
export function runChecks(input: CheckInput): CheckReport {
  const configProblems: Issue[] = []
  const config = settings(input.config, configProblems)
  const issues: Issue[] = [...configProblems]
  const { nodes, graph, types } = input
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const typeOf = new Map(types.map((t) => [t.id, t]))
  const { systems, problems: systemProblems } = resolveSystems(input.config.systems)
  const firstBoard = graph.boards[0]?.id ?? 'main'

  for (const p of systemProblems) issues.push({ rule: 'config-invalid', severity: 'error', message: `systems.${p.system}: ${p.message}` })

  const custom: CustomCheck[] = []
  ;(input.config.customChecks ?? []).forEach((raw, i) => {
    const parsed = CustomCheck.safeParse(raw)
    if (parsed.success) custom.push(parsed.data)
    else
      issues.push({
        rule: 'config-invalid',
        severity: 'error',
        message: `customChecks[${i}]: ${parsed.error.issues.map((x) => `${x.path.join('.') || 'check'}: ${x.message}`).join('; ')}`,
      })
  })

  const level = (rule: string) => config.get(rule)?.level ?? 'off'
  const opts = (rule: string) => {
    const meta = RULES.find((r) => r.id === rule)
    const defaults = Object.fromEntries((meta?.options ?? []).filter((o) => o.default !== undefined).map((o) => [o.key, o.default]))
    return { ...defaults, ...config.get(rule)?.options }
  }
  /** Adds an issue unless its rule is off or the node opted out. */
  const emit = (issue: Omit<Issue, 'severity'>) => {
    const lv = level(issue.rule)
    if (lv === 'off' || muted(issue.node ? byId.get(issue.node) : undefined, issue.rule)) return
    issues.push({ ...issue, severity: lv })
  }
  /** Nodes a rule applies to: enabled, in its type/tag scope, not opted out. */
  const subjects = (rule: string, filter: (n: StoryNode) => boolean = () => true) => {
    if (level(rule) === 'off') return []
    const o = opts(rule)
    return nodes.filter((n) => inScope(n, o) && !muted(n, rule) && filter(n))
  }

  // ---- integrity ----
  for (const f of input.files) emit({ rule: 'invalid-file', message: `${f.path}: ${f.problem}` })

  const linked = new Set<string>()
  for (const n of subjects('broken-link')) {
    const text = [n.body, ...Object.values(n.fields), n.summary ?? ''].join('\n')
    const missing = new Set<string>()
    for (const m of text.matchAll(LINKS)) {
      const target = m[1].trim()
      if (byId.has(target)) continue
      missing.add(target)
    }
    for (const target of missing) {
      const similar = suggestIds(target, nodes)
      emit({
        rule: 'broken-link',
        node: n.id,
        message: `links to [[${target}]], which does not exist`,
        hint: similar.length ? `Did you mean ${similar.map((s) => `[[${s}]]`).join(' or ')}?` : undefined,
        fixes: [{ kind: 'unlink', node: n.id, target }],
      })
    }
  }
  for (const n of nodes)
    for (const m of [n.body, ...Object.values(n.fields)].join('\n').matchAll(LINKS)) {
      linked.add(m[1].trim())
      linked.add(n.id)
    }

  for (const e of graph.edges) {
    const gone = [e.source, e.target].filter((id) => !byId.has(id))
    if (gone.length)
      emit({
        rule: 'broken-connection',
        edge: e.id,
        node: byId.has(e.source) ? e.source : byId.has(e.target) ? e.target : undefined,
        message: `connection ${e.id} (${e.source} -${e.type}-> ${e.target}) points to missing ${gone.join(' and ')}`,
        fixes: [{ kind: 'remove-edge', edge: e.id }],
      })
  }

  for (const b of graph.boards) {
    const cards = new Set([...(b.nodes ?? []), ...b.groups.flatMap((g) => g.nodes)])
    for (const card of cards) {
      if (byId.has(entityOf(card))) continue
      emit({
        rule: 'broken-card',
        board: b.id,
        message: `board "${b.title}" has a card for missing node ${entityOf(card)}`,
        fixes: [{ kind: 'remove-card', board: b.id, card }],
      })
    }
  }

  for (const n of subjects('bad-parent', (x) => !!x.parent)) {
    const p = byId.get(n.parent!)
    if (!p) emit({ rule: 'bad-parent', node: n.id, message: `parent ${n.parent} does not exist` })
    else if (!ALLOWED_PARENTS[n.type]?.includes(p.type)) emit({ rule: 'bad-parent', node: n.id, message: `a ${n.type} cannot sit under ${p.id} (a ${p.type})` })
  }

  const media = new Set(input.media)
  for (const n of subjects('missing-media')) {
    const refs = new Set([...n.media, ...(n.src ? [n.src] : []), ...[...n.body.matchAll(MEDIA_REF)].map((m) => decodeURI(m[1]))])
    for (const ref of refs) if (!media.has(ref)) emit({ rule: 'missing-media', node: n.id, message: `uses ${ref}, which is not in media/` })
  }

  // ---- sheets ----
  const systemOf = (n: StoryNode): ResolvedSystem | undefined => {
    const id = systemIdOf(n, typeOf.get(n.type))
    return id ? systems.get(id) : undefined
  }
  for (const t of types) {
    if (t.system && !systems.has(t.system) && level('unknown-system') !== 'off')
      issues.push({ rule: 'unknown-system', severity: level('unknown-system') as Severity, message: `type ${t.id} uses unknown system "${t.system}"` })
  }
  for (const n of subjects('unknown-system', (x) => !!x.system && !systems.has(x.system)))
    emit({ rule: 'unknown-system', node: n.id, message: `uses unknown system "${n.system}"` })

  for (const n of subjects('statblock-missing', (x) => !!systemOf(x) && isEmptyStat(x.stats)))
    emit({ rule: 'statblock-missing', node: n.id, message: `has no ${systemOf(n)!.label} statblock`, open: 'stats' })

  for (const n of nodes) {
    const system = systemOf(n)
    if (!system) continue
    const stats = n.stats ?? {}
    if (!isEmptyStat(stats)) {
      const missing = system.stats.filter((s) => s.required && isEmptyStat(stats[s.key]))
      if (missing.length) emit({ rule: 'stat-missing', node: n.id, message: `statblock lacks ${missing.map(statLabel).join(', ')}`, open: 'stats' })
    }
    for (const def of system.stats) {
      const problem = statProblem(def, stats[def.key])
      if (problem) emit({ rule: 'stat-invalid', node: n.id, message: `stats.${def.key}: ${problem}`, open: 'stats' })
    }
    const unknown = Object.keys(stats).filter((k) => !system.stats.some((s) => s.key === k))
    if (unknown.length) {
      const near = unknown.map((k) => {
        const s = statForField(system, k)
        return s ? `${k} → ${s.key}` : k
      })
      emit({
        rule: 'stat-unknown',
        node: n.id,
        message: `stats not in ${system.label}: ${near.join(', ')}`,
        hint: `Keys: ${system.stats.map((s) => s.key).join(', ')}`,
      })
    }
    const legacy = Object.fromEntries(
      Object.entries(n.fields)
        .filter(([, v]) => v.trim())
        .flatMap(([k]) => {
          const s = statForField(system, k)
          return s && isEmptyStat(stats[s.key]) ? [[k, s.key]] : []
        }),
    )
    if (Object.keys(legacy).length)
      emit({
        rule: 'legacy-fields',
        node: n.id,
        message: `fields ${Object.keys(legacy).join(', ')} belong in the statblock`,
        hint: `Move to stats: ${Object.entries(legacy)
          .map(([f, k]) => `${f} → ${k}`)
          .join(', ')}`,
        fixes: [{ kind: 'move-fields', node: n.id, fields: legacy }],
      })
  }

  if (level('shared-ability') !== 'off') {
    const minChars = Number(opts('shared-ability').minChars ?? 120)
    const library = abilityLibrary(nodes, types)
    const libraryTypes = types.filter((t) => t.library)
    const seen = new Map<string, { node: string; name: string }[]>()
    for (const n of nodes) {
      if (typeOf.get(n.type)?.library || muted(n, 'shared-ability')) continue
      for (const a of bodyAbilities(n.body, typeOf.get(n.type)?.tabs)) {
        if (a.text.length < minChars) continue
        const key = normalizeName(a.name)
        const lib = a.ref ? byId.get(a.ref) : library.get(key)
        if (lib && libraryTypes.some((t) => t.id === lib.type)) {
          emit({
            rule: 'shared-ability',
            node: n.id,
            message: `"${a.name}" repeats rules text that the library node ${lib.id} holds`,
            hint: `Keep only the name (and campaign-specific changes) on ${n.id}; the card shows ${lib.id}'s text.`,
          })
          continue
        }
        seen.set(key, [...(seen.get(key) ?? []), { node: n.id, name: a.name }])
      }
    }
    for (const copies of seen.values()) {
      const where = [...new Set(copies.map((c) => c.node))]
      if (where.length < 2) continue
      const lib = libraryTypes[0]
      for (const id of where)
        emit({
          rule: 'shared-ability',
          node: id,
          message: `"${copies[0].name}" is written out in ${where.length} nodes (${where.join(', ')})`,
          hint: lib
            ? `Create a ${lib.id} node "${copies[0].name}" with the full text and keep only the name on each sheet.`
            : `Add a library type (project types: { "spell": { "label": "Spell", "library": true } }), create a "${copies[0].name}" node with the full text, and keep only the name on each sheet.`,
        })
    }
  }

  // ---- canvas ----
  const placed = new Set(graph.boards.flatMap((b) => (b.nodes ?? []).map(entityOf)))
  const libraryIds = new Set(types.filter((t) => t.library).map((t) => t.id))
  for (const n of subjects('not-on-canvas', (x) => !placed.has(x.id) && !libraryIds.has(x.type)))
    emit({
      rule: 'not-on-canvas',
      node: n.id,
      message: 'is not on any board',
      fixes: [{ kind: 'place', node: n.id, board: firstBoard }],
    })

  for (const b of graph.boards) {
    for (const g of b.groups) {
      if (g.nodes.length || b.groups.some((x) => x.parent === g.id)) continue
      emit({
        rule: 'empty-group',
        board: b.id,
        group: g.id,
        message: `group "${g.title}" on board "${b.title}" is empty`,
        fixes: [{ kind: 'delete-group', board: b.id, group: g.id }],
      })
    }
    const overlaps = overlapWarnings(b)
    if (overlaps.length)
      emit({
        rule: 'layout-overlap',
        board: b.id,
        message: `board "${b.title}": ${overlaps.slice(0, 3).join('; ')}${overlaps.length > 3 ? `; +${overlaps.length - 3} more` : ''}`,
        fixes: [{ kind: 'arrange', board: b.id }],
      })
  }

  if (level('orphan') !== 'off') {
    const connected = new Set(graph.edges.flatMap((e) => [e.source, e.target]))
    for (const n of subjects('orphan', (x) => !!typeOf.get(x.type)?.entity && !connected.has(x.id) && !linked.has(x.id)))
      emit({ rule: 'orphan', node: n.id, message: 'has no connections or links' })
  }

  // ---- content ----
  const maxWords = Number(opts('long-body').maxWords ?? 1200)
  for (const n of subjects('long-body')) {
    // Abilities tabs are reference material; only narrative text counts.
    const sections = splitSections(n.body)
    const narrative = sections.filter((s) => !s.title || !isAbilityTab(s.title, typeOf.get(n.type)?.tabs ?? []))
    const count = words(narrative.flatMap((s) => s.lines).join('\n'))
    if (count > maxWords) emit({ rule: 'long-body', node: n.id, message: `body is ${count} words (limit ${maxWords})` })
  }

  for (const n of subjects('summary-length')) {
    if (n.summary && n.summary.length > SUMMARY_MAX)
      emit({ rule: 'summary-length', node: n.id, message: `summary is ${n.summary.length} chars (max ${SUMMARY_MAX})` })
    if (/(…|\.\.\.)\s*$/.test(n.title)) emit({ rule: 'summary-length', node: n.id, message: 'title ends with "…"' })
  }

  for (const n of subjects('missing-summary', (x) => !x.summary?.trim())) emit({ rule: 'missing-summary', node: n.id, message: 'has no summary' })

  for (const n of subjects('todo-marker')) {
    const line = n.body.split('\n').findIndex((l) => TODO.test(l))
    if (line >= 0) emit({ rule: 'todo-marker', node: n.id, message: `open marker on body line ${line + 1}: ${n.body.split('\n')[line].trim().slice(0, 80)}` })
  }

  if (level('duplicate-title') !== 'off') {
    const groups = new Map<string, StoryNode[]>()
    for (const n of subjects('duplicate-title')) {
      const key = `${n.type}:${normalizeName(n.title)}`
      groups.set(key, [...(groups.get(key) ?? []), n])
    }
    for (const same of groups.values()) {
      if (same.length < 2) continue
      for (const n of same)
        emit({
          rule: 'duplicate-title',
          node: n.id,
          message: `shares the title "${n.title}" with ${same
            .filter((x) => x !== n)
            .map((x) => x.id)
            .join(', ')}`,
        })
    }
  }

  // ---- rpg ----
  const minClues = Number(opts('clue-minimum').min ?? 3)
  for (const [id, count] of clueCounts(graph.edges)) {
    if (count >= minClues) continue
    emit({ rule: 'clue-minimum', node: id, message: `has ${plural(count, 'clue')} pointing to it (minimum ${minClues})` })
  }

  // ---- custom ----
  for (const c of custom) {
    for (const n of nodes) {
      if (muted(n, c.id)) continue
      if (c.types && !c.types.includes(n.type)) continue
      if (c.tags && !c.tags.some((t) => n.tags.includes(t))) continue
      if (c.excludeTags?.some((t) => n.tags.includes(t))) continue
      const missing = customMissing(c, n, graph)
      if (missing.length) issues.push({ rule: c.id, severity: c.severity, node: n.id, message: `${c.message} (${missing.join('; ')})`, hint: c.hint })
    }
  }

  const ruleList: CheckReport['rules'] = [
    ...RULES.map((r) => ({ ...r, setting: level(r.id), values: opts(r.id) })),
    ...custom.map((c) => ({
      id: c.id,
      title: c.message,
      category: 'custom' as const,
      level: c.severity,
      description: c.message,
      fix: c.hint ?? '',
      setting: c.severity,
      values: {},
      custom: true,
    })),
  ]
  const sorted = issues.toSorted(
    (a, b) => LEVEL_RANK[a.severity] - LEVEL_RANK[b.severity] || a.rule.localeCompare(b.rule) || (a.node ?? '').localeCompare(b.node ?? ''),
  )
  return {
    issues: sorted,
    counts: { error: count(sorted, 'error'), warn: count(sorted, 'warn'), info: count(sorted, 'info') },
    rules: ruleList,
  }
}

const count = (issues: Issue[], s: Severity) => issues.filter((i) => i.severity === s).length

/** Whether an H1 section renders as ability cards (configured, or a default ability heading). */
function isAbilityTab(title: string, tabs: readonly TabDef[]) {
  const t = tabs.find((d) => [d.title, ...(d.aliases ?? [])].some((x) => normalizeName(x) === normalizeName(title)))
  return t ? t.kind === 'abilities' : ABILITY_TAB_NAMES.includes(normalizeName(title))
}

function customMissing(c: CustomCheck, n: StoryNode, graph: Graph): string[] {
  const out: string[] = []
  const r = c.require
  if (r?.fields) {
    const gone = r.fields.filter((f) => !n.fields[f]?.trim())
    if (gone.length) out.push(`missing fields: ${gone.join(', ')}`)
  }
  if (r?.stats) {
    const gone = r.stats.filter((s) => isEmptyStat(n.stats?.[s]))
    if (gone.length) out.push(`missing stats: ${gone.join(', ')}`)
  }
  if (r?.tags && !r.tags.some((t) => n.tags.includes(t))) out.push(`needs a tag: ${r.tags.join(' or ')}`)
  if (r?.summary && !n.summary?.trim()) out.push('no summary')
  if (r?.body && !n.body.trim()) out.push('empty body')
  if (r?.media && !n.media.length && !n.src) out.push('no media')
  if (r?.parent && !n.parent) out.push('no parent')
  if (r?.edges) {
    const mine = graph.edges.filter((e) => e.source === n.id || e.target === n.id)
    const gone = r.edges.filter((t) => !mine.some((e) => e.type === t))
    if (gone.length) out.push(`no ${gone.join(', ')} connection`)
  }
  if (r?.tabs) {
    const titles = new Set(splitSections(n.body).map((s) => normalizeName(s.title ?? '')))
    const gone = r.tabs.filter((t) => !titles.has(normalizeName(t)))
    if (gone.length) out.push(`missing tabs: ${gone.join(', ')}`)
  }
  if (c.forbid) {
    try {
      const re = new RegExp(c.forbid, 'i')
      const hit = [n.body, ...Object.values(n.fields)].join('\n').match(re)
      if (hit) out.push(`contains "${hit[0].slice(0, 40)}"`)
    } catch {
      out.push(`invalid forbid pattern ${c.forbid}`)
    }
  }
  if (c.maxWords && words(n.body) > c.maxWords) out.push(`${words(n.body)} words (max ${c.maxWords})`)
  return out
}

/** Severity counts as "Maquest detected 2 errors, 5 warnings"; empty string when clean. */
export function detectedLine(counts: Record<Severity, number>) {
  const parts = [
    counts.error && plural(counts.error, 'error'),
    counts.warn && plural(counts.warn, 'warning'),
    counts.info && plural(counts.info, 'note'),
  ].filter(Boolean)
  return parts.length ? `Maquest detected ${parts.join(', ')}.` : ''
}
