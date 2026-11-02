import { useEffect } from 'react'
import { useUI } from '../lib/store'
import { isEditingTarget } from '../lib/deletion'
import { NodeInspector } from './inspector/NodeInspector'
import { EdgeInspector } from './inspector/EdgeInspector'

/**
 * Esc closes the inspector. Inside one of its fields the first Esc only leaves the field; popups, dialogs and the
 * image viewer handle their own Esc first.
 */
function useEscapeToClose() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[role="menu"], [role="dialog"], [role="listbox"], .yarl__root') || document.querySelector('.yarl__root')) return
      if (isEditingTarget(target)) {
        if (target?.closest('#project-inspector')) (document.activeElement as HTMLElement | null)?.blur()
        return
      }
      useUI.getState().select(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

export function Inspector() {
  const kind = useUI((s) => s.selection?.kind)
  const id = useUI((s) => s.selection?.id)
  useEscapeToClose()
  if (!kind || !id) return null
  return (
    <aside id="project-inspector" aria-label="Inspector" className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain bg-panel">
      {kind === 'node' ? <NodeInspector key={id} id={id} /> : <EdgeInspector key={id} id={id} />}
    </aside>
  )
}
