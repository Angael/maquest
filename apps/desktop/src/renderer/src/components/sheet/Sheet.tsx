import { useEffect, useMemo, useRef, useState } from 'react'
import { Tabs } from '@base-ui/react/tabs'
import { Check, FileText, Pencil, Plus } from 'lucide-react'
import type { StoryNode } from '@maquest/core/schema'
import { isEmptyStat, replaceSection, sheetTabs, systemIdOf, type SheetTab } from '@maquest/core/sheet'
import { api } from '../../lib/api'
import { useAction, useSystems } from '../../lib/queries'
import { useUI } from '../../lib/store'
import { useTypes } from '../../lib/styles'
import { MarkdownEditor } from '../MarkdownEditor'
import { Button, IconButton, cn } from '../ui'
import { GhostSelect, ghost } from '../inspector/fields'
import { StatBlock, StatForm } from './StatBlock'
import { AbilityCards } from './Abilities'

/** Last tab viewed per node (by title), so reopening a node returns to it. */
const lastTab = new Map<string, string>()

/** The sheet layout of a node: its tabs (empty for plain documents) and statblock system. */
export function useSheet(node: StoryNode, body: string) {
  const types = useTypes()
  const systems = useSystems()
  const type = types.of(node.type)
  const systemId = systemIdOf(node, type)
  const system = systemId ? systems.get(systemId) : undefined
  const hasStats = !!system || !isEmptyStat(node.stats)
  const tabs = useMemo(
    () => sheetTabs(body, { statsTitle: hasStats ? (system?.tab ?? 'Stats') : undefined, tabs: type.tabs }),
    [body, hasStats, system, type.tabs],
  )
  return { tabs, system, systemId, type, systems }
}

/**
 * Entity sheet: the statblock and the body's H1 sections as tabs. Reading is the default; the statblock and ability
 * cards switch to editing with the pencil, prose tabs are edited in place, and the document icon edits the whole
 * body as one document.
 */
export function Sheet({ node, body, onBody }: { node: StoryNode; body: string; onBody: (body: string) => void }) {
  const { tabs, system, systemId, type, systems } = useSheet(node, body)
  const update = useAction(api.updateNode)
  const request = useUI((s) => (s.sheetRequest?.id === node.id ? s.sheetRequest : null))
  const [active, setActive] = useState(() => lastTab.get(node.id) ?? tabs[0]?.title)
  const [editing, setEditing] = useState(false)
  const [source, setSource] = useState(false)
  const current = tabs.find((t) => t.title === active) ?? tabs[0]

  // A request from elsewhere (the Problems menu) opens the statblock once; then it is cleared from the store.
  const [handled, setHandled] = useState<typeof request>(null)
  if (request && request !== handled) {
    setHandled(request)
    const stats = tabs.find((t) => t.kind === 'stats')
    if (stats) {
      setActive(stats.title)
      setSource(false)
      setEditing(request.edit)
    }
  }
  useEffect(() => {
    if (request) useUI.getState().requestSheet(null)
  }, [request])

  const choose = (title: string) => {
    setActive(title)
    lastTab.set(node.id, title)
    setEditing(false)
  }
  const addTab = (title: string) => {
    onBody(`${body.trimEnd()}${body.trim() ? '\n\n' : ''}# ${title}\n`)
    choose(title)
  }
  const editable = !source && (current?.kind === 'stats' || current?.kind === 'abilities')

  return (
    <Tabs.Root value={current?.key ?? null} onValueChange={(key) => choose(tabs.find((t) => t.key === key)?.title ?? '')} className="mt-1">
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
            label={editing ? 'Done editing' : current?.kind === 'stats' ? 'Edit statblock' : 'Edit abilities'}
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
            {t.kind === 'stats' ? (
              <div className="px-4 pt-4">
                {editing ? (
                  <>
                    <SystemPicker
                      value={node.system ?? ''}
                      typeDefault={type.system ? (systems.get(type.system)?.label ?? type.system) : undefined}
                      options={[...systems.values()].map((s) => ({ value: s.id, label: s.label }))}
                      onChange={(id) => update.mutate([node.id, { system: id || null }])}
                    />
                    <StatForm key={systemId ?? ''} system={system} stats={node.stats ?? {}} onSave={(patch) => update.mutate([node.id, { stats: patch }])} />
                  </>
                ) : isEmptyStat(node.stats) ? (
                  <EmptyStats label={system?.label} onFill={() => setEditing(true)} />
                ) : (
                  <StatBlock system={system} stats={node.stats ?? {}} color={type.color} />
                )}
              </div>
            ) : t.kind === 'abilities' && !editing ? (
              <div className="px-4 pt-4">
                <AbilityCards text={t.text} />
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

function SystemPicker({
  value,
  typeDefault,
  options,
  onChange,
}: {
  value: string
  typeDefault?: string
  options: { value: string; label: string }[]
  onChange: (id: string) => void
}) {
  return (
    <div className="mb-2 flex h-7 items-center gap-2">
      <span className="w-[88px] shrink-0 text-xs text-fg-subtle">System</span>
      <GhostSelect
        aria-label="Statblock system"
        value={value}
        muted={!value}
        options={[{ value: '', label: typeDefault ? `${typeDefault} (type default)` : 'None' }, ...options]}
        onValueChange={onChange}
      />
    </div>
  )
}

function EmptyStats({ label, onFill }: { label?: string; onFill: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      <p className="text-sm text-fg-subtle">No {label ?? ''} statblock yet.</p>
      <Button variant="outline" size="sm" onClick={onFill}>
        <Pencil size={13} aria-hidden /> Fill statblock
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
