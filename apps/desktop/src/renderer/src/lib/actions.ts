import { useReactFlow, useStoreApi } from '@xyflow/react'
import { refsOf, type NodeType } from '@maquest/core/schema'
import { api } from './api'
import { currentBoardId, queryClient, useBoard, useGraph } from './queries'
import { useUI } from './store'

/** dataTransfer type carrying an entity id dragged from the sidebar. */
export const NODE_DRAG_TYPE = 'application/x-maquest-node'

const refresh = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' })

/** Creates a node, drops it at the canvas center and selects it. */
export function useCreateNode() {
  const flow = useReactFlow()
  const select = useUI((s) => s.select)
  return async (type: NodeType, opts: { title?: string; parent?: string; position?: { x: number; y: number }; src?: string; group?: string } = {}) => {
    const el = document.querySelector('.react-flow')?.getBoundingClientRect()
    const pos =
      opts.position ??
      (el ? flow.screenToFlowPosition({ x: el.x + el.width / 2 - 128 + Math.random() * 60, y: el.y + el.height / 2 - 40 + Math.random() * 60 }) : undefined)
    const node = await api.createNode({ type, title: opts.title ?? `New ${type}`, parent: opts.parent, src: opts.src }, pos, currentBoardId(), opts.group)
    await refresh()
    select({ kind: 'node', id: node.id })
    return node
  }
}

/**
 * Selects a node and makes sure one of its cards is on screen: switches to a board that has it
 * if the current one doesn't, and pans (keeping the zoom) only when the card is out of view.
 */
export function useRevealNode() {
  const flow = useReactFlow()
  const store = useStoreApi()
  const { data: graph } = useGraph()
  const current = useBoard()
  return (id: string) => {
    const ui = useUI.getState()
    const onCurrent = current && refsOf(current, id).length > 0
    const board = onCurrent ? current : graph?.boards.find((b) => refsOf(b, id).length)
    if (board && board.id !== current?.id) ui.setBoard(board.id)
    ui.select({ kind: 'node', id })
    if (!board) return
    if (!onCurrent) {
      const pos = board.layout[refsOf(board, id)[0]]
      // Let the canvas switch boards before moving the viewport.
      if (pos) setTimeout(() => void flow.setCenter(pos.x + 128, pos.y + 90, { zoom: flow.getZoom(), duration: 400 }), 50)
      return
    }
    const { width, height, transform } = store.getState()
    const [tx, ty, zoom] = transform
    const visible = (key: string) => {
      const n = flow.getInternalNode(key)
      if (!n) return false
      const { x, y } = n.internals.positionAbsolute
      const w = n.measured.width ?? 256
      const h = n.measured.height ?? 160
      return x * zoom + tx < width && (x + w) * zoom + tx > 0 && y * zoom + ty < height && (y + h) * zoom + ty > 0
    }
    const keys = refsOf(board, id)
    if (keys.some(visible)) return
    const n = flow.getInternalNode(keys[0])
    const pos = n?.internals.positionAbsolute ?? board.layout[keys[0]]
    if (!pos) return
    void flow.setCenter(pos.x + (n?.measured.width ?? 256) / 2, pos.y + (n?.measured.height ?? 180) / 2, { zoom, duration: 400 })
  }
}

/** Imports dropped/pasted files into media/ and returns project-relative paths. */
export async function importFiles(files: FileList | File[]): Promise<string[]> {
  const out: string[] = []
  for (const f of Array.from(files)) {
    if (!/^(image|video)\//.test(f.type)) continue
    const abs = window.maquest.pathForFile(f)
    out.push(abs ? await api.importMedia(abs) : await api.writeMedia(f.name || `pasted.${f.type.split('/')[1]}`, new Uint8Array(await f.arrayBuffer())))
  }
  return out
}
