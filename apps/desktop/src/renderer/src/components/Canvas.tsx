import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MarkerType, MiniMap, Panel,
  ReactFlow, SelectionMode, useNodesState, useReactFlow, type Edge as FlowEdge, type Node as FlowNode,
} from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import dagre from '@dagrejs/dagre'
import { ChevronDown, LayoutGrid, Plus, Redo2, Undo2 } from 'lucide-react'
import { EDGE_DESCRIPTIONS, EDGE_TYPES, NODE_TYPES, type EdgeType, type NodeType, type StoryNode } from '@maquest/core/schema'
import { api } from '../lib/api'
import { importFiles, useCreateNode } from '../lib/actions'
import { useAction, useGraph, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { EDGE_STYLE, NODE_STYLE, type EdgeKind } from '../lib/styles'
import { inferConnectionType } from '../lib/connections'
import { StoryCard, type CardData } from './StoryCard'
import { FloatingEdge } from './FloatingEdge'

const nodeTypes = { card: StoryCard }
const edgeTypes = { floating: FloatingEdge }
const NONE: StoryNode[] = []
const MODES: { label: string; nodes: readonly NodeType[]; edges: readonly EdgeKind[] }[] = [
  { label: 'Everything', nodes: NODE_TYPES, edges: ['contains', ...EDGE_TYPES] },
  { label: 'Story flow', nodes: ['story', 'chapter', 'scene', 'note'], edges: ['contains', 'leads-to', 'branches-to', 'parallel', 'foreshadows'] },
  { label: 'World / entities', nodes: ['character', 'location', 'faction', 'item', 'media', 'note'], edges: ['link', 'involves', 'located-at', 'member-of', 'owns', 'relationship'] },
]

function defaultPosition(n: StoryNode, index: number) {
  return { x: NODE_TYPES.indexOf(n.type) * 300, y: index * 180 }
}

function descendants(nodes: StoryNode[], root: string) {
  const ids = new Set([root])
  let grew = true
  while (grew) {
    grew = false
    for (const n of nodes) if (n.parent && ids.has(n.parent) && !ids.has(n.id)) { ids.add(n.id); grew = true }
  }
  return ids
}

function handleSide(side: string | null | undefined) {
  switch (side) {
    case 'top': case 'right': case 'bottom': case 'left': return side
    default: return undefined
  }
}

export function Canvas() {
  const { data: all = NONE } = useNodes()
  const { data: graph } = useGraph()
  const { selection, selectedNodeIds, select, selectNodes, hiddenEdges, hiddenNodes, storyScope, connectType } = useUI()
  useEffect(() => {
    if (all === NONE) return
    const existing = new Set(all.map((node) => node.id))
    const remaining = selectedNodeIds.filter((id) => existing.has(id))
    if (remaining.length !== selectedNodeIds.length) selectNodes(remaining)
    if (selection?.kind === 'edge' && graph && !graph.edges.some((edge) => edge.id === selection.id)) select(null)
  }, [all, graph, selection, selectedNodeIds, select, selectNodes])
  const flow = useReactFlow()
  const create = useCreateNode()
  const [createError, setCreateError] = useState<Error | null>(null)
  const spawnNote = async (position?: { x: number; y: number }) => {
    setCreateError(null)
    try {
      await create('note', { position, parent: storyScope ?? undefined })
      useUI.setState((state) => ({ hiddenNodes: state.hiddenNodes.filter((type) => type !== 'note') }))
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }
  const addEdge = useAction(api.addEdge)
  const setLayout = useAction(api.setLayout)
  const undo = useAction(api.undo)
  const redo = useAction(api.redo)
  const history = useQuery({ queryKey: ['history'], queryFn: () => api.history() })
  const historyBusy = undo.isPending || redo.isPending
  const historyQueue = useRef(Promise.resolve())
  const travel = useCallback((direction: 'undo' | 'redo') => {
    // Queue rapid shortcuts; query refetches must not drop the next keystroke.
    historyQueue.current = historyQueue.current
      .then(async () => { await (direction === 'undo' ? undo : redo).mutateAsync([]) })
      .catch(() => { /* Mutation errors are rendered below. */ })
  }, [undo, redo])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor')) || !(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      event.preventDefault()
      travel(key === 'y' || event.shiftKey ? 'redo' : 'undo')
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [travel])

  const visible = useMemo(() => {
    let list = all.filter((n) => !hiddenNodes.includes(n.type))
    if (storyScope && graph) {
      const ids = descendants(all, storyScope)
      const roots = new Set(ids)
      for (const e of graph.edges) {
        if (roots.has(e.source)) ids.add(e.target)
        if (roots.has(e.target)) ids.add(e.source)
      }
      list = list.filter((n) => ids.has(n.id))
    }
    return list
  }, [all, graph, hiddenNodes, storyScope])

  const connections = useMemo(() => [
    ...visible.filter((n) => n.parent && !hiddenEdges.includes('contains')).map((n) => ({ id: `contains:${n.id}`, source: n.parent!, target: n.id })),
    ...(graph?.edges ?? []).filter((e) => !hiddenEdges.includes(e.type)),
  ], [visible, graph, hiddenEdges])
  const focus = useMemo(() => {
    const roots = new Set(selectedNodeIds)
    if (selection?.kind === 'edge') {
      const edge = connections.find((e) => e.id === selection.id)
      if (edge) { roots.add(edge.source); roots.add(edge.target) }
    }
    const neighbors = new Set(roots)
    const lines = new Set<string>()
    if (selection?.kind === 'edge') {
      lines.add(selection.id)
    } else {
      for (const e of connections) if (roots.has(e.source) || roots.has(e.target)) {
        neighbors.add(e.source); neighbors.add(e.target); lines.add(e.id)
      }
    }
    return { roots, neighbors, lines, active: roots.size > 0 }
  }, [selectedNodeIds, selection, connections])

  const flowNodes = useMemo<FlowNode<CardData>[]>(() => {
    const counters: Record<string, number> = {}
    const defaults = new Map<string, { x: number; y: number }>()
    for (const n of all) defaults.set(n.id, defaultPosition(n, (counters[n.type] = (counters[n.type] ?? -1) + 1)))
    return visible.map((n) => ({
      id: n.id, type: 'card',
      position: graph?.layout[n.id] ?? defaults.get(n.id)!,
      data: { node: n, emphasis: !focus.active || selectedNodeIds.includes(n.id) ? undefined : focus.neighbors.has(n.id) ? 'neighbor' : 'dimmed' },
      selected: selectedNodeIds.includes(n.id),
    }))
  }, [all, visible, graph, selectedNodeIds, focus])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode<CardData>>(flowNodes)
  const changeNodes = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes)
    const selections = changes.filter((change) => change.type === 'select')
    if (!selections.length) return
    const previous = useUI.getState().selectedNodeIds
    const ids = new Set(previous)
    for (const change of selections) {
      if (change.selected) ids.add(change.id)
      else ids.delete(change.id)
    }
    if (ids.size !== previous.length || previous.some((id) => !ids.has(id))) selectNodes([...ids])
  }, [onNodesChange, selectNodes])
  useEffect(() => setNodes((previous) => flowNodes.map((node) => {
    const old = previous.find((n) => n.id === node.id)
    return { ...node, measured: old?.measured }
  })), [flowNodes, setNodes])
  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current && flowNodes.length) {
      fitted.current = true
      requestAnimationFrame(() => void flow.fitView({ padding: 0.15, maxZoom: 1 }))
    }
  }, [flowNodes, flow])

  const edges = useMemo<FlowEdge[]>(() => {
    const ids = new Set(visible.map((n) => n.id))
    const style = (kind: EdgeKind, id: string) => {
      const s = EDGE_STYLE[kind]
      const selected = selection?.kind === 'edge' && selection.id === id
      const incident = focus.lines.has(id)
      return {
        selected,
        style: { stroke: selected ? '#fbbf24' : s.color, strokeWidth: (s.width ?? 1.5) + (selected ? 2 : focus.active && incident ? 1 : 0), strokeDasharray: s.dash, opacity: focus.active && !incident ? 0.5 : 1 },
        animated: s.animated && (!focus.active || incident),
        markerEnd: kind === 'contains' || kind === 'link' || kind === 'relationship' ? undefined : { type: MarkerType.ArrowClosed, color: selected ? '#fbbf24' : s.color },
      }
    }
    const out: FlowEdge[] = []
    if (!hiddenEdges.includes('contains')) for (const n of visible) {
      if (n.parent && ids.has(n.parent)) out.push({ id: `contains:${n.id}`, type: 'floating', source: n.parent, target: n.id, selectable: false, ...style('contains', `contains:${n.id}`) })
    }
    for (const e of graph?.edges ?? []) {
      if (hiddenEdges.includes(e.type) || !ids.has(e.source) || !ids.has(e.target)) continue
      out.push({ id: e.id, type: 'floating', source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
        label: e.label ?? (e.type === 'link' ? undefined : e.type), labelStyle: { fill: EDGE_STYLE[e.type].color, fontSize: 11 }, ...style(e.type, e.id) })
    }
    return out
  }, [visible, graph, hiddenEdges, selection, focus])
  const error = createError ?? undo.error ?? redo.error ?? history.error ?? setLayout.error ?? addEdge.error

  return (
    <div className="canvas-workspace h-full w-full outline-none" tabIndex={0} aria-label="Story canvas" aria-keyshortcuts="N" onKeyDown={(event) => {
        onConnect={(c) => {
          if (c.source === c.target) return
          const source = flow.getNode(c.source)?.data as CardData | undefined
          const target = flow.getNode(c.target)?.data as CardData | undefined
          if (!source || !target) return
          const type = connectType === 'auto' ? inferConnectionType(source.node.type, target.node.type) : connectType
          addEdge.mutate([{ source: c.source, target: c.target, type, sourceHandle: handleSide(c.sourceHandle), targetHandle: handleSide(c.targetHandle) }], {
            onSuccess: () => useUI.setState((state) => ({ hiddenEdges: state.hiddenEdges.filter((kind) => kind !== type) })),
          })
        }}
      event.preventDefault()
      void spawnNote()
    }} onPointerDownCapture={(event) => {
      const target = event.target
      if (target instanceof Element && target.closest('.react-flow__node, .react-flow__edge, .react-flow__pane, .react-flow__edgelabel-renderer') && !target.closest('button, input, select, textarea, [contenteditable="true"]')) event.currentTarget.focus({ preventScroll: true })
    }} onDragOver={(e) => e.preventDefault()} onDrop={async (e) => {
      e.preventDefault()
      const files = await importFiles(e.dataTransfer.files)
      const pos = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      for (const [i, src] of files.entries()) await create('media', { title: src.split('/').pop()!, src, position: { x: pos.x + i * 30, y: pos.y + i * 30 } })
    }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={changeNodes}
        connectionMode={ConnectionMode.Loose}
        onConnect={(c) => { if (c.source !== c.target) addEdge.mutate([{ source: c.source, target: c.target, type: connectType, sourceHandle: handleSide(c.sourceHandle), targetHandle: handleSide(c.targetHandle) }]) }}
        onEdgeClick={(_, edge) => { if (!edge.id.startsWith('contains:')) select({ kind: 'edge', id: edge.id }) }}
        onPaneClick={() => select(null)}
        onDoubleClick={(event) => {
          if (!(event.target instanceof Element) || !event.target.classList.contains('react-flow__pane')) return
          event.preventDefault()
          void spawnNote(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
        }}
        zoomOnDoubleClick={false}
        onNodeDragStop={(_, __, dragged) => setLayout.mutate([Object.fromEntries(dragged.map((n) => [n.id, n.position]))])}
        selectionOnDrag selectionMode={SelectionMode.Partial} multiSelectionKeyCode={['Control', 'Meta', 'Shift']}
        selectionKeyCode={null} panOnDrag={[1, 2]} deleteKeyCode={null}
        minZoom={0.1} proOptions={{ hideAttribution: true }} colorMode="dark">
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#292524" />
        <Controls position="bottom-left" className="!overflow-hidden !rounded-lg !border !border-stone-600 !shadow-xl" />
        <MiniMap position="bottom-right" pannable zoomable ariaLabel="Graph overview — drag to pan, scroll to zoom"
          nodeColor={(n) => { const data = n.data as CardData; return NODE_STYLE[data.node.type].color }}
          nodeStrokeColor="#fafaf9" nodeStrokeWidth={2} nodeBorderRadius={3}
          bgColor="#292524" maskColor="rgb(0 0 0 / 0.6)" maskStrokeColor="#fbbf24" maskStrokeWidth={3}
          style={{ border: '1px solid #57534e', borderRadius: 8 }} />
        <Panel position="top-left" className="canvas-toolbar"><Toolbar canUndo={!!history.data?.canUndo && !historyBusy} canRedo={!!history.data?.canRedo && !historyBusy} travel={travel} /></Panel>
        <Panel position="top-right" className="canvas-modes"><FilterPanel /></Panel>
        <Panel position="bottom-center"><div className="rounded-md border border-stone-800 bg-stone-950/90 px-3 py-1.5 text-[11px] text-stone-400">N / double-click blank space to add a note · Drag blank space to select · Shift / Ctrl / ⌘ to add · Middle / right drag to pan</div>{error && <div role="alert" className="mt-1 max-w-lg rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error.message}</div>}</Panel>
      </ReactFlow>
    </div>
  )
}

/** Dagre supplies ranks; deterministic obstacle placement preserves pinned rectangles. */
function useAutoLayout() {
  const flow = useReactFlow<FlowNode<CardData>>()
  const setLayout = useAction(api.setLayout)
  const [error, setError] = useState<Error | null>(null)
  const run = async () => {
    setError(null)
    try {
    const nodes = flow.getNodes()
    const g = new dagre.graphlib.Graph().setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 120 }).setDefaultEdgeLabel(() => ({}))
    const size = (n: FlowNode<CardData>) => ({ width: n.measured?.width ?? (n.data.node.type === 'media' ? 256 : 224), height: n.measured?.height ?? 160 })
    for (const n of nodes) g.setNode(n.id, size(n))
    for (const e of flow.getEdges()) g.setEdge(e.source, e.target)
    dagre.layout(g)
    const occupied = nodes.filter((n) => n.data.node.pinned).map((n) => ({ ...n.position, ...size(n) }))
    const positions: Record<string, { x: number; y: number }> = {}
    const movable = nodes.filter((n) => !n.data.node.pinned).sort((a, b) => {
      const left = g.node(a.id); const right = g.node(b.id)
      return left.x - right.x || left.y - right.y || a.id.localeCompare(b.id)
    })
    for (const n of movable) {
      const layout = g.node(n.id)
      const rect = { x: layout.x - layout.width / 2, y: layout.y - layout.height / 2, ...size(n) }
      for (;;) {
        const collisions = occupied.filter((o) => rect.x < o.x + o.width + 40 && rect.x + rect.width + 40 > o.x && rect.y < o.y + o.height + 40 && rect.y + rect.height + 40 > o.y)
        if (!collisions.length) break
        rect.y = Math.max(...collisions.map((o) => o.y + o.height + 40))
      }
      occupied.push(rect)
      positions[n.id] = { x: rect.x, y: rect.y }
    }
    for (const n of nodes) if (n.data.node.pinned) positions[n.id] = { ...n.position }
    if (nodes.length) await setLayout.mutateAsync([positions])
    requestAnimationFrame(() => void flow.fitView({ padding: 0.15, maxZoom: 1, duration: 400 }))
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }
  return { run, pending: setLayout.isPending, error }
}

function Toolbar({ canUndo, canRedo, travel }: { canUndo: boolean; canRedo: boolean; travel: (direction: 'undo' | 'redo') => void }) {
  const create = useCreateNode()
  const autoLayout = useAutoLayout()
  const { data: all = [] } = useNodes()
  const { storyScope, setStoryScope } = useUI()
  const [open, setOpen] = useState(false)
  const button = 'rounded p-1.5 text-stone-400 hover:bg-stone-800 hover:text-stone-100 disabled:cursor-not-allowed disabled:opacity-30'
  return <div>
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-700/80 bg-stone-900/95 p-1.5 text-sm shadow-xl backdrop-blur">
  const connectionDescription = connectType === 'auto' ? 'Choose a type from the source and target cards. Ambiguous pairs use a free link; hierarchy is unchanged.' : EDGE_DESCRIPTIONS[connectType]
      <div className="relative">
        <button aria-expanded={open} className="flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 font-medium text-stone-950 hover:bg-amber-400" onClick={() => setOpen(!open)}><Plus size={15} /> Add</button>
        {open && <div className="absolute top-9 left-0 z-50 w-44 rounded-lg border border-stone-700 bg-stone-900 p-1 shadow-2xl" onMouseLeave={() => setOpen(false)}>
          {NODE_TYPES.filter((t) => t !== 'media').map((t) => { const S = NODE_STYLE[t]; return <button key={t} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-stone-800" onClick={() => { setOpen(false); void create(t) }}><S.icon size={14} style={{ color: S.color }} /> {S.label}</button> })}
    useUI.setState({ hiddenNodes: NODE_TYPES.filter((t) => !preset.nodes.includes(t)), hiddenEdges: kinds.filter((t) => !preset.edges.includes(t)) })
        </div>}
      </div>
      <div className="mx-1 h-5 w-px bg-stone-700" />
      <button aria-label="Undo" aria-keyshortcuts="Control+Z Meta+Z" title="Undo (Ctrl / ⌘ Z)" disabled={!canUndo} className={button} onClick={() => travel('undo')}><Undo2 size={16} /></button>
      <button aria-label="Redo" aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z" title="Redo (Ctrl Y / Ctrl or ⌘ Shift Z)" disabled={!canRedo} className={button} onClick={() => travel('redo')}><Redo2 size={16} /></button>
      <div className="flex items-center justify-between text-[11px]"><span className="text-stone-400">New lines: <span className="text-amber-300">{connectType === 'auto' ? 'Auto' : connectType}</span></span><button aria-expanded={advanced} className="flex items-center gap-1 text-stone-300 hover:text-amber-300" onClick={() => setAdvanced(!advanced)}>Advanced <ChevronDown size={12} className={advanced ? 'rotate-180' : ''} /></button></div>
      <select aria-label="Story scope" className="max-w-40 rounded bg-stone-800 px-1.5 py-1 text-xs text-stone-200 outline-amber-400" value={storyScope ?? ''} onChange={(e) => setStoryScope(e.target.value || null)}><option value="">All stories</option>{all.filter((n) => n.type === 'story').map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
    </div>
      <label className="flex items-center justify-between gap-1 text-xs text-stone-400" title={connectionDescription}>Connect as<select aria-label="New connection type" className="rounded bg-stone-800 px-1 py-1 text-stone-100" value={connectType} onChange={(e) => setConnectType(e.target.value as EdgeType | 'auto')}><option value="auto">Auto</option>{EDGE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <p className="text-[11px] text-stone-500">{connectionDescription}</p>
}

function FilterPanel() {
  const { hiddenEdges, hiddenNodes, toggleEdge, toggleNode, connectType, setConnectType } = useUI()
  const [advanced, setAdvanced] = useState(false)
  const kinds: EdgeKind[] = ['contains', ...EDGE_TYPES]
  const current = MODES.findIndex((mode) => NODE_TYPES.every((t) => hiddenNodes.includes(t) === !mode.nodes.includes(t)) && kinds.every((t) => hiddenEdges.includes(t) === !mode.edges.includes(t)))
  const mode = (index: number) => {
    const preset = MODES[index]
    useUI.setState({ hiddenNodes: NODE_TYPES.filter((t) => !preset.nodes.includes(t)), hiddenEdges: kinds.filter((t) => !preset.edges.includes(t)), connectType: preset.connect })
  }
  return <div className="w-60 rounded-lg border border-stone-700/80 bg-stone-900/95 text-sm shadow-xl backdrop-blur">
    <div className="space-y-2 p-2.5">
      <label className="flex items-center justify-between gap-2 text-xs text-stone-400">View<select aria-label="Graph view mode" className="rounded bg-stone-800 px-2 py-1 text-stone-100 outline-amber-400" value={current} onChange={(e) => mode(Number(e.target.value))}>{current < 0 && <option value={-1} disabled>Custom</option>}{MODES.map((m, i) => <option key={m.label} value={i}>{m.label}</option>)}</select></label>
      <p className="text-[11px] leading-relaxed text-stone-500">Drag between card handles to connect. Pin cards to keep their place when arranging.</p>
      <div className="flex items-center justify-between text-[11px]"><span className="text-stone-400">New lines: <span className="text-amber-300">{connectType}</span></span><button aria-expanded={advanced} className="flex items-center gap-1 text-stone-300 hover:text-amber-300" onClick={() => setAdvanced(!advanced)}>Advanced <ChevronDown size={12} className={advanced ? 'rotate-180' : ''} /></button></div>
    </div>
    {advanced && <div className="max-h-[65vh] space-y-3 overflow-y-auto border-t border-stone-800 p-2.5">
      <label className="flex items-center justify-between gap-1 text-xs text-stone-400" title={EDGE_DESCRIPTIONS[connectType]}>Connect as<select aria-label="New connection type" className="rounded bg-stone-800 px-1 py-1 text-stone-100" value={connectType} onChange={(e) => setConnectType(e.target.value as EdgeType)}>{EDGE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <p className="text-[11px] text-stone-500">{EDGE_DESCRIPTIONS[connectType]}</p>
      <div><div className="pb-1 text-[10px] tracking-wider text-stone-500 uppercase">Connections / legend</div>{kinds.map((k) => { const s = EDGE_STYLE[k]; return <button key={k} aria-pressed={!hiddenEdges.includes(k)} title={k === 'contains' ? 'Story → chapter → scene hierarchy' : EDGE_DESCRIPTIONS[k]} onClick={() => toggleEdge(k)} className={clsx('flex w-full items-center gap-2 rounded px-1 py-1 text-xs hover:bg-stone-800', hiddenEdges.includes(k) && 'opacity-35')}><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke={s.color} strokeWidth={s.width ?? 1.5} strokeDasharray={s.dash} /></svg>{k}</button> })}</div>
      <div><div className="pb-1 text-[10px] tracking-wider text-stone-500 uppercase">Nodes</div>{NODE_TYPES.map((t) => { const S = NODE_STYLE[t]; return <button key={t} aria-pressed={!hiddenNodes.includes(t)} onClick={() => toggleNode(t)} className={clsx('flex w-full items-center gap-2 rounded px-1 py-1 text-xs hover:bg-stone-800', hiddenNodes.includes(t) && 'opacity-35')}><S.icon size={13} style={{ color: S.color }} />{S.plural}</button> })}</div>
      <p className="text-[11px] text-stone-500">Selected cards glow amber; neighbors have a soft outline. Unrelated cards and lines fade.</p>
    </div>}
  </div>
}
