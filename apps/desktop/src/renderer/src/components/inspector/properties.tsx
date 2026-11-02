import { memo, useId, useMemo } from 'react'
import { ImagePlus, Plus, X } from 'lucide-react'
import { type Status, type StoryNode, onBoard, refsOf } from '@maquest/core/schema'
import { api, isVideo, mediaUrl } from '../../lib/api'
import { importFiles } from '../../lib/actions'
import { useAction, useGraph } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { ClockDial } from '../ClockDial'
import { openImage } from '../Lightbox'
import { IconButton, Menu, MenuItem, MenuLabel, cn } from '../ui'
import { GhostSelect, PropertyRow, ghost } from './fields'

export const STATUSES: Status[] = ['idea', 'draft', 'revised', 'done']
export const STATUS_LABEL: Record<Status, string> = { idea: 'Idea', draft: 'Draft', revised: 'Revised', done: 'Done' }
const STATUS_DOT: Record<Status, string> = {
  idea: 'bg-fg-subtle',
  draft: 'bg-warning',
  revised: 'bg-accent',
  done: 'bg-success',
}

export function StatusDot({ status }: { status?: Status }) {
  return <span aria-hidden className={cn('block size-2 rounded-full', status ? STATUS_DOT[status] : 'shadow-[inset_0_0_0_1px_var(--color-fg-faint)]')} />
}

export const CLOCK_SIZES = [2, 3, 4, 5, 6, 8, 10, 12]

export const ClockProperty = memo(function ClockProperty({ node }: { node: StoryNode }) {
  const update = useAction(api.updateNode)
  const sizeId = useId()
  const clock = node.clock
  if (!clock) return null
  const set = (patch: Partial<NonNullable<StoryNode['clock']>> | null) => update.mutate([node.id, { clock: patch && { ...clock, ...patch } }])
  return (
    <PropertyRow label="Clock" className="items-start">
      <div className="w-full min-w-0">
        <div className="flex h-7 items-center gap-2 pl-1.5">
          <ClockDial size={clock.size} filled={clock.filled} radius={10} onSet={(filled) => set({ filled })} />
          <span className="tabular text-xs text-fg-muted">
            {clock.filled}/{clock.size}
          </span>
          <GhostSelect
            id={sizeId}
            aria-label="Clock size"
            className="w-auto"
            value={String(clock.size)}
            options={CLOCK_SIZES.map((n) => ({ value: String(n), label: `${n} segments` }))}
            onValueChange={(v) => set({ size: Number(v), filled: Math.min(clock.filled, Number(v)) })}
          />
          <IconButton
            icon={X}
            label="Remove clock"
            size="sm"
            className="ml-auto opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100"
            onClick={() => set(null)}
          />
        </div>
        <ol className="mt-0.5 mb-1">
          {Array.from({ length: clock.size }, (_, i) => (
            <li key={`${i}:${clock.steps[i] ?? ''}`} className="flex items-center">
              <span className={cn('tabular w-5 shrink-0 pl-1.5 text-2xs', i < clock.filled ? 'text-accent-text' : 'text-fg-faint')}>{i + 1}</span>
              <input
                aria-label={`What happens at ${i + 1}`}
                placeholder="What happens…"
                className={cn(ghost, 'h-6 text-xs', i < clock.filled ? 'text-accent-text' : 'text-fg-muted')}
                defaultValue={clock.steps[i] ?? ''}
                onBlur={(e) => {
                  if ((clock.steps[i] ?? '') === e.target.value) return
                  const steps = Array.from({ length: clock.size }, (_, k) => (k === i ? e.target.value : (clock.steps[k] ?? '')))
                  set({ steps })
                }}
              />
            </li>
          ))}
        </ol>
      </div>
    </PropertyRow>
  )
})

export const BoardsProperty = memo(function BoardsProperty({ id }: { id: string }) {
  const { data: graph } = useGraph()
  const update = useAction(api.updateBoard)
  const focusNode = useUI((s) => s.focusNode)
  const labelId = useId()
  const boards = graph?.boards
  const [on, off] = useMemo(() => {
    const all = boards ?? []
    return [all.filter((b) => onBoard(b, id)), all.filter((b) => !onBoard(b, id))]
  }, [boards, id])
  if (!on.length && !off.length) return null
  return (
    <PropertyRow label="Boards" id={labelId}>
      <div role="group" aria-labelledby={labelId} className="flex w-full min-w-0 flex-wrap items-center gap-1 py-1 pl-1.5">
        {on.map((b) => (
          <span key={b.id} className="inline-flex h-5 max-w-full items-center rounded bg-active text-xs text-fg-muted">
            <button
              type="button"
              title={`Show on ${b.title}`}
              className="min-w-0 truncate rounded-l pl-1.5 outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70"
              onClick={() => focusNode(id, b.id)}
            >
              {b.title}
            </button>
            <button
              type="button"
              aria-label={`Remove from ${b.title}`}
              title={`Remove from ${b.title}`}
              className="mx-0.5 flex size-4 shrink-0 items-center justify-center rounded-[3px] text-fg-faint outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70"
              onClick={() => update.mutate([b.id, { removeNodes: refsOf(b, id) }])}
            >
              <X size={11} aria-hidden />
            </button>
          </span>
        ))}
        {!on.length && <span className="text-sm text-fg-faint">Not on a board</span>}
        {off.length > 0 && (
          <Menu trigger={<IconButton icon={Plus} label="Add to board" size="sm" className="size-5" />}>
            <MenuLabel>Add to board</MenuLabel>
            {off.map((b) => (
              <MenuItem key={b.id} onClick={() => update.mutate([b.id, { addNodes: [id] }])}>
                {b.title}
              </MenuItem>
            ))}
          </Menu>
        )}
        {update.error && (
          <div role="alert" className="w-full text-xs text-danger">
            {update.error.message}
          </div>
        )}
      </div>
    </PropertyRow>
  )
})

export async function attachMedia(node: StoryNode, files: FileList | null, mutate: (args: [string, Partial<StoryNode>]) => void) {
  if (!files?.length) return
  const paths = await importFiles(files)
  if (paths.length) mutate([node.id, { media: [...node.media, ...paths] }])
}

export const MediaProperty = memo(function MediaProperty({ node, onAttach }: { node: StoryNode; onAttach: () => void }) {
  const update = useAction(api.updateNode)
  const items = useMemo(() => [...(node.src ? [node.src] : []), ...node.media], [node.src, node.media])
  if (!items.length) return null
  return (
    <PropertyRow label="Media" className="items-start">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 py-1 pl-1.5">
        {items.map((m) => {
          const name = m.split('/').pop() ?? m
          return (
            <div key={m} className="group/media relative">
              {isVideo(m) ? (
                <video src={mediaUrl(m)} className="h-14 rounded-md bg-surface" controls aria-label={name} />
              ) : (
                <button
                  type="button"
                  className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  onClick={() => openImage(mediaUrl(m))}
                >
                  <img
                    src={mediaUrl(m)}
                    alt={name}
                    title="View full size"
                    className="h-14 max-w-28 min-w-10 cursor-zoom-in rounded-md bg-surface object-cover shadow-[inset_0_0_0_1px_var(--color-line)]"
                  />
                </button>
              )}
              {m !== node.src && (
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  title={`Remove ${name}`}
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded bg-app/80 text-fg-muted opacity-0 outline-none group-focus-within/media:opacity-100 group-hover/media:opacity-100 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70"
                  onClick={() => update.mutate([node.id, { media: node.media.filter((x) => x !== m) }])}
                >
                  <X size={12} aria-hidden />
                </button>
              )}
            </div>
          )
        })}
        <IconButton icon={ImagePlus} label="Attach media" size="sm" onClick={onAttach} />
      </div>
    </PropertyRow>
  )
})
