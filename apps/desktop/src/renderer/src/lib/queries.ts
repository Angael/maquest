import { useEffect, useMemo } from 'react'
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ALL_BOARD, MAIN_BOARD, type Board, type Graph, type StoryNode } from '@maquest/core/schema'
import { api } from './api'
import { useUI } from './store'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false } },
})

/** Files on disk are the source of truth: any change (app, agent via MCP, git) refetches everything. */
export function useLiveProject() {
  useEffect(() => window.maquest.onChanged(() => void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' })), [])
}

export const useCurrent = () => useQuery({ queryKey: ['app', 'current'], queryFn: () => api.current() })
export const useRecent = () => useQuery({ queryKey: ['app', 'recent'], queryFn: () => api.recent() })
export const useNodes = () => useQuery({ queryKey: ['nodes'], queryFn: () => api.listNodes() })
export const useGraph = () => useQuery({ queryKey: ['graph'], queryFn: () => api.graph() })
export const useOutline = () => useQuery({ queryKey: ['outline'], queryFn: () => api.outline() })
export const useGuidelines = () => useQuery({ queryKey: ['guidelines'], queryFn: () => api.guidelines() })
export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api.config() })

/** Id of the board shown on the canvas, for imperative calls outside React. */
export function currentBoardId() {
  const id = useUI.getState().board
  if (id === ALL_BOARD) return id
  const boards = queryClient.getQueryData<Graph>(['graph'])?.boards
  return boards?.some((b) => b.id === id) ? id : (boards?.[0]?.id ?? MAIN_BOARD)
}

/** The built-in read-only canvas: every node except backlog ideas, laid out by the canvas itself. */
export function allBoard(nodes: readonly StoryNode[]): Board {
  return { id: ALL_BOARD, title: 'All', nodes: nodes.filter((n) => n.type !== 'idea').map((n) => n.id), phases: [], layout: {}, groups: [] }
}

/** The board shown on the canvas; falls back to the first board when the chosen one is gone. */
export function useBoard(): Board | undefined {
  const { data: graph } = useGraph()
  const { data: nodes } = useNodes()
  const id = useUI((s) => s.board)
  const all = useMemo(() => (id === ALL_BOARD && nodes ? allBoard(nodes) : undefined), [id, nodes])
  return all ?? graph?.boards.find((b) => b.id === id) ?? graph?.boards[0]
}

export function useNode(id: string | null) {
  const { data } = useNodes()
  return id ? (data?.find((n) => n.id === id) ?? null) : null
}

/** Mutation that refreshes project queries afterwards. */
export function useAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: A) => fn(...a),
    onSettled: () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' }),
  })
}
