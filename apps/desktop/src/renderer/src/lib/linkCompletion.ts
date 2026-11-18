import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { StateEffect, StateField } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { rankScored } from './search'

export type LinkTarget = { id: string; title: string; type: string; tags?: readonly string[] }

type Targets = { nodes: readonly LinkTarget[]; label: (type: string) => string }

/** Replaces the nodes (and their type labels) that `[[` suggests, without rebuilding the editor's extensions. */
export const setLinkTargets = StateEffect.define<Targets>()

const targetsField = StateField.define<Targets>({
  create: () => ({ nodes: [], label: (type) => type }),
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(setLinkTargets) ? e.value : v), value),
})

/** Typing `[[` suggests nodes by title (or id); picking one inserts `[[node-id]]`. */
export function linkCompletion() {
  const source = (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/\[\[[^\]|\n]*$/)
    if (!before) return null
    const targets = context.state.field(targetsField)
    const query = before.text.slice(2)
    const from = before.from + 2
    // Skip the closing brackets if they are already there (autoclose or editing an existing link).
    const after = context.state.sliceDoc(context.pos, context.pos + 2)
    const close = after === ']]' ? '' : ']]'
    const options: Completion[] = rankScored(targets.nodes, query, (n) => [n.title, n.id, ...(n.tags ?? [])])
      .slice(0, 40)
      .map(({ item, score }) => ({
        label: item.title || item.id,
        detail: targets.label(item.type),
        boost: score,
        apply: (view, _completion, start, end) => {
          const insert = `${item.id}${close}`
          view.dispatch({
            changes: { from: start, to: end, insert },
            selection: { anchor: start + insert.length + (close ? 0 : 2) },
          })
        },
      }))
    // Ranking is ours (title, id and tags); keep CodeMirror from re-filtering by the label alone.
    return { from, to: context.pos, options, filter: false }
  }
  return [targetsField, autocompletion({ override: [source], icons: false, activateOnTyping: true, maxRenderedOptions: 40 }), completionTheme]
}

const completionTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--color-raised)',
    border: 'none',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-popover)',
    padding: '4px',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { maxHeight: '16rem', minWidth: '14rem', maxWidth: '24rem' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    padding: '4px 8px',
    borderRadius: '5px',
    color: 'var(--color-fg-muted)',
    fontSize: '13px',
    lineHeight: '20px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--color-active)', color: 'var(--color-fg)' },
  '.cm-completionLabel': { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--color-accent-text)' },
  '.cm-completionDetail': { marginLeft: 'auto', fontStyle: 'normal', fontSize: '11px', color: 'var(--color-fg-faint)' },
})
