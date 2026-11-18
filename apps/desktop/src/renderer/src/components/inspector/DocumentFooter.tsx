import { memo, useDeferredValue, useMemo } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { STRUCTURE_TYPES, type OutlineNode, type StoryNode } from '@maquest/core/schema'
import { countWords, readingMinutes } from '@maquest/core/text'
import { useOutline } from '../../lib/queries'
import { useTypes } from '../../lib/styles'
import { absolute, ago } from '../../lib/time'
import { nodeLinkProps } from '../../lib/nodeLink'
import { cn } from '../ui'

const number = new Intl.NumberFormat()
const plural = (n: number, one: string, many = `${one}s`) => `${number.format(n)} ${n === 1 ? one : many}`
const isStructure = (type: string) => STRUCTURE_TYPES.some((t) => t === type)

/** Stories, chapters and scenes in reading order (the sidebar's outline, depth first). */
function readingOrder(outline: readonly OutlineNode[]): OutlineNode[] {
  return outline.flatMap((n) => [n, ...readingOrder(n.children)])
}

/**
 * Under a node's document: its word count and reading time (with the total of its chapters and scenes), when it was
 * last edited, and for stories, chapters and scenes the previous and next one in reading order.
 */
export const DocumentFooter = memo(function DocumentFooter({ node, body, all }: { node: StoryNode; body: string; all: readonly StoryNode[] }) {
  const types = useTypes()
  const { data: outline } = useOutline()
  const words = countWords(useDeferredValue(body))
  /** Words and count of the chapters and scenes below this node, from the saved files. */
  const below = useMemo(() => {
    const children = new Map<string, StoryNode[]>()
    for (const n of all) if (n.parent && isStructure(n.type)) children.set(n.parent, [...(children.get(n.parent) ?? []), n])
    let total = 0
    const counts = new Map<string, number>()
    const seen = new Set([node.id])
    const walk = (id: string) => {
      for (const c of children.get(id) ?? []) {
        if (seen.has(c.id)) continue
        seen.add(c.id)
        total += countWords(c.body)
        counts.set(c.type, (counts.get(c.type) ?? 0) + 1)
        walk(c.id)
      }
    }
    walk(node.id)
    return { total, counts }
  }, [all, node.id])
  const { previous, next } = useMemo(() => {
    if (!isStructure(node.type) || !outline) return {}
    const same = readingOrder(outline).filter((n) => n.type === node.type)
    const at = same.findIndex((n) => n.id === node.id)
    return at < 0 ? {} : { previous: same[at - 1], next: same[at + 1] }
  }, [outline, node.id, node.type])
  const parts = [...below.counts].map(([type, n]) => plural(n, types.of(type).label.toLowerCase(), types.of(type).plural.toLowerCase()))
  const edited = node.updated ?? node.created
  const when = edited ? ago(edited) : null

  return (
    <footer aria-label="Document details" className="mx-4 mt-4 border-t border-line pt-2">
      <div className="tabular flex min-h-6 flex-wrap items-center gap-x-1.5 text-2xs text-fg-faint">
        <span title={words ? `About ${readingMinutes(words)} min to read` : undefined}>
          {plural(words, 'word')}
          {words > 0 && ` · ${readingMinutes(words)} min read`}
        </span>
        {parts.length > 0 && (
          <span>
            · {plural(words + below.total, 'word')} with its {parts.join(', ')}
          </span>
        )}
        {when && (
          <time dateTime={edited} title={`${node.updated ? 'Edited' : 'Created'} ${absolute.format(new Date(edited!))}`} className="ml-auto">
            {node.updated ? 'Edited' : 'Created'} {when}
          </time>
        )}
      </div>
      {(previous || next) && (
        <nav aria-label={`Previous and next ${types.of(node.type).label.toLowerCase()}`} className="mt-1 flex gap-2">
          <Step to={previous} label="Previous" />
          <Step to={next} label="Next" end />
        </nav>
      )}
    </footer>
  )
})

function Step({ to, label, end }: { to?: OutlineNode; label: string; end?: boolean }) {
  if (!to) return <span className="flex-1" />
  const Icon = end ? ArrowRight : ArrowLeft
  return (
    <button
      type="button"
      {...nodeLinkProps(to.id)}
      aria-label={`${label}: ${to.title}`}
      className={cn(
        'group/step flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/70',
        end && 'flex-row-reverse text-right',
      )}
    >
      <Icon size={14} aria-hidden className="shrink-0 text-fg-faint group-hover/step:text-fg-muted" />
      <span className="flex min-w-0 flex-col">
        <span className="text-2xs text-fg-faint">{label}</span>
        <span className="truncate text-sm text-fg-muted group-hover/step:text-fg">{to.title}</span>
      </span>
    </button>
  )
}
