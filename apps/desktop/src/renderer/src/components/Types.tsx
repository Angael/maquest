import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Pipette, RotateCcw, Trash2 } from 'lucide-react'
import { TYPE_ID, typeInfo, type TypeDef } from '@maquest/core/schema'
import { api } from '../lib/api'
import { useAction, useConfig, useNodes } from '../lib/queries'
import { useTypes, type TypeStyle } from '../lib/styles'
import { Button, Input, Label, Textarea, Tooltip, cn } from './ui'
import { IconPicker } from './views/IconPicker'
import { CreateButton, ListGroup, PageHeader, TwoPane, listRow } from './views/ViewLayout'

const SWATCHES: [string, string][] = [
  ['#ef4444', 'Red'],
  ['#f97316', 'Orange'],
  ['#f59e0b', 'Amber'],
  ['#eab308', 'Yellow'],
  ['#84cc16', 'Lime'],
  ['#10b981', 'Emerald'],
  ['#06b6d4', 'Cyan'],
  ['#3b82f6', 'Blue'],
  ['#6366f1', 'Indigo'],
  ['#8b5cf6', 'Violet'],
  ['#ec4899', 'Pink'],
  ['#a8a29e', 'Stone'],
]

type Change = Partial<Record<keyof TypeDef, string | string[] | null>>

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method 'api': (Error: )?/, '')
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Project node types: rename, recolor and re-icon built-ins, and add custom entity types (stored in maquest.json). */
export function Types() {
  const types = useTypes()
  const { data: nodes } = useNodes()
  const { data: config } = useConfig()
  const setTypes = useAction(api.setTypes)
  const [active, setActive] = useState('character')
  const t = types.list.find((x) => x.id === active) ?? types.list[0]
  const save = (id: string, change: Change | null) => setTypes.mutate([{ [id]: change }])
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of nodes ?? []) map.set(n.type, (map.get(n.type) ?? 0) + 1)
    return map
  }, [nodes])
  const groups = useMemo(
    () =>
      [
        { label: 'Built-in', items: types.list.filter((x) => x.builtin) },
        { label: 'Custom', items: types.list.filter((x) => !x.builtin) },
      ].filter((g) => g.items.length),
    [types],
  )
  const custom = types.list.length - (groups[0]?.items.length ?? 0)

  const header = (
    <PageHeader
      title="Types"
      count={`${types.list.length} types${custom ? ` · ${custom} custom` : ''}`}
      description="What your project is made of. Rename, recolor and re-icon the built-ins, or add your own kinds of things, like monsters or spells."
    >
      <CreateButton
        label="New type"
        fieldLabel="New type name"
        placeholder="e.g. Monster"
        submitLabel="Add type"
        hint={(v) => {
          const id = slugOf(v)
          return id && TYPE_ID.test(id) ? (
            <span className="font-mono">
              id {id} · folder {typeInfo(id).dir}/
            </span>
          ) : (
            'Singular, like “Monster”. Lowercase letters, numbers and dashes.'
          )
        }}
        create={async (name) => {
          const id = slugOf(name)
          if (!TYPE_ID.test(id)) return 'Use letters, numbers and dashes, starting with a letter.'
          if (types.list.some((x) => x.id === id)) return 'That type already exists.'
          try {
            await setTypes.mutateAsync([{ [id]: {} }])
          } catch (error) {
            return errorText(error)
          }
          setActive(id)
          return null
        }}
      />
    </PageHeader>
  )

  return (
    <TwoPane
      header={header}
      listLabel="Node types"
      list={groups.map((g) => (
        <ListGroup key={g.label} label={g.label} count={g.items.length}>
          {g.items.map((x) => (
            <li key={x.id}>
              <button type="button" aria-current={x.id === t?.id ? 'page' : undefined} onClick={() => setActive(x.id)} className={listRow(x.id === t?.id)}>
                <x.icon size={14} style={{ color: x.color }} aria-hidden className="shrink-0" />
                <span className="flex-1 truncate">{x.label}</span>
                <span className="tabular text-2xs text-fg-faint" aria-label={plural(counts.get(x.id) ?? 0, 'node')}>
                  {counts.get(x.id) ?? 0}
                </span>
              </button>
            </li>
          ))}
        </ListGroup>
      ))}
    >
      {t && (
        <TypeEditor
          key={t.id}
          t={t}
          count={counts.get(t.id) ?? 0}
          customized={!!config?.types?.[t.id]}
          error={setTypes.error ? errorText(setTypes.error) : null}
          save={(c) => save(t.id, c)}
        />
      )}
    </TwoPane>
  )
}

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur()
const slugOf = (s: string) => s.trim().toLowerCase().replaceAll(/\s+/g, '-')

function TypeEditor({
  t,
  count,
  customized,
  error,
  save,
}: {
  t: TypeStyle
  count: number
  customized: boolean
  error: string | null
  save: (change: Change | null) => void
}) {
  const [label, setLabel] = useState(t.label)
  const [pluralName, setPluralName] = useState(t.plural)
  const [fields, setFields] = useState(t.fields.join(', '))
  const [body, setBody] = useState(t.body)
  // Adopt changes made elsewhere (agents, git, reset) to fields the user isn't editing.
  const [seen, setSeen] = useState(t)
  if (seen !== t) {
    setSeen(t)
    if (seen.label !== t.label) setLabel(t.label)
    if (seen.plural !== t.plural) setPluralName(t.plural)
    if (seen.fields.join(',') !== t.fields.join(',')) setFields(t.fields.join(', '))
    if (seen.body !== t.body) setBody(t.body)
  }
  const commit = (key: keyof TypeDef, value: string, current: string) => {
    if (value.trim() !== current) save({ [key]: value.trim() || null })
  }

  return (
    <div className="max-w-2xl px-6 pt-5 pb-10">
      <div className="flex items-center gap-4">
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `color-mix(in oklch, ${t.color} 16%, transparent)`,
            color: t.color,
            boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${t.color} 28%, transparent)`,
          }}
        >
          <t.icon size={24} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-2xl leading-9 font-semibold text-fg">{t.label}</h2>
          <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <span className="font-mono text-2xs text-fg-faint" translate="no">
              {t.id} · {t.dir}/
            </span>
            <span aria-hidden className="text-fg-faint">
              ·
            </span>
            <span className="tabular">{plural(count, 'node')}</span>
            {t.builtin && (
              <>
                <span aria-hidden className="text-fg-faint">
                  ·
                </span>
                <span>Built-in</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-7 space-y-7">
        <section>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input
                aria-label="Type name"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => commit('label', label, t.label)}
                onKeyDown={blurOnEnter}
              />
            </div>
            <div>
              <Label>Plural</Label>
              <Input
                aria-label="Type plural"
                value={pluralName}
                onChange={(e) => setPluralName(e.target.value)}
                onBlur={() => commit('plural', pluralName, t.plural)}
                onKeyDown={blurOnEnter}
              />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-fg-faint">
            {t.builtin ? 'Built-in types keep their id and folder; only how they look changes.' : 'The plural names the sidebar section.'}
          </p>
        </section>

        <section>
          <Label>Color</Label>
          <ColorPicker value={t.color} onChange={(color) => save({ color })} />
        </section>

        <section>
          <Label>Icon</Label>
          <IconPicker value={t.iconName} color={t.color} onChange={(icon) => save({ icon })} />
        </section>

        {!t.builtin && (
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-fg">New {t.plural.toLowerCase()} start with</h3>
              <p className="mt-0.5 text-xs text-fg-subtle">Applied when you or an agent creates a {t.label.toLowerCase()}. Existing nodes are not changed.</p>
            </div>
            <div>
              <Label>Fields</Label>
              <Input
                aria-label="Starter fields"
                placeholder="threat, habitat, weakness"
                value={fields}
                onChange={(e) => setFields(e.target.value)}
                onKeyDown={blurOnEnter}
                onBlur={() => {
                  const list = fields
                    .split(',')
                    .map((f) => f.trim())
                    .filter(Boolean)
                  if (list.join(',') !== t.fields.join(',')) save({ fields: list.length ? list : null })
                }}
              />
              <p className="mt-1.5 text-xs text-fg-faint">Comma separated. Each becomes an empty property in the inspector.</p>
            </div>
            <div>
              <Label>Body template</Label>
              <Textarea
                aria-label="Starter body"
                rows={4}
                placeholder={'## Description\n\n## Tactics\n'}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={() => body !== t.body && save({ body: body || null })}
                className="min-h-24 font-mono text-xs leading-5"
              />
              <p className="mt-1.5 text-xs text-fg-faint">Markdown the body starts with, e.g. headings to fill in.</p>
            </div>
          </section>
        )}

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        <section className="flex items-center gap-4 border-t border-line pt-5">
          {t.builtin ? (
            <>
              <p className="flex-1 text-xs text-fg-subtle">
                {customized ? `Restore the default name, color and icon of ${t.label}.` : 'This type uses its default name, color and icon.'}
              </p>
              <Button variant="outline" disabled={!customized} onClick={() => save(null)}>
                <RotateCcw size={14} aria-hidden />
                Reset to defaults
              </Button>
            </>
          ) : (
            <>
              <p className="flex-1 text-xs text-fg-subtle">
                {count
                  ? `${plural(count, 'node')} ${count === 1 ? 'uses' : 'use'} this type. Move or delete ${count === 1 ? 'it' : 'them'} before deleting the type.`
                  : 'No nodes use this type, so it can be deleted safely.'}
              </p>
              <Button variant="danger" disabled={count > 0} onClick={() => save(null)}>
                <Trash2 size={14} aria-hidden />
                Delete type
              </Button>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/** Swatches as a radio group (arrow keys move the choice) plus a custom color well. */
function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const group = useRef<HTMLDivElement>(null)
  const current = value.toLowerCase()
  const index = SWATCHES.findIndex(([hex]) => hex === current)
  const isCustom = index < 0
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!step) return
    e.preventDefault()
    const next = (Math.max(index, 0) + step + SWATCHES.length) % SWATCHES.length
    onChange(SWATCHES[next][0])
    group.current?.querySelectorAll<HTMLButtonElement>('[role=radio]')[next]?.focus()
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={group} role="radiogroup" aria-label="Color" onKeyDown={move} className="flex flex-wrap items-center gap-2">
        {SWATCHES.map(([hex, name], i) => {
          const on = hex === current
          return (
            <Tooltip key={hex} content={name}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={name}
                tabIndex={on || (isCustom && i === 0) ? 0 : -1}
                onClick={() => onChange(hex)}
                className={cn(
                  'flex size-6 items-center justify-center rounded-full outline-none transition-transform duration-100 hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-app active:scale-95',
                  on && 'ring-2 ring-fg ring-offset-2 ring-offset-app',
                )}
                style={{ background: hex }}
              >
                {on && <Check size={13} strokeWidth={3} className="text-black/70" aria-hidden />}
              </button>
            </Tooltip>
          )
        })}
      </div>
      <span aria-hidden className="mx-1 h-4 w-px bg-line" />
      <Tooltip content="Custom color">
        <label
          className={cn(
            'relative flex size-6 cursor-pointer items-center justify-center rounded-full focus-within:ring-2 focus-within:ring-accent/70',
            isCustom ? 'ring-2 ring-fg ring-offset-2 ring-offset-app' : 'shadow-[inset_0_0_0_1px_var(--color-line-strong)] text-fg-subtle hover:text-fg',
          )}
          style={isCustom ? { background: value } : undefined}
        >
          {isCustom ? <Check size={13} strokeWidth={3} className="text-black/70" aria-hidden /> : <Pipette size={12} aria-hidden />}
          <input
            type="color"
            aria-label="Custom color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </Tooltip>
      <span className="ml-1 font-mono text-2xs text-fg-faint uppercase">{value}</span>
    </div>
  )
}
