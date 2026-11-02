import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { ClipboardPaste, Copy, CopyPlus, EyeOff, Group, Search, Trash2, type LucideIcon } from 'lucide-react'
import { onBoard, type Board, type NodeType, type StoryNode } from '@maquest/core/schema'
import { useTypes } from '../../lib/styles'
import { cn, popupSurface } from '../ui'

/*
 * Cursor-positioned menus (right-click, A key). Hand-placed at the pointer and deliberately not animated: they open
 * dozens of times a session, often from the keyboard.
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

export type NodeActions = Record<'copy' | 'duplicate' | 'group' | 'remove' | 'destroy', () => void>

export function NodeMenu({ point, count, close, actions }: { point: Point; count: number; close: () => void; actions: NodeActions }) {
  const menu = useFloatingMenu(point, close)
  const run = (action: () => void) => () => {
    close()
    action()
  }
  return (
    <div
      ref={menu}
      role="menu"
      aria-label={count === 1 ? 'Card actions' : `Actions for ${count} cards`}
      className={cn(popupSurface, 'fixed z-50 w-64')}
      style={{ left: point.x, top: point.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => menuKeys(event, close)}
    >
      {count > 1 && <Heading>{count} cards</Heading>}
      <Item icon={Copy} shortcut="Ctrl+C" onClick={run(actions.copy)}>
        Copy reference
      </Item>
      <Item icon={CopyPlus} shortcut="Ctrl+D" onClick={run(actions.duplicate)}>
        Duplicate
      </Item>
      <Item icon={Group} shortcut="Ctrl+G" onClick={run(actions.group)}>
        Group
      </Item>
      <Divider />
      <Item icon={EyeOff} shortcut="Del" onClick={run(actions.remove)}>
        Remove from board
      </Item>
      <Item icon={Trash2} shortcut="Shift+Del" danger onClick={run(actions.destroy)}>
        Delete everywhere…
      </Item>
    </div>
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
