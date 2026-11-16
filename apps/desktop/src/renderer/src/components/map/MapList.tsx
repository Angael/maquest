import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Map as MapIcon, MonitorPlay, MoreHorizontal, Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import { emptyMap, mapDefaultsOf } from '@maquest/core/map'
import type { StoryNode } from '@maquest/core/schema'
import { api } from '../../lib/api'
import { queryClient, useConfig, useMap, useNodes } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { Button, IconButton, Input, Menu, MenuItem, MenuSeparator, Popover } from '../ui'
import { MapThumb } from './MapThumb'
import { MapSettingsForm } from './MapPanel'

const refresh = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' })

const failed = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e))

/** The Maps view: every map of the project, to create, open, rename, copy, delete or show to the players. */
export function MapList() {
  const { data: nodes } = useNodes()
  const maps = useMemo(() => nodes?.filter((n) => n.type === 'map') ?? [], [nodes])
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    try {
      const node = await api.createMap(`Map ${maps.length + 1}`)
      await refresh()
      useUI.getState().openMap(node.id)
    } catch (e) {
      failed(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 overflow-y-auto" data-map-list>
      <div className="mx-auto max-w-6xl px-8 py-8">
        <header className="mb-6 flex items-center gap-3">
          <h1 className="font-serif text-2xl font-semibold text-fg">Maps</h1>
          {maps.length > 0 && <span className="tabular text-sm text-fg-subtle">{maps.length}</span>}
          <div className="flex-1" />
          <DefaultsPopover />
          <Button variant="primary" size="lg" onClick={() => void create()} disabled={busy}>
            <Plus size={16} aria-hidden />
            New map
          </Button>
        </header>
        {maps.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl px-6 py-20 text-center shadow-[inset_0_0_0_1px_var(--color-line)]">
            <MapIcon size={28} aria-hidden className="text-fg-faint" />
            <p className="max-w-sm text-sm leading-6 text-fg-subtle">
              Battle maps, dungeons and towns with walls, doors, lights and fog of war. Agents can draw them too.
            </p>
            <Button variant="subtle" size="lg" onClick={() => void create()} disabled={busy}>
              <Plus size={16} aria-hidden />
              Create the first map
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
            {maps.map((n) => (
              <MapCard key={n.id} node={n} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function MapCard({ node }: { node: StoryNode }) {
  const { data: doc } = useMap(node.id)
  const [renaming, setRenaming] = useState(false)
  const open = (background = false) => useUI.getState().openMap(node.id, background)

  const rename = async (title: string) => {
    setRenaming(false)
    if (!title || title === node.title) return
    await api.updateNode(node.id, { title }).catch(failed)
    await refresh()
  }
  const duplicate = async () => {
    try {
      await api.duplicateMap(node.id, `${node.title} copy`)
      await refresh()
    } catch (e) {
      failed(e)
    }
  }
  const remove = async () => {
    try {
      useUI.getState().closeMap(node.id)
      await api.deleteNodes([node.id], false)
      await refresh()
      toast(`Deleted ${node.title}`, { action: { label: 'Undo', onClick: () => void api.undo().then(refresh, failed) } })
    } catch (e) {
      failed(e)
    }
  }

  return (
    <li className="group relative flex flex-col overflow-hidden rounded-xl bg-surface shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-100 hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
      <button
        type="button"
        aria-label={`Open ${node.title}`}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        onClick={() => open()}
        onAuxClick={(e) => e.button === 1 && open(true)}
        onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      >
        <div className="flex aspect-[3/2] items-center justify-center overflow-hidden bg-app">
          <MapThumb id={node.id} className="h-full w-full bg-transparent" />
        </div>
      </button>
      <div className="flex h-12 items-center gap-1 pr-1.5 pl-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <Input
              autoFocus
              defaultValue={node.title}
              aria-label="Map name"
              className="h-7 font-serif"
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => void rename(e.currentTarget.value.trim())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  e.currentTarget.value = node.title
                  e.currentTarget.blur()
                }
              }}
            />
          ) : (
            <>
              <div className="truncate font-serif text-[15px] font-medium text-fg">{node.title}</div>
              {doc && (
                <div className="tabular truncate text-2xs text-fg-subtle">
                  {doc.grid.cols}×{doc.grid.rows} cells · {doc.tokens.length} tokens{doc.fog.enabled ? ' · fog' : ''}
                </div>
              )}
            </>
          )}
        </div>
        <IconButton
          icon={MonitorPlay}
          label="Open as player: a window with only what the players see"
          onClick={() => void api.openPlayerView(node.id).catch(failed)}
        />
        <Menu align="end" trigger={<IconButton icon={MoreHorizontal} label={`More actions for ${node.title}`} />}>
          <MenuItem icon={MapIcon} onClick={() => open()}>
            Open
          </MenuItem>
          <MenuItem icon={Pencil} onClick={() => setRenaming(true)}>
            Rename
          </MenuItem>
          <MenuItem icon={Copy} onClick={() => void duplicate()}>
            Duplicate
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={Trash2} onClick={() => void remove()} danger>
            Delete
          </MenuItem>
        </Menu>
      </div>
    </li>
  )
}

/** Project-wide defaults for new maps: set the units and diagonal rule of your system once and forget them. */
function DefaultsPopover() {
  const { data: config } = useConfig()
  const value = useMemo(() => emptyMap({}, config?.maps), [config])
  const save = (next: Pick<typeof value, 'grid' | 'style'>) =>
    void api.setMapDefaults(mapDefaultsOf({ ...value, ...next })).then(() => queryClient.invalidateQueries({ queryKey: ['config'] }), failed)
  return (
    <Popover
      side="bottom"
      align="end"
      trigger={
        <Button variant="ghost" size="lg">
          <Settings2 size={16} aria-hidden />
          Defaults for new maps
        </Button>
      }
    >
      <div className="w-80" data-map-defaults>
        <p className="border-b border-line px-3 py-2.5 text-xs leading-5 text-fg-subtle">
          New maps in this project start with these. Each map can still change them under Map settings.
        </p>
        <div className="max-h-[70vh] overflow-y-auto p-3">
          <MapSettingsForm value={value} onChange={save} />
        </div>
      </div>
    </Popover>
  )
}
