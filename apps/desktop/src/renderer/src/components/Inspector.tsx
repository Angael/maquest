import { useEffect, useRef, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { ArrowRight, ImagePlus, Trash2, X } from 'lucide-react'
import {
  ALLOWED_PARENTS,
  EDGE_DESCRIPTIONS,
  EDGE_LABEL_MAX,
  EDGE_TYPES,
  NODE_TYPES,
  type EdgeType,
  type NodeType,
  type Status,
  type StoryNode,
  onBoard,
  refsOf,
} from '@maquest/core/schema'
import { api, isVideo, mediaUrl } from '../lib/api'
import { importFiles } from '../lib/actions'
import { useAction, useGraph, useNodes, useNode } from '../lib/queries'
import { useUI } from '../lib/store'
import { BEFORE_DELETE, useDeleteSelection } from '../lib/deletion'
import { EDGE_STYLE, NODE_STYLE } from '../lib/styles'
import { MarkdownEditor } from './MarkdownEditor'
import { ClockDial } from './ClockDial'
import { Button, Input, Label, Select } from './ui'

const STATUSES: Status[] = ['idea', 'draft', 'revised', 'done']

export function Inspector() {
  const selection = useUI((s) => s.selection)!
  const select = useUI((s) => s.select)
  return (
    <aside id="project-inspector" aria-label="Inspector" className="w-full min-w-0 overflow-y-auto border-l border-stone-800 bg-stone-950">
      <div className="flex justify-end p-1">
        <Button onClick={() => select(null)} title="Close">
          <X size={16} />
        </Button>
      </div>
      {selection.kind === 'node' ? <NodeInspector key={selection.id} id={selection.id} /> : <EdgeInspector key={selection.id} id={selection.id} />}
    </aside>
  )
}

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

function NodeInspector({ id }: { id: string }) {
  const node = useNode(id)
  const { data: all = [] } = useNodes()
  const { data: graph } = useGraph()
  const select = useUI((s) => s.select)
  const update = useAction(api.updateNode)
  const deleteSelection = useDeleteSelection()
  const removeEdge = useAction(api.removeEdge)
  const [draft, setDraft] = useState<Draft | null>(node && toDraft(node))
  const [newField, setNewField] = useState('')
  const dirty = useRef(false)
  const revision = useRef(0)
  const pending = useRef<Patch>({})
  const saveQueue = useRef(Promise.resolve())
  const deleting = useRef(false)
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

  if (!node || !draft) return <div className="p-4 text-sm text-stone-500">Node not found.</div>
  const S = NODE_STYLE[node.type]
  const change = (patch: Patch) => {
    dirty.current = true
    setDraft(applyPatch(draft, patch))
    pending.current = mergePatch(pending.current, patch)
    save(id, pending.current, ++revision.current)
  }
  const parents = all.filter((n) => ALLOWED_PARENTS[node.type]?.includes(n.type))
  const titleOf = (nid: string) => all.find((n) => n.id === nid)?.title ?? nid
  const edges = graph?.edges.filter((e) => e.source === id || e.target === id) ?? []
  const children = all.filter((n) => n.parent === id)

  return (
    <div className="space-y-4 px-4 pb-8">
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase" style={{ color: S.color }}>
          <S.icon size={13} /> {S.label}
          <span className="ml-1 font-mono text-stone-600 normal-case">{node.id}</span>
        </div>
        <input
          className="mt-1 w-full bg-transparent font-serif text-2xl text-stone-100 outline-none"
          value={draft.title}
          onChange={(e) => change({ title: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label>Type</Label>
          <Select value={node.type} onChange={(e) => update.mutate([id, { type: e.target.value as NodeType, parent: null }])}>
            {NODE_TYPES.map((t) => (
              <option key={t} value={t}>
                {NODE_STYLE[t].label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={node.status ?? ''} onChange={(e) => update.mutate([id, { status: (e.target.value || null) as Status | null }])}>
            <option value="">—</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        {ALLOWED_PARENTS[node.type] && (
          <div>
            <Label>In</Label>
            <Select value={node.parent ?? ''} onChange={(e) => update.mutate([id, { parent: e.target.value || null }])}>
              <option value="">—</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div>
        <Label>Summary</Label>
        <Input
          value={draft.summary}
          placeholder={node.type === 'scene' ? 'X tries to Y, but Z, so W' : 'One line'}
          onChange={(e) => change({ summary: e.target.value })}
        />
      </div>

      <div>
        <Label>Fields</Label>
        <div className="space-y-1.5">
          {Object.entries(draft.fields).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-xs text-stone-400">{k}</span>
              <Input value={v} onChange={(e) => change({ fields: { [k]: e.target.value } })} />
              <button className="text-stone-600 hover:text-red-400" onClick={() => change({ fields: { [k]: null } })} title="Remove field">
                <X size={14} />
              </button>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const name = newField.trim()
              if (name) {
                if (!(name in draft.fields)) change({ fields: { [name]: '' } })
                setNewField('')
              }
            }}
          >
            <Input placeholder="+ add field" value={newField} onChange={(e) => setNewField(e.target.value)} />
          </form>
        </div>
      </div>

      <div>
        <Label>Tags</Label>
        <Input
          key={draft.tags.join(', ')}
          defaultValue={draft.tags.join(', ')}
          placeholder="comma, separated"
          onBlur={(e) =>
            change({
              tags: e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        />
      </div>

      <ClockEditor node={node} />

      <BoardMembership id={id} />

      <MediaStrip node={node} />

      <div>
        <Label>Content</Label>
        <MarkdownEditor value={draft.body} onChange={(body) => change({ body })} />
      </div>

      {children.length > 0 && (
        <div>
          <Label>Contains</Label>
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => select({ kind: 'node', id: c.id })}
              className="block w-full truncate rounded px-2 py-1 text-left text-sm text-stone-300 hover:bg-stone-900"
            >
              {c.order}. {c.title}
            </button>
          ))}
        </div>
      )}

      <div>
        <Label>Connections</Label>
        {edges.length === 0 && <div className="text-xs text-stone-600">Drag from a node's edge on the canvas to connect.</div>}
        {edges.map((e) => {
          const out = e.source === id
          const other = out ? e.target : e.source
          return (
            <div key={e.id} className="group flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-stone-900">
              <span className="w-24 shrink-0 truncate text-xs" style={{ color: EDGE_STYLE[e.type].color }}>
                {out ? '→' : '←'} {e.type}
              </span>
              <button className="truncate text-stone-200 hover:underline" onClick={() => select({ kind: 'node', id: other })}>
                {titleOf(other)}
              </button>
              {e.label && <span className="truncate text-xs text-stone-500">“{e.label}”</span>}
              <button className="ml-auto hidden text-stone-500 group-hover:block hover:text-stone-200" onClick={() => select({ kind: 'edge', id: e.id })}>
                edit
              </button>
              <button className="hidden text-stone-500 group-hover:block hover:text-red-400" onClick={() => removeEdge.mutate([e.id])}>
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex gap-2 border-t border-stone-800 pt-3">
        {node.type !== 'idea' && <Button onClick={() => update.mutate([id, { type: 'idea', parent: null }])}>Move to backlog</Button>}
        <Button variant="danger" className="ml-auto" onClick={() => void deleteSelection({ kind: 'node', id })}>
          <Trash2 size={15} /> Delete
        </Button>
      </div>
    </div>
  )
}

function ClockEditor({ node }: { node: StoryNode }) {
  const update = useAction(api.updateNode)
  const clock = node.clock
  const set = (patch: Partial<NonNullable<StoryNode['clock']>> | null) =>
    update.mutate([node.id, { clock: patch && { size: 6, filled: 0, steps: [], ...clock, ...patch } }])
  if (!clock) {
    return (
      <div>
        <Label>Clock</Label>
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <span>Track a front, threat or countdown:</span>
          {[4, 6, 8].map((size) => (
            <button key={size} className="rounded border border-stone-700 px-1.5 py-0.5 text-stone-300 hover:border-amber-400" onClick={() => set({ size })}>
              {size}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div>
      <Label>Clock</Label>
      <div className="flex items-start gap-3">
        <ClockDial size={clock.size} filled={clock.filled} radius={28} onSet={(filled) => set({ filled })} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-xs text-stone-400">
            {clock.filled}/{clock.size}
            <Select
              className="w-auto py-0.5"
              aria-label="Clock size"
              value={clock.size}
              onChange={(e) => set({ size: Number(e.target.value), filled: Math.min(clock.filled, Number(e.target.value)) })}
            >
              {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n} segments
                </option>
              ))}
            </Select>
            <button className="ml-auto text-stone-500 hover:text-red-400" onClick={() => set(null)}>
              Remove
            </button>
          </div>
          {Array.from({ length: clock.size }, (_, i) => (
            <Input
              key={`${i}:${clock.steps[i] ?? ''}`}
              aria-label={`What happens at ${i + 1}`}
              placeholder={`${i + 1}: what happens…`}
              className={i < clock.filled ? 'text-amber-200' : undefined}
              defaultValue={clock.steps[i] ?? ''}
              onBlur={(e) => {
                if ((clock.steps[i] ?? '') === e.target.value) return
                const steps = Array.from({ length: clock.size }, (_, k) => (k === i ? e.target.value : (clock.steps[k] ?? '')))
                set({ steps })
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function BoardMembership({ id }: { id: string }) {
  const { data: graph } = useGraph()
  const update = useAction(api.updateBoard)
  const boards = graph?.boards ?? []
  if (!boards.length) return null
  return (
    <div>
      <Label>Boards</Label>
      <div className="flex flex-wrap gap-1">
        {boards.map((b) => {
          const on = onBoard(b, id)
          return (
            <button
              key={b.id}
              aria-pressed={on}
              title={on ? `Remove from ${b.title}` : `Place on ${b.title}`}
              className={
                on
                  ? 'rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200'
                  : 'rounded-full border border-dashed border-stone-700 px-2 py-0.5 text-xs text-stone-500 hover:text-stone-200'
              }
              onClick={() => update.mutate([b.id, on ? { removeNodes: refsOf(b, id) } : { addNodes: [id] }])}
            >
              {b.title}
            </button>
          )
        })}
      </div>
      {update.error && (
        <div role="alert" className="mt-1 text-xs text-red-300">
          {update.error.message}
        </div>
      )}
    </div>
  )
}

function MediaStrip({ node }: { node: StoryNode }) {
  const update = useAction(api.updateNode)
  const fileInput = useRef<HTMLInputElement>(null)
  const items = [...(node.src ? [node.src] : []), ...node.media]
  const attach = async (files: FileList | null) => {
    if (!files) return
    const paths = await importFiles(files)
    if (paths.length) update.mutate([node.id, { media: [...node.media, ...paths] }])
  }
  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), e.stopPropagation(), void attach(e.dataTransfer.files))}>
      <Label>Media</Label>
      <div className="flex flex-wrap gap-2">
        {items.map((m) => (
          <div key={m} className="group relative">
            {isVideo(m) ? <video src={mediaUrl(m)} className="h-20 rounded" controls /> : <img src={mediaUrl(m)} className="h-20 rounded object-cover" />}
            {m !== node.src && (
              <button
                className="absolute top-1 right-1 hidden rounded bg-black/70 p-0.5 group-hover:block"
                onClick={() => update.mutate([node.id, { media: node.media.filter((x) => x !== m) }])}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        <button
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded border border-dashed border-stone-700 text-[11px] text-stone-500 hover:border-stone-500 hover:text-stone-300"
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={18} /> attach
        </button>
        <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => void attach(e.target.files)} />
      </div>
    </div>
  )
}

function EdgeInspector({ id }: { id: string }) {
  const { data: graph } = useGraph()
  const { data: all = [] } = useNodes()
  const select = useUI((s) => s.select)
  const updateEdge = useAction(api.updateEdge)
  const deleteSelection = useDeleteSelection()
  const edge = graph?.edges.find((e) => e.id === id)
  const [label, setLabel] = useState(edge?.label ?? '')
  const dirty = useRef(false)
  const labelRevision = useRef(0)
  const labelQueue = useRef(Promise.resolve())
  const deleting = useRef(false)
  const saveLabel = useDebouncedCallback((targetId: string, value: string, version: number) => {
    const persist = async () => {
      if (deleting.current) return
      try {
        await updateEdge.mutateAsync([targetId, { label: value }])
        if (labelRevision.current === version) dirty.current = false
      } catch {
        /* Retain the local label if saving fails. */
      }
    }
    labelQueue.current = labelQueue.current.then(persist)
    return labelQueue.current
  }, 400)
  useEffect(() => {
    if (!dirty.current) setLabel(edge?.label ?? '')
  }, [edge?.label])
  useEffect(() => {
    const beforeDelete = (event: Event) => {
      if ((event as CustomEvent<string[]>).detail.includes(id)) {
        deleting.current = true
        saveLabel.cancel()
      }
    }
    window.addEventListener(BEFORE_DELETE, beforeDelete)
    return () => {
      window.removeEventListener(BEFORE_DELETE, beforeDelete)
      saveLabel.flush()
    }
  }, [id, saveLabel])
  if (!edge) return <div className="p-4 text-sm text-stone-500">Connection not found.</div>
  const title = (nid: string) => all.find((n) => n.id === nid)?.title ?? nid

  return (
    <div className="space-y-4 px-4">
      <div className="text-[11px] font-medium tracking-wider text-stone-500 uppercase">Connection</div>
      <div className="flex items-center gap-2 font-serif text-lg">
        <button className="hover:underline" onClick={() => select({ kind: 'node', id: edge.source })}>
          {title(edge.source)}
        </button>
        <ArrowRight size={16} style={{ color: EDGE_STYLE[edge.type].color }} />
        <button className="hover:underline" onClick={() => select({ kind: 'node', id: edge.target })}>
          {title(edge.target)}
        </button>
      </div>
      <div>
        <Label>Type</Label>
        <Select value={edge.type} onChange={(e) => updateEdge.mutate([id, { type: e.target.value as EdgeType }])}>
          {EDGE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <div className="mt-1 text-xs text-stone-500">{EDGE_DESCRIPTIONS[edge.type]}</div>
      </div>
      <div>
        <Label>Name</Label>
        <Input
          value={label}
          maxLength={EDGE_LABEL_MAX}
          placeholder="e.g. betrays, owes a debt to…"
          onChange={(e) => {
            dirty.current = true
            setLabel(e.target.value)
            saveLabel(id, e.target.value, ++labelRevision.current)
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => updateEdge.mutate([id, { source: edge.target, target: edge.source }])}>Reverse</Button>
        <Button variant="danger" className="ml-auto" onClick={() => void deleteSelection({ kind: 'edge', id })}>
          <Trash2 size={15} /> Delete
        </Button>
      </div>
    </div>
  )
}
