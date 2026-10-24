import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { PROJECT_KINDS, type ProjectKind } from '@maquest/core/schema'
import { api } from '../lib/api'
import { useRecent } from '../lib/queries'
import { Button, Input, Label, Select } from './ui'

export function StartScreen() {
  const qc = useQueryClient()
  const { data: recent } = useRecent()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ProjectKind>('mixed')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const updateRecent = async (root: string, trash: boolean) => {
    setError(null)
    setBusy(root)
    try {
      if (trash) await api.trash(root)
      else await api.removeRecent(root)
      await qc.invalidateQueries({ queryKey: ['app'] })
    } catch (err) {
      setError(`${err instanceof Error ? err.message : String(err)}. You can remove the entry from Recent without deleting its folder.`)
    } finally {
      setBusy(null)
    }
  }
  const done = (r: unknown) => r && qc.invalidateQueries()

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,#292524_0%,#0c0a09_60%)]">
      <div className="w-[520px] space-y-8">
        <div>
          <div className="flex items-center gap-2 text-amber-400">
            <Sparkles size={22} />
            <h1 className="font-serif text-4xl text-stone-100">Maquest</h1>
          </div>
          <p className="mt-2 text-sm text-stone-400">
            Stories, campaigns and worlds as plain markdown. Talk to your agent in the project folder and it edits the project through MCP while you watch.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-stone-800 bg-stone-900/60 p-5">
          <Label>New project</Label>
          <div className="flex gap-2">
            <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
            <Select className="w-36" value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}>
              {PROJECT_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" disabled={!name.trim()} onClick={async () => done(await api.pickFolder({ name: name.trim(), kind }))}>
              <Plus size={16} /> Create in folder…
            </Button>
            <Button onClick={async () => done(await api.pickFolder())}>
              <FolderOpen size={16} /> Open existing folder
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        {!!recent?.length && (
          <div>
            <Label>Recent</Label>
            <div className="space-y-1">
              {recent.map((r) => (
                <div key={r.root} className="group flex items-center rounded-md hover:bg-stone-900">
                  <button onClick={async () => done(await api.open(r.root))} className="flex min-w-0 flex-1 items-baseline justify-between px-3 py-2 text-left">
                    <span className="text-stone-200">{r.config.name}</span>
                    <span className="truncate pl-4 text-xs text-stone-500">{r.root}</span>
                  </button>
                  <button
                    title="Move project to trash"
                    aria-label={`Move ${r.config.name} to trash`}
                    disabled={busy !== null}
                    className="px-2 text-stone-500 hover:text-red-400 disabled:opacity-40"
                    onClick={() => void updateRecent(r.root, true)}
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    title="Remove from recent (keep project files)"
                    aria-label={`Remove ${r.config.name} from recent`}
                    disabled={busy !== null}
                    className="px-2 text-stone-500 hover:text-stone-200 disabled:opacity-40"
                    onClick={() => void updateRecent(r.root, false)}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
