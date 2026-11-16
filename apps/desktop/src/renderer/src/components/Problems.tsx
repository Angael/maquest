import { useMemo, useState } from 'react'
import { CircleAlert, CircleCheck, EyeOff, Info, MoreHorizontal, TriangleAlert, type LucideIcon } from 'lucide-react'
import { ALL_BOARD, onBoard, type Graph, type RuleLevel, type Severity, type StoryNode } from '@maquest/core/schema'
import type { CheckReport, Issue, QuickFix } from '@maquest/core'
import { api } from '../lib/api'
import { currentBoardId, queryClient, useAction, useChecks, useGraph, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { useTypes } from '../lib/styles'
import { Button, IconButton, Input, Menu, MenuItem, MenuLabel, MenuSeparator, Popover, Segmented, cn } from './ui'
import { GhostSelect } from './inspector/fields'
import { nodeLinkProps } from '../lib/nodeLink'

const SEVERITY: Record<Severity, { icon: LucideIcon; label: string; plural: string; className: string }> = {
  error: { icon: CircleAlert, label: 'Error', plural: 'Errors', className: 'text-danger' },
  warn: { icon: TriangleAlert, label: 'Warning', plural: 'Warnings', className: 'text-warning' },
  info: { icon: Info, label: 'Note', plural: 'Notes', className: 'text-fg-subtle' },
}
const LEVELS: { value: RuleLevel; label: string }[] = [
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warning' },
  { value: 'info', label: 'Note' },
  { value: 'off', label: 'Off' },
]
const CATEGORY: Record<CheckReport['rules'][number]['category'], string> = {
  integrity: 'Integrity',
  canvas: 'Canvas',
  content: 'Content',
  sheets: 'Sheets',
  rpg: 'Tabletop',
  custom: 'Project checks',
}
/** Issues shown per rule before "Show all". */
const PAGE = 12

type Rule = CheckReport['rules'][number]
type Filter = 'all' | Severity

const NO_NODES: StoryNode[] = []

/**
 * Title-bar entry for Maquest checks: counts at a glance, a dropdown of every issue (where it is, why, what to do,
 * quick fixes), and the rule settings. Rechecked shortly after any change on disk.
 */
export function ProblemsMenu() {
  const { data: report } = useChecks()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'issues' | 'rules'>('issues')
  if (!report) return null
  const { error, warn, info } = report.counts
  const label =
    error || warn ? `Maquest detected ${summary(report.counts)}` : `Maquest detected no problems${info ? ` (${info} note${info === 1 ? '' : 's'})` : ''}`
  const trigger = (
    <Button aria-label={label} title={label} className="gap-1.5 px-2 data-[popup-open]:bg-active data-[popup-open]:text-fg" data-problems>
      {!error && !warn && <CircleCheck size={16} aria-hidden className="text-fg-subtle" />}
      {error > 0 && (
        <span className="tabular flex items-center gap-1 text-danger">
          <CircleAlert size={15} aria-hidden />
          {error}
        </span>
      )}
      {warn > 0 && (
        <span className="tabular flex items-center gap-1 text-warning">
          <TriangleAlert size={15} aria-hidden />
          {warn}
        </span>
      )}
    </Button>
  )
  return (
    <Popover trigger={trigger} open={open} onOpenChange={setOpen} className="flex w-[460px] max-w-[calc(100vw-24px)] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-fg">Problems</h2>
          <p className="truncate text-xs text-fg-subtle">
            {error || warn || info ? `Maquest detected ${summary(report.counts)}.` : 'Maquest detected no problems.'}
          </p>
        </div>
        <Segmented
          label="Problems view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'issues', label: 'Issues' },
            { value: 'rules', label: 'Rules' },
          ]}
        />
      </div>
      {tab === 'issues' ? <IssueList report={report} close={() => setOpen(false)} /> : <RuleList report={report} />}
    </Popover>
  )
}

const summary = (c: Record<Severity, number>) =>
  [
    c.error && `${c.error} error${c.error === 1 ? '' : 's'}`,
    c.warn && `${c.warn} warning${c.warn === 1 ? '' : 's'}`,
    c.info && `${c.info} note${c.info === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(', ')

function IssueList({ report, close }: { report: CheckReport; close: () => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const shown = report.issues.filter((i) => filter === 'all' || i.severity === filter)
  const groups = useMemo(() => {
    const out = new Map<string, Issue[]>()
    for (const i of shown) out.set(i.rule, [...(out.get(i.rule) ?? []), i])
    return [...out]
  }, [shown])
  const options: { value: Filter; label: string }[] = [
    { value: 'all', label: `All ${report.issues.length}` },
    ...(['error', 'warn', 'info'] as const).filter((s) => report.counts[s]).map((s) => ({ value: s, label: `${SEVERITY[s].plural} ${report.counts[s]}` })),
  ]
  if (!report.issues.length)
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <CircleCheck size={22} className="text-success" aria-hidden />
        <p className="text-sm text-fg-muted">Everything checks out.</p>
        <p className="text-xs text-fg-subtle">Maquest rechecks the project whenever you or an agent change it.</p>
      </div>
    )
  return (
    <>
      {options.length > 2 && (
        <div className="px-3 pt-2">
          <Segmented label="Show" value={filter} onChange={setFilter} options={options} />
        </div>
      )}
      <div className="max-h-[min(64vh,560px)] overflow-y-auto overscroll-contain px-1.5 py-1.5" role="list" aria-label="Issues">
        {groups.map(([rule, issues]) => (
          <RuleGroup key={rule} rule={report.rules.find((r) => r.id === rule)} id={rule} issues={issues} close={close} />
        ))}
      </div>
    </>
  )
}

function RuleGroup({ rule, id, issues, close }: { rule?: Rule; id: string; issues: Issue[]; close: () => void }) {
  const [all, setAll] = useState(false)
  const setChecks = useAction(api.setChecks)
  const S = SEVERITY[issues[0].severity]
  const list = all ? issues : issues.slice(0, PAGE)
  return (
    <section className="py-1.5" aria-label={rule?.title ?? id}>
      <div className="flex items-center gap-1.5 px-1.5">
        <S.icon size={14} aria-hidden className={cn('shrink-0', S.className)} />
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
          {rule?.title ?? id} <span className="tabular font-normal text-fg-faint">{issues.length}</span>
        </h3>
        {rule && !rule.custom && (
          <Menu
            align="end"
            trigger={
              <Button size="sm" aria-label={`${rule.title} settings`} className="size-6 px-0 text-fg-faint hover:text-fg">
                <MoreHorizontal size={14} aria-hidden />
              </Button>
            }
          >
            <MenuLabel>Report as</MenuLabel>
            {LEVELS.filter((l) => l.value !== 'off').map((l) => (
              <MenuItem key={l.value} disabled={rule.setting === l.value} onClick={() => setChecks.mutate([{ [rule.id]: withLevel(rule, l.value) }])}>
                {l.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onClick={() => setChecks.mutate([{ [rule.id]: 'off' }])}>Turn off this check</MenuItem>
          </Menu>
        )}
      </div>
      {rule?.fix && <p className="mt-0.5 mb-1 px-1.5 pl-[26px] text-xs leading-4 text-fg-subtle">{rule.fix}</p>}
      <ul>
        {list.map((issue, k) => (
          <IssueRow key={`${k}:${issue.node ?? issue.board ?? issue.edge}:${issue.message}`} issue={issue} close={close} />
        ))}
      </ul>
      {issues.length > list.length && (
        <Button size="sm" className="ml-[20px] font-normal text-fg-subtle" onClick={() => setAll(true)}>
          Show all {issues.length}
        </Button>
      )}
    </section>
  )
}

const FIX_LABEL: Record<QuickFix['kind'], string> = {
  place: 'Add to board',
  'remove-edge': 'Remove connection',
  'remove-card': 'Remove card',
  'delete-group': 'Delete group',
  unlink: 'Remove link',
  'rename-fields': 'Move to field',
  arrange: 'Tidy board',
}

function IssueRow({ issue, close }: { issue: Issue; close: () => void }) {
  const { data: nodes = NO_NODES } = useNodes()
  const { data: graph } = useGraph()
  const types = useTypes()
  const fix = useAction(api.applyFix)
  const update = useAction(api.updateNode)
  const node = issue.node ? nodes.find((n) => n.id === issue.node) : undefined
  const board = issue.board ? graph?.boards.find((b) => b.id === issue.board) : undefined
  const T = node && types.of(node.type)
  const fixes = (issue.fixes ?? []).map((f) => withCurrentBoard(f, graph))
  const open = () => {
    if (node) openNode(node.id, issue.open)
    else if (board) {
      useUI.getState().setView('canvas')
      useUI.getState().setBoard(board.id)
    }
    close()
  }
  const ignore = node && (() => update.mutate([node.id, { checks: { off: [...new Set([...(node.checks?.off ?? []), issue.rule])] } }]))
  return (
    <li className="group/issue relative rounded-md px-1.5 py-1 pr-8 pl-[26px] hover:bg-hover/60">
      {ignore && (
        <IconButton
          icon={EyeOff}
          size="sm"
          label={`Ignore for ${node!.title}`}
          className="absolute top-1 right-1 opacity-0 group-focus-within/issue:opacity-100 group-hover/issue:opacity-100"
          onClick={ignore}
        />
      )}
      <div className="text-sm leading-5 text-fg-muted">
        {(node || board) && (
          <button
            type="button"
            {...(node ? nodeLinkProps(node.id, open) : { onClick: open })}
            className="mr-1.5 inline-flex max-w-full items-center gap-1 rounded align-bottom font-medium text-fg outline-none hover:underline hover:decoration-fg-faint hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {T && <T.icon size={13} aria-hidden className="shrink-0" style={{ color: T.color }} />}
            <span className="truncate">{node?.title ?? board?.title}</span>
          </button>
        )}
        {!node && issue.node && <span className="mr-1.5 font-mono text-xs text-fg">{issue.node}</span>}
        {issue.message}
      </div>
      {issue.hint && <p className="mt-0.5 text-xs leading-4 text-fg-subtle">{issue.hint}</p>}
      {(fixes.length > 0 || (node && issue.open)) && (
        <div className="mt-1 mb-0.5 flex flex-wrap items-center gap-1">
          {fixes.map((f) => (
            <Button key={f.kind} size="sm" variant="outline" disabled={fix.isPending} onClick={() => fix.mutate([f])}>
              {f.kind === 'place' ? `Add to ${graph?.boards.find((b) => b.id === f.board)?.title ?? 'board'}` : FIX_LABEL[f.kind]}
            </Button>
          ))}
          {node && issue.open && (
            <Button size="sm" variant="outline" onClick={open}>
              Edit {issue.open}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** "Add to board" targets the board on screen when the canvas shows a real board. */
function withCurrentBoard(f: QuickFix, graph: Graph | undefined): QuickFix {
  if (f.kind !== 'place') return f
  const current = currentBoardId()
  return current !== ALL_BOARD && graph?.boards.some((b) => b.id === current) ? { ...f, board: current } : f
}

/** Shows a node: on the canvas when it is on a board (staying on the current board if it is there), else just in the inspector. */
function openNode(id: string, tab?: string) {
  const ui = useUI.getState()
  const boards = queryClient.getQueryData<Graph>(['graph'])?.boards.filter((b) => onBoard(b, id)) ?? []
  if (boards.length) ui.focusNode(id, boards.some((b) => b.id === currentBoardId()) ? undefined : boards[0].id)
  else ui.select({ kind: 'node', id })
  if (tab) ui.requestSheet({ id, tab, edit: true })
}

/** A rule setting with a new level, keeping its options. */
function withLevel(rule: Rule, level: RuleLevel) {
  const configured = Object.keys(rule.values).length && rule.options?.length
  return configured ? [level, rule.values] : level
}

function RuleList({ report }: { report: CheckReport }) {
  const setChecks = useAction(api.setChecks)
  const byCategory = useMemo(() => {
    const out = new Map<string, Rule[]>()
    for (const r of report.rules) out.set(r.category, [...(out.get(r.category) ?? []), r])
    return [...out]
  }, [report.rules])
  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const i of report.issues) out.set(i.rule, (out.get(i.rule) ?? 0) + 1)
    return out
  }, [report.issues])
  return (
    <div className="max-h-[min(64vh,560px)] overflow-y-auto overscroll-contain px-3 py-2">
      {byCategory.map(([category, rules]) => (
        <section key={category} className="mb-3">
          <h3 className="mb-1 text-2xs font-medium text-fg-subtle">{CATEGORY[category as Rule['category']]}</h3>
          <ul className="space-y-0.5">
            {rules.map((r) => (
              <li key={r.id} className="py-1.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-fg">
                      {r.title}
                      {counts.get(r.id) ? <span className="tabular ml-1.5 text-xs text-fg-faint">{counts.get(r.id)}</span> : null}
                    </div>
                    <p className="text-xs leading-4 text-fg-subtle">{r.description}</p>
                  </div>
                  {r.custom ? (
                    <span className="h-7 shrink-0 px-1.5 text-xs leading-7 text-fg-faint">{SEVERITY[r.setting as Severity]?.label}</span>
                  ) : (
                    <GhostSelect
                      aria-label={`${r.title}: level`}
                      className="w-[104px] shrink-0"
                      value={r.setting}
                      muted={r.setting === 'off'}
                      options={LEVELS}
                      onValueChange={(v) => setChecks.mutate([{ [r.id]: withLevel(r, v as RuleLevel) }])}
                    />
                  )}
                </div>
                {r.options
                  ?.filter((o) => o.type === 'number' && r.setting !== 'off')
                  .map((o) => (
                    <label key={o.key} className="mt-1 flex items-center gap-2 text-xs text-fg-subtle">
                      {o.label}
                      <Input
                        type="number"
                        min={1}
                        className="tabular h-6 w-20 text-xs"
                        defaultValue={Number(r.values[o.key] ?? o.default)}
                        onBlur={(e) => {
                          const n = Number(e.target.value)
                          if (n > 0 && n !== Number(r.values[o.key] ?? o.default)) setChecks.mutate([{ [r.id]: [r.setting, { ...r.values, [o.key]: n }] }])
                        }}
                      />
                    </label>
                  ))}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="pb-1 text-xs leading-4 text-fg-faint">
        Scope rules to types or tags and add project checks in <span className="font-mono">maquest.json</span> (checks, customChecks), or ask your agent.
      </p>
    </div>
  )
}
