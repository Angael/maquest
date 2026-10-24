import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useDebouncedCallback } from 'use-debounce'
import { RotateCcw } from 'lucide-react'
import { PROJECT_KINDS, type Guideline, type ProjectKind } from '@maquest/core/schema'
import { api } from '../lib/api'
import { useAction, useConfig, useGuidelines } from '../lib/queries'
import { MarkdownEditor } from './MarkdownEditor'
import { Button, Input, Label, Select } from './ui'

const SOURCE_BADGE: Record<Guideline['source'], string> = {
  default: 'text-stone-500',
  override: 'text-amber-400',
  custom: 'text-sky-400',
}

/** Built-in guidelines with per-project overrides. Agents read and edit the same data via MCP. */
export function Guidelines() {
  const { data: list = [] } = useGuidelines()
  const { data: config } = useConfig()
  const updateConfig = useAction(api.updateConfig)
  const setGuideline = useAction(api.setGuideline)
  const [active, setActive] = useState<string | null>(null)
  const [newId, setNewId] = useState('')
  const g = list.find((x) => x.id === active) ?? list[0]

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 overflow-y-auto border-r border-stone-800 p-3">
        <Label>Project kind (picks applicable guidelines)</Label>
        <Select value={config?.kind} onChange={(e) => updateConfig.mutate([{ kind: e.target.value as ProjectKind }])}>
          {PROJECT_KINDS.map((k) => <option key={k}>{k}</option>)}
        </Select>
        <div className="mt-4 space-y-0.5">
          {list.map((x) => {
            const applies = config?.kind === 'mixed' || x.scope === 'all' || x.scope === config?.kind
            return (
              <button key={x.id} onClick={() => setActive(x.id)} className={clsx('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm', g?.id === x.id ? 'bg-stone-800' : 'hover:bg-stone-900', (x.disabled || !applies) && 'opacity-40')}>
                <span className="truncate">{x.title}</span>
                <span className={clsx('ml-auto text-[10px] uppercase', SOURCE_BADGE[x.source])}>{x.source}</span>
              </button>
            )
          })}
        </div>
        <form className="mt-4" onSubmit={async (e) => {
          e.preventDefault()
          if (!newId.trim()) return
          const created = await setGuideline.mutateAsync([newId, { title: newId, body: '- ' }])
          setActive(created.id)
          setNewId('')
        }}>
          <Input placeholder="+ new guideline" value={newId} onChange={(e) => setNewId(e.target.value)} />
        </form>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto p-6">{g && <GuidelineEditor key={g.id} g={g} />}</div>
    </div>
  )
}

function GuidelineEditor({ g }: { g: Guideline }) {
  const setGuideline = useAction(api.setGuideline)
  const reset = useAction(api.resetGuideline)
  const [title, setTitle] = useState(g.title)
  const [body, setBody] = useState(g.body)
  const save = useDebouncedCallback((patch: { title?: string; body?: string }) => setGuideline.mutate([g.id, patch]), 600)
  useEffect(() => () => void save.flush(), [save])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <input className="flex-1 bg-transparent font-serif text-2xl text-stone-100 outline-none" value={title} onChange={(e) => (setTitle(e.target.value), save({ title: e.target.value }))} />
        <Select className="w-32" value={g.scope} onChange={(e) => setGuideline.mutate([g.id, { scope: e.target.value as Guideline['scope'] }])}>
          {(['all', 'novel', 'screenplay', 'rpg'] as const).map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Button onClick={() => setGuideline.mutate([g.id, { disabled: !g.disabled }])}>{g.disabled ? 'Enable' : 'Disable'}</Button>
        {g.source !== 'default' && (
          <Button variant="danger" onClick={() => reset.mutate([g.id])} title={g.source === 'custom' ? 'Delete' : 'Restore built-in default'}>
            <RotateCcw size={15} /> {g.source === 'custom' ? 'Delete' : 'Reset'}
          </Button>
        )}
      </div>
      <p className="text-xs text-stone-500">
        {g.source === 'default'
          ? 'Built-in default. Editing creates a project override in guidelines/' + g.id + '.md.'
          : `Stored in guidelines/${g.id}.md`}
      </p>
      <MarkdownEditor value={body} onChange={(b) => (setBody(b), save({ body: b }))} />
    </div>
  )
}
