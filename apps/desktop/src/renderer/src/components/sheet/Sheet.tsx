import { useEffect, useMemo, useRef, useState } from 'react'
import { Tabs } from '@base-ui/react/tabs'
import { Check, FileText, Pencil, Plus } from 'lucide-react'
import type { StoryNode } from '@maquest/core/schema'
import { isEmptyValue, replaceSection, sheetTabs, type SheetTab } from '@maquest/core/sheet'
import { api } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { useTypes } from '../../lib/styles'
import { MarkdownEditor } from '../MarkdownEditor'
import { Button, IconButton, cn } from '../ui'
import { ghost } from '../inspector/fields'
import { FieldSheet } from './Widgets'
import { FieldForm, fieldPatch } from './FieldForm'
import { CardList } from './Cards'

/** Last tab viewed per node (by key), so reopening a node returns to it. */
const lastTab = new Map<string, string>()

/** The sheet layout of a node: its tabs (empty for plain documents) and type. */
export function useSheet(node: StoryNode, body: string) {
  const types = useTypes()
  const type = types.of(node.type)
  const tabs = useMemo(() => sheetTabs(body, type), [body, type])
  return { tabs, type }
}

/**
 * Entity sheet: the type's tabs, fields tabs with their widgets and the body's H1 sections. Reading is the default;
 * fields and cards switch to editing with the pencil (meters, ratings and toggles also set with a click), prose tabs
 * are edited in place, and the document icon edits the whole body as one document.
 */
export function Sheet({ node, body, onBody }: { node: StoryNode; body: string; onBody: (body: string) => void }) {
  const { tabs, type } = useSheet(node, body)
  const update = useAction(api.updateNode)
  const request = useUI((s) => (s.sheetRequest?.id === node.id ? s.sheetRequest : null))
  const [active, setActive] = useState(() => lastTab.get(node.id) ?? tabs[0]?.key)
  const [editing, setEditing] = useState(false)
  const [source, setSource] = useState(false)
  const current = tabs.find((t) => t.key === active) ?? tabs[0]
  const saveFields = (patch: Record<string, unknown>) => update.mutate([node.id, { fields: patch }])

  // A request from elsewhere (the Problems menu) opens a tab once; then it is cleared from the store.
  const [handled, setHandled] = useState<typeof request>(null)
  if (request && request !== handled) {
    setHandled(request)
    const tab = tabs.find((t) => t.title === request.tab) ?? tabs.find((t) => t.kind === 'fields')
    if (tab) {
      setActive(tab.key)
      setSource(false)
      setEditing(request.edit && (tab.kind === 'fields' || tab.kind === 'cards'))
    }
  }
  useEffect(() => {
    if (request) useUI.getState().requestSheet(null)
  }, [request])

  const choose = (key: string) => {
    setActive(key)
    lastTab.set(node.id, key)
    setEditing(false)
  }
  const addTab = (title: string) => {
    const next = `${body.trimEnd()}${body.trim() ? '\n\n' : ''}# ${title}\n`
    onBody(next)
    const added = sheetTabs(next, type).find((t) => t.kind !== 'fields' && t.title === title)
    if (added) choose(added.key)
  }
  const editable = !source && (current?.kind === 'fields' || current?.kind === 'cards')

  return (
    <Tabs.Root value={current?.key ?? null} onValueChange={(key) => choose(String(key))} className="mt-1">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-panel px-4">
        {source ? (
          <span className="flex h-9 flex-1 items-center text-xs font-medium text-fg-subtle">Whole document</span>
        ) : (
          <Tabs.List aria-label="Sheet" className="relative -mb-px flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
            {tabs.map((t) => (
              <Tabs.Tab
                key={t.key}
                value={t.key}
                className="h-9 shrink-0 border-b-2 border-transparent px-2 text-sm font-medium whitespace-nowrap text-fg-subtle outline-none transition-colors duration-100 first:-ml-2 hover:text-fg focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-inset data-[active]:border-accent data-[active]:text-fg"
              >
                {t.title}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        )}
        {!source && <AddTab taken={tabs.map((t) => t.title)} onAdd={addTab} />}
        {editable && (
          <IconButton
            icon={editing ? Check : Pencil}
            label={editing ? 'Done editing' : current?.kind === 'fields' ? `Edit ${current.title}` : 'Edit cards'}
            size="sm"
            aria-pressed={editing}
            className={cn(editing && 'text-accent-text')}
            onClick={() => setEditing((e) => !e)}
          />
        )}
        <IconButton
          icon={FileText}
          label={source ? 'Back to tabs' : 'Edit as one document'}
          size="sm"
          aria-pressed={source}
          className={cn(source && 'bg-active text-fg')}
          onClick={() => {
            setSource((s) => !s)
            setEditing(false)
          }}
        />
      </div>
      {source ? (
        <MarkdownEditor value={body} onChange={onBody} variant="document" label="Content" placeholder="Start writing…" minHeight="160px" />
      ) : (
        tabs.map((t) => (
          <Tabs.Panel key={t.key} value={t.key} className="outline-none">
            {t.kind === 'fields' ? (
              <div className="px-4 pt-4">
                {editing ? (
                  <FieldForm sections={t.sections} values={node.fields} onSave={saveFields} />
                ) : t.sections.every((s) => s.fields.every((f) => isEmptyValue(node.fields[f.key]))) ? (
                  <EmptyFields title={t.title} none={!t.sections.some((s) => s.fields.length)} onFill={() => setEditing(true)} />
                ) : (
                  <FieldSheet
                    sections={t.sections}
                    values={node.fields}
                    color={type.color}
                    onSet={(key, value) => saveFields({ [key]: fieldPatch(node.fields[key], value) })}
                  />
                )}
              </div>
            ) : t.kind === 'cards' && !editing ? (
              <div className="px-4 pt-4">
                <CardList text={t.text} />
              </div>
            ) : (
              <TabEditor key={t.key} tab={t} onChange={(text) => onBody(replaceSection(body, t.section, text))} />
            )}
          </Tabs.Panel>
        ))
      )}
    </Tabs.Root>
  )
}

/** A section's text as the body stores it: no leading blank line, no trailing whitespace. */
const normalizeSection = (s: string) => s.replace(/^\s*\n/, '').trimEnd()

/**
 * Edits one section. Keeps its own text while typing, because the body normalizes a section (trimmed, one blank
 * line after the heading) and feeding that back would eat trailing newlines as they are typed.
 */
function TabEditor({ tab, onChange }: { tab: Extract<SheetTab, { section: number }>; onChange: (text: string) => void }) {
  const [text, setText] = useState(tab.text)
  const [seen, setSeen] = useState(tab.text)
  if (seen !== tab.text) {
    setSeen(tab.text)
    if (normalizeSection(text) !== tab.text) setText(tab.text)
  }
  return (
    <MarkdownEditor
      value={text}
      onChange={(next) => {
        setText(next)
        onChange(next)
      }}
      variant="document"
      label={tab.title}
      placeholder={`Write ${tab.title.toLowerCase()}…`}
      minHeight="120px"
      hint={false}
    />
  )
}

function EmptyFields({ title, none, onFill }: { title: string; none: boolean; onFill: () => void }) {
  if (none)
    return (
      <p className="py-2 text-sm leading-6 text-fg-subtle">
        This tab has no fields yet. Ask your agent to define them on the type (<span className="font-mono text-xs text-fg-muted">types.&lt;id&gt;.fields</span>
        ).
      </p>
    )
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      <p className="text-sm text-fg-subtle">Nothing in {title} yet.</p>
      <Button variant="outline" size="sm" onClick={onFill}>
        <Pencil size={13} aria-hidden /> Fill in
      </Button>
    </div>
  )
}

function AddTab({ taken, onAdd }: { taken: string[]; onAdd: (title: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const title = name.trim().replaceAll(/\s+/g, ' ')
  const commit = () => {
    if (title && !taken.includes(title)) onAdd(title)
    setName('')
    setAdding(false)
  }
  if (!adding) return <IconButton icon={Plus} label="Add tab" size="sm" onClick={() => setAdding(true)} />
  return (
    <input
      ref={input}
      autoFocus
      aria-label="New tab title"
      placeholder="Tab title…"
      value={name}
      autoComplete="off"
      className={cn(ghost, 'h-6 w-28 shrink-0 bg-surface text-xs shadow-[inset_0_0_0_1px_var(--color-line-strong)]')}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          setName('')
          setAdding(false)
        }
      }}
      onBlur={commit}
    />
  )
}
