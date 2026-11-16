import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Eye, LayoutGrid, Maximize, MonitorPlay, PanelRight, Settings2, ShieldUser } from 'lucide-react'
import { emptyMap, mapDefaultsOf, type MapDoc } from '@maquest/core/map'
import { api } from '../../lib/api'
import { queryClient, useConfig, useMap, useNode } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { Button, IconButton, Input, Menu, MenuItem, Popover, Segmented, Separator, Tooltip, cn, floating } from '../ui'
import { MapViewport } from './MapViewport'
import { MapSettingsForm, ScenePanel, SelectionPanel } from './MapPanel'
import { ToolOptions, ToolRail, useToolKeys } from './MapToolbar'
import { useMapUI } from './mapStore'
import { duplicateIds, moveIds, removeIds, reorder } from './edit'

/** The map editor view: the map, its tools and a side panel (selection, layers, fog, grid, style). */
export function MapEditor() {
  const id = useUI((s) => s.map)
  const node = useNode(id)
  const { data: saved, error } = useMap(id)
  const [doc, setDoc] = useState<MapDoc | null>(null)
  const saving = useRef(0)
  const queue = useRef(Promise.resolve())
  const select = useMapUI((s) => s.select)

  // Files are the source of truth: take the file's version whenever it changes and no save of ours is in flight.
  useEffect(() => {
    if (saved && saving.current === 0) setDoc(saved)
  }, [saved])
  useEffect(() => {
    select([])
  }, [id, select])
  // Drop selected ids that no longer exist (e.g. an agent removed them).
  useEffect(() => {
    if (!doc) return
    const ids = new Set([...doc.objects.map((o) => o.id), ...doc.tokens.map((t) => t.id)])
    const sel = useMapUI.getState().selected
    if (sel.some((s) => !ids.has(s))) select(sel.filter((s) => ids.has(s)))
  }, [doc, select])

  const commit = useCallback(
    (next: MapDoc) => {
      if (!id) return
      setDoc(next)
      saving.current++
      queue.current = queue.current
        .then(() => api.saveMap(id, next))
        .then(
          (written) => void queryClient.setQueryData(['map', id], written),
          (e: Error) => {
            toast.error(`Could not save the map: ${e.message}`)
            void queryClient.invalidateQueries({ queryKey: ['map', id] })
          },
        )
        .finally(() => {
          saving.current--
        })
    },
    [id],
  )

  useToolKeys(!!doc)
  useEditorKeys(doc, commit)

  const panel = useMapUI((s) => s.panel)

  if (!id) return <Empty text="No map open. Pick one from the Maps list." />
  if (error) return <Empty text={(error as Error).message} />
  if (!doc) return null

  return (
    <div className="absolute inset-0 flex">
      <div className="relative min-w-0 flex-1">
        <MapViewport doc={doc} commit={commit} mapId={id} />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start gap-2">
          <div className={cn(floating, 'pointer-events-auto flex h-9 min-w-0 shrink items-center gap-1 pr-1 pl-1')}>
            <IconButton icon={LayoutGrid} label="All maps" onClick={() => useUI.getState().setView('maps')} />
            <MapTitle id={id} title={node?.title ?? id} />
          </div>
          <div className="pointer-events-auto min-w-0 shrink">
            <ToolOptions />
          </div>
          <div className="flex-1" />
          <ViewControls id={id} doc={doc} commit={commit} />
        </div>
        <div className="pointer-events-none absolute top-15 left-3 flex">
          <div className="pointer-events-auto">
            <ToolRail />
          </div>
        </div>
        <div className="pointer-events-none absolute top-15 right-3 bottom-3 flex flex-col items-end">
          <SelectionPanel doc={doc} commit={commit} />
        </div>
      </div>
      {panel && (
        <aside aria-label="Fog, tokens and layers" className="flex w-72 shrink-0 flex-col border-l border-line bg-panel">
          <ScenePanel doc={doc} commit={commit} />
        </aside>
      )}
    </div>
  )
}

/** The map's name; click to rename. */
function MapTitle({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <Input
        autoFocus
        defaultValue={title}
        aria-label="Map name"
        className="h-7 w-52 font-serif text-sm"
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          setEditing(false)
          const next = e.currentTarget.value.trim()
          if (next && next !== title) void api.updateNode(id, { title: next }).then(() => queryClient.invalidateQueries({ queryKey: ['nodes'] }))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            e.currentTarget.value = title
            e.currentTarget.blur()
          }
        }}
      />
    )
  return (
    <Tooltip content="Rename">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="h-7 max-w-60 min-w-0 truncate rounded-md px-1.5 font-serif text-sm font-medium text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        {title}
      </button>
    </Tooltip>
  )
}

/** Grid, units and look of this map; can become (or take) the project's defaults for new maps. */
function MapSettings({ doc, commit }: { doc: MapDoc; commit: (d: MapDoc) => void }) {
  const { data: config } = useConfig()
  return (
    <Popover
      side="bottom"
      align="end"
      trigger={
        <Button size="md" variant="ghost">
          <Settings2 size={14} aria-hidden />
          Map
        </Button>
      }
    >
      <div className="w-80" data-map-settings>
        <div className="max-h-[70vh] overflow-y-auto p-3">
          <MapSettingsForm value={doc} onChange={(v) => commit({ ...doc, ...v })} />
        </div>
        <div className="flex items-center gap-1 border-t border-line p-2">
          <Button
            size="sm"
            variant="ghost"
            title="New maps in this project start with this map's grid, distances and look"
            onClick={() =>
              void api.setMapDefaults(mapDefaultsOf(doc)).then(
                () => {
                  void queryClient.invalidateQueries({ queryKey: ['config'] })
                  toast.success('New maps will start with these settings')
                },
                (e: Error) => toast.error(e.message),
              )
            }
          >
            Use for new maps
          </Button>
          {config?.maps && (
            <Button
              size="sm"
              variant="ghost"
              title="Take the project's defaults (the map keeps its size)"
              onClick={() => {
                const d = emptyMap({ cols: doc.grid.cols, rows: doc.grid.rows }, config.maps)
                commit({ ...doc, grid: d.grid, style: d.style })
              }}
            >
              Apply project defaults
            </Button>
          )}
        </div>
      </div>
    </Popover>
  )
}

function ViewControls({ id, doc, commit }: { id: string; doc: MapDoc; commit: (d: MapDoc) => void }) {
  const viewMode = useMapUI((s) => s.viewMode)
  const panel = useMapUI((s) => s.panel)
  const set = useMapUI((s) => s.set)
  const exportSvg = async (opts: Parameters<typeof api.exportMapSvg>[1]) => {
    try {
      const file = await api.exportMapSvg(id, opts)
      if (file) toast.success(`Exported ${file}`)
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`)
    }
  }
  return (
    <div className={cn(floating, 'pointer-events-auto flex h-9 shrink-0 items-center gap-1 px-1')}>
      <Segmented
        label="View as"
        value={viewMode}
        onChange={(v) => set({ viewMode: v })}
        options={[
          { value: 'gm', label: 'GM', icon: ShieldUser, showLabel: true },
          { value: 'player', label: 'Players', icon: Eye, showLabel: true },
        ]}
      />
      <IconButton icon={MonitorPlay} label="Open the players' window (only what they see)" onClick={() => void api.openPlayerView(id)} />
      <IconButton icon={Maximize} label="Fit map to screen" onClick={() => window.dispatchEvent(new Event('maquest:map-fit'))} />
      <Separator vertical />
      <MapSettings doc={doc} commit={commit} />
      <Menu trigger={<IconButton icon={Download} label="Export as SVG" />}>
        <MenuItem onClick={() => void exportSvg({ tokens: false })}>SVG: map only</MenuItem>
        <MenuItem onClick={() => void exportSvg({ tokens: true })}>SVG: with tokens</MenuItem>
        <MenuItem onClick={() => void exportSvg({ tokens: true, fog: 'player', lighting: 'player' })}>SVG: as players see it</MenuItem>
        <MenuItem onClick={() => void exportSvg({ tokens: false, grid: false })}>SVG: no grid, no tokens</MenuItem>
      </Menu>
      <IconButton
        icon={PanelRight}
        label={panel ? 'Hide fog, tokens and layers' : 'Show fog, tokens and layers'}
        active={panel}
        onClick={() => set({ panel: !panel })}
      />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center p-8 text-sm text-fg-subtle">{text}</div>
}

/** Delete, duplicate, nudge, order, select all, undo/redo and Esc while the map view is open. */
function useEditorKeys(doc: MapDoc | null, commit: (d: MapDoc) => void) {
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const d = doc
      if (!d || useUI.getState().view !== 'map') return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], [role="menu"], [role="dialog"]')) return
      const { selected, select, snap, set, tool } = useMapUI.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && (key === 'z' || key === 'y')) {
        e.preventDefault()
        void (key === 'y' || e.shiftKey ? api.redo() : api.undo()).catch((err: Error) => toast.error(err.message))
      } else if (mod && key === 'a') {
        e.preventDefault()
        select([...d.objects.map((o) => o.id), ...d.tokens.map((t) => t.id)])
      } else if (mod && key === 'd' && selected.length) {
        e.preventDefault()
        const r = duplicateIds(d, selected)
        commit(r.doc)
        select(r.ids)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) {
        e.preventDefault()
        commit(removeIds(d, selected))
        select([])
      } else if (e.key.startsWith('Arrow') && selected.length && !mod) {
        e.preventDefault()
        const by = e.shiftKey ? 0.1 : snap || 0.5
        const dx = e.key === 'ArrowLeft' ? -by : e.key === 'ArrowRight' ? by : 0
        const dy = e.key === 'ArrowUp' ? -by : e.key === 'ArrowDown' ? by : 0
        commit(moveIds(d, selected, dx, dy, false))
      } else if ((e.key === '[' || e.key === ']') && selected.length) {
        e.preventDefault()
        commit(reorder(d, selected, e.key === ']' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward'))
      } else if (e.key === 'Escape') {
        if (selected.length) select([])
        else if (tool !== 'select') set({ tool: 'select' })
      }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [doc, commit])
}
