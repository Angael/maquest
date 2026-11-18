import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { CircleDot, CopyPlus, ExternalLink, FolderOpen, Inbox, LayoutDashboard, Link2, Map as MapIcon, Network, Pencil, PlusSquare, Trash2 } from 'lucide-react'
import { onBoard, type Status, type StoryNode } from '@maquest/core/schema'
import { api } from '../../lib/api'
import { currentBoardId, queryClient, useGraph, useNodes } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { useDeleteEverywhere } from '../../lib/deletion'
import { useTypes } from '../../lib/styles'
import { STATUSES, STATUS_LABEL, StatusDot } from '../inspector/properties'
import { MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub } from '../ui'

/** Refreshes project queries after a direct api call. */
export const refresh = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' })

/** Runs a menu action: refreshes on success, reports failures as a toast (the menu is gone by then). */
export function act<T>(work: Promise<T>): Promise<T | undefined> {
  return work.then(
    async (result) => {
      await refresh()
      return result
    },
    (error: unknown) => {
      toast.error((error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method 'api': (Error: )?/, ''))
      return undefined
    },
  )
}

export const copyText = (text: string, what = 'Copied') =>
  void navigator.clipboard.writeText(text).then(
    () => toast(what),
    () => toast.error('Could not copy to the clipboard'),
  )

/** Opens a node the way a click does: maps in their tab, everything else in the inspector. */
export function openNode(node: Pick<StoryNode, 'id' | 'type'>, newTab = false) {
  const ui = useUI.getState()
  if (node.type === 'map') ui.openMap(node.id, newTab)
  else if (newTab) ui.openTab(node.id)
  else ui.select({ kind: 'node', id: node.id })
}

/** Selects a node and puts the cursor in the inspector's title, ready to type. */
export function renameInInspector(id: string) {
  const ui = useUI.getState()
  if (ui.view !== 'canvas' && ui.view !== 'backlog') ui.setView('canvas')
  ui.select({ kind: 'node', id })
  let tries = 0
  const focus = () => {
    const title = document.querySelector<HTMLTextAreaElement>(`[data-node-title="${CSS.escape(id)}"]`)
    if (title) {
      title.focus()
      title.select()
    } else if (++tries < 20) requestAnimationFrame(focus)
  }
  requestAnimationFrame(focus)
}

export async function duplicateNode(node: StoryNode) {
  const copies = await act(node.type === 'map' ? api.duplicateMap(node.id, `${node.title} copy`).then((n) => [n.id]) : api.duplicateNodes([node.id], { x: 40, y: 40 }, currentBoardId()))
  await queryClient.refetchQueries({ queryKey: ['nodes'] })
  if (copies?.[0] && node.type !== 'map') useUI.getState().select({ kind: 'node', id: copies[0] })
}

/** Status as a submenu of radio items; with several nodes it shows the status they share, if any. */
export function StatusMenu({ nodes }: { nodes: StoryNode[] }) {
  const shared = nodes.every((n) => n.status === nodes[0]?.status) ? (nodes[0]?.status ?? '') : '-'
  return (
    <MenuSub label="Status" icon={CircleDot}>
      <MenuRadioGroup
        value={shared}
        onValueChange={(value) => {
          const status = (value || null) as Status | null
          void act(Promise.all(nodes.map((n) => api.updateNode(n.id, { status }))))
        }}
      >
        <MenuRadioItem value="" iconNode={<StatusDot />}>
          No status
        </MenuRadioItem>
        {STATUSES.map((s) => (
          <MenuRadioItem key={s} value={s} iconNode={<StatusDot status={s} />}>
            {STATUS_LABEL[s]}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </MenuSub>
  )
}

/** Boards that do not show all of `ids` yet; empty when every board already has them. */
export function AddToBoardMenu({ ids }: { ids: string[] }) {
  const { data: graph } = useGraph()
  const boards = (graph?.boards ?? []).filter((b) => ids.some((id) => !onBoard(b, id)))
  if (!boards.length) return null
  return (
    <MenuSub label="Add to board" icon={PlusSquare}>
      {boards.map((b) => (
        <MenuItem key={b.id} icon={LayoutDashboard} onClick={() => void act(api.updateBoard(b.id, { addNodes: ids.filter((id) => !onBoard(b, id)) }))}>
          {b.title}
        </MenuItem>
      ))}
    </MenuSub>
  )
}

/**
 * Everything you can do with one node, wherever it shows up (sidebar, links, chips, lists). `children` adds the actions
 * that only make sense where the menu opened, at the top.
 */
export function NodeMenu({
  id,
  children,
  rename,
  open,
  remove,
}: {
  id: string
  children?: ReactNode
  /** Rename in place (sidebar rows); otherwise the inspector title takes the cursor. */
  rename?: () => void
  /** What "Open" does here (default: like a click on a node link). */
  open?: () => void
  /** Replaces "Delete…" (e.g. the backlog deletes with an undo toast). */
  remove?: () => void
}) {
  const { data: nodes } = useNodes()
  const { data: graph } = useGraph()
  const types = useTypes()
  const destroy = useDeleteEverywhere()
  const node = nodes?.find((n) => n.id === id)
  if (!node) return <MenuItem disabled>Not found</MenuItem>
  const isMap = node.type === 'map'
  const board = graph?.boards.find((b) => b.id === currentBoardId() && onBoard(b, id)) ?? graph?.boards.find((b) => onBoard(b, id))
  const S = types.of(node.type)
  return (
    <>
      {children}
      {children && <MenuSeparator />}
      <MenuItem icon={isMap ? MapIcon : S.icon} color={isMap ? undefined : S.color} onClick={open ?? (() => openNode(node))}>
        {isMap ? 'Open map' : 'Open'}
      </MenuItem>
      <MenuItem icon={ExternalLink} onClick={() => openNode(node, true)}>
        Open in new tab
      </MenuItem>
      {board && node.type !== 'idea' && (
        <MenuItem icon={Network} onClick={() => useUI.getState().focusNode(id, board.id)}>
          Show on canvas
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={Pencil} shortcut="F2" onClick={rename ?? (() => (isMap ? openNode(node) : renameInInspector(id)))}>
        Rename
      </MenuItem>
      <MenuItem icon={CopyPlus} onClick={() => void duplicateNode(node)}>
        Duplicate
      </MenuItem>
      <MenuItem icon={Link2} onClick={() => copyText(`[[${id}]]`, 'Link copied')}>
        Copy link
      </MenuItem>
      <StatusMenu nodes={[node]} />
      {node.type !== 'idea' && <AddToBoardMenu ids={[id]} />}
      <MenuSeparator />
      <MenuItem icon={FolderOpen} onClick={() => void api.reveal(node.path)}>
        Show file in folder
      </MenuItem>
      {node.type !== 'idea' && !isMap && (
        <MenuItem icon={Inbox} onClick={() => void act(api.updateNode(id, { type: 'idea', parent: null }))}>
          Move to backlog
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={Trash2} danger shortcut="Del" onClick={remove ?? (() => destroy([id]))}>
        Delete…
      </MenuItem>
    </>
  )
}
