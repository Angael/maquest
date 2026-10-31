import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { TYPE_ID, isBuiltinType, type TypeDef } from '@maquest/core/schema'
import { api } from '../lib/api'
import { useAction, useNodes } from '../lib/queries'
import { ICON_NAMES, iconFor, useTypes, type TypeStyle } from '../lib/styles'
import { Button, Input, Label, Textarea } from './ui'

const SWATCHES = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#a8a29e']
const ICON_LIMIT = 240

type Change = Partial<Record<keyof TypeDef, string | string[] | null>>

/** Project node types: rename, recolor and re-icon built-ins, and add custom entity types (stored in maquest.json). */
export function Types() {
  const types = useTypes()
  const { data: nodes = [] } = useNodes()
  const setTypes = useAction(api.setTypes)
  const [active, setActive] = useState('character')
  const [newId, setNewId] = useState('')
  const t = types.list.find((x) => x.id === active) ?? types.list[0]
  const save = (id: string, change: Change | null) => setTypes.mutate([{ [id]: change }])
  const slug = newId.trim().toLowerCase().replaceAll(/\s+/g, '-')
  const canAdd = TYPE_ID.test(slug) && !types.list.some((x) => x.id === slug)

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-stone-800 p-3">
        <div className="space-y-0.5" role="list" aria-label="Node types">
          {types.list.map((x) => (
            <button
              key={x.id}
              role="listitem"
              onClick={() => setActive(x.id)}
              className={clsx(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                x.id === t?.id ? 'bg-stone-800 text-stone-100' : 'text-stone-300 hover:bg-stone-900',
              )}
            >
              <x.icon size={15} style={{ color: x.color }} />
              <span className="flex-1 truncate">{x.label}</span>
              {!x.builtin && <span className="text-[10px] text-sky-400">custom</span>}
              <span className="text-[11px] text-stone-600">{nodes.filter((n) => n.type === x.id).length}</span>
            </button>
          ))}
        </div>
        <form
          className="mt-4 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (!canAdd) return
            save(slug, {})
            setActive(slug)
            setNewId('')
          }}
        >
          <Input aria-label="New type id" placeholder="New type, e.g. monster" value={newId} onChange={(e) => setNewId(e.target.value)} />
          <Button type="submit" title="Add type" disabled={!canAdd}>
            <Plus size={15} />
          </Button>
        </form>
        {setTypes.error && <p className="mt-2 text-xs text-red-400">{setTypes.error.message.replace(/^Error invoking remote method 'api': (Error: )?/, '')}</p>}
      </div>
      {t && <TypeEditor key={t.id} t={t} count={nodes.filter((n) => n.type === t.id).length} save={(c) => save(t.id, c)} />}
    </div>
  )
}

function TypeEditor({ t, count, save }: { t: TypeStyle; count: number; save: (change: Change | null) => void }) {
  const [label, setLabel] = useState(t.label)
  const [plural, setPlural] = useState(t.plural)
  const [fields, setFields] = useState(t.fields.join(', '))
  const [body, setBody] = useState(t.body)
  const commit = (key: keyof TypeDef, value: string, current: string) => {
    if (value.trim() !== current) save({ [key]: value.trim() || null })
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2" style={{ background: `${t.color}22`, color: t.color }}>
            <t.icon size={22} />
          </div>
          <div className="flex-1">
            <div className="font-serif text-2xl text-stone-100">{t.label}</div>
            <div className="font-mono text-xs text-stone-500">
              {t.id} · {t.dir}/ · {count} node{count === 1 ? '' : 's'}
            </div>
          </div>
          {t.builtin ? (
            <Button title="Reset to defaults" onClick={() => save(null)}>
              <RotateCcw size={15} /> Reset
            </Button>
          ) : (
            <Button variant="danger" disabled={count > 0} title={count ? 'Convert or delete its nodes first' : 'Delete type'} onClick={() => save(null)}>
              <Trash2 size={15} /> Delete
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input aria-label="Type name" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => commit('label', label, t.label)} />
          </div>
          <div>
            <Label>Plural</Label>
            <Input aria-label="Type plural" value={plural} onChange={(e) => setPlural(e.target.value)} onBlur={() => commit('plural', plural, t.plural)} />
          </div>
        </div>

        <div>
          <Label>Color</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                aria-label={`Color ${c}`}
                aria-pressed={t.color === c}
                onClick={() => save({ color: c })}
                className={clsx('size-6 rounded-full', t.color === c && 'ring-2 ring-stone-100 ring-offset-2 ring-offset-stone-950')}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              aria-label="Custom color"
              value={t.color}
              onChange={(e) => save({ color: e.target.value })}
              className="size-7 cursor-pointer rounded bg-transparent"
            />
          </div>
        </div>

        <div>
          <Label>Icon</Label>
          <IconPicker value={t.iconName} color={t.color} onChange={(icon) => save({ icon })} />
        </div>

        {!t.builtin && (
          <>
            <div>
              <Label>Starter fields (comma separated)</Label>
              <Input
                aria-label="Starter fields"
                placeholder="threat, habitat, weakness"
                value={fields}
                onChange={(e) => setFields(e.target.value)}
                onBlur={() => {
                  const list = fields
                    .split(',')
                    .map((f) => f.trim())
                    .filter(Boolean)
                  if (list.join(',') !== t.fields.join(',')) save({ fields: list.length ? list : null })
                }}
              />
            </div>
            <div>
              <Label>Starter body</Label>
              <Textarea
                aria-label="Starter body"
                rows={5}
                placeholder={'## Description\n\n## Tactics\n'}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={() => body !== t.body && save({ body: body || null })}
              />
            </div>
          </>
        )}
        {isBuiltinType(t.id) && <p className="text-xs text-stone-500">Built-in types keep their id and folder; only how they look changes.</p>}
      </div>
    </div>
  )
}

export function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (icon: string) => void }) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase().replaceAll(/\s+/g, '-')
    const list = q ? ICON_NAMES.filter((n) => n.includes(q)) : ICON_NAMES
    return list.toSorted((a, b) => Number(!a.startsWith(q)) - Number(!b.startsWith(q)) || a.length - b.length)
  }, [query])
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-2">
      <Input
        aria-label="Search icons"
        placeholder={`Search ${ICON_NAMES.length} icons (current: ${value})`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-2 grid max-h-64 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1 overflow-y-auto" role="listbox" aria-label="Icons">
        {matches.slice(0, ICON_LIMIT).map((name) => {
          const Icon = iconFor(name)
          return (
            <button
              key={name}
              role="option"
              aria-selected={name === value}
              aria-label={name}
              title={name}
              onClick={() => onChange(name)}
              className={clsx(
                'flex aspect-square items-center justify-center rounded hover:bg-stone-800',
                name === value ? 'bg-stone-800 ring-1 ring-amber-400' : 'text-stone-400',
              )}
              style={name === value ? { color } : undefined}
            >
              <Icon size={18} />
            </button>
          )
        })}
      </div>
      {matches.length > ICON_LIMIT && (
        <p className="mt-1 text-[11px] text-stone-500">
          Showing {ICON_LIMIT} of {matches.length}; search to narrow.
        </p>
      )}
      {!matches.length && <p className="mt-1 text-[11px] text-stone-500">No icons match.</p>}
    </div>
  )
}
