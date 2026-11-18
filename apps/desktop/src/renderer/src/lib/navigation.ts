import { useEffect } from 'react'
import { create } from 'zustand'
import type { StoryNode } from '@maquest/core/schema'
import { queryClient } from './queries'
import { useUI, type View } from './store'
import { isEditingTarget } from './deletion'

/**
 * Browser-like history of the nodes shown in the inspector: Alt+← / Alt+→ (or the mouse's back and forward buttons) walk
 * it, and the command palette lists the most recent ones. Session-only; reset when the project changes.
 */
type Navigation = { back: string[]; forward: string[]; recent: string[] }
export const useNavigation = create<Navigation>(() => ({ back: [], forward: [], recent: [] }))

const LIMIT = 50
const RECENT = 12
/** The node shown last (it stays current while the inspector is closed). */
let current: string | null = null
let travelling = false

useUI.subscribe((s) => {
  const id = s.selection?.kind === 'node' ? s.selection.id : null
  if (!id || id === current) return
  const nav = useNavigation.getState()
  const recent = [id, ...nav.recent.filter((r) => r !== id)].slice(0, RECENT)
  if (travelling || !current) useNavigation.setState({ recent })
  else useNavigation.setState({ back: [...nav.back, current].slice(-LIMIT), forward: [], recent })
  current = id
})

export function resetNavigation() {
  current = null
  useNavigation.setState({ back: [], forward: [], recent: [] })
}

const exists = (id: string) => queryClient.getQueryData<StoryNode[]>(['nodes'])?.some((n) => n.id === id) ?? true

/** Shows the previous (-1) or next (1) node of the history; skips nodes deleted since. Returns whether it moved. */
export function navigate(step: -1 | 1): boolean {
  const nav = useNavigation.getState()
  const from = [...(step < 0 ? nav.back : nav.forward)]
  let target: string | undefined
  do target = from.pop()
  while (target && (target === current || !exists(target)))
  const to = [...(step < 0 ? nav.forward : nav.back), ...(target && current ? [current] : [])]
  useNavigation.setState(step < 0 ? { back: from, forward: to } : { forward: from, back: to })
  if (!target) return false
  travelling = true
  try {
    useUI.getState().select({ kind: 'node', id: target })
  } finally {
    travelling = false
  }
  return true
}

/** Views that show the node inspector, where back/forward make sense. */
const NAVIGABLE = new Set<View>(['canvas', 'backlog'])

/** Alt+← / Alt+→ (⌘[ / ⌘] on macOS) and the mouse's back/forward buttons, outside text fields. */
export function useNavigationShortcuts() {
  useEffect(() => {
    const mac = window.maquest.platform === 'darwin'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isEditingTarget(event.target) || !NAVIGABLE.has(useUI.getState().view)) return
      const arrows = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      const brackets = mac && event.metaKey && !event.altKey && !event.ctrlKey && (event.key === '[' || event.key === ']')
      if (!arrows && !brackets) return
      // Before React Flow sees it: on a focused card, Alt+arrows would otherwise also nudge the card.
      event.preventDefault()
      event.stopPropagation()
      navigate(event.key === 'ArrowLeft' || event.key === '[' ? -1 : 1)
    }
    // Buttons 3 and 4 are the mouse's back and forward thumb buttons.
    const onMouseUp = (event: MouseEvent) => {
      if ((event.button !== 3 && event.button !== 4) || !NAVIGABLE.has(useUI.getState().view)) return
      event.preventDefault()
      navigate(event.button === 3 ? -1 : 1)
    }
    const stop = (event: MouseEvent) => (event.button === 3 || event.button === 4) && event.preventDefault()
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousedown', stop)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousedown', stop)
    }
  }, [])
}
