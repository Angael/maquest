import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, MoreHorizontal, Trash2, X } from 'lucide-react'
import { PROJECT_KINDS, type ProjectKind } from '@maquest/core/schema'
import { api } from '../lib/api'
import { useRecent } from '../lib/queries'
import { Button, IconButton, Input, Menu, MenuItem, MenuSeparator, Select } from './ui'
import { Logo, TitleBar } from './TitleBar'

const KIND_LABEL: Record<ProjectKind, string> = { novel: 'Novel', screenplay: 'Screenplay', rpg: 'RPG campaign', mixed: 'Mixed' }

/** Shortens a long path in the middle, keeping its start and the folder name readable. */
function middle(path: string, max = 56) {
  if (path.length <= max) return path
  const tail = Math.ceil(max * 0.6)
  return `${path.slice(0, max - tail - 1)}…${path.slice(-tail)}`
}

export function StartScreen() {
  const qc = useQueryClient()
  const { data: recent } = useRecent()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ProjectKind>('mixed')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)

  const run = async (action: () => Promise<unknown>, explain?: (message: string) => string) => {
    setError(null)
    setBusy(true)
    try {
      if (await action()) await qc.invalidateQueries()
      else await qc.invalidateQueries({ queryKey: ['app'] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(explain ? explain(message) : message)
    } finally {
      setBusy(false)
    }
  }

  const create = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the project a name first.')
      nameInput.current?.focus()
      return
    }
    void run(() => api.pickFolder({ name: trimmed, kind }))
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar>
        <div className="flex-1" />
      </TitleBar>
      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-app bg-[radial-gradient(80%_60%_at_50%_0%,var(--color-panel),transparent)] px-6">
        <div className="my-auto w-full max-w-[460px] py-16">
          <header className="mb-8 flex flex-col items-center text-center">
            <Logo className="mb-4 size-10" />
            <h1 className="font-serif text-2xl font-semibold text-fg" translate="no">
              Maquest
            </h1>
            <p className="mt-1.5 text-sm text-pretty text-fg-subtle">Stories and worlds in plain markdown, written with your agent.</p>
          </header>

          <form
            className="rounded-xl bg-panel p-4 shadow-[inset_0_0_0_1px_var(--color-line)]"
            onSubmit={(e) => {
              e.preventDefault()
              create()
            }}
          >
            <label htmlFor="new-project-name" className="mb-2 block text-xs font-medium text-fg-subtle">
              New project
            </label>
            <div className="flex gap-2">
              <Input
                id="new-project-name"
                ref={nameInput}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="Project name…"
                className="h-8 min-w-0 flex-1 focus-visible:outline-none!"
                value={name}
                aria-invalid={error === 'Give the project a name first.' || undefined}
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) setError(null)
                }}
              />
              <Select aria-label="Project kind" className="w-36 shrink-0 [&>select]:h-8" value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}>
                {PROJECT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="primary" size="lg" disabled={busy}>
                Create…
              </Button>
            </div>
            <p className="mt-2 text-xs text-fg-faint">You’ll choose where the project folder goes.</p>
          </form>

          <div className="mt-3 flex justify-center">
            <Button size="md" disabled={busy} onClick={() => void run(() => api.pickFolder())}>
              <FolderOpen size={14} aria-hidden />
              Open folder…
            </Button>
          </div>

          <div aria-live="polite" className="min-h-0">
            {error && (
              <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
          </div>

          {!!recent?.length && (
            <section className="mt-10" aria-labelledby="recent-heading">
              <h2 id="recent-heading" className="mb-1.5 px-2 text-xs font-medium text-fg-subtle">
                Recent
              </h2>
              <ul className="space-y-px">
                {recent.map((r) => (
                  <li key={r.root} className="group relative flex items-center rounded-lg focus-within:bg-hover hover:bg-hover">
                    <button
                      type="button"
                      disabled={busy}
                      title={r.root}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-accent)] focus-visible:outline-none!"
                      onClick={() => void run(() => api.open(r.root))}
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                        e.preventDefault()
                        const item = e.currentTarget.closest('li')
                        const next = e.key === 'ArrowDown' ? item?.nextElementSibling : item?.previousElementSibling
                        next?.querySelector('button')?.focus()
                      }}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm text-fg">{r.config.name}</span>
                        <span className="truncate font-mono text-2xs text-fg-faint">{middle(r.root)}</span>
                      </span>
                      <span className="shrink-0 pr-8 text-xs text-fg-subtle">{KIND_LABEL[r.config.kind] ?? r.config.kind}</span>
                    </button>
                    <div className="absolute right-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-popup-open]]:opacity-100">
                      <Menu align="end" trigger={<IconButton icon={MoreHorizontal} size="sm" label={`More actions for ${r.config.name}`} disabled={busy} />}>
                        <MenuItem
                          icon={X}
                          onClick={() =>
                            void run(
                              () => api.removeRecent(r.root),
                              (m) => m,
                            )
                          }
                        >
                          Remove from recent
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          icon={Trash2}
                          danger
                          onClick={() =>
                            void run(
                              () => api.trash(r.root),
                              (m) => `${m}. You can remove the entry from Recent without deleting its folder.`,
                            )
                          }
                        >
                          Move folder to trash
                        </MenuItem>
                      </Menu>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
