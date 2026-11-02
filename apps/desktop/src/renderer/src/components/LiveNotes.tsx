import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebouncedCallback } from 'use-debounce'
import { NotebookPen, X } from 'lucide-react'
import { IconButton, floating, cn } from './ui'
import { api } from '../lib/api'
import { useUI } from '../lib/store'
import { MarkdownEditor } from './MarkdownEditor'

const MOD = window.maquest.platform === 'darwin' ? '⌘' : 'Ctrl'

export const useLiveNotes = () => useQuery({ queryKey: ['liveNotes'], queryFn: () => api.liveNotes() })

/** Toggles the live notes panel; Ctrl+J does the same from anywhere. A dot marks notes that have content. */
export function LiveNotesButton() {
  const { data: notes = '' } = useLiveNotes()
  const open = useUI((s) => s.liveNotesOpen)
  const hasNotes = notes.trim().length > 0
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
  return (
    <IconButton
      icon={NotebookPen}
      label="Live notes"
      shortcut={`${MOD}+J`}
      active={open}
      aria-description={hasNotes ? 'Has notes' : undefined}
      className="relative"
      onClick={() => useUI.getState().setLiveNotesOpen(!open)}
    >
      {hasNotes && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-accent shadow-[0_0_0_2px_var(--color-panel)]" />}
    </IconButton>
  )
}

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

  if (!open || draft === null) return null
  return (
    <section
      aria-label="Live notes"
      className={cn(
        floating,
        'absolute right-3 bottom-3 z-40 flex max-h-[70%] w-[400px] max-w-[calc(100%-1.5rem)] flex-col',
        'transition-[opacity,translate] duration-150 ease-[var(--ease-out)] starting:translate-y-1.5 starting:opacity-0',
      )}
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), close())}
    >
      <header className="flex items-start gap-2 py-2.5 pr-2 pl-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-fg">Live notes</h2>
          <p className="truncate text-xs text-fg-subtle">Your agent treats changes here as important.</p>
        </div>
        <IconButton icon={X} size="sm" label="Close live notes" shortcut="Esc" tooltipSide="top" onClick={close} />
      </header>
      <div className="min-h-0 overflow-y-auto px-3.5 pb-3 [&>div]:border-none [&>div]:bg-transparent [&>div>div]:px-0">
        <MarkdownEditor
          label="Live notes"
          placeholder="Quick notes during the session…"
          minHeight="160px"
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
  )
}
