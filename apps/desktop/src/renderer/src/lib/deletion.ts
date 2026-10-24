import { useEffect, useRef } from 'react'
import type { Selection } from './store'
import { entityOf } from '@maquest/core/schema'
import { useUI } from './store'
import { api } from './api'
import { currentBoardId, useAction, useNodes } from './queries'

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

/** Takes nodes off the shown board only; the entities stay in the project and on other boards. */
export function useRemoveFromBoard() {
  const update = useAction(api.updateBoard)
  return async (ids: string[]) => {
    if (!ids.length) return
    window.dispatchEvent(new CustomEvent(BEFORE_DELETE, { detail: ids }))
    useUI.getState().select(null)
    try {
      await update.mutateAsync([currentBoardId(), { removeNodes: ids }])
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    }
  }
}

/** Confirms, then deletes nodes from the project and every board. */
export function useDeleteEverywhere() {
  const remove = useDeleteSelection()
  return (keys: string[]) => {
    const ids = [...new Set(keys.map(entityOf))]
    if (
      !ids.length ||
      !confirm(ids.length === 1 ? 'Delete this node from the project and every board?' : `Delete ${ids.length} nodes from the project and every board?`)
    )
      return
    void remove({ kind: 'node', id: ids[0] }, ids)
  }
}

/** Delete on the canvas removes the selected cards from the board; Shift+Delete, or Delete in the sidebar or other views, deletes the nodes. */
export function useDeleteShortcut() {
  const remove = useDeleteSelection()
  const unplace = useRemoveFromBoard()
  const destroy = useDeleteEverywhere()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || event.repeat || event.defaultPrevented || event.isComposing || isEditingTarget(event.target)) return
      const { selection, selectedNodeIds, view } = useUI.getState()
      if (!selection) return
      event.preventDefault()
      const keys = selectedNodeIds.length ? selectedNodeIds : [selection.id]
      const entities = [...new Set(keys.map(entityOf))]
      // The canvas works on cards (references); the outline in the sidebar and other views work on the nodes.
      const onCanvas = view === 'canvas' && !(event.target instanceof Element && event.target.closest('[data-sidebar]'))
      if (selection.kind === 'node' && onCanvas) {
        if (event.shiftKey) destroy(entities)
        else void unplace(keys)
      } else void remove(selection, selection.kind === 'node' ? entities : [])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [remove, unplace, destroy])
}
