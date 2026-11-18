import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import { api } from './api'
import { queryClient } from './queries'
import { useUI, type View } from './store'
import { isEditingTarget } from './deletion'

/** Undo/redo of the app's own edits (main-process history), shared by the canvas toolbar, shortcuts and the palette. */
export const useHistoryState = create<{ busy: boolean; error: Error | null }>(() => ({ busy: false, error: null }))

let queue = Promise.resolve()

/** Queues one undo or redo step; rapid shortcuts run in order and none is dropped while queries refetch. */
export function travel(direction: 'undo' | 'redo') {
  queue = queue.then(async () => {
    useHistoryState.setState({ busy: true })
    try {
      await (direction === 'undo' ? api.undo() : api.redo())
      useHistoryState.setState({ error: null })
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      useHistoryState.setState({ error })
      // The canvas shows its own error banner; elsewhere a toast says what happened.
      if (useUI.getState().view !== 'canvas') toast.error(error.message)
    } finally {
      useHistoryState.setState({ busy: false })
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' })
    }
  })
}

/** Views where Ctrl+Z undoes project edits; the map editor keeps its own shortcut, and text fields their own undo. */
const UNDOABLE = new Set<View>(['canvas', 'backlog'])

/** Ctrl/⌘+Z undoes, Ctrl+Y or Ctrl/⌘+Shift+Z redoes. */
export function useHistoryShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented || isEditingTarget(event.target)) return
      const key = event.key.toLowerCase()
      if ((key !== 'z' && key !== 'y') || !UNDOABLE.has(useUI.getState().view)) return
      event.preventDefault()
      travel(key === 'y' || event.shiftKey ? 'redo' : 'undo')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
