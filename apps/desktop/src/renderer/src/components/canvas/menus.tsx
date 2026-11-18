import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpLeft,
  BoxSelect,
  ClipboardPaste,
  Copy,
  CopyPlus,
  EyeOff,
  FolderOpen,
  Group,
  Link2,
  Map as MapIcon,
  Palette,
  Pencil,
  Search,
  Spline,
  Trash2,
  Ungroup,
  Unlink,
  type LucideIcon,
} from 'lucide-react'
import {
  EDGE_TYPES,
  GROUP_COLORS,
  onBoard,
  type Board,
  type EdgeType,
  type Group as GroupT,
  type GroupColor,
  type NodeType,
  type StoryNode,
} from '@maquest/core/schema'
import { api } from '../../lib/api'
import { currentBoardId, useGraph, useNodes } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { EDGE_STYLE, GROUP_STYLE, useTypes } from '../../lib/styles'
import { AddToBoardMenu, StatusMenu, act, copyText, openNode, renameInInspector } from '../menus/NodeMenu'
import { MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub, cn, popupSurface } from '../ui'

/*
 * The add-card menu (right-click on the empty canvas, A key) and the menus of cards, lines and groups. The add menu is hand-placed
 * because it holds a search field; the others use the shared context menu host.
 */

type Point = { x: number; y: number }

/** Keeps a floating menu on screen, focuses its first item and closes it on outside clicks. */
function useFloatingMenu(point: Point, close: () => void) {
  const menu = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = menu.current!
    const rect = element.getBoundingClientRect()
    element.style.left = `${Math.max(8, Math.min(point.x, window.innerWidth - rect.width - 8))}px`
    element.style.top = `${Math.max(8, Math.min(point.y, window.innerHeight - rect.height - 8))}px`
    element.querySelector('button')?.focus({ preventScroll: true })
  }, [point])
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close()
    }
    window.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('resize', close)
    }
  }, [close])
  return menu
}

/** Arrow / Home / End move between items; Escape and Tab close. */
function menuKeys(event: ReactKeyboardEvent<HTMLDivElement>, close: () => void) {
  const buttons = Array.from(event.currentTarget.querySelectorAll('button'))
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (event.target instanceof HTMLInputElement && event.key !== 'Escape' && event.key !== 'ArrowDown') return
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    close()
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
}

/** Same look as the Base UI menu items, driven by focus (these menus move focus themselves). */
const item =
  'flex h-7 w-full cursor-default items-center gap-2 rounded-[5px] px-2 text-left text-sm text-fg-muted outline-none select-none hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg focus:bg-hover focus:text-fg'

function Item({
  icon: Icon,
  color,
  shortcut,
  danger,
  onClick,
  children,
}: {
  icon: LucideIcon
  color?: string
  shortcut?: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(item, danger && 'text-danger hover:bg-danger-soft hover:text-danger focus:bg-danger-soft focus:text-danger')}
      onClick={onClick}
    >
      <Icon size={14} aria-hidden className={cn('shrink-0', !color && !danger && 'text-fg-subtle')} style={color ? { color } : undefined} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="shrink-0 text-2xs text-fg-faint">{shortcut}</span>}
    </button>
  )
}

const Divider = () => <div role="separator" className="mx-1 my-1 h-px bg-line" />
const Heading = ({ children }: { children: ReactNode }) => <div className="px-2 pt-1.5 pb-1 text-2xs font-medium text-fg-subtle">{children}</div>

export type CardActions = Record<'copy' | 'duplicate' | 'group' | 'remove' | 'destroy', () => void>

/** Right-click menu of one card or of the selected cards (`ids` are entity ids). */
export function CardMenu({ ids, actions }: { ids: string[]; actions: CardActions }) {
  const { data: nodes } = useNodes()
  const picked = (nodes ?? []).filter((n) => ids.includes(n.id))
  const one = ids.length === 1 ? picked[0] : undefined
  const types = useTypes()
  const S = one && types.of(one.type)
  return (
    <>
      {ids.length > 1 && <MenuLabel>{ids.length} cards</MenuLabel>}
      {one && S && (
        <>
          <MenuItem icon={one.type === 'map' ? MapIcon : S.icon} color={one.type === 'map' ? undefined : S.color} onClick={() => openNode(one, true)}>
            {one.type === 'map' ? 'Open map' : 'Open in new tab'}
          </MenuItem>
          <MenuItem icon={Pencil} shortcut="F2" onClick={() => (one.type === 'map' ? openNode(one) : renameInInspector(one.id))}>
            Rename
          </MenuItem>
          <MenuSeparator />
        </>
      )}
      <MenuItem icon={Copy} shortcut="Ctrl+C" onClick={actions.copy}>
        Copy reference
      </MenuItem>
      {one && (
        <MenuItem icon={Link2} onClick={() => copyText(`[[${one.id}]]`, 'Link copied')}>
          Copy link
        </MenuItem>
      )}
      <MenuItem icon={CopyPlus} shortcut="Ctrl+D" onClick={actions.duplicate}>
        Duplicate
      </MenuItem>
      <MenuItem icon={Group} shortcut="Ctrl+G" onClick={actions.group}>
        Group
      </MenuItem>
      {picked.length > 0 && <StatusMenu nodes={picked} />}
      <AddToBoardMenu ids={ids} />
      {one && (
        <>
          <MenuSeparator />
          <MenuItem icon={FolderOpen} onClick={() => void api.reveal(one.path)}>
            Show file in folder
          </MenuItem>
        </>
      )}
      <MenuSeparator />
      <MenuItem icon={EyeOff} shortcut="Del" onClick={actions.remove}>
        Remove from board
      </MenuItem>
      <MenuItem icon={Trash2} shortcut="Shift+Del" danger onClick={actions.destroy}>
        Delete everywhere…
      </MenuItem>
    </>
  )
}

const go = (nodeId: string) => useUI.getState().focusNode(nodeId, currentBoardId())

/** Right-click menu of a connection line (or its label). Containment lines only offer detaching the child. */
export function EdgeMenu({ id, select }: { id: string; select: () => void }) {
  const { data: graph } = useGraph()
  const { data: nodes } = useNodes()
  const title = (nodeId: string) => nodes?.find((n) => n.id === nodeId)?.title ?? nodeId
  if (id.startsWith('contains:')) {
    const child = id.slice('contains:'.length)
    const parent = nodes?.find((n) => n.id === child)?.parent
    return (
      <>
        {parent && (
          <MenuItem icon={ArrowUpLeft} onClick={() => go(parent)}>
            Go to {title(parent)}
          </MenuItem>
        )}
        <MenuItem icon={ArrowDownRight} onClick={() => go(child)}>
          Go to {title(child)}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={Unlink} onClick={() => void act(api.updateNode(child, { parent: null }))}>
          Detach from parent
        </MenuItem>
      </>
    )
  }
  const edge = graph?.edges.find((e) => e.id === id)
  if (!edge) return <MenuItem disabled>Not found</MenuItem>
  return (
    <>
      <MenuItem icon={Pencil} onClick={select}>
        Edit connection
      </MenuItem>
      <MenuSub label="Type" icon={Spline}>
        <MenuRadioGroup value={edge.type} onValueChange={(type) => void act(api.updateEdge(id, { type: type as EdgeType }))}>
          {EDGE_TYPES.map((t) => (
            <MenuRadioItem key={t} value={t} iconNode={<span className="size-2 rounded-full" style={{ background: EDGE_STYLE[t].color }} />}>
              {t}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuSub>
      <MenuItem icon={ArrowLeftRight} onClick={() => void act(api.updateEdge(id, { source: edge.target, target: edge.source }))}>
        Reverse direction
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={ArrowUpLeft} onClick={() => go(edge.source)}>
        Go to {title(edge.source)}
      </MenuItem>
      <MenuItem icon={ArrowDownRight} onClick={() => go(edge.target)}>
        Go to {title(edge.target)}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={Trash2} danger shortcut="Del" onClick={() => void act(api.removeEdge(id))}>
        Delete connection
      </MenuItem>
    </>
  )
}

/** Right-click menu of a group frame. */
export function GroupMenu({
  group,
  rename,
  recolor,
  selectCards,
  ungroup,
}: {
  group: GroupT
  rename: () => void
  recolor: (color: GroupColor) => void
  selectCards: () => void
  ungroup: () => void
}) {
  return (
    <>
      <MenuItem icon={Pencil} onClick={rename}>
        Rename
      </MenuItem>
      <MenuSub label="Color" icon={Palette}>
        <MenuRadioGroup value={group.color} onValueChange={(c) => recolor(c as GroupColor)}>
          {GROUP_COLORS.map((c) => (
            <MenuRadioItem key={c} value={c} iconNode={<span className="size-3 rounded-full" style={{ background: GROUP_STYLE[c].border }} />}>
              {c[0].toUpperCase() + c.slice(1)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuSub>
      <MenuItem icon={BoxSelect} disabled={!group.nodes.length} onClick={selectCards}>
        Select cards
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={Ungroup} shortcut="Del" onClick={ungroup}>
        Ungroup
      </MenuItem>
    </>
  )
}

export function AddNodeMenu({
  point,
  close,
  create,
  board,
  nodes,
  place,
  group,
  paste,
}: {
  point: Point
  close: () => void
  create: (type: NodeType) => void
  group: () => void
  paste?: () => void
  board?: Board
  nodes: StoryNode[]
  place: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const missing = board ? nodes.filter((n) => !onBoard(board, n.id) && n.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : []
  const menu = useFloatingMenu(point, close)
  const types = useTypes()
  return (
    <div
      ref={menu}
      role="menu"
      aria-label="Add node"
      className={cn(popupSurface, 'fixed z-50 max-h-[calc(100vh-16px)] w-60 overflow-y-auto')}
      style={{ left: point.x, top: point.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => menuKeys(event, close)}
    >
      {paste && (
        <>
          <Item icon={ClipboardPaste} shortcut="Ctrl+V" onClick={paste}>
            Paste reference
          </Item>
          <Divider />
        </>
      )}
      <Heading>New card</Heading>
      {types.list
        .filter((t) => t.id !== 'media')
        .map((style) => (
          <Item key={style.id} icon={style.icon} color={style.color} onClick={() => create(style.id)}>
            {style.label}
          </Item>
        ))}
      <Divider />
      <Item icon={Group} onClick={group}>
        Group area
      </Item>
      {board && (
        <>
          <Divider />
          <div className="relative px-1 pt-0.5 pb-1">
            <Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-faint" />
            <input
              aria-label="Find an existing node to place on this board"
              placeholder="Place existing…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 w-full rounded-[5px] bg-app/60 pr-2 pl-7 text-sm text-fg shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-fg-faint focus:shadow-[inset_0_0_0_1px_var(--color-accent)]"
            />
          </div>
          {missing.map((n) => {
            const style = types.of(n.type)
            return (
              <Item key={n.id} icon={style.icon} color={style.color} onClick={() => place(n.id)}>
                {n.title}
              </Item>
            )
          })}
        </>
      )}
      <p className="px-2 pt-1 pb-1.5 text-2xs text-fg-faint">Drop images or videos on the canvas to add media.</p>
    </div>
  )
}
