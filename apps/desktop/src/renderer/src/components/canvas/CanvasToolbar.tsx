import { useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import { Popover as BasePopover } from '@base-ui/react/popover'
import { BookOpen, Check, ChevronDown, Columns3, Ellipsis, Group, Layers, LayoutGrid, Lock, Pencil, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react'
import { ALL_BOARD, type Board } from '@maquest/core/schema'
import { LAYOUT_MODES, arrange } from '@maquest/core/layout'
import { api } from '../../lib/api'
import { useAction, useBoard, useGraph, useNodes } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { Button, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator, Separator, Tooltip, cn, floating, menuItem, popupSurface } from '../ui'
import { FIT_VIEW, cardSize, isCard, type AnyFlowNode } from './shared'

/** Hierarchical auto layout: groups arrange their own content and move as blocks; pinned cards stay put. */
function useAutoLayout(afterLayout: () => void) {
  const flow = useReactFlow<AnyFlowNode>()
  const setLayout = useAction(api.setLayout)
  const board = useBoard()
  const [error, setError] = useState<Error | null>(null)
  const run = async (mode = useUI.getState().layoutMode) => {
    setError(null)
    if (!board) return
    try {
      const nodes = flow.getNodes().filter(isCard)
      const cards = nodes.map((n) => ({ id: n.id, position: n.position, size: cardSize(n), pinned: n.data.node.pinned }))
      const pane = document.querySelector('.react-flow')?.getBoundingClientRect()
      const aspectRatio = pane && pane.height > 0 ? pane.width / pane.height : undefined
      const { positions, groups } = await arrange(board, cards, flow.getEdges(), { mode, aspectRatio })
      const sizes = Object.fromEntries(cards.map((c) => [c.id, c.size]))
      if (nodes.length || board.groups.length) await setLayout.mutateAsync([positions, board.id, { groups, sizes }])
      afterLayout()
      requestAnimationFrame(() => void flow.fitView({ ...FIT_VIEW, duration: 400 }))
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }
  return { run, pending: setLayout.isPending, error }
}

/** Radio item with a second line of help, styled like the menu primitives. */
const radioItem = cn(menuItem, 'h-auto items-start py-1.5')

function AutoLayoutButton({ afterLayout }: { afterLayout: () => void }) {
  const autoLayout = useAutoLayout(afterLayout)
  const layoutMode = useUI((s) => s.layoutMode)
  const setLayoutMode = useUI((s) => s.setLayoutMode)
  const mode = LAYOUT_MODES.find((m) => m.mode === layoutMode) ?? LAYOUT_MODES[0]
  return (
    <>
      <div className="flex items-center rounded-md hover:bg-hover/50">
        <IconButton
          size="sm"
          icon={LayoutGrid}
          label={`Auto-layout (${mode.label})`}
          className="rounded-r-none"
          disabled={autoLayout.pending}
          onClick={() => void autoLayout.run()}
        />
        <Menu
          className="w-72"
          trigger={
            <Button size="sm" aria-label="Auto-layout style" className="w-4 rounded-l-none px-0 text-fg-faint hover:text-fg">
              <ChevronDown size={12} aria-hidden />
            </Button>
          }
        >
          <MenuLabel>Arrange unpinned cards</MenuLabel>
          <BaseMenu.RadioGroup
            value={layoutMode}
            onValueChange={(value) => {
              setLayoutMode(value as typeof layoutMode)
              void autoLayout.run(value as typeof layoutMode)
            }}
          >
            {LAYOUT_MODES.map((m) => (
              <BaseMenu.RadioItem key={m.mode} value={m.mode} closeOnClick className={radioItem}>
                <span className="flex h-5 w-3.5 shrink-0 items-center">
                  <BaseMenu.RadioItemIndicator>
                    <Check size={14} className="text-accent-text" aria-hidden />
                  </BaseMenu.RadioItemIndicator>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-5 text-fg">{m.label}</span>
                  <span className="block text-2xs leading-4 whitespace-normal text-fg-subtle">{m.hint}</span>
                </span>
              </BaseMenu.RadioItem>
            ))}
          </BaseMenu.RadioGroup>
        </Menu>
      </div>
      {autoLayout.error && <ToolbarError error={autoLayout.error} />}
    </>
  )
}

function StoryScope() {
  const { data: all = [] } = useNodes()
  const storyScope = useUI((s) => s.storyScope)
  const setStoryScope = useUI((s) => s.setStoryScope)
  const stories = all.filter((n) => n.type === 'story')
  if (stories.length < 2) return null
  const current = stories.find((s) => s.id === storyScope)
  return (
    <Menu
      className="max-w-72"
      trigger={
        <Button size="sm" aria-label="Story scope" className={cn('max-w-44 gap-1 px-1.5', current && 'text-accent-text')}>
          <BookOpen size={14} aria-hidden className="shrink-0" />
          <span className="truncate">{current?.title ?? 'All stories'}</span>
          <ChevronDown size={12} aria-hidden className="shrink-0 text-fg-faint" />
        </Button>
      }
    >
      <MenuLabel>Show cards of</MenuLabel>
      <BaseMenu.RadioGroup value={storyScope ?? ''} onValueChange={(value) => setStoryScope((value as string) || null)}>
        {[{ id: '', title: 'All stories' }, ...stories].map((s) => (
          <BaseMenu.RadioItem key={s.id} value={s.id} closeOnClick className={menuItem}>
            <span className="flex w-3.5 shrink-0">
              <BaseMenu.RadioItemIndicator>
                <Check size={14} className="text-accent-text" aria-hidden />
              </BaseMenu.RadioItemIndicator>
            </span>
            <span className="truncate">{s.title}</span>
          </BaseMenu.RadioItem>
        ))}
      </BaseMenu.RadioGroup>
    </Menu>
  )
}

function ToolbarError({ error }: { error: Error }) {
  return (
    <div role="alert" className="absolute top-full left-0 mt-2 max-w-sm rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
      {error.message}
    </div>
  )
}

const tab =
  'flex h-6 shrink-0 items-center gap-1.5 rounded-[5px] px-2 text-xs font-medium outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-accent/70'
const tabState = (on: boolean) => (on ? 'bg-active text-fg' : 'text-fg-subtle hover:bg-hover hover:text-fg')

/** Board tabs (drag to reorder), board actions and a new-board button. */
function Boards() {
  const { data: graph } = useGraph()
  const board = useBoard()
  const setBoard = useUI((s) => s.setBoard)
  const create = useAction(api.createBoard)
  const update = useAction(api.updateBoard)
  const remove = useAction(api.deleteBoard)
  const reorder = useAction(api.reorderBoards)
  const [dragged, setDragged] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null)
  const [editing, setEditing] = useState<'new' | 'rename' | null>(null)
  const [title, setTitle] = useState('')
  const [phasesOpen, setPhasesOpen] = useState(false)
  const actions = useRef<HTMLButtonElement>(null)
  if (!graph || !board) return null
  const submit = async () => {
    const value = title.trim()
    setEditing(null)
    if (!value) return
    if (editing === 'new') setBoard((await create.mutateAsync([{ title: value }])).id)
    else update.mutate([board.id, { title: value }])
  }
  const error = create.error ?? update.error ?? remove.error ?? reorder.error
  const readOnly = board.id === ALL_BOARD
  const drop = (target: string, after: boolean) => {
    if (!dragged || dragged === target) return
    const ids = graph.boards.map((b) => b.id).filter((id) => id !== dragged)
    ids.splice(ids.indexOf(target) + (after ? 1 : 0), 0, dragged)
    reorder.mutate([ids])
  }
  const input = (
    <form
      key="board-name"
      className="flex shrink-0"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <input
        autoFocus
        aria-label={editing === 'new' ? 'New board name' : 'Board name'}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => void submit()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(null)
        }}
        placeholder="Board name"
        className="h-6 w-32 rounded-[5px] bg-app/60 px-2 text-xs text-fg shadow-[inset_0_0_0_1px_var(--color-accent)] outline-none placeholder:text-fg-faint"
      />
    </form>
  )
  return (
    <>
      <div role="tablist" aria-label="Boards" className="flex max-w-[40vw] min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
        <Tooltip content="Every node in the project, read-only">
          <button role="tab" aria-selected={readOnly} onClick={() => setBoard(ALL_BOARD)} className={cn(tab, tabState(readOnly))}>
            <Layers size={13} aria-hidden className={readOnly ? 'text-accent-text' : undefined} />
            Overview
          </button>
        </Tooltip>
        <Separator vertical className="mx-0.5" />
        {graph.boards.map((b) =>
          editing === 'rename' && b.id === board.id ? (
            input
          ) : (
            <button
              key={b.id}
              role="tab"
              aria-selected={b.id === board.id}
              onClick={() => setBoard(b.id)}
              onDoubleClick={() => {
                setTitle(b.title)
                setEditing('rename')
              }}
              draggable
              data-board-tab={b.id}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-maquest-board', b.id)
                e.dataTransfer.effectAllowed = 'move'
                setDragged(b.id)
              }}
              onDragEnd={() => {
                setDragged(null)
                setDropAt(null)
              }}
              onDragOver={(e) => {
                if (!dragged) return
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'move'
                const rect = e.currentTarget.getBoundingClientRect()
                setDropAt({ id: b.id, after: e.clientX > rect.left + rect.width / 2 })
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                drop(b.id, e.clientX > rect.left + rect.width / 2)
                setDragged(null)
                setDropAt(null)
              }}
              className={cn(
                tab,
                tabState(b.id === board.id),
                'max-w-40',
                dragged === b.id && 'opacity-40',
                dropAt?.id === b.id &&
                  dragged !== b.id &&
                  (dropAt.after ? 'shadow-[inset_-2px_0_0_var(--color-accent)]' : 'shadow-[inset_2px_0_0_var(--color-accent)]'),
              )}
            >
              <span className="truncate">{b.title}</span>
            </button>
          ),
        )}
        {editing === 'new' && input}
      </div>
      {!readOnly && (
        <Menu trigger={<IconButton ref={actions} size="sm" icon={Ellipsis} label="Board actions" className="text-fg-subtle" />} className="min-w-52">
          <MenuLabel>{board.title}</MenuLabel>
          <MenuItem
            icon={Pencil}
            onClick={() => {
              setTitle(board.title)
              setEditing('rename')
            }}
          >
            Rename…
          </MenuItem>
          <MenuItem icon={Columns3} onClick={() => setTimeout(() => setPhasesOpen(true))}>
            Phase columns…{board.phases.length ? ` (${board.phases.length})` : ''}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={Trash2}
            danger
            disabled={graph.boards.length < 2}
            onClick={() => {
              setBoard(graph.boards.find((b) => b.id !== board.id)!.id)
              remove.mutate([board.id])
            }}
          >
            Delete board
          </MenuItem>
        </Menu>
      )}
      {editing !== 'new' && (
        <IconButton
          size="sm"
          icon={Plus}
          label="New board"
          className="text-fg-subtle"
          onClick={() => {
            setTitle('')
            setEditing('new')
          }}
        />
      )}
      {!readOnly && (
        <BasePopover.Root open={phasesOpen} onOpenChange={setPhasesOpen}>
          <BasePopover.Portal>
            <BasePopover.Positioner anchor={actions} side="bottom" align="start" sideOffset={10} className="z-[60]">
              <BasePopover.Popup aria-label="Phase columns" className={cn(popupSurface, 'popup-motion w-72 p-3')}>
                <PhaseEditor key={board.id} board={board} save={(phases) => update.mutate([board.id, { phases }])} />
              </BasePopover.Popup>
            </BasePopover.Positioner>
          </BasePopover.Portal>
        </BasePopover.Root>
      )}
      {error && <ToolbarError error={error} />}
    </>
  )
}

function PhaseEditor({ board, save }: { board: Board; save: (phases: Board['phases']) => void }) {
  const [phases, setPhases] = useState(board.phases)
  const commit = (next: Board['phases']) => {
    setPhases(next)
    save(next.filter((p) => p.title.trim()))
  }
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium text-fg">Phase columns</div>
        <p className="mt-0.5 text-xs text-fg-subtle">Acts, left to right. A card belongs to the column it sits in; move it to change phase.</p>
      </div>
      {phases.length > 0 && (
        <ol className="space-y-1">
          {phases.map((p, i) => (
            <li key={p.id} className="flex items-center gap-1.5">
              <span className="tabular w-4 text-right text-xs text-fg-faint">{i + 1}</span>
              <input
                aria-label={`Phase ${i + 1}`}
                value={p.title}
                onChange={(e) => setPhases(phases.map((x) => (x.id === p.id ? { ...x, title: e.target.value } : x)))}
                onBlur={() => commit(phases)}
                className="h-7 min-w-0 flex-1 rounded-md bg-surface px-2 text-sm text-fg shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_1px_var(--color-accent)]"
              />
              <IconButton size="sm" icon={X} label={`Remove phase ${p.title}`} onClick={() => commit(phases.filter((x) => x.id !== p.id))} />
            </li>
          ))}
        </ol>
      )}
      <Button size="sm" variant="subtle" onClick={() => commit([...phases, { id: crypto.randomUUID().slice(0, 8), title: `Phase ${phases.length + 1}` }])}>
        <Plus size={14} aria-hidden /> Add phase
      </Button>
    </div>
  )
}

/** One floating toolbar: boards, then (on editable boards) add, history, arrange, group and story scope. */
export function CanvasToolbar({
  canUndo,
  canRedo,
  travel,
  openAddMenu,
  group,
  afterLayout,
  readOnly,
}: {
  canUndo: boolean
  canRedo: boolean
  travel: (direction: 'undo' | 'redo') => void
  openAddMenu: (point: { x: number; y: number }) => void
  group: () => void
  afterLayout: () => void
  readOnly: boolean
}) {
  return (
    <div role="toolbar" aria-label="Canvas" className={cn(floating, 'relative flex h-9 max-w-full items-center gap-0.5 px-1.5')}>
      <Boards />
      <Separator vertical className="mx-1.5" />
      {readOnly ? (
        <span className="flex items-center gap-1.5 px-1 text-xs text-fg-subtle">
          <Lock size={12} aria-hidden /> Read-only
        </span>
      ) : (
        <>
          <Tooltip content="Add a card" shortcut="A">
            <Button
              size="sm"
              variant="primary"
              aria-haspopup="menu"
              className="gap-1 pr-2.5 pl-1.5"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                openAddMenu({ x: rect.left, y: rect.bottom + 8 })
              }}
            >
              <Plus size={14} aria-hidden /> Add
            </Button>
          </Tooltip>
          <Separator vertical className="mx-1.5" />
          <IconButton
            size="sm"
            icon={Undo2}
            label="Undo"
            shortcut="Ctrl+Z"
            aria-keyshortcuts="Control+Z Meta+Z"
            disabled={!canUndo}
            onClick={() => travel('undo')}
          />
          <IconButton
            size="sm"
            icon={Redo2}
            label="Redo"
            shortcut="Ctrl+Shift+Z"
            aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"
            disabled={!canRedo}
            onClick={() => travel('redo')}
          />
          <Separator vertical className="mx-1.5" />
          <AutoLayoutButton afterLayout={afterLayout} />
          <IconButton size="sm" icon={Group} label="Group selection" shortcut="Ctrl+G" aria-keyshortcuts="Control+G Meta+G" onClick={group} />
          <StoryScope />
        </>
      )}
    </div>
  )
}
