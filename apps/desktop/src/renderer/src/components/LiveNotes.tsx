import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebouncedCallback } from 'use-debounce'
import { NotebookPen, X } from 'lucide-react'
import { api } from '../lib/api'
import { useUI } from '../lib/store'
import { MarkdownEditor } from './MarkdownEditor'

export const useLiveNotes = () => useQuery({ queryKey: ['liveNotes'], queryFn: () => api.liveNotes() })

/** Toggles the live notes panel; Ctrl+J does the same from anywhere. */
export function LiveNotesButton() {
  const { data: notes = '' } = useLiveNotes()
  const { liveNotesOpen, setLiveNotesOpen } = useUI()
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
    <button
      aria-pressed={liveNotesOpen}
      title="Live notes for your agent (Ctrl+J)"
      onClick={() => setLiveNotesOpen(!liveNotesOpen)}
      className={
        liveNotesOpen
          ? 'flex items-center gap-1.5 rounded-md bg-stone-800 px-3 py-1 text-sm text-stone-100'
          : 'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm text-stone-400 hover:text-stone-200'
      }
    >
      <NotebookPen size={15} />
      Live notes
      {!!notes.trim() && <span className="size-1.5 rounded-full bg-amber-400" aria-label="has notes" />}
    </button>
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
      className="absolute right-3 bottom-3 z-40 flex max-h-[70%] w-[420px] max-w-[calc(100%-1.5rem)] flex-col rounded-lg border border-stone-700 bg-stone-950/95 shadow-2xl backdrop-blur"
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), close())}
    >
      <header className="flex items-center gap-2 border-b border-stone-800 px-3 py-1.5">
        <NotebookPen size={14} className="text-amber-400" />
        <span className="text-sm text-stone-200">Live notes</span>
        <span className="truncate text-xs text-stone-500">your agent sees changes as important</span>
        <button aria-label="Close live notes" title="Close (Esc)" className="ml-auto text-stone-500 hover:text-stone-200" onClick={close}>
          <X size={15} />
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto p-2">
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
