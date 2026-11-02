import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { ArrowDown, ArrowLeftRight, Spline, Trash2 } from 'lucide-react'
import { EDGE_DESCRIPTIONS, EDGE_LABEL_MAX, EDGE_TYPES, type EdgeType, type StoryNode } from '@maquest/core/schema'
import { api } from '../../lib/api'
import { useAction, useGraph, useNodes } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { BEFORE_DELETE, useDeleteSelection } from '../../lib/deletion'
import { EDGE_STYLE, useTypes } from '../../lib/styles'
import { IconButton, MenuItem, MenuSeparator } from '../ui'
import { InspectorHeader } from './Header'
import { GhostSelect, PropertyRow, ghost } from './fields'

function Endpoint({ node, id, role }: { node?: StoryNode; id: string; role: 'From' | 'To' }) {
  const types = useTypes()
  const select = useUI((s) => s.select)
  const S = node && types.of(node.type)
  return (
    <button
      type="button"
      aria-label={`${role}: ${node?.title ?? id}`}
      onClick={() => select({ kind: 'node', id })}
      className="-mx-1.5 flex w-[calc(100%+12px)] min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/70"
    >
      {S ? <S.icon size={16} aria-hidden className="shrink-0" style={{ color: S.color }} /> : <span className="size-4" />}
      <span className="min-w-0 truncate font-serif text-lg leading-snug font-semibold text-fg">{node?.title ?? id}</span>
      {S && <span className="ml-auto shrink-0 text-xs text-fg-faint">{S.label}</span>}
    </button>
  )
}

export function EdgeInspector({ id }: { id: string }) {
  const { data: graph } = useGraph()
  const { data: nodes } = useNodes()
  const updateEdge = useAction(api.updateEdge)
  const deleteSelection = useDeleteSelection()
  const edge = graph?.edges.find((e) => e.id === id)
  const typeId = useId()
  const nameId = useId()
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
  const byId = useMemo(() => new Map((nodes ?? []).map((n) => [n.id, n])), [nodes])
  if (!edge) return <div className="p-4 text-sm text-fg-subtle">Connection not found.</div>
  const color = EDGE_STYLE[edge.type].color
  const reverse = () => updateEdge.mutate([id, { source: edge.target, target: edge.source }])

  return (
    <div className="pb-10">
      <InspectorHeader
        icon={Spline}
        label="Connection"
        color={color}
        menu={
          <>
            <MenuItem icon={ArrowLeftRight} onClick={reverse}>
              Reverse direction
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Trash2} danger onClick={() => void deleteSelection({ kind: 'edge', id })}>
              Delete connection
            </MenuItem>
          </>
        }
      />
      <div className="px-4">
        <Endpoint node={byId.get(edge.source)} id={edge.source} role="From" />
        <div className="flex h-6 items-center gap-2 pl-0.5">
          <ArrowDown size={14} aria-hidden style={{ color }} />
          <span className="text-xs" style={{ color }}>
            {edge.label || edge.type}
          </span>
          <IconButton icon={ArrowLeftRight} label="Reverse direction" size="sm" className="ml-auto" onClick={reverse} />
        </div>
        <Endpoint node={byId.get(edge.target)} id={edge.target} role="To" />
      </div>

      <div className="mt-4 px-4">
        <PropertyRow label="Type" htmlFor={typeId} className="items-start">
          <div className="w-full min-w-0">
            <GhostSelect
              id={typeId}
              value={edge.type}
              leading={<span aria-hidden className="block h-0.5 w-3 rounded-full" style={{ background: color }} />}
              options={EDGE_TYPES.map((t) => ({ value: t, label: t }))}
              onValueChange={(type) => updateEdge.mutate([id, { type: type as EdgeType }])}
            />
            <p className="px-1.5 pb-1 text-xs leading-4 text-fg-subtle">{EDGE_DESCRIPTIONS[edge.type]}</p>
          </div>
        </PropertyRow>
        <PropertyRow label="Name" htmlFor={nameId}>
          <input
            id={nameId}
            value={label}
            maxLength={EDGE_LABEL_MAX}
            placeholder="e.g. betrays, owes a debt to…"
            autoComplete="off"
            className={`${ghost} h-7`}
            onChange={(e) => {
              dirty.current = true
              setLabel(e.target.value)
              saveLabel(id, e.target.value, ++labelRevision.current)
            }}
          />
        </PropertyRow>
      </div>
    </div>
  )
}
