import { createElement, type MouseEvent, type ReactNode } from 'react'
import { useUI } from './store'
import { openContextMenu } from '../components/ContextMenu'
import { NodeMenu } from '../components/menus/NodeMenu'

/** Opens a node in a new (pinned) inspector tab, keeping the one being viewed. */
export const openNodeTab = (id: string) => useUI.getState().openTab(id)

/** Middle press: stops the browser's autoscroll and the X11 primary-selection paste. */
export function preventMiddleDown(e: { button: number; preventDefault(): void }) {
  if (e.button === 1) e.preventDefault()
}

/**
 * Mouse handlers for anything that opens a node: a click runs `open` (selecting the node by
 * default), a middle click opens it in a new inspector tab, like a link in a browser, and a right click shows the
 * node's menu (or `menu`, for places with their own).
 */
export function nodeLinkProps(id: string, open: () => void = () => useUI.getState().select({ kind: 'node', id }), menu?: () => ReactNode) {
  return {
    onClick: open,
    onContextMenu: (e: MouseEvent) => void openContextMenu(e, menu ?? (() => createElement(NodeMenu, { id })), { label: 'Node actions' }),
    onMouseDown: preventMiddleDown,
    onAuxClick: (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      e.stopPropagation()
      openNodeTab(id)
    },
  }
}
