import { memo, useMemo } from 'react'
import { BookOpen } from 'lucide-react'
import type { StoryNode } from '@maquest/core/schema'
import { cardLibrary, cardNode, parseCards, type Card } from '@maquest/core/sheet'
import { useNodes } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { useTypes } from '../../lib/styles'
import { MarkdownPreview } from '../MarkdownEditor'
import { Popover, cn } from '../ui'

const NO_NODES: StoryNode[] = []

/**
 * A cards tab: ## headings group the cards, each shows its name and short facts; hovering opens the full text (click
 * keeps it open). Cards named like a library node (or linked with [[id]]) show its text.
 */
export const CardList = memo(function CardList({ text }: { text: string }) {
  const { data: nodes = NO_NODES } = useNodes()
  const types = useTypes()
  const parsed = useMemo(() => parseCards(text), [text])
  const library = useMemo(() => cardLibrary(nodes, types.list), [nodes, types])
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const empty = !parsed.groups.some((g) => g.cards.length || g.intro)
  if (empty)
    return (
      <p className="text-sm leading-6 text-fg-subtle">
        No cards yet. Use <span className="font-mono text-xs text-fg-muted">## Group</span> headings and{' '}
        <span className="font-mono text-xs text-fg-muted">### Name {'{meta}'}</span> per card, or bullets starting with a bold name.
      </p>
    )
  return (
    <div className="space-y-5" data-cards>
      {parsed.groups.map((g, i) => (
        <section key={`${i}:${g.title ?? ''}`} aria-label={g.title ?? 'Cards'}>
          {g.title && (
            <h3 className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium text-fg-subtle">
              {g.title}
              {g.cards.length > 0 && <span className="tabular text-fg-faint">{g.cards.length}</span>}
            </h3>
          )}
          {g.intro && (
            <div className="mb-2 [&_.prose-md]:text-sm [&_.prose-md]:leading-6">
              <MarkdownPreview source={g.intro} />
            </div>
          )}
          {g.cards.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
              {g.cards.map((a, k) => (
                <CardTile key={`${k}:${a.name}`} card={a} linked={cardNode(a, library, byId)} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
})

function CardTile({ card: a, linked }: { card: Card; linked?: StoryNode }) {
  const types = useTypes()
  const select = useUI((s) => s.select)
  const T = linked && types.of(linked.type)
  const card = (
    <button
      type="button"
      data-card={a.name}
      className="group/card flex min-h-12 w-full min-w-0 flex-col justify-center gap-0.5 rounded-md bg-surface px-2.5 py-1.5 text-left shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-[box-shadow,background-color] duration-100 hover:bg-hover hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus-visible:ring-2 focus-visible:ring-accent/70 data-[popup-open]:bg-hover data-[popup-open]:shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{a.name}</span>
        {T && <T.icon size={12} aria-label={`${T.label}: ${linked!.title}`} className="shrink-0" style={{ color: T.color }} />}
      </span>
      {a.meta.length > 0 && <span className="truncate text-2xs leading-4 text-fg-subtle">{a.meta.join(' · ')}</span>}
    </button>
  )
  const own = a.text.trim()
  const shared = linked?.body.trim()
  return (
    <Popover trigger={card} hover side="left" align="start" className="w-[min(380px,calc(100vw-32px))]">
      <div className="max-h-[min(60vh,520px)] overflow-y-auto p-3.5">
        <div className="font-serif text-lg leading-snug font-semibold text-fg">{a.name}</div>
        {(a.meta.length > 0 || linked) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {a.meta.map((m) => (
              <span key={m} className="inline-flex h-5 items-center rounded bg-active px-1.5 text-2xs text-fg-muted">
                {m}
              </span>
            ))}
            {linked && T && (
              <button
                type="button"
                className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-2xs text-fg-subtle outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70"
                onClick={() => select({ kind: 'node', id: linked.id })}
              >
                <BookOpen size={11} aria-hidden /> {T.label}: {linked.title}
              </button>
            )}
          </div>
        )}
        {linked?.summary && <p className="mt-2 text-sm leading-5 text-fg-muted">{linked.summary}</p>}
        <div className={cn('card-text mt-2', !shared && !own && 'text-sm text-fg-faint')}>
          {shared && <MarkdownPreview source={shared} />}
          {own && shared && <div className="mt-3 mb-1 text-2xs font-medium text-fg-subtle">On this sheet</div>}
          {own && <MarkdownPreview source={own} />}
          {!shared && !own && 'No description.'}
        </div>
      </div>
    </Popover>
  )
}
