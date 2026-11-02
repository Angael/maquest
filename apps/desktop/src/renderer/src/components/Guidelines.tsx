import { useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Bot, EyeOff, Info, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react'
import { PROJECT_KINDS, type Guideline, type GuidelineScope, type ProjectKind } from '@maquest/core/schema'
import { api } from '../lib/api'
import { useAction, useConfig, useGuidelines } from '../lib/queries'
import { useUI } from '../lib/store'
import { MarkdownEditor } from './MarkdownEditor'
import { Button, IconButton, Menu, MenuItem, Select, Tooltip, cn } from './ui'
import { ConfirmDialog, CreateButton, ListGroup, PageHeader, Switch, TwoPane, listRow } from './views/ViewLayout'

const KIND_LABEL: Record<ProjectKind, string> = { novel: 'Novel', screenplay: 'Screenplay', rpg: 'Tabletop RPG', mixed: 'Mixed' }
const SCOPE_LABEL: Record<GuidelineScope, string> = { all: 'All projects', novel: 'Novels', screenplay: 'Screenplays', rpg: 'Tabletop RPGs' }
const SCOPES = Object.keys(SCOPE_LABEL) as GuidelineScope[]

const appliesTo = (g: Guideline, kind: ProjectKind | undefined) => !kind || kind === 'mixed' || g.scope === 'all' || g.scope === kind

/** Built-in guidelines with per-project overrides. Agents read and edit the same data via MCP. */
export function Guidelines() {
  const { data: list = [] } = useGuidelines()
  const { data: config } = useConfig()
  const updateConfig = useAction(api.updateConfig)
  const setGuideline = useAction(api.setGuideline)
  const active = useUI((s) => s.guideline)
  const setActive = useUI((s) => s.setGuideline)
  const kind = config?.kind
  const g = list.find((x) => x.id === active) ?? list[0]
  const groups = useMemo(
    () =>
      [
        { label: 'Custom', items: list.filter((x) => x.source === 'custom') },
        { label: 'Built-in', items: list.filter((x) => x.source !== 'custom') },
      ].filter((group) => group.items.length),
    [list],
  )
  const following = useMemo(() => list.filter((x) => !x.disabled && appliesTo(x, kind)).length, [list, kind])

  const header = (
    <PageHeader
      title="Guidelines"
      count={list.length ? `${following} of ${list.length} active` : undefined}
      description="Rules your agent reads before it writes. Built-in ones apply by project kind; edit any of them or add your own."
    >
      <label htmlFor="project-kind" className="text-xs font-medium text-fg-subtle">
        Project kind
      </label>
      <Tooltip content="Agents only follow guidelines meant for this kind of project. Mixed uses all of them." side="bottom">
        <Select id="project-kind" className="w-36" value={kind ?? 'mixed'} onChange={(e) => updateConfig.mutate([{ kind: e.target.value as ProjectKind }])}>
          {PROJECT_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
      </Tooltip>
      <CreateButton
        label="New guideline"
        fieldLabel="Guideline name"
        placeholder="e.g. Combat pacing"
        submitLabel="Create"
        hint={(v) => (v ? <span className="font-mono">guidelines/{slug(v)}.md</span> : 'Saved as a markdown file in guidelines/.')}
        create={async (name) => {
          if (!slug(name)) return 'Use at least one letter or number.'
          if (list.some((x) => x.id === slug(name))) return 'A guideline with this name already exists.'
          // Core turns the name into the file id; `slug` here only previews it and catches clashes.
          const created = await setGuideline.mutateAsync([name, { title: name, body: '- ' }])
          setActive(created.id)
          return null
        }}
      />
    </PageHeader>
  )

  return (
    <TwoPane
      header={header}
      listLabel="Guidelines"
      list={groups.map((group) => (
        <ListGroup key={group.label} label={group.label} count={group.items.length}>
          {group.items.map((x) => (
            <GuidelineRow
              key={x.id}
              g={x}
              kind={kind}
              selected={x.id === g?.id}
              onSelect={() => setActive(x.id)}
              onToggle={(on) => setGuideline.mutate([x.id, { disabled: !on }])}
            />
          ))}
        </ListGroup>
      ))}
    >
      {g && <GuidelineEditor key={g.id} g={g} kind={kind} />}
    </TwoPane>
  )
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 60)

function GuidelineRow({
  g,
  kind,
  selected,
  onSelect,
  onToggle,
}: {
  g: Guideline
  kind: ProjectKind | undefined
  selected: boolean
  onSelect: () => void
  onToggle: (on: boolean) => void
}) {
  const applies = appliesTo(g, kind)
  const muted = g.disabled || !applies
  return (
    <li className={cn(listRow(selected), 'pr-2')}>
      <button
        type="button"
        aria-current={selected ? 'page' : undefined}
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-accent/70"
      >
        <span className={cn(muted && 'text-fg-faint', g.disabled && 'line-through decoration-fg-faint/50')}>{g.title}</span>
        {g.disabled && <span className="sr-only"> (off)</span>}
      </button>
      {!applies && (
        <Tooltip content={`Only for ${SCOPE_LABEL[g.scope].toLowerCase()}; agents skip it in this project`}>
          <span className="relative z-10 shrink-0 text-2xs text-fg-faint">{SCOPE_LABEL[g.scope]}</span>
        </Tooltip>
      )}
      {g.source === 'override' && (
        <Tooltip content="Edited for this project">
          <span className="relative z-10 size-1.5 shrink-0 rounded-full bg-accent-text" aria-label="Edited" />
        </Tooltip>
      )}
      <Switch className="relative z-10" checked={!g.disabled} onChange={onToggle} label={`${g.title}: ${g.disabled ? 'off' : 'on'}`} />
    </li>
  )
}

function GuidelineEditor({ g, kind }: { g: Guideline; kind: ProjectKind | undefined }) {
  const setGuideline = useAction(api.setGuideline)
  const reset = useAction(api.resetGuideline)
  const [title, setTitle] = useState(g.title)
  const [body, setBody] = useState(g.body)
  const [confirming, setConfirming] = useState(false)
  const save = useDebouncedCallback((patch: { title?: string; body?: string }) => setGuideline.mutate([g.id, patch]), 600)
  useEffect(() => () => void save.flush(), [save])
  // Adopt edits made elsewhere (agents via MCP, git, a reset) unless the user has unsaved typing in flight.
  const [seen, setSeen] = useState({ title: g.title, body: g.body })
  if ((seen.title !== g.title || seen.body !== g.body) && !save.isPending()) {
    setSeen({ title: g.title, body: g.body })
    // Saved files are trimmed; ignore that echo so trailing spaces being typed survive.
    if (seen.title !== g.title && g.title.trim() !== title.trim()) setTitle(g.title)
    if (seen.body !== g.body && g.body.trim() !== body.trim()) setBody(g.body)
  }
  const applies = appliesTo(g, kind)
  const file = `guidelines/${g.id}.md`
  const reads = g.reads ?? 0
  const writes = g.writes ?? 0
  const toggle = (on: boolean) => setGuideline.mutate([g.id, { disabled: !on }])

  return (
    <div className="max-w-3xl px-6 pt-5 pb-10">
      <div className="flex items-start gap-3">
        <input
          aria-label="Guideline title"
          className="min-w-0 flex-1 truncate bg-transparent font-serif text-2xl leading-9 font-semibold text-fg outline-none placeholder:text-fg-faint"
          placeholder="Untitled guideline"
          value={title}
          onChange={(e) => (setTitle(e.target.value), save({ title: e.target.value }))}
        />
        <div className="flex h-9 shrink-0 items-center gap-1">
          <label className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-xs font-medium text-fg-muted hover:bg-hover">
            <Switch checked={!g.disabled} onChange={toggle} label="Guideline on" />
            {g.disabled ? 'Off' : 'On'}
          </label>
          {g.source !== 'default' && (
            <Menu align="end" trigger={<IconButton icon={MoreHorizontal} label="More actions" />}>
              {g.source === 'override' ? (
                <MenuItem icon={RotateCcw} onClick={() => setConfirming(true)}>
                  Reset to built-in…
                </MenuItem>
              ) : (
                <MenuItem icon={Trash2} danger onClick={() => setConfirming(true)}>
                  Delete guideline…
                </MenuItem>
              )}
            </Menu>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-subtle">
        <label className="flex items-center gap-2">
          Applies to
          <Select
            aria-label="Applies to"
            className="w-36"
            value={g.scope}
            onChange={(e) => setGuideline.mutate([g.id, { scope: e.target.value as GuidelineScope }])}
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
        <Tooltip content={g.source === 'default' ? `Built-in. Your first edit saves a project copy to ${file}` : 'Stored in the project folder'}>
          <span className="truncate font-mono text-2xs text-fg-faint" translate="no">
            {g.source === 'default' ? 'Built-in' : file}
          </span>
        </Tooltip>
        <Tooltip content="How often agents read or edited this guideline through MCP">
          <span className="tabular flex items-center gap-1.5 text-fg-faint">
            <Bot size={13} aria-hidden />
            {reads || writes ? `Read ${reads}× · edited ${writes}× by agents` : 'Not used by agents yet'}
          </span>
        </Tooltip>
      </div>

      {(g.disabled || !applies) && (
        <div className="mt-4 flex items-center gap-2.5 rounded-md bg-surface px-3 py-2 text-xs text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)]">
          {g.disabled ? (
            <EyeOff size={14} className="shrink-0 text-fg-subtle" aria-hidden />
          ) : (
            <Info size={14} className="shrink-0 text-fg-subtle" aria-hidden />
          )}
          <span className="flex-1">
            {g.disabled
              ? 'This guideline is off. Agents won’t see it.'
              : `Only for ${SCOPE_LABEL[g.scope].toLowerCase()}. This project is ${KIND_LABEL[kind ?? 'mixed'].toLowerCase()}, so agents skip it.`}
          </span>
          {g.disabled ? (
            <Button size="sm" variant="subtle" onClick={() => toggle(true)}>
              Turn on
            </Button>
          ) : (
            <Button size="sm" variant="subtle" onClick={() => setGuideline.mutate([g.id, { scope: 'all' }])}>
              Apply to all projects
            </Button>
          )}
        </div>
      )}

      <div className="mt-5">
        <MarkdownEditor label="Guideline" value={body} onChange={(b) => (setBody(b), save({ body: b }))} minHeight="360px" hint={false} />
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={g.source === 'override' ? 'Reset to the built-in version?' : 'Delete this guideline?'}
        description={
          g.source === 'override'
            ? `Your project edits to “${g.title}” will be lost and ${file} removed.`
            : `“${g.title}” and ${file} will be deleted. Agents will no longer follow it.`
        }
        confirmLabel={g.source === 'override' ? 'Reset' : 'Delete'}
        onConfirm={() => reset.mutate([g.id])}
      />
    </div>
  )
}
