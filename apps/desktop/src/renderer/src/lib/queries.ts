import { useEffect } from 'react'
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MAIN_BOARD, type Board, type Graph } from '@maquest/core/schema'
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
  return queryClient.getQueryData<Graph>(['graph'])?.boards.some((b) => b.id === id) ? id : MAIN_BOARD
}

/** The board shown on the canvas; falls back to the main board when the chosen one is gone. */
export function useBoard(): Board | undefined {
  const { data: graph } = useGraph()
  const id = useUI((s) => s.board)
  return graph?.boards.find((b) => b.id === id) ?? graph?.boards.find((b) => b.id === MAIN_BOARD)
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
