import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MarkerType, MiniMap, Panel,
  ReactFlow, SelectionMode, useReactFlow, ViewportPortal, type Connection, type Edge as FlowEdge, type IsValidConnection, type Node as FlowNode, type NodeChange,
} from '@xyflow/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import dagre from '@dagrejs/dagre'
import { ChevronDown, Columns3, LayoutGrid, Pencil, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react'
import {
  EDGE_DESCRIPTIONS, EDGE_TYPES, MAIN_BOARD, NODE_TYPES, PHASE_WIDTH, clueCounts, isReferenceEdge, onBoard, phaseIndex,
  type Board, type EdgeType, type Graph, type NodeType, type StoryNode,
} from '@maquest/core/schema'
import { api } from '../lib/api'
import { importFiles, useCreateNode } from '../lib/actions'
import { currentBoardId, queryClient, useAction, useBoard, useGraph, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { EDGE_STYLE, NODE_STYLE, type EdgeKind } from '../lib/styles'
import { inferConnectionType } from '../lib/connections'
import { StoryCard, type CardData, type CardRef } from './StoryCard'
import { FloatingConnectionLine, FloatingEdge, type FloatingFlowEdge } from './FloatingEdge'

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

type LocalNode = { position?: { x: number; y: number }; measured?: { width: number; height: number }; dragging?: boolean }
type NewEdge = { source: string; target: string; type: EdgeType }

/** Adds an edge optimistically so the line stays on screen while the write round-trips through disk. */
function useAddEdge() {
  return useMutation({
    mutationFn: (edge: NewEdge) => api.addEdge(edge),
    onMutate: async (edge) => {
      await queryClient.cancelQueries({ queryKey: ['graph'] })
      const previous = queryClient.getQueryData<Graph>(['graph'])
      if (previous) queryClient.setQueryData<Graph>(['graph'], { ...previous, edges: [...previous.edges, { ...edge, id: `pending:${crypto.randomUUID()}` }] })
      return { previous }
    },
    onError: (_error, _edge, context) => { if (context?.previous) queryClient.setQueryData(['graph'], context.previous) },
    onSettled: () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' }),
  })
}

/** In-app node clipboard; paste duplicates from disk so edits after copy are included. */
let clipboard: { ids: string[]; pastes: number } | null = null

const cardSize = (n: FlowNode<CardData>) => ({ width: n.measured?.width ?? (n.data.node.type === 'media' ? 256 : 224), height: n.measured?.height ?? 160 })

export function Canvas() {
  const { data: all = NONE } = useNodes()
  const { data: graph } = useGraph()
  const { selection, selectedNodeIds, select, selectNodes, hiddenEdges, hiddenNodes, storyScope, connectType, edgeLabels, referenceLines } = useUI()
  const board = useBoard()
  const [hovered, setHovered] = useState<{ edge?: string; node?: string }>({})
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
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const workspace = useRef<HTMLDivElement>(null)
  const [addMenu, setAddMenu] = useState<{ x: number; y: number; position?: { x: number; y: number } } | null>(null)
  const closeAddMenu = () => {
    setAddMenu(null)
    workspace.current?.focus({ preventScroll: true })
  }
  const openAddMenu = (point: { x: number; y: number }) => {
    setAddMenu({ ...point, position: flow.screenToFlowPosition(point) })
  }
  const spawnNode = async (type: NodeType) => {
    const position = addMenu?.position
    closeAddMenu()
    setCreateError(null)
    try {
      await create(type, { position })
      useUI.setState((state) => ({ hiddenNodes: state.hiddenNodes.filter((kind) => kind !== type), storyScope: null }))
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }
  const addEdge = useAddEdge()
  const setLayout = useAction(api.setLayout)
  const undo = useAction(api.undo)
  const redo = useAction(api.redo)
  const duplicate = useAction(api.duplicateNodes)
  const history = useQuery({ queryKey: ['history'], queryFn: () => api.history() })
  const historyBusy = undo.isPending || redo.isPending
  const historyQueue = useRef(Promise.resolve())
  const visibleRef = useRef(NONE)
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
      if (key === 'a' && !event.shiftKey) {
        event.preventDefault()
        selectNodes(visibleRef.current.map((n) => n.id))
      } else if (key === 'c' && !event.shiftKey) {
        if (window.getSelection()?.toString()) return // Let native text copy win.
        const ids = useUI.getState().selectedNodeIds
        if (!ids.length) return
        event.preventDefault()
        clipboard = { ids, pastes: 0 }
      } else if (key === 'v' && !event.shiftKey) {
        if (!clipboard || event.repeat) return
        event.preventDefault()
        const step = 40 * ++clipboard.pastes
        // Refetch before selecting, or the stale-selection cleanup drops the new ids.
        duplicate.mutateAsync([clipboard.ids, { x: step, y: step }, currentBoardId()])
          .then(async (ids) => { await queryClient.refetchQueries({ queryKey: ['nodes'] }); selectNodes(ids) })
          .catch(() => { /* Rendered below. */ })
      } else if (key === 'z' || key === 'y') {
        event.preventDefault()
        travel(key === 'y' || event.shiftKey ? 'redo' : 'undo')
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [travel, duplicate, selectNodes])

  const visible = useMemo(() => {
    let list = all.filter((n) => !hiddenNodes.includes(n.type) && (!board || onBoard(board, n.id)))
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
  }, [all, graph, board, hiddenNodes, storyScope])
  useLayoutEffect(() => { visibleRef.current = visible })

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
    const byId = new Map(all.map((n) => [n.id, n]))
    const refs = new Map<string, CardRef[]>()
    if (!referenceLines) for (const e of graph?.edges ?? []) {
      const target = byId.get(e.target)
      if (!isReferenceEdge(e.type) || hiddenEdges.includes(e.type) || !target) continue
      refs.set(e.source, [...(refs.get(e.source) ?? []), { edge: e.id, type: e.type, id: target.id, title: target.title, nodeType: target.type }])
    }
    const clues = clueCounts(graph?.edges ?? [])
    return visible.map((n) => ({
      id: n.id, type: 'card',
      position: board?.layout[n.id] ?? defaults.get(n.id)!,
      data: { node: n, emphasis: !focus.active || selectedNodeIds.includes(n.id) ? undefined : focus.neighbors.has(n.id) ? 'neighbor' : 'dimmed', refs: refs.get(n.id), clues: clues.get(n.id) },
      selected: selectedNodeIds.includes(n.id),
    }))
  }, [all, visible, graph, board, selectedNodeIds, focus, referenceLines, hiddenEdges])
  // Disk (via queries) owns positions and the zustand store owns selection; React Flow only reports
  // measurements and in-flight drags, kept here until the saved layout catches up.
  const [local, setLocal] = useState<Record<string, LocalNode>>({})
  // Drop settled drag positions once a new saved layout arrives (adjusting state during render, not in an effect).
  const [seenBoard, setSeenBoard] = useState(board)
  if (seenBoard !== board) {
    setSeenBoard(board)
    setLocal((previous) => {
    let changed = false
    const next: Record<string, LocalNode> = {}
    for (const [id, entry] of Object.entries(previous)) {
      const saved = board?.layout[id]
      const settled = !entry.dragging && entry.position && saved && saved.x === entry.position.x && saved.y === entry.position.y
      if (settled) { changed = true; next[id] = { measured: entry.measured } } else next[id] = entry
    }
    return changed ? next : previous
    })
  }
  const nodes = useMemo(() => flowNodes.map((node) => {
    const entry = local[node.id]
    return entry ? { ...node, position: entry.position ?? node.position, measured: entry.measured, dragging: entry.dragging } : node
  }), [flowNodes, local])
  const changeNodes = useCallback((changes: NodeChange<FlowNode<CardData>>[]) => {
    const geometry = changes.filter((change) => change.type === 'position' || change.type === 'dimensions')
    if (geometry.length) setLocal((previous) => {
      const next = { ...previous }
      for (const change of geometry) {
        const entry = { ...next[change.id] }
        if (change.type === 'position') {
          if (change.position) entry.position = change.position
          entry.dragging = change.dragging
        } else if (change.dimensions) entry.measured = change.dimensions
        next[change.id] = entry
      }
      return next
    })
    const selections = changes.filter((change) => change.type === 'select')
    if (!selections.length) return
    const previous = useUI.getState().selectedNodeIds
    const ids = new Set(previous)
    for (const change of selections) {
      if (change.selected) ids.add(change.id)
      else ids.delete(change.id)
    }
    if (ids.size !== previous.length || previous.some((id) => !ids.has(id))) selectNodes([...ids])
  }, [selectNodes])
  const fitted = useRef<string | null>(null)
  useEffect(() => {
    if (board && fitted.current !== board.id && flowNodes.length) {
      fitted.current = board.id
      setLocal({})
      requestAnimationFrame(() => void flow.fitView({ padding: 0.15, maxZoom: 1 }))
    }
  }, [flowNodes, flow, board])

  const edges = useMemo<FloatingFlowEdge[]>(() => {
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
    const out: FloatingFlowEdge[] = []
    if (!hiddenEdges.includes('contains')) for (const n of visible) {
      if (n.parent && ids.has(n.parent)) out.push({ id: `contains:${n.id}`, type: 'floating', source: n.parent, target: n.id, selectable: false, focusable: false, data: { color: EDGE_STYLE.contains.color }, ...style('contains', `contains:${n.id}`) })
    }
    // Reference edges are chips on the card; they only become lines for focused cards (or when switched on).
    const shown = (graph?.edges ?? []).filter((e) => !hiddenEdges.includes(e.type) && ids.has(e.source) && ids.has(e.target)
      && (referenceLines || !isReferenceEdge(e.type) || focus.roots.has(e.source) || focus.roots.has(e.target)))
    const labelShown = (id: string, source: string, target: string) => edgeLabels === 'always' || (focus.active && focus.lines.has(id))
      || hovered.edge === id || hovered.node === source || hovered.node === target
    // Spread every line between the same two cards so A→B and B→A (or two types) stay readable.
    const pairs = new Map<string, string[]>()
    for (const e of shown) {
      const key = [e.source, e.target].toSorted().join('\0')
      pairs.set(key, [...(pairs.get(key) ?? []), e.id])
    }
    for (const e of shown) {
      const group = pairs.get([e.source, e.target].toSorted().join('\0'))!
      const lane = (group.indexOf(e.id) - (group.length - 1) / 2) * 14
      // The offset is perpendicular to source→target, so flip it for reversed edges to keep lanes apart.
      const offset = e.source < e.target ? lane : -lane
      out.push({ id: e.id, type: 'floating', source: e.source, target: e.target,
        label: e.label ?? (e.type === 'link' ? undefined : e.type), data: { color: EDGE_STYLE[e.type].color, offset, hideLabel: !labelShown(e.id, e.source, e.target) }, ...style(e.type, e.id) })
    }
    return out
  }, [visible, graph, hiddenEdges, selection, focus, referenceLines, edgeLabels, hovered])
  const connectionType = useCallback((c: Connection | FlowEdge) => {
    const source = flow.getNode(c.source)?.data as CardData | undefined
    const target = flow.getNode(c.target)?.data as CardData | undefined
    if (!source || !target) return null
    return connectType === 'auto' ? inferConnectionType(source.node.type, target.node.type) : connectType
  }, [flow, connectType])
  const isValidConnection = useCallback<IsValidConnection>((c) => {
    if (c.source === c.target) return false
    const type = connectionType(c)
    return !!type && !graph?.edges.some((e) => e.source === c.source && e.target === c.target && e.type === type)
  }, [connectionType, graph])
  const onConnect = useCallback((c: Connection) => {
    const type = connectionType(c)
    if (!type) return
    addEdge.mutate({ source: c.source, target: c.target, type })
    useUI.setState((state) => ({ hiddenEdges: state.hiddenEdges.filter((kind) => kind !== type) }))
  }, [connectionType, addEdge])
  const onEdgeClick = useCallback((_: unknown, edge: FlowEdge) => { if (edge.selectable !== false) select({ kind: 'edge', id: edge.id }) }, [select])
  const onPaneClick = useCallback(() => select(null), [select])
  const onNodeDragStop = useCallback((_: unknown, __: unknown, dragged: FlowNode[]) => {
    setLayout.mutate([Object.fromEntries(dragged.map((n) => [n.id, n.position])), currentBoardId()])
  }, [setLayout])
  const error = createError ?? undo.error ?? redo.error ?? history.error ?? setLayout.error ?? addEdge.error ?? duplicate.error

  return (
    <div ref={workspace} className="canvas-workspace h-full w-full outline-none" tabIndex={0} aria-label="Story canvas" aria-keyshortcuts="A" onPointerMove={(event) => {
      pointer.current = { x: event.clientX, y: event.clientY }
    }} onPointerLeave={() => { pointer.current = null }} onKeyDown={(event) => {
      if (event.target !== event.currentTarget || event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'a') return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      openAddMenu(pointer.current ?? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
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
        connectionMode={ConnectionMode.Loose} connectionLineComponent={FloatingConnectionLine}
        isValidConnection={isValidConnection} onConnect={onConnect}
        onEdgeClick={onEdgeClick} onPaneClick={onPaneClick}
        onEdgeMouseEnter={(_, edge) => setHovered({ edge: edge.id })} onEdgeMouseLeave={() => setHovered({})}
        onNodeMouseEnter={(_, node) => setHovered({ node: node.id })} onNodeMouseLeave={() => setHovered({})}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          openAddMenu({ x: event.clientX, y: event.clientY })
        }}
        onNodeDragStop={onNodeDragStop}
        selectionOnDrag selectionMode={SelectionMode.Partial} multiSelectionKeyCode={['Control', 'Meta', 'Shift']}
        selectionKeyCode={null} panOnDrag={[1]} deleteKeyCode={null}
        minZoom={0.1} proOptions={{ hideAttribution: true }} colorMode="dark">
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#292524" />
        {board && <PhaseLanes board={board} />}
        <Controls position="bottom-left" className="!overflow-hidden !rounded-lg !border !border-stone-600 !shadow-xl" />
        <MiniMap position="bottom-right" pannable zoomable ariaLabel="Graph overview — drag to pan, scroll to zoom"
          nodeColor={(n) => { const data = n.data as CardData; return NODE_STYLE[data.node.type].color }}
          nodeStrokeColor="#fafaf9" nodeStrokeWidth={2} nodeBorderRadius={3}
          bgColor="#292524" maskColor="rgb(0 0 0 / 0.6)" maskStrokeColor="#fbbf24" maskStrokeWidth={3}
          style={{ border: '1px solid #57534e', borderRadius: 8 }} />
        <Panel position="top-left" className="canvas-toolbar"><Toolbar canUndo={!!history.data?.canUndo && !historyBusy} canRedo={!!history.data?.canRedo && !historyBusy} travel={travel} openAddMenu={(point) => setAddMenu(point)} /></Panel>
        <Panel position="top-right" className="canvas-modes"><FilterPanel /></Panel>
        <Panel position="bottom-center"><div className="rounded-md border border-stone-800 bg-stone-950/90 px-3 py-1.5 text-[11px] text-stone-400">A / right-click blank space to add · Drag blank space to select · Shift / Ctrl / ⌘ to add · Ctrl+A/C/V select all, copy, paste · Middle drag to pan</div>{error && <div role="alert" className="mt-1 max-w-lg rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error.message}</div>}</Panel>
      </ReactFlow>
      {addMenu && <AddNodeMenu point={addMenu} close={closeAddMenu} create={(type) => { void spawnNode(type) }}
        board={board} nodes={all} place={(id) => {
          const position = addMenu.position
          closeAddMenu()
          if (board && position) setLayout.mutate([{ [id]: position }, board.id])
        }} />}
    </div>
  )
}

function AddNodeMenu({ point, close, create, board, nodes, place }: {
  point: { x: number; y: number }; close: () => void; create: (type: NodeType) => void
  board?: Board; nodes: StoryNode[]; place: (id: string) => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const curated = !!board?.nodes
  const missing = curated ? nodes.filter((n) => !onBoard(board!, n.id) && n.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : []
  useLayoutEffect(() => {
    const element = menu.current!
    const rect = element.getBoundingClientRect()
    element.style.left = `${Math.max(8, Math.min(point.x, window.innerWidth - rect.width - 8))}px`
    element.style.top = `${Math.max(8, Math.min(point.y, window.innerHeight - rect.height - 8))}px`
    element.querySelector('button')?.focus({ preventScroll: true })
  }, [point])
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close()
    }
    window.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('resize', close)
    }
  }, [close])
  return <div ref={menu} role="menu" aria-label="Add node" className="fixed z-50 max-h-[calc(100vh-16px)] w-56 overflow-y-auto rounded-lg border border-stone-700 bg-stone-900 p-1 text-sm shadow-2xl" style={{ left: point.x, top: point.y }}
    onContextMenu={(event) => event.preventDefault()} onKeyDown={(event) => {
      const buttons = Array.from(event.currentTarget.querySelectorAll('button'))
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (event.target instanceof HTMLInputElement && event.key !== 'Escape' && event.key !== 'ArrowDown') return
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault()
        close()
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }
    }}>
    {NODE_TYPES.filter((type) => type !== 'media').map((type) => {
      const style = NODE_STYLE[type]
      return <button key={type} role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-stone-800 focus:bg-stone-800 focus:outline-none" onClick={() => create(type)}><style.icon size={14} style={{ color: style.color }} /> {style.label}</button>
    })}
    <div className="px-2 py-1.5 text-[11px] text-stone-500">Drop images or videos to add media.</div>
    {curated && <div className="border-t border-stone-800 pt-1">
      <input aria-label="Find an existing node to place on this board" placeholder="Place existing…" value={query} onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded bg-stone-800 px-2 py-1 text-xs text-stone-100 outline-none placeholder:text-stone-500" />
      {missing.map((n) => {
        const style = NODE_STYLE[n.type]
        return <button key={n.id} role="menuitem" className="flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left text-xs hover:bg-stone-800 focus:bg-stone-800 focus:outline-none" onClick={() => place(n.id)}><style.icon size={12} className="shrink-0" style={{ color: style.color }} /><span className="truncate">{n.title}</span></button>
      })}
    </div>}
  </div>
}

/** Phase columns drawn in flow coordinates behind the cards; a card's phase is the column it sits in. */
function PhaseLanes({ board }: { board: Board }) {
  if (!board.phases.length) return null
  const ys = Object.values(board.layout).map((p) => p.y)
  const top = (ys.length ? Math.min(...ys) : 0) - 120
  const height = Math.max(1600, (ys.length ? Math.max(...ys) : 0) - top + 600)
  return <ViewportPortal>
    {board.phases.map((phase, i) => (
      <div key={phase.id} className="pointer-events-none absolute border-r border-dashed border-stone-700/70"
        style={{ transform: `translate(${i * PHASE_WIDTH}px, ${top}px)`, width: PHASE_WIDTH, height, background: i % 2 ? 'rgb(41 37 36 / 0.25)' : 'rgb(41 37 36 / 0.1)', zIndex: -1 }}>
        <div className="px-4 py-3 font-serif text-2xl text-stone-500">{i + 1}. {phase.title}</div>
      </div>
    ))}
  </ViewportPortal>
}

/** Dagre supplies ranks; deterministic obstacle placement preserves pinned rectangles. */
function useAutoLayout() {
  const flow = useReactFlow<FlowNode<CardData>>()
  const setLayout = useAction(api.setLayout)
  const board = useBoard()
  const [error, setError] = useState<Error | null>(null)
  const run = async () => {
    setError(null)
    try {
    const nodes = flow.getNodes()
    const g = new dagre.graphlib.Graph().setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 120 }).setDefaultEdgeLabel(() => ({}))
    for (const n of nodes) g.setNode(n.id, cardSize(n))
    for (const e of flow.getEdges()) g.setEdge(e.source, e.target)
    dagre.layout(g)
    const occupied = nodes.filter((n) => n.data.node.pinned).map((n) => ({ ...n.position, ...cardSize(n) }))
    const positions: Record<string, { x: number; y: number }> = {}
    const movable = nodes.filter((n) => !n.data.node.pinned).toSorted((a, b) => {
      const left = g.node(a.id); const right = g.node(b.id)
      return left.x - right.x || left.y - right.y || a.id.localeCompare(b.id)
    })
    for (const n of movable) {
      const layout = g.node(n.id)
      const rect = { x: layout.x - layout.width / 2, y: layout.y - layout.height / 2, ...cardSize(n) }
      for (;;) {
        const collisions = occupied.filter((o) => rect.x < o.x + o.width + 40 && rect.x + rect.width + 40 > o.x && rect.y < o.y + o.height + 40 && rect.y + rect.height + 40 > o.y)
        if (!collisions.length) break
        rect.y = Math.max(...collisions.map((o) => o.y + o.height + 40))
      }
      occupied.push(rect)
      positions[n.id] = { x: rect.x, y: rect.y }
    }
    if (board?.phases.length) {
      // Keep every card in its phase column; arrange each column in two lanes, in dagre order.
      const columns = new Map<number, FlowNode<CardData>[]>()
      for (const n of movable) {
        const i = phaseIndex(board, n.position.x)
        const column = i >= 0 ? i : n.position.x < 0 ? 0 : board.phases.length - 1
        columns.set(column, [...(columns.get(column) ?? []), n])
      }
      for (const [column, list] of columns) {
        list.sort((a, b) => g.node(a.id).y - g.node(b.id).y || a.id.localeCompare(b.id))
        list.forEach((n, k) => { positions[n.id] = { x: column * PHASE_WIDTH + 40 + (k % 2) * 250, y: Math.floor(k / 2) * 220 } })
      }
    }
    for (const n of nodes) if (n.data.node.pinned) positions[n.id] = { ...n.position }
    if (nodes.length) await setLayout.mutateAsync([positions, board?.id])
    requestAnimationFrame(() => void flow.fitView({ padding: 0.15, maxZoom: 1, duration: 400 }))
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }
  return { run, pending: setLayout.isPending, error }
}

function Toolbar({ canUndo, canRedo, travel, openAddMenu }: { canUndo: boolean; canRedo: boolean; travel: (direction: 'undo' | 'redo') => void; openAddMenu: (point: { x: number; y: number }) => void }) {
  const autoLayout = useAutoLayout()
  const { data: all = [] } = useNodes()
  const { storyScope, setStoryScope } = useUI()
  const button = 'rounded p-1.5 text-stone-400 hover:bg-stone-800 hover:text-stone-100 disabled:cursor-not-allowed disabled:opacity-30'
  return <div className="space-y-1.5">
    <BoardBar />
    <div className="flex w-fit flex-wrap items-center gap-1.5 rounded-lg border border-stone-700/80 bg-stone-900/95 p-1.5 text-sm shadow-xl backdrop-blur">
      <div className="relative">
        <button aria-haspopup="menu" title="Add node (A or right-click canvas)" className="flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 font-medium text-stone-950 hover:bg-amber-400" onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          openAddMenu({ x: rect.left, y: rect.bottom + 8 })
        }}><Plus size={15} /> Add</button>
      </div>
      <div className="mx-1 h-5 w-px bg-stone-700" />
      <button aria-label="Undo" aria-keyshortcuts="Control+Z Meta+Z" title="Undo (Ctrl / ⌘ Z)" disabled={!canUndo} className={button} onClick={() => travel('undo')}><Undo2 size={16} /></button>
      <button aria-label="Redo" aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z" title="Redo (Ctrl Y / Ctrl or ⌘ Shift Z)" disabled={!canRedo} className={button} onClick={() => travel('redo')}><Redo2 size={16} /></button>
      <button aria-label="Auto-layout unpinned nodes" title="Arrange visible nodes around pinned cards" disabled={autoLayout.pending} className={button} onClick={() => { void autoLayout.run() }}><LayoutGrid size={16} /></button>
      <select aria-label="Story scope" className="max-w-40 rounded bg-stone-800 px-1.5 py-1 text-xs text-stone-200 outline-amber-400" value={storyScope ?? ''} onChange={(e) => setStoryScope(e.target.value || null)}><option value="">All stories</option>{all.filter((n) => n.type === 'story').map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
    </div>
    {autoLayout.error && <div role="alert" className="mt-2 max-w-sm rounded bg-red-950 p-2 text-xs text-red-200">{autoLayout.error.message}</div>}
  </div>
}

function FilterPanel() {
  const { hiddenEdges, hiddenNodes, toggleEdge, toggleNode, connectType, setConnectType, edgeLabels, referenceLines } = useUI()
  const [advanced, setAdvanced] = useState(false)
  const connectionDescription = connectType === 'auto' ? 'Choose a type from the source and target cards. Ambiguous pairs use a free link; hierarchy is unchanged.' : EDGE_DESCRIPTIONS[connectType]
  const kinds: EdgeKind[] = ['contains', ...EDGE_TYPES]
  const current = MODES.findIndex((mode) => NODE_TYPES.every((t) => hiddenNodes.includes(t) === !mode.nodes.includes(t)) && kinds.every((t) => hiddenEdges.includes(t) === !mode.edges.includes(t)))
  const mode = (index: number) => {
    const preset = MODES[index]
    useUI.setState({ hiddenNodes: NODE_TYPES.filter((t) => !preset.nodes.includes(t)), hiddenEdges: kinds.filter((t) => !preset.edges.includes(t)) })
  }
  return <div className="w-60 rounded-lg border border-stone-700/80 bg-stone-900/95 text-sm shadow-xl backdrop-blur">
    <div className="space-y-2 p-2.5">
      <div className="space-y-1.5">
        <span className="text-xs text-stone-400">View</span>
        <div role="group" aria-label="Graph view mode" className="flex overflow-hidden rounded-md border border-stone-700">
          {MODES.map((m, i) => <button key={m.label} aria-pressed={current === i} onClick={() => mode(i)} className={clsx('flex-1 border-r border-stone-700 px-2 py-1.5 text-xs last:border-r-0 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400', current === i ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-300 hover:bg-stone-700')}>{m.label}</button>)}
        </div>
      </div>
      <div className="space-y-1 text-xs text-stone-300">
        <label className="flex items-center justify-between gap-2" title="Names of lines appear when you hover or select a card or line">
          Line names
          <select aria-label="When to show line names" className="rounded bg-stone-800 px-1 py-0.5" value={edgeLabels} onChange={(e) => useUI.setState({ edgeLabels: e.target.value as 'focus' | 'always' })}>
            <option value="focus">On hover / focus</option><option value="always">Always</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2" title="involves, located-at, member-of and owns: as chips on the card, or as lines">
          References
          <select aria-label="How to show references" className="rounded bg-stone-800 px-1 py-0.5" value={referenceLines ? 'lines' : 'chips'} onChange={(e) => useUI.setState({ referenceLines: e.target.value === 'lines' })}>
            <option value="chips">Chips on cards</option><option value="lines">Lines</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] leading-relaxed text-stone-500">Drag from a card's edge dot and drop anywhere on another card to connect. Pin cards to keep their place when arranging.</p>
      <div className="flex items-center justify-between text-[11px]"><span className="text-stone-400">New lines: <span className="text-amber-300">{connectType === 'auto' ? 'Auto' : connectType}</span></span><button aria-expanded={advanced} className="flex items-center gap-1 text-stone-300 hover:text-amber-300" onClick={() => setAdvanced(!advanced)}>Advanced <ChevronDown size={12} className={advanced ? 'rotate-180' : ''} /></button></div>
    </div>
    {advanced && <div className="max-h-[65vh] space-y-3 overflow-y-auto border-t border-stone-800 p-2.5">
      <label className="flex items-center justify-between gap-1 text-xs text-stone-400" title={connectionDescription}>Connect as<select aria-label="New connection type" className="rounded bg-stone-800 px-1 py-1 text-stone-100" value={connectType} onChange={(e) => setConnectType(e.target.value as EdgeType | 'auto')}><option value="auto">Auto</option>{EDGE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <p className="text-[11px] text-stone-500">{connectionDescription}</p>
      <div><div className="pb-1 text-[10px] tracking-wider text-stone-500 uppercase">Connections / legend</div>{kinds.map((k) => { const s = EDGE_STYLE[k]; return <button key={k} aria-pressed={!hiddenEdges.includes(k)} title={k === 'contains' ? 'Story → chapter → scene hierarchy' : EDGE_DESCRIPTIONS[k]} onClick={(event) => { if (event.shiftKey || event.ctrlKey || event.metaKey) useUI.setState({ hiddenEdges: kinds.filter((kind) => kind !== k) }); else toggleEdge(k) }} className={clsx('flex w-full items-center gap-2 rounded px-1 py-1 text-xs hover:bg-stone-800', hiddenEdges.includes(k) && 'opacity-35')}><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke={s.color} strokeWidth={s.width ?? 1.5} strokeDasharray={s.dash} /></svg>{k}</button> })}</div>
      <div><div className="pb-1 text-[10px] tracking-wider text-stone-500 uppercase">Nodes</div>{NODE_TYPES.map((t) => { const S = NODE_STYLE[t]; return <button key={t} aria-pressed={!hiddenNodes.includes(t)} onClick={(event) => { if (event.shiftKey || event.ctrlKey || event.metaKey) useUI.setState({ hiddenNodes: NODE_TYPES.filter((type) => type !== t) }); else toggleNode(t) }} className={clsx('flex w-full items-center gap-2 rounded px-1 py-1 text-xs hover:bg-stone-800', hiddenNodes.includes(t) && 'opacity-35')}><S.icon size={13} style={{ color: S.color }} />{S.plural}</button> })}</div>
      <p className="text-[11px] text-stone-500">Shift / Ctrl / ⌘ click a legend item to show only that type.</p>
      <p className="text-[11px] text-stone-500">Selected cards glow amber; neighbors have a soft outline. Unrelated cards and lines fade.</p>
    </div>}
  </div>
}

/** Board switcher plus create / rename / delete and phase-column editing. */
function BoardBar() {
  const { data: graph } = useGraph()
  const board = useBoard()
  const setBoard = useUI((s) => s.setBoard)
  const create = useAction(api.createBoard)
  const update = useAction(api.updateBoard)
  const remove = useAction(api.deleteBoard)
  const [editing, setEditing] = useState<'new' | 'rename' | null>(null)
  const [title, setTitle] = useState('')
  const [phasesOpen, setPhasesOpen] = useState(false)
  if (!graph || !board) return null
  const button = 'rounded p-1 text-stone-400 hover:bg-stone-800 hover:text-stone-100'
  const submit = async () => {
    const value = title.trim()
    setEditing(null)
    if (!value) return
    if (editing === 'new') setBoard((await create.mutateAsync([{ title: value }])).id)
    else update.mutate([board.id, { title: value }])
  }
  const error = create.error ?? update.error ?? remove.error
  return <div className="w-fit rounded-lg border border-stone-700/80 bg-stone-900/95 p-1 text-sm shadow-xl backdrop-blur">
    <div className="flex items-center gap-1">
      <div role="tablist" aria-label="Boards" className="flex max-w-[50vw] items-center gap-0.5 overflow-x-auto">
        {graph.boards.map((b) => (
          <button key={b.id} role="tab" aria-selected={b.id === board.id} onClick={() => setBoard(b.id)}
            title={b.nodes ? `${b.nodes.length} cards` : 'Every node in the project'}
            className={clsx('shrink-0 rounded px-2 py-1 text-xs', b.id === board.id ? 'bg-stone-700 text-stone-50' : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100')}>
            {b.title}
          </button>
        ))}
      </div>
      {editing
        ? <form className="flex" onSubmit={(e) => { e.preventDefault(); void submit() }}>
            <input autoFocus aria-label={editing === 'new' ? 'New board name' : 'Board name'} value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void submit()} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null) }}
              placeholder="Board name" className="w-32 rounded bg-stone-800 px-1.5 py-0.5 text-xs text-stone-100 outline-amber-400" />
          </form>
        : <>
            <button aria-label="New board" title="New board (starts empty; place cards with A → Place existing)" className={button} onClick={() => { setTitle(''); setEditing('new') }}><Plus size={14} /></button>
            <button aria-label="Rename board" title="Rename board" className={button} onClick={() => { setTitle(board.title); setEditing('rename') }}><Pencil size={13} /></button>
          </>}
      <button aria-label="Phase columns" aria-expanded={phasesOpen} title="Phase columns (acts, left to right)" className={clsx(button, board.phases.length && 'text-amber-300')} onClick={() => setPhasesOpen(!phasesOpen)}><Columns3 size={14} /></button>
      {board.id !== MAIN_BOARD && <button aria-label="Delete board" title="Delete board (cards stay in the project)" className={clsx(button, 'hover:text-red-400')}
        onClick={() => { setBoard(MAIN_BOARD); remove.mutate([board.id]) }}><Trash2 size={13} /></button>}
    </div>
    {phasesOpen && <PhaseEditor key={board.id} board={board} save={(phases) => update.mutate([board.id, { phases }])} />}
    {error && <div role="alert" className="mt-1 max-w-sm rounded bg-red-950 p-2 text-xs text-red-200">{error.message}</div>}
  </div>
}

function PhaseEditor({ board, save }: { board: Board; save: (phases: Board['phases']) => void }) {
  const [phases, setPhases] = useState(board.phases)
  const commit = (next: Board['phases']) => { setPhases(next); save(next.filter((p) => p.title.trim())) }
  return <div className="mt-1 w-64 space-y-1 border-t border-stone-800 p-1.5 text-xs">
    <p className="text-[11px] text-stone-500">Columns left to right. A card belongs to the phase it sits in; move it to change phase.</p>
    {phases.map((p, i) => (
      <div key={p.id} className="flex items-center gap-1">
        <span className="w-4 text-stone-500">{i + 1}.</span>
        <input aria-label={`Phase ${i + 1}`} value={p.title} onChange={(e) => setPhases(phases.map((x) => (x.id === p.id ? { ...x, title: e.target.value } : x)))}
          onBlur={() => commit(phases)} className="min-w-0 flex-1 rounded bg-stone-800 px-1.5 py-0.5 text-stone-100 outline-amber-400" />
        <button aria-label={`Remove phase ${p.title}`} className="text-stone-500 hover:text-red-400" onClick={() => commit(phases.filter((x) => x.id !== p.id))}><X size={12} /></button>
      </div>
    ))}
    <button className="text-amber-300 hover:text-amber-200" onClick={() => commit([...phases, { id: crypto.randomUUID().slice(0, 8), title: `Phase ${phases.length + 1}` }])}>+ Add phase</button>
  </div>
}
