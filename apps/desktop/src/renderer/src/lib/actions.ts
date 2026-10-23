import { useReactFlow } from '@xyflow/react'
import type { NodeType } from '@maquest/core/schema'
import { api } from './api'
import { queryClient } from './queries'
import { useUI } from './store'

const refresh = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' })

/** Creates a node, drops it at the canvas center and selects it. */
export function useCreateNode() {
  const flow = useReactFlow()
  const select = useUI((s) => s.select)
  return async (type: NodeType, opts: { title?: string; parent?: string; position?: { x: number; y: number }; src?: string } = {}) => {
    const el = document.querySelector('.react-flow')?.getBoundingClientRect()
    const pos =
      opts.position ??
      (el ? flow.screenToFlowPosition({ x: el.x + el.width / 2 - 110 + Math.random() * 60, y: el.y + el.height / 2 - 40 + Math.random() * 60 }) : undefined)
    const node = await api.createNode({ type, title: opts.title ?? `New ${type}`, parent: opts.parent, src: opts.src }, pos)
    await refresh()
    select({ kind: 'node', id: node.id })
    return node
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
