import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  Panel,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Edge as FlowEdge,
  type EdgeMouseHandler,
  type IsValidConnection,
  type Node as FlowNode,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ALL_BOARD,
  CARD_SIZE,
  GROUP_HEADER,
  GROUP_PAD,
  bounds,
  clueCounts,
  groupAt,
  groupContent,
  groupDepth,
  groupOf,
  groupSubtree,
  isReferenceEdge,
  onBoard,
  entityOf,
  freeRefKey,
  type Board,
  type EdgeType,
  type Graph,
  type NodeType,
  type Position,
  type Rect,
  type Size,
  type StoryNode,
  refsOf,
} from '@maquest/core/schema'
import { useShallow } from 'zustand/react/shallow'
import { api } from '../lib/api'
import { NODE_DRAG_TYPE, importFiles, useCreateNode } from '../lib/actions'
import { currentBoardId, queryClient, useAction, useBoard, useGraph, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { isEditingTarget as isEditing, useDeleteEverywhere, useRemoveFromBoard } from '../lib/deletion'
import { EDGE_STYLE, useTypes, type EdgeKind } from '../lib/styles'
import { inferConnectionType } from '../lib/connections'
import { StoryCard, type CardData, type CardRef } from './StoryCard'
import { FloatingConnectionLine, FloatingEdge, type FloatingFlowEdge } from './FloatingEdge'
import { GroupFrame, type GroupFlowNode } from './GroupFrame'
import { CanvasToolbar } from './canvas/CanvasToolbar'
import { CanvasControls, CanvasMinimap } from './canvas/CanvasControls'
import { ViewMenu } from './canvas/ViewMenu'
import { AddNodeMenu, NodeMenu } from './canvas/menus'
import { PhaseLanes } from './canvas/PhaseLanes'
import { hoverEdge, hoverNode } from './canvas/hover'
import { FIT_VIEW, cardSize, isCard, type AnyFlowNode, type CardFlowNode } from './canvas/shared'

const nodeTypes = { card: StoryCard, frame: GroupFrame }
const edgeTypes = { floating: FloatingEdge }
const NONE: StoryNode[] = []
/** Selected lines and arrowheads use the brand accent. */
const SELECTED = '#f88a3d'
const onEdgeEnter: EdgeMouseHandler = (_, edge) => hoverEdge(edge.id)
const onEdgeLeave: EdgeMouseHandler = () => hoverEdge(null)
const onNodeEnter: NodeMouseHandler = (_, node) => hoverNode(node.id)
const onNodeLeave: NodeMouseHandler = () => hoverNode(null)

function defaultPosition(column: number, index: number) {
  return { x: Math.max(0, column) * 300, y: index * 180 }
}

function descendants(nodes: StoryNode[], root: string) {
  const ids = new Set([root])
  let grew = true
  while (grew) {
    grew = false
    for (const n of nodes)
      if (n.parent && ids.has(n.parent) && !ids.has(n.id)) {
        ids.add(n.id)
        grew = true
      }
  }
  return ids
}

type LocalNode = { position?: { x: number; y: number }; measured?: { width: number; height: number }; dragging?: boolean; size?: Size }
/** Flow id of a group frame; card ids are node ids. */
const GROUP_PREFIX = 'group:'
const groupKey = (id: string) => GROUP_PREFIX + id
const groupIdOf = (flowId: string) => (flowId.startsWith(GROUP_PREFIX) ? flowId.slice(GROUP_PREFIX.length) : null)
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
    onError: (_error, _edge, context) => {
      if (context?.previous) queryClient.setQueryData(['graph'], context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' }),
  })
}

/** In-app node clipboard of references: pasting places the same entities on the shown board, never copies them. */
let clipboard: { ids: string[]; board: string; pastes: number } | null = null
/** Separates an edge id from the card keys of its extra copies (when a node has several cards). */
const EDGE_REF = '@'

export function Canvas() {
  const { data: all = NONE } = useNodes()
  const { data: graph } = useGraph()
  const { selection, selectedNodeIds, hiddenEdges, hiddenNodes, storyScope, connectType, edgeLabels, referenceLines } = useUI(
    useShallow((s) => ({
      selection: s.selection,
      selectedNodeIds: s.selectedNodeIds,
      hiddenEdges: s.hiddenEdges,
      hiddenNodes: s.hiddenNodes,
      storyScope: s.storyScope,
      connectType: s.connectType,
      edgeLabels: s.edgeLabels,
      referenceLines: s.referenceLines,
    })),
  )
  const select = useUI((s) => s.select)
  const selectNodes = useUI((s) => s.selectNodes)
  const minimap = useUI((s) => s.minimap)
  const board = useBoard()
  const types = useTypes()
  const typeIds = useMemo(() => types.list.map((t) => t.id), [types])
  const readOnly = board?.id === ALL_BOARD
  useEffect(() => {
    if (all === NONE) return
    const existing = new Set(all.map((node) => node.id))
    const remaining = selectedNodeIds.filter((id) => existing.has(entityOf(id)))
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
    if (readOnly) return
    setAddMenu({ ...point, position: flow.screenToFlowPosition(point) })
  }
  const spawnNode = async (type: NodeType) => {
    const position = addMenu?.position
    closeAddMenu()
    setCreateError(null)
    try {
      await create(type, { position, group: board && position ? groupAt(board, position)?.id : undefined })
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
  const place = useAction(api.placeNodes)
  const removeFromBoard = useRemoveFromBoard()
  const deleteEverywhere = useDeleteEverywhere()
  const copyRefs = useCallback((ids: string[]) => {
    clipboard = { ids, board: currentBoardId(), pastes: 0 }
  }, [])
  /** Places the copied entities on the shown board (offset on their own board, as-is on another one). */
  const paste = useCallback(
    (at?: Position) => {
      if (!clipboard) return
      const board = currentBoardId()
      const same = clipboard.board === board
      const step = same ? 40 * ++clipboard.pastes : 0
      const ids = clipboard.ids
      let offset = { x: step, y: step }
      if (at) {
        const source = queryClient.getQueryData<Graph>(['graph'])?.boards.find((b) => b.id === clipboard!.board)
        const origin = bounds(ids.flatMap((id) => (source?.layout[id] ? [{ ...source.layout[id], width: 0, height: 0 }] : [])))
        if (origin) offset = { x: at.x - origin.x, y: at.y - origin.y }
      }
      place
        .mutateAsync([ids, offset, board, clipboard.board])
        .then(async (keys) => {
          await queryClient.refetchQueries({ queryKey: ['graph'] })
          selectNodes(keys)
        })
        .catch(() => {
          /* Rendered below. */
        })
    },
    [place, selectNodes],
  )
  /** Copies the entities themselves (new files), placed beside the originals on the shown board. */
  const duplicateNodes = useCallback(
    (ids: string[]) => {
      // Refetch before selecting, or the stale-selection cleanup drops the new ids.
      duplicate
        .mutateAsync([ids, { x: 40, y: 40 }, currentBoardId()])
        .then(async (copies) => {
          await queryClient.refetchQueries({ queryKey: ['nodes'] })
          selectNodes(copies)
        })
        .catch(() => {
          /* Rendered below. */
        })
    },
    [duplicate, selectNodes],
  )
  const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null)
  const openNodeMenu = (event: { preventDefault: () => void; clientX: number; clientY: number }, id?: string) => {
    event.preventDefault()
    if (readOnly) return
    const selected = useUI.getState().selectedNodeIds
    const ids = id && !selected.includes(id) ? [id] : selected
    if (!ids.length) return
    if (id && !selected.includes(id)) selectNodes(ids)
    setAddMenu(null)
    setNodeMenu({ x: event.clientX, y: event.clientY, ids })
  }
  const closeNodeMenu = () => {
    setNodeMenu(null)
    workspace.current?.focus({ preventScroll: true })
  }
  const history = useQuery({ queryKey: ['history'], queryFn: () => api.history() })
  const historyBusy = undo.isPending || redo.isPending
  const historyQueue = useRef(Promise.resolve())
  const visibleRef = useRef<{ key: string; node: StoryNode }[]>([])
  const travel = useCallback(
    (direction: 'undo' | 'redo') => {
      // Queue rapid shortcuts; query refetches must not drop the next keystroke.
      historyQueue.current = historyQueue.current
        .then(async () => {
          await (direction === 'undo' ? undo : redo).mutateAsync([])
        })
        .catch(() => {
          /* Mutation errors are rendered below. */
        })
    },
    [undo, redo],
  )
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        useUI.getState().view !== 'canvas' ||
        (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor')) ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey
      )
        return
      const key = event.key.toLowerCase()
      if (key === 'a' && !event.shiftKey) {
        event.preventDefault()
        selectNodes(visibleRef.current.map((c) => c.key))
      } else if (key === 'c' && !event.shiftKey) {
        if (window.getSelection()?.toString()) return // Let native text copy win.
        const ids = useUI.getState().selectedNodeIds
        if (!ids.length) return
        event.preventDefault()
        copyRefs(ids)
      } else if (key === 'v' && !event.shiftKey) {
        if (!clipboard || event.repeat || currentBoardId() === ALL_BOARD) return
        event.preventDefault()
        paste()
      } else if (key === 'd' && !event.shiftKey) {
        const ids = useUI.getState().selectedNodeIds
        if (!ids.length || event.repeat || currentBoardId() === ALL_BOARD) return
        event.preventDefault()
        duplicateNodes(ids)
      } else if (key === 'z' || key === 'y') {
        event.preventDefault()
        travel(key === 'y' || event.shiftKey ? 'redo' : 'undo')
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [travel, copyRefs, paste, duplicateNodes, selectNodes])

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
  /** One card per board key; a node may be shown by several cards (references) on the same board. */
  const cards = useMemo(() => {
    if (!board) return visible.map((node) => ({ key: node.id, node }))
    const byId = new Map(visible.map((n) => [n.id, n]))
    return (board.nodes ?? []).flatMap((key) => {
      const node = byId.get(entityOf(key))
      return node ? [{ key, node }] : []
    })
  }, [visible, board])
  /** Card keys per node id. */
  const keysOf = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const c of cards) out.set(c.node.id, [...(out.get(c.node.id) ?? []), c.key])
    return out
  }, [cards])
  useLayoutEffect(() => {
    visibleRef.current = cards
  })

  const connections = useMemo(
    () => [
      ...visible.filter((n) => n.parent && !hiddenEdges.includes('contains')).map((n) => ({ id: `contains:${n.id}`, source: n.parent!, target: n.id })),
      ...(graph?.edges ?? []).filter((e) => !hiddenEdges.includes(e.type)),
    ],
    [visible, graph, hiddenEdges],
  )
  const focus = useMemo(() => {
    const roots = new Set(selectedNodeIds.map(entityOf))
    if (selection?.kind === 'edge') {
      const edge = connections.find((e) => e.id === selection.id)
      if (edge) {
        roots.add(edge.source)
        roots.add(edge.target)
      }
    }
    const neighbors = new Set(roots)
    const lines = new Set<string>()
    if (selection?.kind === 'edge') {
      lines.add(selection.id)
    } else {
      for (const e of connections)
        if (roots.has(e.source) || roots.has(e.target)) {
          neighbors.add(e.source)
          neighbors.add(e.target)
          lines.add(e.id)
        }
    }
    return { roots, neighbors, lines, active: roots.size > 0 }
  }, [selectedNodeIds, selection, connections])

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const updateGroup = useAction(api.updateGroup)
  const deleteGroup = useAction(api.deleteGroup)
  const createGroup = useAction(api.createGroup)
  const flowNodes = useMemo<CardFlowNode[]>(() => {
    const counters: Record<string, number> = {}
    const defaults = new Map<string, { x: number; y: number }>()
    for (const n of all) defaults.set(n.id, defaultPosition(typeIds.indexOf(n.type), (counters[n.type] = (counters[n.type] ?? -1) + 1)))
    const byId = new Map(all.map((n) => [n.id, n]))
    const refs = new Map<string, CardRef[]>()
    if (!referenceLines)
      for (const e of graph?.edges ?? []) {
        const target = byId.get(e.target)
        if (!isReferenceEdge(e.type) || hiddenEdges.includes(e.type) || !target) continue
        refs.set(e.source, [...(refs.get(e.source) ?? []), { edge: e.id, type: e.type, id: target.id, title: target.title, nodeType: target.type }])
      }
    const clues = clueCounts(graph?.edges ?? [])
    return cards.map(({ key, node: n }) => ({
      id: key,
      type: 'card',
      position: board?.layout[key] ?? defaults.get(n.id)!,
      data: {
        node: n,
        emphasis: !focus.active || selectedNodeIds.includes(key) ? undefined : focus.neighbors.has(n.id) ? 'neighbor' : 'dimmed',
        refs: refs.get(n.id),
        clues: clues.get(n.id),
      },
      selected: selectedNodeIds.includes(key),
    }))
  }, [all, cards, graph, board, selectedNodeIds, focus, referenceLines, hiddenEdges, typeIds])
  // Disk (via queries) owns positions and the zustand store owns selection; React Flow only reports
  // measurements and in-flight drags, kept here until the saved layout catches up.
  const [local, setLocal] = useState<Record<string, LocalNode>>({})
  const localRef = useRef(local)
  const boardRef = useRef(board)
  useLayoutEffect(() => {
    localRef.current = local
    boardRef.current = board
  })
  /** Rendered card sizes, so the main process fits groups around what is actually on screen. */
  const measuredSizes = useCallback(() => {
    const out: Record<string, Size> = {}
    for (const [id, entry] of Object.entries(localRef.current)) if (entry.measured && !groupIdOf(id)) out[id] = entry.measured
    return out
  }, [])
  /**
   * Once no save is in flight, the saved layout is authoritative: drop every settled position and size, so later
   * changes (auto layout, agents, undo) show up even where the save landed slightly off (groups are refitted, carried
   * cards accumulate rounding).
   */
  const saving = useRef(0)
  const releaseLayout = useCallback(() => {
    if (saving.current) return
    setLocal((previous) => {
      const next: Record<string, LocalNode> = {}
      for (const [id, entry] of Object.entries(previous)) {
        if (entry.dragging) next[id] = entry
        else if (entry.measured && !groupIdOf(id)) next[id] = { measured: entry.measured }
      }
      return next
    })
  }, [])
  const saveLayout = useCallback(
    async (...args: Parameters<typeof api.setLayout>) => {
      saving.current++
      try {
        await setLayout.mutateAsync(args)
      } finally {
        saving.current--
        releaseLayout()
      }
    },
    [setLayout, releaseLayout],
  )
  // Rendered card sizes keyed by value, so group frames only recompute when a card's size actually changes.
  const sizeKey = Object.entries(local)
    .flatMap(([id, entry]) => (entry.measured && !groupIdOf(id) ? [`${id}\0${entry.measured.width}\0${entry.measured.height}`] : []))
    .join('\n')
  const sizes = useMemo(
    () =>
      Object.fromEntries(
        sizeKey
          .split('\n')
          .filter(Boolean)
          .map((line): [string, Size] => {
            const [id, width, height] = line.split('\0')
            return [id, { width: Number(width), height: Number(height) }]
          }),
      ),
    [sizeKey],
  )
  const groupNodes = useMemo<GroupFlowNode[]>(() => {
    if (!board) return []
    return board.groups
      .map((g) => ({ g, depth: groupDepth(board, g.id) }))
      .toSorted((a, b) => a.depth - b.depth)
      .map(({ g, depth }) => {
        const content = groupContent(board, g.id, (id) => sizes[id] ?? CARD_SIZE)
        return {
          id: groupKey(g.id),
          type: 'frame' as const,
          position: { x: g.x, y: g.y },
          width: g.width,
          height: g.height,
          // The resizer starts from measured dimensions, even for explicitly sized nodes.
          measured: { width: g.width, height: g.height },
          dragHandle: '.group-handle',
          className: 'group-node',
          // Below every card, even when selected (selection adds 1000).
          zIndex: -2000 + depth,
          selected: selectedGroup === g.id,
          data: {
            group: g,
            content,
            count: g.nodes.length + board.groups.filter((x) => x.parent === g.id).length,
            select: () => {
              setSelectedGroup(g.id)
              selectNodes([])
              select(null)
            },
            rename: (title: string) => updateGroup.mutate([board.id, g.id, { title }]),
            recolor: (color) => updateGroup.mutate([board.id, g.id, { color }]),
            ungroup: () => {
              setSelectedGroup(null)
              deleteGroup.mutate([board.id, g.id])
            },
            resized: (rect: Rect) => void saveLayout({}, board.id, { groups: { [g.id]: rect }, sizes: measuredSizes() }),
          },
        }
      })
  }, [board, sizes, selectedGroup, select, selectNodes, updateGroup, deleteGroup, saveLayout, measuredSizes])
  // Drop settled drag positions once a new saved layout arrives (adjusting state during render, not in an effect).
  const [seenBoard, setSeenBoard] = useState(board)
  if (seenBoard !== board) {
    setSeenBoard(board)
    setLocal((previous) => {
      let changed = false
      const next: Record<string, LocalNode> = {}
      for (const [id, entry] of Object.entries(previous)) {
        if (groupIdOf(id)) {
          next[id] = entry
          continue
        }
        const saved = board?.layout[id]
        const settled = !entry.dragging && entry.position && saved && saved.x === entry.position.x && saved.y === entry.position.y
        if (settled) {
          changed = true
          next[id] = { measured: entry.measured }
        } else next[id] = entry
      }
      return changed ? next : previous
    })
  }
  /** Positions on the read-only All canvas: one column per node type, cards stacked by their rendered height. */
  const allLayout = useMemo(() => {
    if (!readOnly) return null
    const out = new Map<string, Position>()
    const columns = [...new Set([...typeIds, ...cards.map((c) => c.node.type)])].filter((t) => cards.some((c) => c.node.type === t))
    for (const [col, type] of columns.entries()) {
      let y = 0
      for (const c of cards.filter((card) => card.node.type === type)) {
        out.set(c.key, { x: col * (288 + 64), y })
        y += (sizes[c.key]?.height ?? CARD_SIZE.height) + 32
      }
    }
    return out
  }, [readOnly, cards, sizes, typeIds])
  const nodes = useMemo<AnyFlowNode[]>(
    () => [
      ...groupNodes.map((node) => {
        const entry = local[node.id]
        return entry
          ? {
              ...node,
              position: entry.position ?? node.position,
              width: entry.size?.width ?? node.width,
              height: entry.size?.height ?? node.height,
              measured: entry.size ?? entry.measured ?? node.measured,
            }
          : node
      }),
      ...flowNodes.map((node) => {
        const entry = local[node.id]
        const fixed = allLayout?.get(node.id)
        if (fixed) return { ...node, position: fixed, measured: entry?.measured }
        return entry ? { ...node, position: entry.position ?? node.position, measured: entry.measured, dragging: entry.dragging } : node
      }),
    ],
    [groupNodes, flowNodes, local, allLayout],
  )
  const changeNodes = useCallback(
    (changes: NodeChange<AnyFlowNode>[]) => {
      const geometry = changes.filter((change) => change.type === 'position' || change.type === 'dimensions')
      if (geometry.length)
        setLocal((previous) => {
          const next = { ...previous }
          const b = boardRef.current
          const resizing = new Set(geometry.filter((c) => c.type === 'dimensions' && c.resizing !== undefined).map((c) => c.id))
          // Cards carried by a dragged group move with it; React Flow may also report them when they are selected.
          const carried = new Set<string>()
          for (const change of geometry) {
            const id = groupIdOf(change.id)
            if (!id || !b) continue
            const entry = { ...next[change.id] }
            const saved = b.groups.find((g) => g.id === id)
            if (!saved) continue
            if (change.type === 'dimensions') {
              if (change.dimensions) entry.measured = change.dimensions
              if (change.resizing !== undefined && change.dimensions) {
                entry.size = change.dimensions
                entry.dragging = change.resizing
              }
            } else if (change.position) {
              const from = entry.position ?? { x: saved.x, y: saved.y }
              entry.position = change.position
              if (!resizing.has(change.id)) {
                entry.dragging = change.dragging
                const dx = change.position.x - from.x
                const dy = change.position.y - from.y
                for (const sub of groupSubtree(b, id)) {
                  const group = b.groups.find((g) => g.id === sub)!
                  for (const n of group.nodes) {
                    carried.add(n)
                    const at = next[n]?.position ?? b.layout[n]
                    if (at) next[n] = { ...next[n], position: { x: at.x + dx, y: at.y + dy }, dragging: change.dragging }
                  }
                  if (sub === id) continue
                  carried.add(groupKey(sub))
                  const at = next[groupKey(sub)]?.position ?? { x: group.x, y: group.y }
                  next[groupKey(sub)] = { ...next[groupKey(sub)], position: { x: at.x + dx, y: at.y + dy }, dragging: change.dragging }
                }
              }
            }
            next[change.id] = entry
          }
          for (const change of geometry) {
            if (groupIdOf(change.id) || carried.has(change.id)) continue
            const entry = { ...next[change.id] }
            if (change.type === 'position') {
              if (change.position) entry.position = change.position
              entry.dragging = change.dragging
            } else if (change.dimensions) entry.measured = change.dimensions
            next[change.id] = entry
          }
          return next
        })
      const selections = changes.filter((change) => change.type === 'select' && !groupIdOf(change.id))
      if (selections.some((change) => change.type === 'select' && change.selected)) setSelectedGroup(null)
      if (!selections.length) return
      const previous = useUI.getState().selectedNodeIds
      const ids = new Set(previous)
      for (const change of selections) {
        if (change.type !== 'select') continue
        if (change.selected) ids.add(change.id)
        else ids.delete(change.id)
      }
      if (ids.size !== previous.length || previous.some((id) => !ids.has(id))) selectNodes([...ids])
    },
    [selectNodes],
  )
  const fitted = useRef<string | null>(null)
  const pendingFocus = useUI((s) => s.pendingFocus)
  // Center on a node requested from elsewhere (search, inspector) once its board has rendered it.
  useEffect(() => {
    if (!pendingFocus || !board) return
    const key = refsOf(board, pendingFocus)[0] ?? pendingFocus
    if (!flowNodes.some((n) => n.id === key)) return
    fitted.current = board.id
    useUI.setState({ pendingFocus: null })
    requestAnimationFrame(() => {
      const node = flow.getInternalNode(key)
      if (!node) return
      const { x, y } = node.internals.positionAbsolute
      void flow.setCenter(x + (node.measured.width ?? 256) / 2, y + (node.measured.height ?? 120) / 2, { zoom: Math.max(flow.getZoom(), 1), duration: 400 })
    })
  }, [pendingFocus, board, flowNodes, flow])
  useEffect(() => {
    if (board && fitted.current !== board.id && flowNodes.length) {
      fitted.current = board.id
      setLocal({})
      requestAnimationFrame(() => void flow.fitView(FIT_VIEW))
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
        style: {
          stroke: selected ? SELECTED : s.color,
          strokeWidth: (s.width ?? 1.5) + (selected ? 2 : focus.active && incident ? 1 : 0),
          strokeDasharray: s.dash,
          opacity: focus.active && !incident ? 0.5 : 1,
        },
        // Flow lines only march while a card on them is selected: calm at rest, cause and effect on focus.
        animated: !!s.animated && focus.active && incident,
        markerEnd:
          kind === 'contains' || kind === 'link' || kind === 'relationship'
            ? undefined
            : { type: MarkerType.ArrowClosed, color: selected ? SELECTED : s.color },
      }
    }
    // A line joins every card of its source to every card of its target; extra copies get suffixed ids.
    const pairsOf = (id: string, source: string, target: string) =>
      (keysOf.get(source) ?? []).flatMap((s) =>
        (keysOf.get(target) ?? []).map((t) => ({ id: s === source && t === target ? id : `${id}${EDGE_REF}${s}${EDGE_REF}${t}`, s, t })),
      )
    const out: FloatingFlowEdge[] = []
    if (!hiddenEdges.includes('contains'))
      for (const n of visible) {
        if (n.parent && ids.has(n.parent))
          for (const pair of pairsOf(`contains:${n.id}`, n.parent, n.id))
            out.push({
              id: pair.id,
              type: 'floating',
              source: pair.s,
              target: pair.t,
              selectable: false,
              focusable: false,
              data: { color: EDGE_STYLE.contains.color },
              ...style('contains', `contains:${n.id}`),
            })
      }
    // Reference edges are chips on the card; they only become lines for focused cards (or when switched on).
    const shown = (graph?.edges ?? []).filter(
      (e) =>
        !hiddenEdges.includes(e.type) &&
        ids.has(e.source) &&
        ids.has(e.target) &&
        (referenceLines || !isReferenceEdge(e.type) || focus.roots.has(e.source) || focus.roots.has(e.target)),
    )
    // Hover reveals the rest of the names inside FloatingEdge, so hovering never rebuilds this list.
    const labelShown = (id: string) => edgeLabels === 'always' || (focus.active && focus.lines.has(id))
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
      for (const pair of pairsOf(e.id, e.source, e.target))
        out.push({
          id: pair.id,
          type: 'floating',
          source: pair.s,
          target: pair.t,
          label: e.label ?? (e.type === 'link' ? undefined : e.type),
          data: { color: EDGE_STYLE[e.type].color, offset, hideLabel: !labelShown(e.id) },
          ...style(e.type, e.id),
        })
    }
    return out
  }, [visible, keysOf, graph, hiddenEdges, selection, focus, referenceLines, edgeLabels])
  const connectionType = useCallback(
    (c: Connection | FlowEdge) => {
      const source = flow.getNode(c.source)?.data as CardData | undefined
      const target = flow.getNode(c.target)?.data as CardData | undefined
      if (!source?.node || !target?.node) return null
      return connectType === 'auto' ? inferConnectionType(source.node.type, target.node.type) : connectType
    },
    [flow, connectType],
  )
  const isValidConnection = useCallback<IsValidConnection>(
    (c) => {
      const source = entityOf(c.source)
      const target = entityOf(c.target)
      if (source === target) return false
      const type = connectionType(c)
      return !!type && !graph?.edges.some((e) => e.source === source && e.target === target && e.type === type)
    },
    [connectionType, graph],
  )
  const onConnect = useCallback(
    (c: Connection) => {
      const type = connectionType(c)
      if (!type) return
      addEdge.mutate({ source: entityOf(c.source), target: entityOf(c.target), type })
      useUI.setState((state) => ({ hiddenEdges: state.hiddenEdges.filter((kind) => kind !== type) }))
    },
    [connectionType, addEdge],
  )
  const onEdgeClick = useCallback(
    (_: unknown, edge: FlowEdge) => {
      if (edge.selectable !== false) select({ kind: 'edge', id: edge.id.split(EDGE_REF)[0] })
    },
    [select],
  )
  const onPaneClick = useCallback(() => {
    select(null)
    setSelectedGroup(null)
  }, [select])
  // A dropped card joins the innermost group under its center (or leaves to the top level); a dropped group
  // nests in the innermost larger group under its title bar. Groups then grow to fit in the main process.
  const onNodeDragStop = useCallback(
    (_: unknown, __: unknown, dragged: FlowNode[]) => {
      const b = boardRef.current
      if (!b) return
      const work: Board = structuredClone(b)
      const draggedGroups = dragged.map((n) => groupIdOf(n.id)).filter((id): id is string => !!id && work.groups.some((g) => g.id === id))
      const carried = new Set(draggedGroups.flatMap((id) => [...groupSubtree(work, id)]))
      // Move each outermost dragged group's subtree by the group's own drag offset.
      for (const n of dragged) {
        const id = groupIdOf(n.id)
        const g = id && work.groups.find((x) => x.id === id)
        if (!g || (g.parent && carried.has(g.parent))) continue
        const dx = n.position.x - g.x
        const dy = n.position.y - g.y
        for (const sub of groupSubtree(work, g.id)) {
          const s = work.groups.find((x) => x.id === sub)!
          s.x += dx
          s.y += dy
          for (const card of s.nodes) if (work.layout[card]) work.layout[card] = { x: work.layout[card].x + dx, y: work.layout[card].y + dy }
        }
      }
      for (const n of dragged) if (isCard(n) && !carried.has(groupOf(work, n.id)?.id ?? '')) work.layout[n.id] = n.position
      const positions: Record<string, Position> = {}
      const groups: Record<string, Rect> = {}
      const assign: Record<string, string | null> = {}
      const nest: Record<string, string | null> = {}
      for (const id of carried) {
        const g = work.groups.find((x) => x.id === id)!
        groups[id] = { x: g.x, y: g.y, width: g.width, height: g.height }
        for (const n of g.nodes) if (work.layout[n]) positions[n] = work.layout[n]
      }
      for (const n of dragged) {
        if (!isCard(n)) continue
        const at = work.layout[n.id]
        positions[n.id] = at
        const owner = groupOf(work, n.id)
        if (owner && carried.has(owner.id)) continue
        const size = cardSize(n)
        const target = groupAt(work, { x: at.x + size.width / 2, y: at.y + size.height / 2 })?.id ?? null
        if (target !== (owner?.id ?? null)) assign[n.id] = target
      }
      for (const id of draggedGroups) {
        const g = work.groups.find((x) => x.id === id)!
        if (g.parent && carried.has(g.parent)) continue
        const own = groupSubtree(work, id)
        const grip = { x: g.x + 16, y: g.y + GROUP_HEADER / 2 }
        const target =
          work.groups
            .filter(
              (o) =>
                !own.has(o.id) &&
                o.width * o.height > g.width * g.height &&
                grip.x >= o.x &&
                grip.x <= o.x + o.width &&
                grip.y >= o.y &&
                grip.y <= o.y + o.height,
            )
            .toSorted((x, y) => groupDepth(work, y.id) - groupDepth(work, x.id))[0]?.id ?? null
        if (target !== (g.parent ?? null)) nest[id] = target
      }
      void saveLayout(positions, b.id, { groups, assign, nest, sizes: measuredSizes() })
    },
    [saveLayout, measuredSizes],
  )
  /** Wraps the selected cards in a new group, or adds an empty one at `point` (flow coordinates). */
  const makeGroup = useCallback(
    async (point?: Position) => {
      const b = boardRef.current
      if (!b || b.id === ALL_BOARD) return
      const ids = point ? [] : useUI.getState().selectedNodeIds.filter((id) => flow.getNode(id))
      let rect: Rect
      let parent: string | undefined
      if (ids.length) {
        const box = bounds(ids.map((id) => ({ ...flow.getNode(id)!.position, ...cardSize(flow.getNode(id) as CardFlowNode) })))!
        rect = {
          x: box.x - GROUP_PAD,
          y: box.y - GROUP_PAD - GROUP_HEADER,
          width: box.width + 2 * GROUP_PAD,
          height: box.height + 2 * GROUP_PAD + GROUP_HEADER,
        }
        const owners = new Set(ids.map((id) => groupOf(b, id)?.id))
        parent = owners.size === 1 ? [...owners][0] : undefined
      } else {
        const at = point ?? flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
        rect = { x: at.x, y: at.y, width: 520, height: 300 }
        parent = groupAt(b, at)?.id
      }
      const group = await createGroup.mutateAsync([b.id, { title: 'New group', nodes: ids, rect, parent, sizes: measuredSizes() }])
      selectNodes([])
      select(null)
      setSelectedGroup(group.id)
    },
    [flow, createGroup, measuredSizes, select, selectNodes],
  )
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented || isEditing(event.target) || useUI.getState().view !== 'canvas') return
      if (event.key === 'Delete' && selectedGroup && board) {
        event.preventDefault()
        setSelectedGroup(null)
        deleteGroup.mutate([board.id, selectedGroup])
      } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        void makeGroup().catch(() => {
          /* Rendered below. */
        })
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [selectedGroup, board, deleteGroup, makeGroup])
  const groupSelection = useCallback(() => void makeGroup().catch(() => {}), [makeGroup])
  const error =
    createError ??
    createGroup.error ??
    updateGroup.error ??
    deleteGroup.error ??
    undo.error ??
    redo.error ??
    history.error ??
    setLayout.error ??
    addEdge.error ??
    duplicate.error ??
    place.error

  return (
    <div
      ref={workspace}
      className="canvas-workspace relative h-full w-full outline-none"
      tabIndex={0}
      onMouseDownCapture={(e) => {
        // Middle click on a card opens it in a new inspector tab.
        if (e.button !== 1) return
        const card = (e.target as Element).closest('.react-flow__node:not(.react-flow__node-group)')?.getAttribute('data-id')
        if (!card || groupIdOf(card)) return
        e.preventDefault()
        useUI.getState().openTab(entityOf(card))
      }}
      aria-label="Story canvas"
      aria-keyshortcuts="A"
      onPointerMove={(event) => {
        pointer.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerLeave={() => {
        pointer.current = null
      }}
      onKeyDown={(event) => {
        if (
          event.target !== event.currentTarget ||
          event.defaultPrevented ||
          event.repeat ||
          event.nativeEvent.isComposing ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey ||
          event.key.toLowerCase() !== 'a'
        )
          return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        openAddMenu(pointer.current ?? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
      }}
      onPointerDownCapture={(event) => {
        const target = event.target
        if (
          target instanceof Element &&
          target.closest('.react-flow__node, .react-flow__edge, .react-flow__pane, .react-flow__edgelabel-renderer') &&
          !target.closest('button, input, select, textarea, [contenteditable="true"]')
        )
          event.currentTarget.focus({ preventScroll: true })
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (e.dataTransfer.types.includes(NODE_DRAG_TYPE)) e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={async (e) => {
        e.preventDefault()
        if (readOnly) return
        const dragged = e.dataTransfer.getData(NODE_DRAG_TYPE)
        if (dragged) {
          if (!board) return
          // Centre the card under the pointer; a node already on the board gets another card.
          const at = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
          const key = freeRefKey(board, dragged)
          try {
            await setLayout.mutateAsync([{ [key]: { x: at.x - 128, y: at.y - 40 } }, board.id])
          } catch {
            return // Rendered below.
          }
          await queryClient.refetchQueries({ queryKey: ['graph'] })
          selectNodes([key])
          return
        }
        const files = await importFiles(e.dataTransfer.files)
        const pos = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        for (const [i, src] of files.entries()) await create('media', { title: src.split('/').pop()!, src, position: { x: pos.x + i * 30, y: pos.y + i * 30 } })
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={changeNodes}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        connectionMode={ConnectionMode.Loose}
        connectionLineComponent={FloatingConnectionLine}
        isValidConnection={isValidConnection}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onEdgeMouseEnter={onEdgeEnter}
        onEdgeMouseLeave={onEdgeLeave}
        onNodeMouseEnter={onNodeEnter}
        onNodeMouseLeave={onNodeLeave}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          setNodeMenu(null)
          openAddMenu({ x: event.clientX, y: event.clientY })
        }}
        onNodeContextMenu={(event, node) => {
          if (isCard(node)) openNodeMenu(event, node.id)
        }}
        onSelectionContextMenu={(event) => openNodeMenu(event)}
        onNodeDragStop={onNodeDragStop}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Control', 'Meta', 'Shift']}
        selectionKeyCode={null}
        panOnDrag={[1]}
        deleteKeyCode={null}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="oklch(1 0 0 / 0.07)" />
        {board && <PhaseLanes phases={board.phases} layout={board.layout} />}
        <CanvasControls readOnly={readOnly} />
        {minimap && <CanvasMinimap />}
        <Panel position="top-left" className="!m-3 max-w-[calc(100%-200px)]">
          <CanvasToolbar
            canUndo={!!history.data?.canUndo && !historyBusy}
            canRedo={!!history.data?.canRedo && !historyBusy}
            travel={travel}
            openAddMenu={setAddMenu}
            group={groupSelection}
            afterLayout={releaseLayout}
            readOnly={readOnly}
          />
        </Panel>
        <Panel position="top-right" className="canvas-view !m-3">
          <ViewMenu />
        </Panel>
        {error && (
          <Panel position="bottom-center" className="!mb-3">
            <div role="alert" className="max-w-lg rounded-md bg-danger-soft px-3 py-2 text-xs text-danger shadow-[var(--shadow-float)]">
              {error.message}
            </div>
          </Panel>
        )}
      </ReactFlow>
      {!readOnly && board && cards.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-xs text-center">
            <p className="font-serif text-lg text-fg-muted">This board is empty</p>
            <p className="mt-1 text-sm text-fg-subtle">
              Press <kbd className="rounded bg-hover px-1 font-sans text-xs text-fg-muted">A</kbd> or right-click to add a card, or drag entries from the
              sidebar.
            </p>
          </div>
        </div>
      )}
      {addMenu && (
        <AddNodeMenu
          point={addMenu}
          close={closeAddMenu}
          create={(type) => {
            void spawnNode(type)
          }}
          board={board}
          nodes={all}
          paste={
            clipboard
              ? () => {
                  const position = addMenu.position
                  closeAddMenu()
                  paste(position)
                }
              : undefined
          }
          group={() => {
            const position = addMenu.position
            closeAddMenu()
            void makeGroup(position).catch(() => {})
          }}
          place={(id) => {
            const position = addMenu.position
            closeAddMenu()
            if (board && position) setLayout.mutate([{ [id]: position }, board.id])
          }}
        />
      )}
      {nodeMenu && (
        <NodeMenu
          point={nodeMenu}
          count={nodeMenu.ids.length}
          close={closeNodeMenu}
          actions={{
            copy: () => copyRefs(nodeMenu.ids),
            duplicate: () => duplicateNodes(nodeMenu.ids),
            group: () => void makeGroup().catch(() => {}),
            remove: () => void removeFromBoard(nodeMenu.ids),
            destroy: () => deleteEverywhere(nodeMenu.ids),
          }}
        />
      )}
    </div>
  )
}
