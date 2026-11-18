import { memo } from 'react'
import { ClipboardCopy, CopyPlus, ExternalLink, FileDown, FolderOpen, Inbox, Link2, PanelTop, Plus, Trash2 } from 'lucide-react'
import { STRUCTURE_TYPES, type NodeType, type StoryNode } from '@maquest/core/schema'
import { api } from '../lib/api'
import { currentBoardId, queryClient, useAction, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { useDeleteEverywhere } from '../lib/deletion'
import { useTypes } from '../lib/styles'
import { openNodeTab } from '../lib/nodeLink'
import { exportManuscript } from '../lib/manuscript'
import { MenuItem, MenuSeparator } from './ui'

const CHILD: Partial<Record<NodeType, NodeType>> = { story: 'chapter', chapter: 'scene' }
const NO_NODES: StoryNode[] = []

const copy = (text: string) => void navigator.clipboard.writeText(text)

/**
 * The actions on one node, shared by the inspector's "…" menu and the sidebar's right-click menu. `onAddChild` adds
 * the "Add chapter/scene" item; `openTab` the "Open in new tab" one (both only make sense outside the inspector).
 */
export const NodeMenuItems = memo(function NodeMenuItems({
  id,
  openTab,
  onAddChild,
}: {
  id: string
  openTab?: boolean
  onAddChild?: (type: NodeType, parent: string) => void
}) {
  const { data: all = NO_NODES } = useNodes()
  const node = all.find((n) => n.id === id)
  const types = useTypes()
  const select = useUI((s) => s.select)
  const update = useAction(api.updateNode)
  const duplicate = useAction(api.duplicateNodes)
  const destroy = useDeleteEverywhere()
  if (!node) return null
  const child = CHILD[node.type]
  const map = node.type === 'map'
  const manuscript = STRUCTURE_TYPES.some((t) => t === node.type)
  return (
    <>
      {openTab && (
        <MenuItem icon={PanelTop} onClick={() => (map ? useUI.getState().openMap(id, true) : openNodeTab(id))}>
          Open in new tab
        </MenuItem>
      )}
      {child && onAddChild && (
        <MenuItem icon={Plus} onClick={() => onAddChild(child, id)}>
          Add {types.of(child).label.toLowerCase()}
        </MenuItem>
      )}
      {(openTab || (child && onAddChild)) && <MenuSeparator />}
      <MenuItem icon={Link2} onClick={() => copy(`[[${id}]]`)}>
        Copy link
      </MenuItem>
      {!map && (
        <MenuItem icon={ClipboardCopy} disabled={!node.body.trim()} onClick={() => copy(node.body)}>
          Copy text
        </MenuItem>
      )}
      {!map && (
        <MenuItem
          icon={CopyPlus}
          onClick={() =>
            void duplicate.mutateAsync([[id], { x: 40, y: 40 }, currentBoardId()]).then(async (copies) => {
              await queryClient.refetchQueries({ queryKey: ['nodes'] })
              if (copies[0]) select({ kind: 'node', id: copies[0] })
            })
          }
        >
          Duplicate
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={FolderOpen} onClick={() => void api.reveal(node.path)}>
        Show file in folder
      </MenuItem>
      <MenuItem icon={ExternalLink} onClick={() => void api.openFile(node.path)}>
        Open file in default app
      </MenuItem>
      {manuscript && (
        <MenuItem icon={FileDown} onClick={() => void exportManuscript(id)}>
          Export as Markdown…
        </MenuItem>
      )}
      {node.type !== 'idea' && !map && (
        <MenuItem icon={Inbox} onClick={() => update.mutate([id, { type: 'idea', parent: null }])}>
          Move to backlog
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={Trash2} danger onClick={() => destroy([id])}>
        Delete…
      </MenuItem>
    </>
  )
})
