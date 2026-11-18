import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { flushPending } from './pending'
import { useUI } from './store'
import { resetNavigation } from './navigation'

/** Forgets everything tied to the open project, so the next one (or the start screen) starts clean. */
export function useLeaveProject() {
  const qc = useQueryClient()
  /** `open` switches to another project and resolves falsy when nothing changed (a cancelled folder picker); without it the project closes. */
  return async (open?: () => Promise<unknown>) => {
    // Unsaved typing belongs to this project: save it before the main process switches to another one.
    await flushPending()
    if (open) {
      if (!(await open())) return
    } else await api.close()
    useUI.setState({ selection: null, selectedNodeIds: [], tabs: [], viewSelections: {}, guideline: null, board: 'main', storyScope: null })
    resetNavigation()
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'app' })
    if (!open) qc.setQueryData(['app', 'current'], null)
    await qc.invalidateQueries({ queryKey: ['app'] })
  }
}

/** Ctrl/⌘+O runs `open` (the folder picker), on the start screen and inside a project. */
export function useOpenFolderShortcut(open: () => void) {
  const latest = useRef(open)
  useEffect(() => {
    latest.current = open
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.defaultPrevented || event.key.toLowerCase() !== 'o') return
      event.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
