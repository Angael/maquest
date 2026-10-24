import { useEffect, useRef } from 'react'
import type { Selection } from './store'
import { useUI } from './store'
import { api } from './api'
import { useAction, useNodes } from './queries'

export const BEFORE_DELETE = 'maquest:before-delete'

export function isEditingTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor')
}

export function useDeleteSelection() {
  const { data: nodes = [] } = useNodes()
  const removeNodes = useAction(api.deleteNodes)
  const removeEdge = useAction(api.removeEdge)
  const busy = useRef(false)
  return async (selection: Selection, ids: string[] = []) => {
    if (!selection || busy.current) return
    busy.current = true
    try {
      if (selection.kind === 'edge') {
        window.dispatchEvent(new CustomEvent(BEFORE_DELETE, { detail: [selection.id] }))
        useUI.getState().select(null)
        await removeEdge.mutateAsync([selection.id])
        return
      }
      const selected = new Set(ids.length ? ids : [selection.id])
      const targets = nodes.filter((node) => selected.has(node.id))
      if (!targets.length) return
      window.dispatchEvent(new CustomEvent(BEFORE_DELETE, { detail: [...selected] }))
      useUI.getState().select(null)
      // Delete selected descendants first; unselected children are detached.
      const hasSelectedAncestor = (id: string) => {
        let parent = nodes.find((node) => node.id === id)?.parent
        const visited = new Set<string>()
        while (parent && !visited.has(parent)) {
          if (selected.has(parent)) return true
          visited.add(parent)
          parent = nodes.find((node) => node.id === parent)?.parent
        }
        return false
      }
      const ordered = targets.toSorted((a, b) => Number(hasSelectedAncestor(b.id)) - Number(hasSelectedAncestor(a.id)))
      await removeNodes.mutateAsync([ordered.map((node) => node.id), false])
    } catch (error) {
      useUI.getState().select(selection)
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      busy.current = false
    }
  }
}

export function useDeleteShortcut() {
  const remove = useDeleteSelection()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || event.repeat || event.defaultPrevented || event.isComposing || isEditingTarget(event.target)) return
      const { selection, selectedNodeIds } = useUI.getState()
      if (!selection) return
      event.preventDefault()
      void remove(selection, selectedNodeIds)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [remove])
}
