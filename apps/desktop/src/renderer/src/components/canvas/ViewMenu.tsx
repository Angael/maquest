import type { ReactNode } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { EDGE_DESCRIPTIONS, EDGE_TYPES, type EdgeType } from '@maquest/core/schema'
import { useShallow } from 'zustand/react/shallow'
import { useUI } from '../../lib/store'
import { EDGE_STYLE, useTypes, type EdgeKind } from '../../lib/styles'
import { Button, Popover, Segmented, Select, cn, floating } from '../ui'
import { EDGE_KINDS, VIEW_MODES } from './shared'

const CUSTOM = -1

/** The current view preset (index into VIEW_MODES) and how many types are hidden. */
function useViewState() {
  const types = useTypes()
  const { hiddenNodes, hiddenEdges } = useUI(useShallow((s) => ({ hiddenNodes: s.hiddenNodes, hiddenEdges: s.hiddenEdges })))
  const ids = types.list.map((t) => t.id)
  const current = VIEW_MODES.findIndex(
    (mode) =>
      ids.every((t) => hiddenNodes.includes(t) === !mode.nodes(types.list).includes(t)) &&
      EDGE_KINDS.every((t) => hiddenEdges.includes(t) === !mode.edges.includes(t)),
  )
  const hidden = ids.filter((t) => hiddenNodes.includes(t)).length + EDGE_KINDS.filter((t) => hiddenEdges.includes(t)).length
  const apply = (index: number) => {
    const preset = VIEW_MODES[index]
    const shown = preset.nodes(types.list)
    useUI.setState({ hiddenNodes: ids.filter((t) => !shown.includes(t)), hiddenEdges: EDGE_KINDS.filter((t) => !preset.edges.includes(t)) })
  }
  return { types, ids, hiddenNodes, hiddenEdges, current, hidden, apply }
}

function Section({ title, count, children }: { title: string; count: string; children: ReactNode }) {
  return (
    <Collapsible.Root className="border-t border-line">
      <Collapsible.Trigger className="group flex h-8 w-full items-center gap-1.5 px-3 text-xs font-medium text-fg-subtle outline-none hover:text-fg focus-visible:bg-hover">
        <ChevronRight size={12} aria-hidden className="transition-transform duration-100 group-data-[panel-open]:rotate-90" />
        <span className="flex-1 text-left">{title}</span>
        <span className="tabular font-normal text-fg-faint">{count}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="px-1.5 pb-2">{children}</Collapsible.Panel>
    </Collapsible.Root>
  )
}

const toggleRow =
  'flex h-7 w-full items-center gap-2 rounded-[5px] px-1.5 text-xs outline-none transition-colors duration-100 hover:bg-hover focus-visible:bg-hover'

function ViewSettings() {
  const { types, ids, hiddenNodes, hiddenEdges, current, apply } = useViewState()
  const edgeLabels = useUI((s) => s.edgeLabels)
  const referenceLines = useUI((s) => s.referenceLines)
  const connectType = useUI((s) => s.connectType)
  const setConnectType = useUI((s) => s.setConnectType)
  const toggleEdge = useUI((s) => s.toggleEdge)
  const toggleNode = useUI((s) => s.toggleNode)
  const description = connectType === 'auto' ? 'Picks the line type from the two cards, e.g. scene → location is located-at.' : EDGE_DESCRIPTIONS[connectType]
  return (
    <div className="w-80">
      <div className="space-y-3 p-3">
        <Segmented
          label="Graph view mode"
          value={current}
          options={VIEW_MODES.map((m, i) => ({ value: i, label: m.label, icon: m.icon, showLabel: true }))}
          onChange={apply}
          className="[&>button]:px-1.5 [&>button]:whitespace-nowrap [&_svg]:shrink-0"
        />
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs text-fg-muted">
          <span>Line names</span>
          <Segmented
            label="When to show line names"
            value={edgeLabels}
            options={[
              { value: 'focus', label: 'On hover' },
              { value: 'always', label: 'Always' },
            ]}
            onChange={(value) => useUI.setState({ edgeLabels: value })}
          />
          <span>References</span>
          <Segmented
            label="How to show references"
            value={referenceLines ? 'lines' : 'chips'}
            options={[
              { value: 'chips', label: 'Chips' },
              { value: 'lines', label: 'Lines' },
            ]}
            onChange={(value) => useUI.setState({ referenceLines: value === 'lines' })}
          />
          <span>Connect as</span>
          <Select aria-label="New connection type" value={connectType} onChange={(e) => setConnectType(e.target.value as EdgeType | 'auto')}>
            <option value="auto">Auto</option>
            {EDGE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>
        <p className="text-2xs text-fg-subtle">{description}</p>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        <Section title="Lines" count={`${EDGE_KINDS.length - EDGE_KINDS.filter((k) => hiddenEdges.includes(k)).length}/${EDGE_KINDS.length}`}>
          {EDGE_KINDS.map((k: EdgeKind) => {
            const s = EDGE_STYLE[k]
            const shown = !hiddenEdges.includes(k)
            return (
              <button
                key={k}
                type="button"
                aria-pressed={shown}
                title={k === 'contains' ? 'Story → chapter → scene hierarchy' : EDGE_DESCRIPTIONS[k]}
                onClick={(event) => {
                  if (event.shiftKey || event.ctrlKey || event.metaKey) useUI.setState({ hiddenEdges: EDGE_KINDS.filter((kind) => kind !== k) })
                  else toggleEdge(k)
                }}
                className={cn(toggleRow, shown ? 'text-fg-muted' : 'text-fg-faint')}
              >
                <svg width="24" height="8" aria-hidden className={cn('shrink-0', !shown && 'opacity-30')}>
                  <line x1="0" y1="4" x2="24" y2="4" stroke={s.color} strokeWidth={Math.min(2, s.width ?? 1.5)} strokeDasharray={s.dash} />
                </svg>
                <span className={cn('flex-1 text-left', !shown && 'line-through decoration-fg-faint/60')}>{k}</span>
              </button>
            )
          })}
        </Section>
        <Section title="Cards" count={`${ids.length - ids.filter((t) => hiddenNodes.includes(t)).length}/${ids.length}`}>
          {types.list.map((S) => {
            const shown = !hiddenNodes.includes(S.id)
            return (
              <button
                key={S.id}
                type="button"
                aria-pressed={shown}
                onClick={(event) => {
                  if (event.shiftKey || event.ctrlKey || event.metaKey) useUI.setState({ hiddenNodes: ids.filter((type) => type !== S.id) })
                  else toggleNode(S.id)
                }}
                className={cn(toggleRow, shown ? 'text-fg-muted' : 'text-fg-faint')}
              >
                <S.icon size={14} aria-hidden className={cn('shrink-0', !shown && 'opacity-30')} style={{ color: S.color }} />
                <span className={cn('flex-1 text-left', !shown && 'line-through decoration-fg-faint/60')}>{S.plural}</span>
              </button>
            )
          })}
        </Section>
      </div>
      <p className="border-t border-line px-3 py-2 text-2xs text-fg-faint">
        Shift-click a type to show only that one. Selecting a card fades what is unrelated.
      </p>
    </div>
  )
}

/** Top-right "View" trigger with the current preset, plus a reset chip when a custom filter hides types. */
export function ViewMenu() {
  const { current, hidden, apply } = useViewState()
  const mode = current === CUSTOM ? null : VIEW_MODES[current]
  const Icon = mode?.icon ?? SlidersHorizontal
  return (
    <div className="flex items-center gap-1.5">
      {current === CUSTOM && hidden > 0 && (
        <div className={cn(floating, 'flex h-9 items-center gap-1 pr-1 pl-2.5 text-xs text-fg-subtle')}>
          <span className="tabular">{hidden} hidden</span>
          <span aria-hidden className="text-fg-faint">
            ·
          </span>
          <Button size="sm" className="px-1.5 text-accent-text hover:text-accent-hover" onClick={() => apply(0)}>
            Reset
          </Button>
        </div>
      )}
      <div className={cn(floating, 'flex h-9 items-center px-1.5')}>
        <Popover
          side="bottom"
          align="end"
          trigger={
            <Button size="sm" aria-label={`View: ${mode?.label ?? 'Custom'}`} className="gap-1.5 px-2">
              <Icon size={14} aria-hidden className={current === 0 ? undefined : 'text-accent-text'} />
              <span className="text-fg">{mode?.label ?? 'Custom'}</span>
              <ChevronDown size={12} aria-hidden className="text-fg-faint" />
            </Button>
          }
        >
          <ViewSettings />
        </Popover>
      </div>
    </div>
  )
}
