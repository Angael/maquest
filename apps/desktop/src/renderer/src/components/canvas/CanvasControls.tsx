import { memo, useCallback } from 'react'
import { MiniMap, Panel, useReactFlow, useStore, useStoreApi, type Node as FlowNode } from '@xyflow/react'
import { Keyboard, Lock, LockOpen, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react'
import { useUI } from '../../lib/store'
import { GROUP_STYLE, useTypes } from '../../lib/styles'
import { Button, IconButton, Popover, Separator, Shortcut, cn, floating } from '../ui'
import { ShortcutList } from '../ShortcutsDialog'
import { MOD, SHORTCUTS } from '../../lib/shortcuts'
import type { GroupFlowNode } from '../GroupFrame'
import { FIT_VIEW, isCard } from './shared'

function ShortcutsPanel() {
  return (
    <div className="w-72 p-3">
      <ShortcutList groups={SHORTCUTS.canvas} />
      <p className="text-2xs text-fg-faint">Right-click blank space to add, right-click cards for actions. Drag from a card's edge to connect.</p>
      <Button size="sm" variant="ghost" className="-ml-2 mt-1.5 gap-2 text-fg-subtle" onClick={() => useUI.getState().setShortcutsOpen(true)}>
        All shortcuts <Shortcut keys={`${MOD}+/`} />
      </Button>
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
