import { memo, useCallback } from 'react'
import { MiniMap, Panel, useReactFlow, useStore, useStoreApi, type Node as FlowNode } from '@xyflow/react'
import { Keyboard, Lock, LockOpen, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react'
import { useUI } from '../../lib/store'
import { GROUP_STYLE, useTypes } from '../../lib/styles'
import { IconButton, Popover, Separator, Shortcut, cn, floating } from '../ui'
import type { GroupFlowNode } from '../GroupFrame'
import { FIT_VIEW, isCard } from './shared'

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Cards',
    items: [
      ['Add a card at the pointer', 'A'],
      ['Copy reference', 'Ctrl+C'],
      ['Paste reference', 'Ctrl+V'],
      ['Duplicate', 'Ctrl+D'],
      ['Group selection', 'Ctrl+G'],
      ['Select all', 'Ctrl+A'],
      ['Remove from board', 'Del'],
      ['Delete everywhere', 'Shift+Del'],
    ],
  },
  {
    group: 'Canvas',
    items: [
      ['Undo', 'Ctrl+Z'],
      ['Redo', 'Ctrl+Shift+Z'],
      ['Add to selection', 'Shift+Click'],
      ['Open in a new tab', 'Middle-click'],
      ['Pan', 'Middle-drag'],
    ],
  },
]

function ShortcutsPanel() {
  return (
    <div className="w-72 p-3">
      {SHORTCUTS.map(({ group, items }, i) => (
        <section key={group} className={cn(i > 0 && 'mt-3')}>
          <h3 className="mb-1 text-2xs font-medium text-fg-subtle">{group}</h3>
          <ul>
            {items.map(([label, keys]) => (
              <li key={label} className="flex h-6 items-center justify-between gap-3 text-xs text-fg-muted">
                {label}
                <Shortcut keys={keys} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-3 text-2xs text-fg-faint">Right-click blank space to add, right-click cards for actions. Drag from a card's edge to connect.</p>
    </div>
  )
}

/** Bottom-left vertical controls: zoom, fit, lock, minimap and the shortcut reference. */
export const CanvasControls = memo(function CanvasControls({ readOnly }: { readOnly: boolean }) {
  const flow = useReactFlow()
  const store = useStoreApi()
  const locked = useStore((s) => !s.nodesDraggable && !s.nodesConnectable && !s.elementsSelectable)
  const minZoom = useStore((s) => s.transform[2] <= s.minZoom)
  const maxZoom = useStore((s) => s.transform[2] >= s.maxZoom)
  const minimap = useUI((s) => s.minimap)
  const setMinimap = useUI((s) => s.setMinimap)
  const side = 'right' as const
  return (
    <Panel position="bottom-left" className="!m-3">
      <div role="toolbar" aria-orientation="vertical" aria-label="Canvas controls" className={cn(floating, 'flex flex-col items-center gap-0.5 p-1')}>
        <IconButton icon={Plus} label="Zoom in" tooltipSide={side} disabled={maxZoom} onClick={() => void flow.zoomIn({ duration: 150 })} />
        <IconButton icon={Minus} label="Zoom out" tooltipSide={side} disabled={minZoom} onClick={() => void flow.zoomOut({ duration: 150 })} />
        <IconButton icon={Maximize} label="Fit view" tooltipSide={side} onClick={() => void flow.fitView({ ...FIT_VIEW, duration: 300 })} />
        <Separator className="mx-1 w-5" />
        {!readOnly && (
          <IconButton
            icon={locked ? Lock : LockOpen}
            label={locked ? 'Unlock canvas' : 'Lock canvas'}
            tooltipSide={side}
            active={locked}
            onClick={() => store.setState({ nodesDraggable: locked, nodesConnectable: locked, elementsSelectable: locked })}
          />
        )}
        <IconButton icon={MapIcon} label="Minimap" tooltipSide={side} active={minimap} onClick={() => setMinimap(!minimap)} />
        <Popover
          side="right"
          align="end"
          trigger={
            <IconButton icon={Keyboard} label="Keyboard shortcuts" tooltipSide={side} className="data-[popup-open]:bg-active data-[popup-open]:text-fg" />
          }
        >
          <ShortcutsPanel />
        </Popover>
      </div>
    </Panel>
  )
})

/** Muted overview: type colors at reduced strength, group outlines, a thin accent viewport. */
export const CanvasMinimap = memo(function CanvasMinimap() {
  const types = useTypes()
  const nodeColor = useCallback(
    (n: FlowNode) => (isCard(n) ? `color-mix(in oklch, ${types.of(n.data.node.type).color} 40%, var(--color-panel))` : 'transparent'),
    [types],
  )
  const nodeStroke = useCallback(
    (n: FlowNode) => (isCard(n) ? 'transparent' : `color-mix(in oklch, ${GROUP_STYLE[(n as GroupFlowNode).data.group.color].border} 45%, transparent)`),
    [],
  )
  return (
    <MiniMap
      position="bottom-right"
      className="canvas-minimap !m-3"
      pannable
      zoomable
      ariaLabel="Overview: drag to pan, scroll to zoom"
      style={{ width: 180, height: 120 }}
      nodeColor={nodeColor}
      nodeStrokeColor={nodeStroke}
      nodeStrokeWidth={6}
      nodeBorderRadius={6}
      bgColor="var(--color-panel)"
      maskColor="oklch(0.165 0.005 60 / 0.55)"
      maskStrokeColor="var(--color-accent)"
      maskStrokeWidth={1.5}
      offsetScale={8}
    />
  )
})
