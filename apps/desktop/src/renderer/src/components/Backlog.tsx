import { useState } from 'react'
import clsx from 'clsx'
import { ArrowUpRight, Lightbulb } from 'lucide-react'
import type { NodeType } from '@maquest/core/schema'
import { api } from '../lib/api'
import { useAction, useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { useTypes } from '../lib/styles'
import { MarkdownPreview } from './MarkdownEditor'

const PROMOTE: NodeType[] = ['note', 'scene', 'chapter', 'story']

/** The idea pile: dump anything, promote it later. */
export function Backlog() {
  const { data: all = [] } = useNodes()
  const types = useTypes()
  const promote = [...PROMOTE.map(types.of), ...types.list.filter((t) => t.entity)]
  const { selection, select } = useUI()
  const create = useAction(api.createNode)
  const update = useAction(api.updateNode)
  const [text, setText] = useState('')
  const ideas = all.filter((n) => n.type === 'idea').toSorted((a, b) => (b.created ?? '').localeCompare(a.created ?? ''))

  const add = () => {
    const raw = text.trim()
    if (!raw) return
    const [first, ...rest] = raw.split('\n')
    create.mutate([{ type: 'idea', title: first.slice(0, 80), body: rest.join('\n') || (first.length > 80 ? first : '') }])
    setText('')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div>
          <h2 className="flex items-center gap-2 font-serif text-2xl text-stone-100">
            <Lightbulb className="text-pink-400" /> Backlog
          </h2>
          <p className="text-sm text-stone-500">Dump ideas, TODOs and half-thoughts. Promote them when they're ready. Agents file loose ideas here too.</p>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && (e.preventDefault(), add())}
          placeholder="What if the innkeeper is the lost heir?…  (Ctrl+Enter to add; first line = title)"
          className="h-24 w-full rounded-lg border border-stone-800 bg-stone-900 p-3 text-sm outline-none focus:border-pink-500/50"
        />
        <div className="space-y-2">
          {ideas.map((n) => (
            <div
              key={n.id}
              onClick={() => select({ kind: 'node', id: n.id })}
              className={clsx(
                'group cursor-pointer rounded-lg border bg-stone-900/60 p-3',
                selection?.kind === 'node' && selection.id === n.id ? 'border-pink-500/50' : 'border-stone-800 hover:border-stone-700',
              )}
            >
              <div className="flex items-start gap-2">
                <div className="font-medium text-stone-100">{n.title}</div>
                <div className="ml-auto hidden items-center gap-1 group-hover:flex" onClick={(e) => e.stopPropagation()}>
                  <ArrowUpRight size={14} className="text-stone-500" />
                  <select
                    className="rounded bg-stone-800 px-1 py-0.5 text-xs text-stone-200 outline-none"
                    value=""
                    onChange={(e) => update.mutate([n.id, { type: e.target.value as NodeType }])}
                  >
                    <option value="">Promote to…</option>
                    {promote.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {n.body.trim() && (
                <div className="mt-1 line-clamp-4 text-sm">
                  <MarkdownPreview source={n.body} />
                </div>
              )}
              {n.tags.length > 0 && (
                <div className="mt-2 flex gap-1">
                  {n.tags.map((t) => (
                    <span key={t} className="rounded bg-stone-800 px-1.5 text-[11px] text-stone-400">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!ideas.length && <div className="py-10 text-center text-sm text-stone-600">Nothing here yet.</div>}
        </div>
      </div>
    </div>
  )
}
