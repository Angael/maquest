import path from 'node:path'
import fs from 'node:fs'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  Clock,
  EDGE_DESCRIPTIONS,
  EDGE_LABEL_MAX,
  SUMMARY_MAX,
  REFERENCE_EDGE_TYPES,
  clueCounts,
  onBoard,
  entityOf,
  refsOf,
  phaseIndex,
  slugify,
  overlapWarnings,
  sparseGroups,
  textMatches,
  GroupColor,
  type Board,
  EDGE_TYPES,
  TypeDef,
  EdgeType,
  EdgeHandle,
  GuidelineScope,
  STYLE_GUIDELINE_ID,
  NodeType,
  NODE_TYPES,
  Project,
  ProjectKind,
  LIVE_NOTES_FILE,
  Status,
  type OutlineNode,
  type StoryNode,
  READ_BUDGET,
  LiveNotesChangedError,
  applyGroupTree,
  bodyHeadings,
  clipLines,
  connectNodes,
  packByBudget,
  sliceBody,
  writeNodes,
  type BatchResult,
  type Outcome,
  type CheckReport,
  type Issue,
  RULES,
  WIDGETS,
  detectedLine,
  fieldSummary,
  itemFields,
  recordsText,
  extraRows,
  isEmptyValue,
  isRequired,
  type FieldDef,
  type TypeInfo,
} from '@maquest/core'
import { MapDefaults, MapOp, OBJECT_KINDS, TEXTURES, mapSummary, mapSvg } from '@maquest/core/map'

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const explicitRoot = arg('project') ?? process.env.MAQUEST_PROJECT
const startDir = explicitRoot ?? process.cwd()

function project(): Project {
  const root = explicitRoot ? path.resolve(explicitRoot) : Project.find(startDir)
  if (!root || !Project.isProject(root)) {
    throw new Error(`No Maquest project found at ${startDir}. Use the "project" tool with action "init" to create one.`)
  }
  return new Project(root)
}

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] })

/**
 * The live notes as last delivered to this agent inside a tool result. Only content that actually went out in a
 * response counts as seen: running a handler, or building a notice that is then discarded, does not.
 */
let seenLiveNotes = ''

/** The author's live notes when they changed since this agent last saw them, as a priority notice. */
function liveNotesNotice(): { notice: string; notes?: string } {
  let notes: string
  try {
    notes = project().liveNotes().trim()
  } catch {
    return { notice: '' }
  }
  if (notes === seenLiveNotes) return { notice: '' }
  if (!notes) return { notice: '', notes }
  return {
    notes,
    notice: `IMPORTANT: the author updated their live notes (${LIVE_NOTES_FILE}, written mid-session in the Maquest app). Deal with them before continuing. For each item, first check whether the project already reflects it (it may have been handled earlier). Fold unhandled items into the project (write/connect, backlog for loose ideas), and ask the author about anything unclear or that you decide not to do. Once every item is handled, clear the notes with delete({ liveNotes: true }); if some are still open, leave them and raise them with the author. Say what you did.\n<live-notes>\n${notes}\n</live-notes>\n\n`,
  }
}

/** Wraps a handler so errors come back to the agent as readable tool errors. */
function safe<A>(fn: (a: A) => string | Promise<string>) {
  return async (a: A) => {
    try {
      const out = await fn(a)
      const { notice, notes } = liveNotesNotice()
      // Marked seen only here, as the notice goes out together with the result.
      if (notes !== undefined) seenLiveNotes = notes
      return text(notice + out)
    } catch (e) {
      return { ...text(`Error: ${(e as Error).message}`), isError: true }
    }
  }
}

/** Item numbers as compact ranges: "#3", "#5–#9". */
function itemRanges(indexes: number[]) {
  const out: string[] = []
  for (let k = 0; k < indexes.length; k++) {
    let j = k
    while (j + 1 < indexes.length && indexes[j + 1] === indexes[j] + 1) j++
    out.push(j > k ? `#${indexes[k] + 1}–#${indexes[j] + 1}` : `#${indexes[k] + 1}`)
    k = j
  }
  return out.join(', ')
}

/**
 * Batch results: one line per applied item when all went through; otherwise an error that says, item by item,
 * what was saved, what failed and what did not run, so a retry resends only what is needed.
 */
function batchText<R>(r: BatchResult<R>, ok: (result: R) => string, noun = 'item'): string {
  const failed = r.outcomes.filter((o) => o.status === 'failed')
  const line = (o: Outcome<R>) =>
    o.status === 'applied' ? `#${o.index + 1} ${ok(o.result)}` : o.status === 'failed' ? `#${o.index + 1} failed: ${o.error}` : ''
  if (!failed.length) return r.outcomes.map(line).join('\n')
  const notRun = r.outcomes.filter((o) => o.status === 'not-run').map((o) => o.index)
  if (r.rejected) {
    throw new Error(
      [
        `Nothing was written: ${failed.length} of ${r.outcomes.length} ${noun}s failed validation (checked against the earlier ${noun}s of this batch). Fix them and resend the whole batch.`,
        ...failed.map(line),
        notRun.length ? `Not run (valid): ${itemRanges(notRun)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }
  const applied = r.outcomes.filter((o) => o.status === 'applied')
  throw new Error(
    [
      `Batch stopped at ${noun} #${failed[0].index + 1}: ${applied.length} applied and saved, 1 failed, ${notRun.length} not run. Do not resend the applied ${noun}s; resend only the failed and not-run ones.`,
      ...r.outcomes.filter((o) => o.status !== 'not-run').map(line),
      notRun.length ? `Not run: ${itemRanges(notRun)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

const line = (n: StoryNode) => `- ${n.id} [${n.type}${n.status ? `, ${n.status}` : ''}] ${n.title}${n.summary ? ` — ${n.summary}` : ''}`

const section = (title: string, nodes: StoryNode[]) => (nodes.length ? `## ${title}\n${nodes.map(line).join('\n')}` : '')
const guidelineText = (g: { id: string; title: string; scope: string; source: string; disabled?: boolean; body: string }) =>
  `## ${g.title} (${g.id}; ${g.scope}; ${g.source}${g.disabled ? '; disabled' : ''})\n${g.body}`

/** Appended to scene reads and prose writes so the author's voice is in view while writing. */
function styleReminder(p: Project) {
  const g = p.guidelines({ applicableOnly: true }).find((x) => x.id === STYLE_GUIDELINE_ID)
  if (!g) return ''
  return g.source === 'default'
    ? `\n\n---\nThe "${STYLE_GUIDELINE_ID}" guideline is not filled in yet. Fill it from the author's own pages (guidelines write) before writing prose.`
    : `\n\n---\n## Style reminder (${STYLE_GUIDELINE_ID})\n${g.body}`
}

/** Words in a node and everything under it. */
const totalWords = (n: OutlineNode): number => n.words + n.children.reduce((sum, c) => sum + totalWords(c), 0)

function outlineText(nodes: OutlineNode[], depth = 0): string {
  return nodes
    .map((n) => {
      const words = totalWords(n)
      const head = `${'  '.repeat(depth)}- ${n.id} [${n.type}${n.status ? `, ${n.status}` : ''}${words ? `, ${words.toLocaleString('en')} words` : ''}] ${n.title}${n.summary ? ` — ${n.summary}` : ''}`
      return n.children.length ? `${head}\n${outlineText(n.children, depth + 1)}` : head
    })
    .join('\n')
}

function nodeText(p: Project, n: StoryNode, body?: { heading: string; text: string }): string {
  const titles = new Map(p.listNodes().map((x) => [x.id, x.title]))
  const edges = p.edgesOf(n.id).map((e) => {
    const out = e.source === n.id
    const other = out ? e.target : e.source
    return `- (${e.id}) ${out ? '→' : '←'} ${e.type}${e.label ? ` "${e.label}"` : ''} ${other} (${titles.get(other) ?? '?'})${e.sourceHandle || e.targetHandle ? ` [handles: ${e.sourceHandle ?? 'auto'} → ${e.targetHandle ?? 'auto'}]` : ''}`
  })
  const children = p.children(n.id).map(line)
  const meta = [
    `id: ${n.id}`,
    `type: ${n.type}`,
    n.parent && `parent: ${n.parent} (${titles.get(n.parent) ?? '?'})`,
    n.order !== undefined && `order: ${n.order}`,
    n.status && `status: ${n.status}`,
    n.pinned !== undefined && `pinned: ${n.pinned}`,
    n.summary && `summary: ${n.summary}`,
    n.tags.length && `tags: ${n.tags.join(', ')}`,
    n.media.length && `media: ${n.media.join(', ')}`,
    n.src && `src: ${n.src}`,
    n.clock &&
      `clock: ${n.clock.filled}/${n.clock.size}${n.clock.steps.some(Boolean) ? ` — ${n.clock.steps.map((s, i) => `${i + 1}${i < n.clock!.filled ? '✓' : ''}: ${s || '?'}`).join('; ')}` : ''}`,
    boardsText(p, n.id) && `boards: ${boardsText(p, n.id)}`,
    ...fieldsText(
      p.types().find((t) => t.id === n.type),
      n,
    ),
    n.checks?.off.length && `checks off: ${n.checks.off.join(', ')}`,
  ].filter(Boolean)
  return [
    `# ${n.title}`,
    meta.join('\n'),
    edges.length ? `## Connections\n${edges.join('\n')}` : '',
    children.length ? `## Children\n${children.join('\n')}` : '',
    body ? `## ${body.heading}\n${body.text}` : `## Body\n${n.body.trim() || '(empty)'}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** A node's fields, one line each: the type's fields in order (required empty ones flagged), then free-form keys. */
function fieldsText(type: TypeInfo | undefined, n: StoryNode): string[] {
  const defined = (type?.fields ?? []).flatMap((def) => {
    const v = n.fields[def.key]
    if (isEmptyValue(v)) return isRequired(def, n.fields) ? [`${def.key}: (missing, required)`] : []
    if (def.widget === 'records') return [`${def.key}: ${Array.isArray(v) ? v.length : 0} records\n${recordsText(def, v).replaceAll(/^## /gm, '### ')}`]
    return [`${def.key}: ${fieldSummary(def, v)}`]
  })
  const free = extraRows(type ?? { fields: [] }, n.fields).map(
    (r) => `${r.def.key}: ${typeof r.value === 'string' ? r.value || '(empty)' : JSON.stringify(r.value)}`,
  )
  return [...defined, ...free]
}

function boardsText(p: Project, id: string) {
  return p
    .boards()
    .filter((b) => onBoard(b, id))
    .map((b) => {
      const at = b.layout[id]
      const i = at ? phaseIndex(b, at.x) : -1
      return `${b.id}${i >= 0 ? ` (phase ${b.phases[i].title})` : ''}`
    })
    .join(', ')
}

function boardSummary(b: Board) {
  return `- ${b.id}: ${b.title} (${b.nodes?.length ?? 0} cards)${b.phases.length ? ` — phases: ${b.phases.map((x) => x.title).join(' → ')}` : ''}`
}

/** Group tree with member titles, e.g. "- g-1a2b3c: Tavern (2 cards: Bartender, Cellar)". */
function groupsText(b: Board, titles: Map<string, { title: string }>) {
  const walk = (parent: string | undefined, depth: number): string[] =>
    b.groups
      .filter((g) => g.parent === parent)
      .flatMap((g) => [
        `${'  '.repeat(depth)}- ${g.id}: ${g.title} [${Math.round(g.width)}×${Math.round(g.height)} at ${Math.round(g.x)},${Math.round(g.y)}] (${g.nodes.length} cards${g.nodes.length ? `: ${g.nodes.map((n) => titles.get(entityOf(n))?.title ?? n).join(', ')}` : ''})`,
        ...walk(g.id, depth + 1),
      ])
  return b.groups.length ? [`## Groups\n${walk(undefined, 0).join('\n')}`, layoutHints(b)].filter(Boolean).join('\n') : ''
}

/** Layout problems worth fixing, with the fix; empty when the board looks tidy. */
function layoutHints(b: Board) {
  const problems = [...overlapWarnings(b), ...sparseGroups(b).map((g) => `group "${g.title}" is mostly empty space`)]
  if (!problems.length) return ''
  const shown = problems.slice(0, 5).join('; ') + (problems.length > 5 ? `; +${problems.length - 5} more` : '')
  return `Layout issues: ${shown}. Run board action "layout" to tidy.`
}

const hints = (p: Project, board: string) => {
  const h = layoutHints(p.board(board))
  return h ? `\n${h}` : ''
}

function boardText(p: Project, b: Board) {
  const titles = new Map(p.listNodes().map((n) => [n.id, n]))
  const ids = b.nodes ?? []
  const entry = (id: string) => {
    const n = titles.get(entityOf(id))
    return n ? line(n) : `- ${id} (missing)`
  }
  const groups = groupsText(b, titles)
  if (!b.phases.length) return [`${boardSummary(b)}\n${ids.map(entry).join('\n')}`, groups].filter(Boolean).join('\n\n')
  const columns = b.phases.map((ph) => ({ title: ph.title, ids: [] as string[] }))
  const loose: string[] = []
  for (const id of ids) {
    const at = b.layout[id]
    const i = at ? phaseIndex(b, at.x) : -1
    if (i >= 0) columns[i].ids.push(id)
    else loose.push(id)
  }
  return [
    boardSummary(b),
    ...columns.map((g, i) => `## ${i + 1}. ${g.title}\n${g.ids.map(entry).join('\n') || '(empty)'}`),
    loose.length ? `## Outside phases\n${loose.map(entry).join('\n')}` : '',
    groups,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** A field as agents need it: key, widget and its settings, e.g. `hp* [meter, max 40] "HP"`. */
function fieldText(f: FieldDef): string {
  const settings = [
    f.widget,
    f.style,
    f.options && `one of ${f.options.join('|')}`,
    f.keys && `keys ${f.keys.join(',')}`,
    f.min !== undefined && `min ${f.min}`,
    f.max !== undefined && `max ${f.max}`,
    f.modifier && `modifier (v-${f.modifier.base})/${f.modifier.step}`,
    f.widget === 'records' && `item { ${itemFields(f).fields.map(fieldText).join('; ')} }`,
    f.groupBy && `grouped by ${f.groupBy}`,
    f.hint && `e.g. ${f.hint}`,
  ].filter(Boolean)
  return `${f.key}${f.required ? '*' : ''} [${settings.join(', ')}]${f.label ? ` "${f.label}"` : ''}`
}

/** Each type's sheet: its fields (what agents write under fields) and tabs. */
function sheetsText(p: Project) {
  const lines = p
    .types()
    .filter((t) => t.fields.length || t.tabs.length)
    .map((t) => {
      const tabs = t.tabs.map((x) =>
        x.kind === 'fields'
          ? `${x.title} (fields${x.fields || x.sections ? `: ${[...(x.fields ?? []), ...(x.sections ?? []).flatMap((s) => s.fields)].join(', ')}` : ''})`
          : x.title,
      )
      return [`- ${t.id}${t.fields.length ? `: ${t.fields.map(fieldText).join('; ')}` : ''}`, tabs.length ? `  tabs: ${tabs.join(', ')}` : '']
        .filter(Boolean)
        .join('\n')
    })
  return lines.length ? ['## Sheets (write fields: { key: value }; maps merge one level, null removes; * = required)', ...lines].join('\n') : ''
}

/** A checks report for agents: counts first, then issues grouped by rule with the rule's fix once. */
function checksText(report: CheckReport, opts: { ids?: string[]; rules?: string[]; notes?: boolean }) {
  const ids = opts.ids && new Set(opts.ids)
  const rules = opts.rules && new Set(opts.rules)
  const issues = report.issues.filter((i) => (!ids || (i.node && ids.has(i.node))) && (!rules || rules.has(i.rule)))
  const counts = { error: 0, warn: 0, info: 0 }
  for (const i of issues) counts[i.severity]++
  const head = detectedLine(counts) || 'Maquest detected no problems.'
  const listed = issues.filter((i) => opts.notes || rules || i.severity !== 'info')
  const byRule = new Map<string, Issue[]>()
  for (const i of listed) byRule.set(i.rule, [...(byRule.get(i.rule) ?? []), i])
  const cap = rules ? 200 : 25
  const sections = [...byRule].map(([rule, list]) => {
    const meta = report.rules.find((r) => r.id === rule)
    const lines = list.slice(0, cap).map((i) => `- ${i.node ?? i.board ?? i.edge ?? 'project'}: ${i.message}${i.hint ? ` → ${i.hint}` : ''}`)
    const more = list.length > cap ? `\n- +${list.length - cap} more (overview({ checks: { rules: ["${rule}"] } }))` : ''
    return `## ${rule} (${list[0].severity}, ${list.length})${meta ? ` — ${meta.title}\nFix: ${meta.fix}` : ''}\n${lines.join('\n')}${more}`
  })
  const hiddenNotes = !opts.notes && !rules ? counts.info : 0
  return [
    head,
    ...sections,
    hiddenNotes ? `(${hiddenNotes} info-level note${hiddenNotes === 1 ? '' : 's'} not listed; pass checks: { notes: true }.)` : '',
    'Tell the author what Maquest detected and what you fixed. Rules and severities are configured with project({ checks }); a node opts out with write checks: { off: [rule] }.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Errors and warnings about the given nodes, appended to write results. */
function touchedIssues(p: Project, ids: string[]) {
  if (!ids.length) return ''
  const set = new Set(ids)
  const issues = p.check().issues.filter((i) => i.node && set.has(i.node) && i.severity !== 'info')
  if (!issues.length) return ''
  return `\nMaquest detected for these nodes (fix now or tell the author):\n${issues
    .slice(0, 30)
    .map((i) => `- ${i.node} [${i.rule}]: ${i.message}${i.hint ? ` → ${i.hint}` : ''}`)
    .join('\n')}${issues.length > 30 ? `\n- +${issues.length - 30} more (overview({ checks: { ids: [...] } }))` : ''}`
}

const server = new McpServer(
  { name: 'maquest', version: '0.1.0' },
  {
    instructions: `Maquest is a writing project: stories → chapters → scenes, plus entities (characters, locations, factions, items), free notes, a backlog of ideas, media, and a node graph of typed, labeled connections.
Workflow: call "overview" first. Read "guidelines" before creative work and follow them. Project overrides beat defaults. When the author corrects your writing or says what they like or dislike, save it to the "${STYLE_GUIDELINE_ID}" guideline right away.
Capture structure eagerly: turn what the author says into project changes right away (write/connect), then briefly report what changed. Put loose ideas in the backlog (type "idea"). Keep connections in sync (involves, located-at, foreshadows, leads-to...). Story prose is the author's: write or rewrite it only when asked; otherwise suggest.
Connection labels are short names for the relationship (max ${EDGE_LABEL_MAX} chars). Never put status or TODOs in labels; use the node's status, tags or body. Give every node a status (idea, draft, done) when you create it and update it as work progresses.
Boards are separate canvases (e.g. one per arc or investigation); each shows only the nodes placed on it.
Edits apply immediately to markdown files on disk, and the Maquest app updates live.
Maquest checks the project for problems (broken links, nodes on no board, empty groups, missing or malformed fields, copied card text, overlong documents…), configured per project. The checks are yours to tune with the project tool: set levels and scope of built-in rules (checks) and add project rules (customChecks: required fields, tags, tabs or text, forbidden text, allowed headings, word limits, optionally inside one tab). When the author settles a format rule, add a check for it instead of only writing it into a guideline. Write results list problems with the nodes you touched; after a round of changes run overview({ checks: true }) and fix what you caused. When telling the author, say "Maquest detected …" (never "the linter").
The author keeps quick live notes in the app during sessions. When they change, tool results start with an IMPORTANT live-notes notice: treat it as top priority. Notes in the overview are still pending: check whether the project already reflects them, clear them with delete({ liveNotes: true }) if so, otherwise act on them or bring them up with the author.`,
  },
)

server.registerTool(
  'overview',
  {
    title: 'Project overview',
    description:
      'Compact map of the whole project: config, story outline (stories > chapters > scenes), entities, notes, backlog, connection stats, guideline index. Start here.',
    inputSchema: {
      checks: z
        .union([
          z.boolean(),
          z.object({
            ids: z.array(z.string()).optional().describe('Only issues about these nodes'),
            rules: z.array(z.string()).optional().describe('Only these rules'),
            notes: z.boolean().optional().describe('Also list info-level notes (counted but not listed by default)'),
          }),
        ])
        .optional()
        .describe(
          'Return the Maquest checks report instead of the overview: errors and warnings (broken links, nodes on no board, missing required fields, copied card text…) with what to do. Run it after a round of changes.',
        ),
    },
    annotations: { readOnlyHint: true },
  },
  safe(({ checks }) => {
    const p = project()
    if (checks) return checksText(p.check(), checks === true ? {} : checks)
    const c = p.config()
    const all = p.listNodes()
    const edges = p.graph().edges
    const byType = (t: string) => all.filter((n) => n.type === t)
    const edgeStats = EDGE_TYPES.map((t) => [t, edges.filter((e) => e.type === t).length] as const)
      .filter(([, n]) => n)
      .map(([t, n]) => `${t}: ${n}`)
      .join(', ')
    return [
      `# ${c.name} (${c.kind})${c.description ? `\n${c.description}` : ''}`,
      (() => {
        const notes = p.liveNotes().trim()
        if (!notes || notes !== seenLiveNotes) return '' // A changed note is already shown as the notice above.
        return `## Live notes (from the author, ${LIVE_NOTES_FILE}; pending until cleared)\n${notes}`
      })(),
      `## Outline\n${outlineText(p.outline()) || '(no stories yet)'}`,
      (() => {
        const custom = p.types().filter((t) => !t.builtin)
        return custom.length
          ? `## Custom types\n${custom.map((t) => `- ${t.id}: ${t.label}${t.library ? ' [library: records with the same name link here]' : ''}`).join('\n')}`
          : ''
      })(),
      sheetsText(p),
      ...p
        .types()
        .filter((t) => t.entity)
        .map((t) => section(t.plural, byType(t.id))),
      section('Notes', byType('note')),
      section('Backlog', byType('idea')),
      section('Media nodes', byType('media')),
      section('Maps (edit with "map")', byType('map')),
      `## Connections\n${edges.length} total${edgeStats ? ` (${edgeStats})` : ''}`,
      `## Boards (read with "board")\n${p.boards().map(boardSummary).join('\n')}`,
      (() => {
        const clocks = all.filter((n) => n.clock)
        return clocks.length
          ? `## Clocks\n${clocks.map((n) => `- ${n.id}: ${n.title} ${n.clock!.filled}/${n.clock!.size}${n.clock!.steps[n.clock!.filled] ? ` — next: ${n.clock!.steps[n.clock!.filled]}` : ''}`).join('\n')}`
          : ''
      })(),
      (() => {
        const weak = [...clueCounts(edges)].filter(([, n]) => n < 3)
        const titles = new Map(all.map((n) => [n.id, n.title]))
        return weak.length
          ? `## Three-clue check\n${weak.map(([id, n]) => `- ${id} (${titles.get(id) ?? '?'}): ${n} clue${n === 1 ? '' : 's'}`).join('\n')}`
          : ''
      })(),
      (() => {
        const line = detectedLine(p.check().counts)
        return `## Maquest checks\n${line ? `${line} List them with overview({ checks: true }).` : 'No problems detected.'}`
      })(),
      `## Guidelines (read with "guidelines")\n${p
        .guidelines({ applicableOnly: true })
        .map((g) => `- ${g.id}: ${g.title}${g.source !== 'default' ? ` [${g.source}]` : ''}`)
        .join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n')
  }),
)

server.registerTool(
  'find',
  {
    title: 'Find nodes',
    description:
      'Search/list nodes. Returns one line per node (id, type, status, title, summary); with text, also the matching lines (title, summary, field or body line). All filters optional.',
    inputSchema: {
      type: z.array(NodeType).optional().describe('Node types to include'),
      parent: z.string().optional().describe('Only direct children of this node id'),
      tag: z.string().optional(),
      status: Status.optional(),
      text: z
        .union([z.string(), z.array(z.string()).min(1)])
        .optional()
        .describe('Case-insensitive full-text match on title/summary/body/fields. Several terms match any of them, e.g. to sweep for stale references.'),
    },
    annotations: { readOnlyHint: true },
  },
  safe((a) => {
    const nodes = project().listNodes(a)
    if (!nodes.length) return 'No matches.'
    const terms = a.text === undefined ? [] : ([] as string[]).concat(a.text)
    return nodes
      .map((n) => {
        const hits = terms.length ? textMatches(n, terms) : []
        return [line(n), ...hits.map((h) => `    ${h.where}: ${h.text}`)].join('\n')
      })
      .join('\n')
  }),
)

/** A node whose full text is over the read budget: everything but the body, plus how to read the body in parts. */
function oversizedText(p: Project, n: StoryNode, size: number, budget: number) {
  const headings = bodyHeadings(n.body)
  const lines = n.body.split('\n').length
  const shown = headings.slice(0, 150).map((h) => `- line ${h.line}: ${'#'.repeat(h.level)} ${h.title}`)
  return nodeText(p, n, {
    heading: 'Body (not shown: too large for one read)',
    text: [
      `The node is ${size.toLocaleString('en')} chars (body ${n.body.length.toLocaleString('en')} chars in ${lines} lines), over this read's budget of ${budget.toLocaleString('en')}.`,
      `Read part of the body with read({ ids: ["${n.id}"], section: "<heading>" }) or read({ ids: ["${n.id}"], lines: { from: 1, to: 200 } }), or read the file directly (read-only; write changes with "write"): ${p.resolve(n.path)}`,
      headings.length
        ? `Headings:\n${shown.join('\n')}${headings.length > shown.length ? `\n- +${headings.length - shown.length} more` : ''}`
        : 'The body has no headings; read it by lines.',
    ].join('\n'),
  })
}

server.registerTool(
  'read',
  {
    title: 'Read nodes',
    description: `Full content of nodes: metadata, fields, connections (with edge ids), children and markdown body. Reading scenes also returns the author's style guideline. Output stays within maxChars (default ${READ_BUDGET.toLocaleString('en')}): whole nodes only; nodes that don't fit are listed at the end to read in another call; a node too large on its own comes back with a heading outline so you can read one section or a line range of its body. Unknown ids are reported with suggestions; the other nodes are still returned.`,
    inputSchema: {
      ids: z.array(z.string()).min(1),
      maxChars: z.number().int().min(2000).optional().describe(`Output budget in characters (default ${READ_BUDGET})`),
      section: z.string().optional().describe('With one id: only this body section (heading title; up to the next heading of the same or a higher level)'),
      lines: z
        .object({ from: z.number().int().min(1), to: z.number().int().min(1).optional() })
        .optional()
        .describe('With one id: only these body lines (1-based, inclusive; combines with section)'),
    },
    annotations: { readOnlyHint: true },
  },
  safe(({ ids, maxChars, section, lines }) => {
    const p = project()
    const budget = maxChars ?? READ_BUDGET
    const found: StoryNode[] = []
    const missing: string[] = []
    for (const id of new Set(ids)) {
      const n = p.getNode(id)
      if (n) found.push(n)
      else missing.push(p.nodeNotFound(id).message)
    }
    if (!found.length) throw new Error(missing.join('\n'))
    const notFound = missing.length ? `\n\n---\n${missing.join('\n')}` : ''
    const reminder = found.some((n) => n.type === 'scene') ? styleReminder(p) : ''

    if (section !== undefined || lines) {
      if (ids.length !== 1) throw new Error('section and lines read part of one node: pass exactly one id')
      const n = found[0]
      const part = sliceBody(n.body, { section, from: lines?.from, to: lines?.to })
      const frame = nodeText(p, n, { heading: '', text: '' }).length + 200
      const clip = clipLines(part.text, Math.max(500, budget - frame))
      const last = part.from + clip.lines - 1
      const more = clip.clipped
        ? `\n\n(Cut at line ${last} to stay within ${budget} chars; continue with lines: { from: ${last + 1}${lines?.to || section ? `, to: ${part.to}` : ''} }.)`
        : ''
      return nodeText(p, n, { heading: `Body (lines ${part.from}–${last} of ${part.total})`, text: clip.text + more }) + notFound + reminder
    }

    const parts = found.map((n) => {
      const full = nodeText(p, n)
      return { n, text: full.length > budget ? oversizedText(p, n, full.length, budget) : full, size: full.length }
    })
    const SEP = '\n\n---\n\n'
    const { included, omitted } = packByBudget(parts, budget, SEP.length)
    const out = included.map((x) => x.text).join(SEP)
    const left = omitted.length
      ? `\n\n---\nNot returned, to stay within ${budget.toLocaleString('en')} chars (read them in another call): ${omitted.map((x) => `${x.n.id} (${x.size.toLocaleString('en')} chars${x.size > budget ? ', too large on its own: a read of it alone returns its outline' : ''})`).join(', ')}`
      : ''
    return (out || '(nothing fit in the budget)') + left + notFound + reminder
  }),
)

const WriteItem = z.object({
  id: z
    .string()
    .optional()
    .describe('Existing node id to update. With create: true, the id of the new node. Omit to create a node with an id made from its title.'),
  create: z
    .boolean()
    .optional()
    .describe('Create a new node with the given id (fails if that id exists). Without it, id always means an existing node, never a new one.'),
  newId: z.string().optional().describe('On update: rename the node id. Children, connections, board cards and [[links]] in other nodes follow.'),
  type: NodeType.optional().describe(
    `Required when creating: ${NODE_TYPES.join(', ')} or a custom type listed in overview. Changing it on update converts the node.`,
  ),
  title: z.string().optional().describe('Required when creating. A short complete phrase; never cut off with "…"'),
  parent: z.string().nullable().optional().describe('chapter→story, scene→chapter, note→story/chapter/scene. null detaches.'),
  order: z.number().optional().describe('Position among siblings'),
  status: Status.nullable().optional(),
  summary: z
    .string()
    .optional()
    .describe(
      `One sentence, under ${SUMMARY_MAX} chars, no prefixes like "Author's note:" (scenes: "X tries to Y, but Z, so W"). Put full wording and quotes in body.`,
    ),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional().describe('Keep this node fixed during automatic canvas layout'),
  fields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'The node\'s data by key: text, numbers, lists or maps, in the format of the type\'s field widgets (overview lists them), e.g. { role: "smuggler", hp: { value: 12, max: 20 }, scores: { str: 9, dex: 14 }, allies: ["mira"] }. Merged into the existing fields, maps one level deep; null removes. Keep numbers and structured data here, not in the body. Values are read at a glance: tiles and chips take a few words, lists a few dozen items, numbers at most 2 decimals; Maquest reports oversized ones (field-oversized).',
    ),
  body: z.string().optional().describe('Markdown body (replaces the existing body)'),
  bodyFile: z
    .string()
    .optional()
    .describe(
      'Instead of body, for long prose: path of a UTF-8 markdown file on the machine running Maquest (absolute, or relative to the project root) whose content replaces the body. Only read, never changed or deleted; no frontmatter.',
    ),
  appendBody: z.string().optional().describe('Markdown appended to the body'),
  edits: z
    .array(
      z.object({
        find: z.string().min(1).describe('Exact text in the body'),
        replace: z.string(),
        all: z.boolean().optional().describe('Replace every occurrence; otherwise find must occur exactly once'),
      }),
    )
    .optional()
    .describe('Targeted find-and-replace in the body. Prefer this over resending the whole body for small changes.'),
  media: z.array(z.string()).optional().describe('Attached media paths (media/...)'),
  src: z.string().optional().describe('For media nodes: media path shown on the canvas'),
  board: z.string().optional().describe('When creating: board to place the node on (default: the first board)'),
  boards: z.array(z.string()).optional().describe('Also place the node on these boards (create or update)'),
  clock: Clock.nullable()
    .optional()
    .describe('Progress clock for fronts/threats/countdowns: {size, filled, steps[] (what happens at each segment)}. null removes it.'),
  checks: z
    .object({ off: z.array(z.string()) })
    .nullable()
    .optional()
    .describe('Maquest checks to skip for this node, e.g. { off: ["field-missing"] } for a bystander that needs no stats. null clears.'),
})

server.registerTool(
  'write',
  {
    title: 'Create or update nodes',
    description: `Batch create/update nodes. Types: story, chapter, scene, note, character, location, faction, item, idea (backlog), media, map (a battle map / floor plan; draw it with the map tool). New nodes get starter templates (fields like want/need/flaw for characters, goal/conflict/outcome for scenes). Markdown bodies may embed media: ![alt](media/file.png). Links to other nodes: [[node-id]].
Entity sheets: each H1 heading (# Title) of a body is a tab in the app; keep one topic per tab (e.g. # Backstory, # Notes) and put numbers and structured data in fields, not in the body. Lists of things with the same shape (abilities, spells, moves, inventory) go in a records field as [{ name, text, …item keys }]; a records field is written whole. Reference text shared by several sheets belongs in one node of a library type (overview marks them); a record named like a library node, or "[[id]]", shows that node's text, so records only add local changes.
Results list what Maquest detected about the written nodes (broken links, missing required fields…): fix those or tell the author. The whole batch is checked first, in order, so items may use ids created or renamed earlier in it; if any item fails the check, nothing is written. Results are per item (#n): when a batch stops part-way, it says which items were saved, which failed and which did not run.`,
    inputSchema: { nodes: z.array(WriteItem).min(1) },
  },
  safe(({ nodes }) => {
    const p = project()
    const r = writeNodes(p, nodes)
    const out = batchText(r, (w) =>
      w.action === 'created'
        ? `created ${w.node.id} (${w.node.type}) ${w.node.title} on ${w.boards.join(', ')}`
        : `updated ${w.node.id}${w.renamedFrom ? ` (renamed from ${w.renamedFrom})` : ''} (${w.node.type}) ${w.node.title}${w.boards.length ? ` on ${w.boards.join(', ')}` : ''}`,
    )
    const prose = r.outcomes.some((o) => o.status === 'applied' && o.result.wroteBody && o.result.node.type === 'scene')
    const touched = r.outcomes.flatMap((o) => (o.status === 'applied' ? [o.result.node.id] : []))
    return out + touchedIssues(p, touched) + (prose ? styleReminder(p) : '')
  }),
)

server.registerTool(
  'delete',
  {
    title: 'Delete nodes',
    description:
      "Delete nodes and their connections. Children are detached unless recursive=true. Reports nodes whose bodies still link to a deleted node. Prefer moving unwanted author content into the backlog over deleting it. liveNotes=true clears the author's live notes once every item in them is handled.",
    inputSchema: {
      ids: z.array(z.string()).optional(),
      liveNotes: z
        .boolean()
        .optional()
        .describe('Clear the live notes (only after all items are done or confirmed with the author). Refused if the notes changed since you last saw them.'),
      recursive: z.boolean().optional(),
      replaceWith: z
        .string()
        .optional()
        .describe('Node id that takes over the connections, board cards and [[links]] of the deleted nodes (e.g. after merging or replacing a character)'),
    },
    annotations: { destructiveHint: true },
  },
  safe(({ ids = [], liveNotes, recursive, replaceWith }) => {
    const p = project()
    if (!ids.length && !liveNotes) throw new Error('Pass ids and/or liveNotes=true')
    if (liveNotes) {
      // Checked before any node is deleted, so a rejected call changes nothing.
      try {
        p.clearLiveNotes(seenLiveNotes)
        seenLiveNotes = ''
      } catch (e) {
        if (!(e instanceof LiveNotesChangedError)) throw e
        // The notes go out in this error, so from here on they count as seen.
        seenLiveNotes = e.current
        throw new Error(
          `${e.message} The author added or changed notes after you last saw them; ${ids.length ? 'no nodes were deleted either. ' : ''}Handle the current notes below, then call delete({ liveNotes: true }) again.\n<live-notes>\n${e.current}\n</live-notes>`,
        )
      }
    }
    if (!ids.length) return 'live notes cleared'
    const deleted: string[] = []
    // Ids already removed as descendants of an earlier recursive delete are skipped.
    for (const id of ids) if (!deleted.includes(id)) deleted.push(...p.deleteNode(id, { recursive, replaceWith }))
    const dangling = deleted.flatMap((id) => {
      const from = p.linksTo(id)
      return from.length ? [`- [[${id}]] still linked from: ${from.map((n) => n.id).join(', ')}`] : []
    })
    return [
      liveNotes ? 'live notes cleared' : '',
      `deleted: ${deleted.join(', ')}`,
      dangling.length ? `Dangling links (edit them or delete with replaceWith):\n${dangling.join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }),
)

server.registerTool(
  'connect',
  {
    title: 'Manage connections',
    description: `Add, update or remove graph connections between nodes. All ops are checked before any is applied; results are per op (#n). Edge types:\n${EDGE_TYPES.map((t) => `- ${t}: ${EDGE_DESCRIPTIONS[t]}`).join('\n')}\nLabels name the connection in a few words (e.g. "betrays", "rivals since childhood"; max ${EDGE_LABEL_MAX} chars). Don't put status, TODOs or notes in labels. ${REFERENCE_EDGE_TYPES.join('/')} are shown as chips on the source card, so point them from the scene/idea/character to the entity.`,
    inputSchema: {
      ops: z
        .array(
          z.object({
            action: z.enum(['add', 'update', 'remove']),
            id: z.string().optional().describe('Edge id (update/remove)'),
            source: z.string().optional(),
            target: z.string().optional(),
            type: EdgeType.optional(),
            label: z.string().optional(),
            sourceHandle: EdgeHandle.optional(),
            targetHandle: EdgeHandle.optional(),
          }),
        )
        .min(1),
    },
  },
  safe(({ ops }) =>
    batchText(
      connectNodes(project(), ops),
      ({ action, edge: e }) =>
        action === 'removed'
          ? `removed edge ${e.id}`
          : `${action === 'updated' ? 'updated edge' : 'edge'} ${e.id}: ${e.source} -${e.type}${e.label ? ` "${e.label}"` : ''}-> ${e.target}`,
      'op',
    ),
  ),
)

server.registerTool(
  'board',
  {
    title: 'Boards (canvases)',
    description:
      "Boards are separate canvases over the same nodes. Each board shows only the nodes placed on it; none is special, and removing a node from a board keeps it in the project. A board may have phase columns (acts, left to right) — a node's phase is the column it sits in. Groups are bordered areas on a board (rooms, cities, chapters), may nest, and always contain their cards. Actions: list, read (nodes by phase, plus groups with size and position), create (title, phases?, nodes?), update (title?, phases? as ordered titles, removeNodes?), place (nodes onto the board, optionally into a phase or group), group (create a group: title, nodes?, parent?, color?; or edit one given group: title?, nodes? to add, removeNodes?, parent?, color?; or build a whole nested tree at once with groups, then lay out the board), ungroup (remove the group frame, keep its cards), layout (auto-arrange the whole board: groups pack their content, shrink to fit and never overlap; pinned cards stay; mode?), delete. Maquest positions cards itself: to organize a board, prefer one group call with the whole groups tree (it runs layout after) over many small edits; after restructuring groups by hand, run layout.",
    inputSchema: {
      action: z.enum(['list', 'read', 'create', 'update', 'place', 'group', 'ungroup', 'layout', 'delete']),
      id: z.string().optional().describe('Board id (default: the first board)'),
      title: z.string().optional(),
      phases: z.array(z.string()).optional().describe('Phase titles in order; replaces the columns'),
      nodes: z.array(z.string()).optional().describe('Node ids (create, place)'),
      phase: z.string().optional().describe('Phase title or id to place the nodes in'),
      removeNodes: z.array(z.string()).optional(),
      group: z.string().optional().describe('Group id or title (place, group, ungroup)'),
      parent: z.string().nullable().optional().describe('Parent group id to nest in; null = top level (group)'),
      color: GroupColor.optional(),
      groups: z
        .array(
          z.object({
            title: z.string(),
            nodes: z.array(z.string()).optional().describe('Cards in this group (placed on the board if needed)'),
            parent: z
              .string()
              .nullable()
              .optional()
              .describe(
                'Title of another group in this list, or an existing group id/title; null = top level. Omit: top level for new groups, unchanged for existing ones',
              ),
            color: GroupColor.optional(),
          }),
        )
        .min(1)
        .optional()
        .describe(
          'group: nested groups to build in one call. A title matching an existing group on the board extends that group; others are created. Checked first (nothing changes if any entry is wrong), then the board is laid out (mode).',
        ),
      mode: z
        .enum(['smart', 'grid', 'flow-right', 'flow-down', 'classic'])
        .optional()
        .describe('layout: smart (default; flow where linked, grid otherwise), grid, flow-right, flow-down, classic'),
    },
  },
  safe(async ({ action, id, title, phases, nodes, phase, removeNodes, group, parent, color, groups, mode }) => {
    const p = project()
    switch (action) {
      case 'list':
        return p.boards().map(boardSummary).join('\n')
      case 'read':
        return boardText(p, p.board(id))
      case 'create': {
        if (!title) throw new Error('create requires title')
        const b = p.createBoard({ title, phases, nodes })
        return `created board ${b.id}`
      }
      case 'update': {
        const cur = p.board(id)
        const next = phases?.map((t, i) => cur.phases.find((x) => x.title === t) ?? { id: `${slugify(t)}-${i + 1}`, title: t })
        const b = p.updateBoard(cur.id, { title, phases: next, removeNodes: removeNodes?.flatMap((n) => [n, ...refsOf(cur, n)]) })
        return `updated board ${b.id}`
      }
      case 'place': {
        if (!nodes?.length) throw new Error('place requires nodes')
        const b = p.updateBoard(p.board(id).id, { addNodes: nodes, phase })
        if (group) p.updateGroup(b.id, group, { addNodes: nodes })
        return `placed ${nodes.length} node(s) on ${b.id}${phase ? ` in ${phase}` : ''}${group ? ` in group ${group}` : ''}${hints(p, b.id)}`
      }
      case 'group': {
        const board = p.board(id).id
        if (groups) {
          if (group || title || nodes || removeNodes || parent !== undefined || color)
            throw new Error('groups builds a whole tree; pass the group details inside it')
          const r = await applyGroupTree(p, board, groups, mode ?? 'smart')
          return (
            batchText(
              r,
              (g) => `${g.action} group ${g.id}: ${g.title}${g.parent ? ` (in ${g.parent})` : ''}, ${g.nodes} card${g.nodes === 1 ? '' : 's'}`,
              'group',
            ) + (r.arranged ? `\narranged ${board} (${mode ?? 'smart'})${hints(p, board)}` : '')
          )
        }
        if (group) {
          const g = p.updateGroup(board, group, { title, color, parent, addNodes: nodes, removeNodes })
          return `updated group ${g.id}: ${g.title}${hints(p, board)}`
        }
        if (!title) throw new Error('group requires title (new group) or group (existing)')
        const g = p.createGroup(board, { title, color, parent: parent ?? undefined, nodes })
        return `created group ${g.id}: ${g.title}${hints(p, board)}`
      }
      case 'ungroup':
        if (!group) throw new Error('ungroup requires group')
        p.deleteGroup(p.board(id).id, group)
        return `removed group ${group}`
      case 'layout': {
        const b = p.board(id)
        await p.arrangeBoard(b.id, mode)
        return `arranged ${b.id} (${mode ?? 'smart'})${hints(p, b.id)}`
      }
      case 'delete':
        if (!id) throw new Error('delete requires id')
        p.deleteBoard(id)
        return `deleted board ${id}`
    }
  }),
)

server.registerTool(
  'guidelines',
  {
    title: 'Writing guidelines',
    description:
      'Built-in writing guidelines merged with per-project overrides. Actions: list (index), read (full text, all applicable if no id), write (override or add custom; stored in guidelines/<id>.md), reset (remove the override and restore the default), disable/enable.',
    inputSchema: {
      action: z.enum(['list', 'read', 'write', 'reset', 'disable', 'enable']),
      id: z.string().optional(),
      title: z.string().optional(),
      body: z.string().optional().describe('Full markdown body for write'),
      scope: GuidelineScope.optional().describe('Which project kinds it applies to'),
    },
  },
  safe(({ action, id, title, body, scope }) => {
    const p = project()
    switch (action) {
      case 'list':
        return p
          .guidelines({ includeDisabled: true })
          .map((g) => `- ${g.id}: ${g.title} [${g.scope}, ${g.source}${g.disabled ? ', disabled' : ''}]`)
          .join('\n')
      case 'read': {
        if (!id) {
          const all = p.guidelines({ applicableOnly: true })
          p.trackGuidelineUse(
            all.map((g) => g.id),
            'reads',
          )
          return all.map(guidelineText).join('\n\n')
        }
        const g = p.guideline(id)
        if (!g) throw new Error(`Unknown guideline: ${id}`)
        p.trackGuidelineUse([g.id], 'reads')
        const d = g.source === 'override' ? p.defaultGuideline(id) : null
        return guidelineText(g) + (d ? `\n\n### Built-in default (overridden)\n${d.body}` : '')
      }
      case 'write': {
        if (!id) throw new Error('write requires id')
        const saved = p.setGuideline(id, { title, body, scope })
        p.trackGuidelineUse([saved.id], 'writes')
        return `saved ${saved.id}`
      }
      case 'reset':
        if (!id) throw new Error('reset requires id')
        p.resetGuideline(id)
        return `reset ${id}`
      case 'disable':
      case 'enable':
        if (!id) throw new Error(`${action} requires id`)
        p.setGuideline(id, { disabled: action === 'disable' })
        return `${action}d ${id}`
    }
  }),
)

server.registerTool(
  'media',
  {
    title: 'Media',
    description:
      'Import an image/video file into the project (copied to media/) or list media. After importing, embed it in a body (![alt](media/x.png)), attach it via write.media, or show it on the canvas as a media node (write type=media, src=path).',
    inputSchema: {
      action: z.enum(['import', 'list']),
      path: z.string().optional().describe('Absolute path of the file to import'),
      name: z.string().optional(),
    },
  },
  safe(({ action, path: src, name }) => {
    const p = project()
    if (action === 'list') return p.listMedia().join('\n') || 'No media.'
    if (!src) throw new Error('import requires path')
    return `imported ${p.importMedia(src, name)}`
  }),
)

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' }

server.registerTool(
  'map',
  {
    title: 'Maps',
    description: `Battle maps / floor plans of map nodes (create one with write type=map). The document is maps/<id>.map.json; the app shows edits live.
Coordinates and lengths are grid cells: (0,0) is the top-left corner, cell (c,r) spans c..c+1, cell centers are at .5. x/y is an object's center (rect, ellipse, image, door, label, light) or the origin its path points are relative to. rotation in degrees, clockwise.
Object kinds (${OBJECT_KINDS.join(', ')}):
- room { shape, op: add|subtract|separate, light?: light|dim|dark, name? }: all visible rooms merge/cut in order into one floor whose outline becomes walls; separate keeps its own walls inside other rooms (room in a room); light overrides the map's ambient inside (lit tavern at night, dark cellar); name shows in its middle for the GM.
- area { shape, op, fill }: painted terrain under rooms; subtract erases paint below it.
- wall { shape, width?, color?, texture? (material: wood, stone, brick, rock…), fill? (closed walls only: a solid top seen from outside, e.g. a roof with texture shingles or thatch, a cliff with rock) }: free-standing wall, blocks sight. path { shape, stroke {color,width,dash?}, fill? }: roads, rivers, decoration.
- door { width (default 1), variant door|double|window|secret, open }: put it on a wall, rotation along the wall (0 = horizontal wall, 90 = vertical).
- image { src: media path, w, h, opacity? }, label { text, size, color }, light { bright, dim, color } (radii in cells).
Shapes: { type: rect, w, h, radius? } | { type: ellipse, rx, ry } | { type: path, points: [{ x, y, in?, out? }], closed } (in/out = bezier handles relative to the point).
Fill: { color?: #rrggbb, texture?: ${TEXTURES.join('|')} or a media path, scale? (cells per tile), opacity? }.
Layers: objects and tokens list layer ids (empty = always shown). Layers with the same group are exclusive: op show swaps them (e.g. "before" / "after" the battle).
Tokens: { name, x, y (cell centers), size, color, player (reveals fog), vision?, darkvision?, node? (character id) }.
Actions: read (summary; full=true lists every object), edit (ops in order, all or nothing), export (SVG file).`,
    inputSchema: {
      action: z.enum(['read', 'edit', 'export']),
      id: z.string().describe('Map node id'),
      full: z.boolean().optional().describe('read: list every object and token'),
      ops: z
        .array(MapOp)
        .optional()
        .describe(
          'edit: add {object}, update {id, set}, remove {ids}, order {id, to front|back|forward|backward}, layer {id?, name?, visible?, group?, objects?, removeObjects?}, show {layer}, token {id?, set}, grid {set: cols, rows, size (px per cell in exports), unit {amount, name}, diagonal equal|alternate|euclid, show}, style {set: background, floor, wall {color, width, texture}}, fog {enabled?, ambient light|dim|dark?, reset?}, bake {ids, mode union|subtract|intersect|exclude} (merge shapes into the first), join {ids} (two open paths into one, or close one)',
        ),
      path: z.string().optional().describe('export: output file (absolute or project-relative; default media/<id>.svg)'),
      fog: z.boolean().optional().describe('export: draw the fog of war as players see it'),
      grid: z.boolean().optional().describe('export: draw grid lines (default: the map setting)'),
      tokens: z.boolean().optional().describe('export: draw tokens (default true)'),
    },
  },
  safe(({ action, id, full, ops, path: out, fog, grid, tokens }) => {
    const p = project()
    if (action === 'read') return `${p.requireNode(id).title}\n${mapSummary(p.readMap(id), full)}`
    if (action === 'edit') {
      if (!ops?.length) throw new Error('edit needs ops')
      const r = p.editMap(id, ops)
      return `${r.results.join('\n')}\n${mapSummary(r.doc).split('\n').slice(0, 4).join('\n')}`
    }
    const doc = p.readMap(id)
    // Images are embedded so the file works anywhere.
    const href = (src: string) => {
      try {
        const ext = src.split('.').pop()!.toLowerCase()
        return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${fs.readFileSync(p.resolve(src)).toString('base64')}`
      } catch {
        return src
      }
    }
    const svg = mapSvg(doc, { imageHref: href, fog: fog ? 'player' : 'none', lighting: fog ? 'player' : 'none', grid, tokens })
    const target = out ? (path.isAbsolute(out) ? out : p.resolve(out)) : p.resolve(`media/${id}.svg`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, svg)
    return `exported ${path.relative(p.root, target).startsWith('..') ? target : path.relative(p.root, target)} (${Math.round(svg.length / 1024)} KB, ${doc.grid.cols * doc.grid.size}×${doc.grid.rows * doc.grid.size} px)`
  }),
)

server.registerTool(
  'project',
  {
    title: 'Project settings',
    description:
      'Update project settings (name, kind: novel|screenplay|rpg|mixed, description; kind selects which guidelines apply), add/edit node types (their fields, sheet tabs and libraries) and Maquest check rules, or init a new project in the current directory.',
    inputSchema: {
      action: z.enum(['update', 'init']),
      name: z.string().optional(),
      kind: ProjectKind.optional(),
      description: z.string().optional(),
      types: z
        .record(z.string(), TypeDef.partial().nullable())
        .optional()
        .describe(
          `Add or change node types by id; each setting given replaces the current one, null resets it. Settings: label, plural, color (#rrggbb), icon (lucide name), dir and body (custom types only), library (reference text that same-named records link to), extends (another type id to inherit fields, and tabs unless set), omit (inherited field keys to drop), fields, tabs.
fields: what the type's sheet holds, in order: a key (plain text) or { key, label?, widget, hint?, required?, requiredWhen? ({ otherKey: value or [values] }: required only then, e.g. a spell level when kind is "Spell"; in records it looks at the same record), icon? (lucide icon name shown with the label, e.g. "shield", "heart", "footprints"), badge? (chip on the canvas card), aliases? (other names checks map to the key), options? (allowed values), keys?/labels? (sub-keys or table columns and their labels), min?/max?, style?, modifier? ({ base, step }: scores show floor((v-base)/step)), signed?, color?, item?/titleKey?/textKey?/groupBy? (records) }. With extends, an entry with an inherited key changes just the settings it gives.
Widgets (${WIDGETS.join(', ')}): text "label: value" (options make a choice); subtitle (italic line under the title); quote; stat (big tile: 40 or { value, note }); toggle (true/false); meter (5, "5/9" or { value, max }; style bar|ring|dots|boxes|clock); scores ({ key: number }; style grid|bars|radar|dots); pairs (named values as chips, { Stealth: 6 }); tags; list; refs (node ids); table ([{ column: value }]); records (a searchable list of records, [{ name, text, … }]: item is the schema of one record, fields of any other widget, and checks report records that don't fit it or have other keys; name (titleKey) is required, text (textKey) is the markdown description, groupBy an item key whose options order the groups; style list|cards (tiles with the text on hover); toggles and meters in records set with a click).
tabs: the sheet in order. { title, kind: "fields", fields?: [keys] | sections?: [{ title?, fields: [keys] }] } shows fields with their widgets (with no list: every field no other fields tab lists); { title, kind: "prose", aliases? } is the body's # Title section as markdown. Fields in no tab show as properties under the title.
Example: {"character": {"fields": [{"key": "hp", "label": "HP", "widget": "meter", "required": true, "badge": true}, {"key": "social", "widget": "scores", "style": "radar", "keys": ["knowledge", "guts", "charm"], "max": 5}, {"key": "moves", "widget": "records", "groupBy": "kind", "item": [{"key": "kind", "options": ["Basic", "Special"], "required": true}, "cost", {"key": "uses", "widget": "meter", "style": "dots"}]}], "tabs": [{"title": "Stats", "kind": "fields", "fields": ["hp", "social"]}, {"title": "Moves", "kind": "fields", "fields": ["moves"]}, {"title": "Story"}]}, "spell": {"label": "Spell", "library": true}}. null as a type resets a built-in or removes an empty custom type.`,
        ),
      checks: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          `Configure Maquest check rules: { "<rule>": "error"|"warn"|"info"|"off" | [level, { options }] } (null resets). Rules: ${RULES.map((r) => `${r.id}${r.options?.length ? ` (${r.options.map((o) => o.key).join(', ')})` : ''}`).join(', ')}. Scope options: types, excludeTypes, excludeTags.`,
        ),
      maps: MapDefaults.nullable()
        .optional()
        .describe(
          'Defaults for new maps (null clears): { grid?: { cols, rows, size, unit {amount, name}, diagonal equal|alternate|euclid, show, color, opacity }, style?: { background, floor, wall {color, width, texture} }, fog?: { enabled, ambient } }. Set the system\'s units and diagonal rule once, e.g. { grid: { unit: { amount: 5, name: "ft" }, diagonal: "equal" } }.',
        ),
      customChecks: z
        .array(z.unknown())
        .optional()
        .describe(
          'Replace the project\'s own checks (the whole list): [{ id, message, hint?, severity?: error|warn|info, types?, tags?, excludeTags?, require?: { fields?, tags?, summary?, body?, media?, parent?, edges?: [edge types], tabs?, match?: "regex" }, tab?: "Tab" | ["Tab"], forbid?: "regex", headings?: ["regex"], maxWords? }]. tab limits match/forbid/headings/maxWords to those body tabs; headings lists the allowed ## headings there. Use them to turn the author\'s format rules into checks, e.g. { id: "abilities-only-rules", types: ["monster"], tab: "Abilities", headings: ["Traits", "Actions", "Reactions"], forbid: "\\\\*\\\\*(tactics|morale)" }.',
        ),
    },
  },
  safe(({ action, name, kind, description, types, checks, customChecks, maps }) => {
    if (action === 'init') {
      const root = path.resolve(startDir)
      const p = Project.init(root, {
        name: name ?? path.basename(root),
        kind,
        description,
        mcp: {
          command: process.execPath,
          args: [process.argv[1]],
          env: process.env.ELECTRON_RUN_AS_NODE ? { ELECTRON_RUN_AS_NODE: '1' } : undefined,
        },
      })
      return `initialized ${p.config().name} at ${p.root}`
    }
    const p = project()
    const all = types ? p.setTypes(types) : undefined
    if (checks || customChecks) p.setChecks(checks ?? {}, customChecks)
    const c =
      name || kind || description !== undefined || maps !== undefined
        ? p.updateConfig({ name, kind, ...(description !== undefined && { description }), ...(maps !== undefined && { maps: maps ?? undefined }) })
        : p.config()
    return [
      `project: ${c.name} (${c.kind})`,
      maps !== undefined && `map defaults: ${c.maps ? JSON.stringify(c.maps) : 'none'}`,
      all && `types: ${all.map((t) => `${t.id}${t.fields.length ? ` (${t.fields.length} fields)` : ''}`).join(', ')}`,
      (checks || customChecks) && detectedLine(p.check().counts),
    ]
      .filter(Boolean)
      .join('\n')
  }),
)

server.registerResource(
  'guideline',
  new ResourceTemplate('maquest://guidelines/{id}', {
    list: () => {
      try {
        return {
          resources: project()
            .guidelines()
            .map((g) => ({ uri: `maquest://guidelines/${g.id}`, name: g.title, mimeType: 'text/markdown' })),
        }
      } catch {
        return { resources: [] }
      }
    },
  }),
  { title: 'Writing guideline', mimeType: 'text/markdown' },
  (uri, { id }) => {
    const p = project()
    const g = p.guideline(String(id))
    if (g) p.trackGuidelineUse([g.id], 'reads')
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: g ? `# ${g.title}\n\n${g.body}` : 'Not found' }] }
  },
)

server.registerPrompt(
  'review',
  {
    title: 'Review against guidelines',
    description: 'Review a story/chapter/scene against the project guidelines.',
    argsSchema: { id: z.string().describe('Node id to review') },
  },
  ({ id }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Read node "${id}" and its children with the maquest tools, read all applicable guidelines, then review it: list concrete problems (structure, stakes, setup/payoff, consistency, pacing) with suggested fixes. Add backlog ideas for the fixes I approve.`,
        },
      },
    ],
  }),
)

server.registerPrompt(
  'brainstorm',
  {
    title: 'Brainstorm',
    description: 'Brainstorm ideas grounded in the current project.',
    argsSchema: { topic: z.string() },
  },
  ({ topic }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Call "overview", then brainstorm about: ${topic}. Give 3-5 distinct options consistent with established facts, recommend one, and save all options as backlog ideas.`,
        },
      },
    ],
  }),
)

await server.connect(new StdioServerTransport())
