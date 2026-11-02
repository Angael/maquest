import { memo, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { ArrowUpRight, Lightbulb, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { NodeType, StoryNode } from '@maquest/core/schema'
import { api } from '../lib/api'
import { useAction, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { useTypes, type TypeStyle } from '../lib/styles'
import { Button, IconButton, Kbd, Menu, MenuItem, MenuLabel, cn } from './ui'
import { PageHeader } from './views/ViewLayout'

const PROMOTE: NodeType[] = ['note', 'scene', 'chapter', 'story']
const TITLE_MAX = 80

/** The idea pile: dump anything, promote it later. Agents file loose ideas here too. */
export function Backlog() {
  const { data: all } = useNodes()
  const types = useTypes()
  const promote = useMemo(() => [...PROMOTE.map(types.of), ...types.list.filter((t) => t.entity)], [types])
  const titles = useMemo(() => new Map((all ?? []).map((n) => [n.id, n.title])), [all])
  const ideas = useMemo(() => (all ?? []).filter((n) => n.type === 'idea').toSorted((a, b) => (b.created ?? '').localeCompare(a.created ?? '')), [all])
  const selected = useUI((s) => (s.selection?.kind === 'node' ? s.selection.id : null))
  const capture = useRef<HTMLInputElement>(null)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Backlog"
        count={ideas.length ? `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'}` : undefined}
        description="Loose ideas, TODOs and half-thoughts, from you or your agent. Promote one to a scene, character or note when it's ready."
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-3xl px-6 pt-5 pb-10">
          <Capture ref={capture} />
          {ideas.length ? (
            <ul className="mt-6 space-y-2" aria-label="Ideas">
              {ideas.map((n) => (
                <IdeaCard key={n.id} idea={n} selected={n.id === selected} promote={promote} titles={titles} />
              ))}
            </ul>
          ) : (
            <Empty onCapture={() => capture.current?.focus()} />
          )}
        </div>
      </div>
    </div>
  )
}

function Capture({ ref }: { ref: RefObject<HTMLInputElement | null> }) {
  const create = useAction(api.createNode)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const detailsRef = useRef<HTMLTextAreaElement>(null)
  const ready = !!title.trim()
  const add = () => {
    if (!ready) return
    const t = title.trim()
    create.mutate([{ type: 'idea', title: t.slice(0, TITLE_MAX), body: details.trim() || (t.length > TITLE_MAX ? t : '') }])
    setTitle('')
    setDetails('')
    ref.current?.focus()
  }
  const submitKeys = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      add()
    } else if (e.key === 'Escape') e.currentTarget.blur()
  }
  return (
    <form
      onSubmit={(e) => (e.preventDefault(), add())}
      className="rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-100 focus-within:shadow-[inset_0_0_0_1px_var(--color-line-strong),0_0_0_3px_var(--color-active)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
    >
      <input
        ref={ref}
        autoFocus
        aria-label="New idea"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          // Enter files a one-liner; Shift+Enter moves on to the details.
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault()
            detailsRef.current?.focus()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            add()
          } else submitKeys(e)
        }}
        onPaste={(e) => {
          // A pasted multi-line note splits into title + details.
          const text = e.clipboardData.getData('text/plain').trim()
          if (!text.includes('\n')) return
          e.preventDefault()
          const [first, ...rest] = text.split('\n')
          setTitle(first.trim())
          setDetails((d) => [d, rest.join('\n').trim()].filter(Boolean).join('\n'))
        }}
        placeholder="New idea, e.g. the innkeeper is the lost heir"
        className="block h-11 w-full bg-transparent px-3.5 pt-1 font-serif text-lg font-semibold text-fg outline-none placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-fg-faint focus-visible:outline-none!"
      />
      <textarea
        ref={detailsRef}
        aria-label="Details"
        rows={1}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        onKeyDown={submitKeys}
        placeholder="Details (optional)"
        className="block max-h-60 min-h-6 w-full resize-none bg-transparent px-3.5 text-sm leading-6 text-fg-muted outline-none [field-sizing:content] placeholder:text-fg-faint focus-visible:outline-none!"
      />
      <div className="flex items-center justify-end gap-3 px-3.5 pt-1.5 pb-2.5">
        <Button type="submit" size="sm" variant={ready ? 'primary' : 'subtle'} disabled={!ready} className="gap-2 pr-1.5">
          Add idea
          <span className="flex items-center gap-0.5" aria-hidden>
            <Kbd className={cn(ready && 'bg-black/15 text-accent-fg')}>↵</Kbd>
          </span>
        </Button>
      </div>
    </form>
  )
}

/** Markdown reduced to a one-paragraph plain-text excerpt for the list. */
function excerpt(body: string, titles: Map<string, string>) {
  return body
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replaceAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id: string, alias?: string) => alias ?? titles.get(id.trim()) ?? id)
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ x]\]\s+)?|\d+[.)]\s+)/, '')
        .replaceAll(/(\*\*|__|\*|_|~~|`)(.+?)\1/g, '$2')
        .trim(),
    )
    .filter(Boolean)
    .join(' · ')
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' })
const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
]
function ago(iso: string) {
  let value = (Date.parse(iso) - Date.now()) / 60_000
  if (Number.isNaN(value)) return null
  if (Math.abs(value) < 1) return 'just now'
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return relative.format(Math.round(value), unit)
    value /= size
  }
  return null
}

const IdeaCard = memo(function IdeaCard({
  idea,
  selected,
  promote,
  titles,
}: {
  idea: StoryNode
  selected: boolean
  promote: TypeStyle[]
  titles: Map<string, string>
}) {
  const select = useUI((s) => s.select)
  const update = useAction(api.updateNode)
  const remove = useAction(api.deleteNodes)
  const undo = useAction(api.undo)
  const text = useMemo(() => excerpt(idea.body, titles), [idea.body, titles])
  const when = idea.created ? ago(idea.created) : null

  const destroy = async () => {
    if (selected) select(null)
    await remove.mutateAsync([[idea.id], false])
    toast(`Deleted “${idea.title}”`, { action: { label: 'Undo', onClick: () => undo.mutate([]) } })
  }

  return (
    <li
      className={cn(
        'group/row relative rounded-lg px-4 py-3 transition-[background-color,box-shadow] duration-100',
        selected
          ? 'bg-surface shadow-[inset_0_0_0_1px_var(--color-accent)]'
          : 'bg-surface/50 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-surface hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* The title button stretches over the card so the whole card selects the idea. */}
          <button
            type="button"
            aria-pressed={selected}
            onClick={() => select({ kind: 'node', id: idea.id })}
            className="block w-full text-left text-base leading-6 font-medium text-fg outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-accent/70"
          >
            <span className="line-clamp-2 text-pretty break-words">{idea.title || 'Untitled idea'}</span>
          </button>
          {text && <p className="mt-0.5 line-clamp-2 font-serif text-sm leading-[1.6] text-pretty break-words text-fg-muted">{text}</p>}
          {(idea.tags.length > 0 || when) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {idea.tags.map((t) => (
                <span key={t} className="inline-flex h-5 items-center rounded bg-hover px-1.5 text-2xs text-fg-subtle">
                  {t}
                </span>
              ))}
              {when && (
                <time dateTime={idea.created} title={absolute.format(new Date(idea.created!))} className="tabular text-2xs text-fg-faint">
                  {idea.tags.length > 0 && (
                    <span aria-hidden="true" className="mr-1.5 text-fg-faint/60">
                      ·
                    </span>
                  )}
                  {when}
                </time>
              )}
            </div>
          )}
        </div>
        <div className="reveal-actions relative z-10 -mt-1 -mr-2 flex shrink-0 items-center gap-0.5">
          <Menu
            align="end"
            trigger={
              <Button size="sm" className="gap-1 text-fg-subtle" aria-label={`Promote “${idea.title}”`}>
                <ArrowUpRight size={14} aria-hidden />
                Promote
              </Button>
            }
          >
            <MenuLabel>Turn this idea into…</MenuLabel>
            {promote.map((t) => (
              <MenuItem key={t.id} icon={t.icon} onClick={() => update.mutate([idea.id, { type: t.id }])}>
                {t.label}
              </MenuItem>
            ))}
          </Menu>
          <IconButton size="sm" icon={Trash2} label="Delete idea" shortcut="Delete" onClick={() => void destroy()} />
        </div>
      </div>
    </li>
  )
})

function Empty({ onCapture }: { onCapture: () => void }) {
  return (
    <div className="mt-6 flex flex-col items-center rounded-lg px-6 py-14 text-center shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="flex size-10 items-center justify-center rounded-lg bg-surface text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)]">
        <Lightbulb size={18} aria-hidden />
      </div>
      <h2 className="mt-3 text-base font-medium text-fg">No ideas yet</h2>
      <p className="mt-1 max-w-sm text-sm text-pretty text-fg-subtle">
        Jot down anything that might matter later. Your agent can file loose ideas here too, so nothing gets lost mid-session.
      </p>
      <Button variant="subtle" className="mt-4" onClick={onCapture}>
        Capture an idea
      </Button>
    </div>
  )
}
