import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebouncedCallback } from 'use-debounce'
import { NotebookPen, X } from 'lucide-react'
import { IconButton, floating, cn } from './ui'
import { api } from '../lib/api'
import { useUI } from '../lib/store'
import { MarkdownEditor } from './MarkdownEditor'

const MOD = window.maquest.platform === 'darwin' ? '⌘' : 'Ctrl'

export const useLiveNotes = () => useQuery({ queryKey: ['liveNotes'], queryFn: () => api.liveNotes() })

const close = () => useUI.getState().setLiveNotesOpen(false)

/** Floating scratchpad saved to live-notes.md; the MCP server flags changes to the agent as important. */
export function LiveNotesPanel() {
  const open = useUI((s) => s.liveNotesOpen)
  const { data: saved } = useLiveNotes()
  const [draft, setDraft] = useState<string | null>(null)
  const dirty = useRef(false)
  const save = useDebouncedCallback(async (text: string) => {
    await api.setLiveNotes(text)
    dirty.current = false
  }, 400)
  // Take outside edits (agent, git, other editors) unless the author is mid-edit.
  useEffect(() => {
    if (saved !== undefined && !dirty.current) setDraft(saved)
  }, [saved])
  useEffect(() => () => void save.flush(), [save])

  // Ctrl+J toggles the panel from anywhere.
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        useUI.getState().setLiveNotesOpen(!useUI.getState().liveNotesOpen)
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])

  const size = useUI((s) => s.liveNotesSize)
  const [live, setLive] = useState<{ width: number; height: number } | null>(null)
  const { width, height } = live ?? size
  /** The panel is anchored bottom-right, so dragging the top-left corner grows it up and left. */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const handle = e.currentTarget
    const bounds = (handle.closest('section')?.parentElement ?? document.body).getBoundingClientRect()
    const x0 = e.clientX
    const y0 = e.clientY
    let next = { width, height }
    handle.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      next = {
        width: Math.round(Math.min(Math.max(width + x0 - ev.clientX, 260), bounds.width - 24)),
        height: Math.round(Math.min(Math.max(height + y0 - ev.clientY, 140), bounds.height - 24)),
      }
      setLive(next)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      useUI.getState().setLiveNotesSize(next)
      setLive(null)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  // Stay mounted through the exit animation, then drop the editor.
  const [shown, setShown] = useState(open)
  if (open && !shown) setShown(true)

  const hasNotes = (saved ?? '').trim().length > 0
  if (draft === null) return null
  return (
    <>
      <IconButton
        icon={NotebookPen}
        label="Live notes"
        shortcut={`${MOD}+J`}
        aria-description={hasNotes ? 'Has notes' : undefined}
        tooltipSide="left"
        inert={open}
        className={cn(
          floating,
          'absolute right-3 bottom-3 z-40 size-9 rounded-full',
          'transition-[opacity,scale,visibility] duration-150 ease-[var(--ease-out)]',
          open && 'invisible scale-90 opacity-0',
        )}
        onClick={() => useUI.getState().setLiveNotesOpen(true)}
      >
        {hasNotes && <span aria-hidden className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent shadow-[0_0_0_2px_var(--color-panel)]" />}
      </IconButton>
      {(open || shown) && (
        <section
          aria-label="Live notes"
          inert={!open}
          onTransitionEnd={(e) => e.target === e.currentTarget && !open && setShown(false)}
          style={{ width, height }}
          className={cn(
            floating,
            'absolute right-3 bottom-3 z-40 flex max-h-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] origin-bottom-right flex-col',
            'transition-[opacity,scale,visibility] ease-[var(--ease-out)]',
            'starting:scale-95 starting:opacity-0',
            open ? 'duration-160' : 'invisible scale-95 opacity-0 duration-100',
          )}
          onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), close())}
        >
          <div aria-hidden title="Resize" className="absolute -top-1 -left-1 z-10 size-4 cursor-nwse-resize touch-none" onPointerDown={startResize} />
          <header className="flex items-start gap-2 py-2.5 pr-2 pl-3.5">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium text-fg">Live notes</h2>
              <p className="truncate text-xs text-fg-subtle">Your agent treats changes here as important.</p>
            </div>
            <IconButton icon={X} size="sm" label="Close live notes" shortcut="Esc" tooltipSide="top" onClick={close} />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3 [&>div]:border-none [&>div]:bg-transparent [&>div>div]:px-0">
            <MarkdownEditor
              label="Live notes"
              placeholder="Quick notes during the session…"
              minHeight="80px"
              hint={false}
              value={draft}
              onChange={(text) => {
                dirty.current = true
                setDraft(text)
                void save(text)
              }}
            />
          </div>
        </section>
      )}
    </>
  )
}
