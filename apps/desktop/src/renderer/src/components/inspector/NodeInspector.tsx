import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { CopyPlus, FolderOpen, Gauge, ImagePlus, Inbox, Link2, Plus, TextCursorInput, Trash2, X } from 'lucide-react'
import { ALLOWED_PARENTS, type NodeType, type Status, type StoryNode } from '@maquest/core/schema'
import { api } from '../../lib/api'
import { currentBoardId, queryClient, useAction, useNodes } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { BEFORE_DELETE, useDeleteEverywhere } from '../../lib/deletion'
import { useTypes } from '../../lib/styles'
import { MarkdownEditor } from '../MarkdownEditor'
import { Button, IconButton, Menu, MenuItem, MenuSeparator, cn } from '../ui'
import { InspectorHeader, useCopy } from './Header'
import { GhostSelect, GhostText, PropertyRow, TagInput, ghost, oneLine } from './fields'
import { BoardsProperty, ClockProperty, MediaProperty, STATUSES, STATUS_LABEL, StatusDot, attachMedia } from './properties'
import { Connections, Contains } from './Connections'

type Draft = Pick<StoryNode, 'title' | 'summary' | 'body' | 'fields' | 'tags'>
/** Unsaved changes; `fields` holds only changed keys, null marking removal. */
type Patch = Partial<Omit<Draft, 'fields'>> & { fields?: Record<string, string | null> }
const toDraft = (n: StoryNode): Draft => ({ title: n.title, summary: n.summary ?? '', body: n.body, fields: n.fields, tags: n.tags })
const mergePatch = (a: Patch, b: Patch): Patch => ({ ...a, ...b, ...((a.fields || b.fields) && { fields: { ...a.fields, ...b.fields } }) })
const applyPatch = (d: Draft, p: Patch): Draft => {
  const fields = { ...d.fields }
  for (const [k, v] of Object.entries(p.fields ?? {})) {
    if (v === null) delete fields[k]
    else fields[k] = v
  }
  return { ...d, ...p, fields }
}

const NO_NODES: StoryNode[] = []

export function NodeInspector({ id }: { id: string }) {
  const { data: all = NO_NODES } = useNodes()
  const node = useMemo(() => all.find((n) => n.id === id) ?? null, [all, id])
  const update = useAction(api.updateNode)
  const [draft, setDraft] = useState<Draft | null>(node && toDraft(node))
  const dirty = useRef(false)
  const revision = useRef(0)
  const pending = useRef<Patch>({})
  const saveQueue = useRef(Promise.resolve())
  const deleting = useRef(false)
  const summaryRef = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const save = useDebouncedCallback((targetId: string, patch: Patch, version: number) => {
    const persist = async () => {
      if (deleting.current) return
      try {
        const saved = await update.mutateAsync([targetId, patch])
        if (revision.current === version) {
          dirty.current = false
          pending.current = {}
          setDraft(toDraft(saved))
        }
      } catch {
        // Keep the local draft on failure; later edits retry its pending fields.
        pending.current = mergePatch(patch, pending.current)
      }
    }
    saveQueue.current = saveQueue.current.then(persist)
    return saveQueue.current
  }, 500)

  // Never replace an in-flight draft with an older watcher/refetch result.
  useEffect(() => {
    if (node && !dirty.current) setDraft(toDraft(node))
  }, [node])

  useEffect(() => {
    const beforeDelete = (event: Event) => {
      if ((event as CustomEvent<string[]>).detail.includes(id)) {
        deleting.current = true
        save.cancel()
        pending.current = {}
      }
    }
    window.addEventListener(BEFORE_DELETE, beforeDelete)
    return () => {
      window.removeEventListener(BEFORE_DELETE, beforeDelete)
      save.flush()
    }
  }, [id, save])

  const change = useCallback(
    (patch: Patch) => {
      dirty.current = true
      setDraft((d) => d && applyPatch(d, patch))
      pending.current = mergePatch(pending.current, patch)
      save(id, pending.current, ++revision.current)
    },
    [id, save],
  )
  const changeBody = useCallback((body: string) => change({ body }), [change])
  const byId = useMemo(() => new Map(all.map((n) => [n.id, n])), [all])
  const children = useMemo(() => all.filter((n) => n.parent === id), [all, id])

  if (!node || !draft) return <div className="p-4 text-sm text-fg-subtle">Node not found.</div>
  const attach = () => fileInput.current?.click()

  return (
    <div className="pb-10">
      <NodeHeader node={node} />
      <div className="px-4">
        <GhostText
          aria-label="Title"
          value={draft.title}
          placeholder="Untitled"
          className="-mx-1.5 py-0.5 font-serif text-[22px] leading-[1.3] font-semibold tracking-[-0.005em] text-fg focus:bg-transparent focus:shadow-none"
          onChange={(e) => change({ title: oneLine(e.target.value) })}
          onKeyDown={(e) => e.key === 'Enter' && summaryRef.current?.focus()}
        />
        <GhostText
          ref={summaryRef}
          aria-label="Summary"
          value={draft.summary}
          placeholder={node.type === 'scene' ? 'Add a summary: X tries to Y, but Z, so W…' : 'Add a summary…'}
          className="-mx-1.5 mt-0.5 max-h-40 text-base leading-[1.45] text-fg-muted focus:bg-transparent focus:shadow-none"
          onChange={(e) => change({ summary: oneLine(e.target.value) })}
        />
      </div>

      <div
        className="mt-3 px-4"
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          e.stopPropagation()
          void attachMedia(node, e.dataTransfer.files, update.mutate)
        }}
      >
        <CoreProperties node={node} />
        <TagsRow tags={draft.tags} onChange={change} />
        <BoardsProperty id={id} />
        <ClockProperty node={node} />
        <MediaProperty node={node} onAttach={attach} />
        <CustomFields fields={draft.fields} onChange={change} node={node} onAttachMedia={attach} />
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            void attachMedia(node, e.target.files, update.mutate)
            e.target.value = ''
          }}
        />
      </div>

      <div className="mx-4 mt-3 border-t border-line" />
      <MarkdownEditor value={draft.body} onChange={changeBody} variant="document" label="Content" placeholder="Start writing…" minHeight="160px" />

      <div className="mt-6 space-y-5 px-4">
        <Contains items={children} />
        <Connections id={id} byId={byId} />
      </div>
    </div>
  )
}

const NodeHeader = memo(function NodeHeader({ node }: { node: StoryNode }) {
  const types = useTypes()
  const select = useUI((s) => s.select)
  const update = useAction(api.updateNode)
  const duplicate = useAction(api.duplicateNodes)
  const destroy = useDeleteEverywhere()
  const [, copy] = useCopy()
  const S = types.of(node.type)
  const menu = (
    <>
      <MenuItem icon={Link2} onClick={() => copy(`[[${node.id}]]`)}>
        Copy link
      </MenuItem>
      <MenuItem
        icon={CopyPlus}
        onClick={() =>
          void duplicate.mutateAsync([[node.id], { x: 40, y: 40 }, currentBoardId()]).then(async (copies) => {
            await queryClient.refetchQueries({ queryKey: ['nodes'] })
            if (copies[0]) select({ kind: 'node', id: copies[0] })
          })
        }
      >
        Duplicate
      </MenuItem>
      <MenuItem icon={FolderOpen} onClick={() => void api.reveal(node.path)}>
        Show file in folder
      </MenuItem>
      {node.type !== 'idea' && (
        <MenuItem icon={Inbox} onClick={() => update.mutate([node.id, { type: 'idea', parent: null }])}>
          Move to backlog
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={Trash2} danger onClick={() => destroy([node.id])}>
        Delete…
      </MenuItem>
    </>
  )
  return <InspectorHeader icon={S.icon} label={S.label} color={S.color} id={node.id} menu={menu} />
})

/** Type, status and parent. */
const CoreProperties = memo(function CoreProperties({ node }: { node: StoryNode }) {
  const types = useTypes()
  const { data: all = NO_NODES } = useNodes()
  const update = useAction(api.updateNode)
  const ids = { type: useId(), status: useId(), parent: useId() }
  const S = types.of(node.type)
  const allowed = ALLOWED_PARENTS[node.type]
  const parents = useMemo(() => (allowed ? all.filter((n) => allowed.includes(n.type)) : []), [all, allowed])
  const typeOptions = types.list.some((t) => t.id === node.type) ? types.list : [...types.list, S]
  const parentLabel = allowed?.length === 1 ? types.of(allowed[0]).label : 'Parent'
  const parent = node.parent ? parents.find((p) => p.id === node.parent) : undefined
  const P = parent && types.of(parent.type)
  return (
    <>
      <PropertyRow label="Type" htmlFor={ids.type}>
        <GhostSelect
          id={ids.type}
          value={node.type}
          leading={<S.icon size={14} style={{ color: S.color }} />}
          onChange={(e) => update.mutate([node.id, { type: e.target.value as NodeType, parent: null }])}
        >
          {typeOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </GhostSelect>
      </PropertyRow>
      <PropertyRow label="Status" htmlFor={ids.status}>
        <GhostSelect
          id={ids.status}
          value={node.status ?? ''}
          leading={<StatusDot status={node.status} />}
          className={node.status ? undefined : '[&_select]:text-fg-faint'}
          onChange={(e) => update.mutate([node.id, { status: (e.target.value || null) as Status | null }])}
        >
          <option value="">No status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </GhostSelect>
      </PropertyRow>
      {allowed && (
        <PropertyRow label={parentLabel} htmlFor={ids.parent}>
          <GhostSelect
            id={ids.parent}
            value={node.parent ?? ''}
            leading={P ? <P.icon size={14} style={{ color: P.color }} /> : undefined}
            className={parent ? undefined : '[&_select]:text-fg-faint'}
            onChange={(e) => update.mutate([node.id, { parent: e.target.value || null }])}
          >
            <option value="">None</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </GhostSelect>
        </PropertyRow>
      )}
    </>
  )
})

const TagsRow = memo(function TagsRow({ tags, onChange }: { tags: string[]; onChange: (patch: Patch) => void }) {
  const tagId = useId()
  return (
    <PropertyRow label="Tags" htmlFor={tagId}>
      <TagInput id={tagId} tags={tags} onChange={(next) => onChange({ tags: next })} />
    </PropertyRow>
  )
})

/** Free-form fields in the same row style, then the "Add property" menu (field, clock, media). */
const CustomFields = memo(function CustomFields({
  fields,
  onChange,
  node,
  onAttachMedia,
}: {
  fields: Record<string, string>
  onChange: (patch: Patch) => void
  node: StoryNode
  onAttachMedia: () => void
}) {
  const update = useAction(api.updateNode)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const prefix = useId()
  const hasMedia = !!node.src || node.media.length > 0
  const cancelled = useRef(false)
  const add = () => {
    const key = cancelled.current ? '' : name.trim()
    cancelled.current = false
    if (key) {
      if (!(key in fields)) onChange({ fields: { [key]: '' } })
      setFocusKey(key)
    }
    setName('')
    setAdding(false)
  }
  return (
    <>
      {Object.entries(fields).map(([k, v], i) => (
        <PropertyRow key={k} label={<span title={k}>{k}</span>} htmlFor={`${prefix}-${i}`}>
          <GhostText
            id={`${prefix}-${i}`}
            value={v}
            placeholder="Empty"
            autoFocus={k === focusKey}
            onChange={(e) => onChange({ fields: { [k]: oneLine(e.target.value) } })}
          />
          <IconButton
            icon={X}
            label={`Remove field ${k}`}
            size="sm"
            className="ml-0.5 self-start opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100"
            onClick={() => onChange({ fields: { [k]: null } })}
          />
        </PropertyRow>
      ))}
      {adding ? (
        <div className="flex h-7 items-center gap-2">
          <input
            autoFocus
            aria-label="New field name"
            placeholder="Field name…"
            value={name}
            autoComplete="off"
            spellCheck={false}
            className={cn(ghost, 'h-7 w-[88px] shrink-0 bg-surface px-1.5 text-xs shadow-[inset_0_0_0_1px_var(--color-line-strong)]')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancelled.current = true
                e.currentTarget.blur()
              }
            }}
            onBlur={add}
          />
          <span className="text-xs text-fg-faint">Enter to add</span>
        </div>
      ) : (
        <Menu
          trigger={
            <Button size="sm" className="-ml-2 mt-0.5 gap-1 px-2 font-normal text-fg-faint hover:text-fg-muted">
              <Plus size={13} aria-hidden /> Add property
            </Button>
          }
        >
          <MenuItem icon={TextCursorInput} onClick={() => setAdding(true)}>
            Field…
          </MenuItem>
          {!node.clock && (
            <MenuItem icon={Gauge} onClick={() => update.mutate([node.id, { clock: { size: 6, filled: 0, steps: [] } }])}>
              Clock
            </MenuItem>
          )}
          {!hasMedia && (
            <MenuItem icon={ImagePlus} onClick={onAttachMedia}>
              Media…
            </MenuItem>
          )}
        </Menu>
      )}
    </>
  )
})
