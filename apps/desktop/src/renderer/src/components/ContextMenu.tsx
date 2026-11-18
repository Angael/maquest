import { useEffect, useMemo, type ReactNode } from 'react'
import { create } from 'zustand'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import { cn, popupSurface } from './ui'

/*
 * Right-click menus. One menu host for the whole app, opened at the pointer by `openContextMenu` from any element's
 * onContextMenu. Text fields, selections, links and images are left to the native OS menu (built in the main process),
 * which only appears when nothing here claimed the event.
 */

type Request = {
  id: number
  x: number
  y: number
  render: () => ReactNode
  label?: string
  /** Outlined while its menu is open, like a right-clicked row in a file manager. */
  target: Element | null
  /** Gets focus back when the menu closes. */
  restore: HTMLElement | null
}

const useMenu = create<{ menu: Request | null; open: boolean }>(() => ({ menu: null, open: false }))
let seq = 0

/** The pieces of a mouse event the opener reads (React and DOM events both fit). */
export type MenuEvent = {
  clientX: number
  clientY: number
  target: EventTarget | null
  currentTarget: EventTarget | null
  preventDefault(): void
  stopPropagation(): void
  nativeEvent?: Event
}

export type MenuOptions = {
  /** Accessible name of the menu. */
  label?: string
  /** Element to outline while the menu is open (default: the element whose handler opened it). */
  target?: Element | null
  /** Element to focus when the menu closes (default: whatever had focus). */
  restore?: HTMLElement | null
  /** Open even over a text field or selected text. */
  force?: boolean
}

const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor'

/** Whether the point lies on selected text: then the native Copy menu is what people expect. */
function onSelection(x: number, y: number) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return false
  for (let i = 0; i < selection.rangeCount; i++)
    for (const r of selection.getRangeAt(i).getClientRects()) if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true
  return false
}

/**
 * Opens Maquest's menu for what was right-clicked and claims the event (no native menu, no outer menus). Returns false
 * and leaves the event alone over text fields and selected text, where the native edit menu belongs.
 */
export function openContextMenu(event: MenuEvent, render: () => ReactNode, opts: MenuOptions = {}) {
  const element = event.target instanceof Element ? event.target : null
  if (!opts.force && (element?.closest(EDITABLE) || onSelection(event.clientX, event.clientY))) return false
  event.preventDefault()
  event.stopPropagation()
  const target = opts.target ?? (event.currentTarget instanceof Element ? event.currentTarget : element)
  let { clientX: x, clientY: y } = event
  // The Menu key and Shift+F10 report no pointer (pointerType ""): open just below the element instead.
  const native = event.nativeEvent ?? (event as unknown as Event)
  const keyboard = ('pointerType' in native && (native as PointerEvent).pointerType === '') || (!x && !y)
  if (keyboard && target) {
    const box = target.getBoundingClientRect()
    x = box.left + Math.min(12, box.width / 2)
    y = box.top + Math.min(box.height, 28)
  }
  const restore = opts.restore ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null)
  useMenu.setState({ menu: { id: ++seq, x, y, render, label: opts.label, target, restore }, open: true })
  return true
}

export const closeContextMenu = () => useMenu.setState({ open: false })

let keepFocus = false
/** Call from a menu action that moves focus itself (a rename field), so closing the menu leaves it there. */
export const leaveFocus = () => {
  keepFocus = true
}

/** Props that give an element a right-click menu: `<li {...contextMenu(() => <Items />)}>`. */
export function contextMenu(render: () => ReactNode, opts?: MenuOptions) {
  return { onContextMenu: (event: MenuEvent) => void openContextMenu(event, render, opts) }
}

/**
 * The one menu popup. Opens instantly (it appears dozens of times a session) and fades out briefly, like a native
 * context menu; it closes when the window loses focus or resizes.
 */
export function ContextMenuHost() {
  const menu = useMenu((s) => s.menu)
  const open = useMenu((s) => s.open)
  useEffect(() => {
    if (!open) return
    keepFocus = false
    const target = menu?.target
    target?.setAttribute('data-context-target', '')
    window.addEventListener('blur', closeContextMenu)
    window.addEventListener('resize', closeContextMenu)
    return () => {
      target?.removeAttribute('data-context-target')
      window.removeEventListener('blur', closeContextMenu)
      window.removeEventListener('resize', closeContextMenu)
    }
  }, [open, menu])
  const anchor = useMemo(() => {
    const x = menu?.x ?? 0
    const y = menu?.y ?? 0
    return { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) }
  }, [menu])
  const restore = menu?.restore
  return (
    <BaseMenu.Root open={open} onOpenChange={(next) => !next && closeContextMenu()}>
      <BaseMenu.Portal>
        <BaseMenu.Positioner anchor={anchor} side="right" align="start" sideOffset={2} collisionPadding={6} className="z-[60] outline-none">
          <BaseMenu.Popup
            key={menu?.id}
            aria-label={menu?.label}
            data-context-menu
            finalFocus={() => (keepFocus ? false : restore?.isConnected ? restore : true)}
            className={cn(popupSurface, 'context-motion max-h-[var(--available-height)] max-w-80 min-w-52 overflow-y-auto')}
          >
            {menu?.render()}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}
