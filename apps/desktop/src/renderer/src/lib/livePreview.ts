import { syntaxTree } from '@codemirror/language'
import { type Extension, type Range, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { isVideo, mediaUrl } from './api'
import { openImage } from '../components/Lightbox'

/**
 * Obsidian-style live preview for CodeMirror markdown: styles the common
 * subset in place and hides its markup except on lines holding the cursor.
 * The document text is never rewritten, only decorated.
 */
export interface LivePreviewOptions {
  /** Called when a `[[node-id]]` chip is clicked. */
  open: (id: string) => void
}

/** Replaces the node id -> title map used to label `[[node-id]]` chips. */
export const setNodeTitles = StateEffect.define<ReadonlyMap<string, string>>()
const nodeTitles = StateField.define<ReadonlyMap<string, string>>({
  create: () => new Map(),
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(setNodeTitles) ? e.value : v), value),
})

const hide = Decoration.replace({})
const mark = (cls: string) => Decoration.mark({ class: cls })
const line = (cls: string) => Decoration.line({ class: cls })

const inlineStyles: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-code',
}
const headings: Record<string, string> = {
  ATXHeading1: 'cm-md-h1',
  ATXHeading2: 'cm-md-h2',
  ATXHeading3: 'cm-md-h3',
  ATXHeading4: 'cm-md-h4',
  ATXHeading5: 'cm-md-h4',
  ATXHeading6: 'cm-md-h4',
}

class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-md-bullet'
    el.textContent = '•'
    return el
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-md-hr'
    return el
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }
  toDOM(view: EditorView) {
    const el = document.createElement('input')
    el.type = 'checkbox'
    el.className = 'cm-md-task'
    el.checked = this.checked
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const from = view.posAtDOM(el)
      const text = view.state.sliceDoc(from, from + 3)
      if (!/^\[[ xX]\]$/.test(text)) return
      view.dispatch({ changes: { from: from + 1, to: from + 2, insert: this.checked ? ' ' : 'x' } })
    })
    return el
  }
  ignoreEvent() {
    return true
  }
}

class MediaWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super()
  }
  eq(other: MediaWidget) {
    return other.src === this.src && other.alt === this.alt
  }
  toDOM() {
    const url = this.src.startsWith('media/') ? mediaUrl(this.src) : this.src
    const el = isVideo(this.src) ? document.createElement('video') : document.createElement('img')
    el.className = 'cm-md-media'
    el.src = url
    if (el instanceof HTMLVideoElement) el.controls = true
    else {
      el.alt = this.alt
      el.title = 'Double-click to view full size'
      el.addEventListener('dblclick', () => openImage(url))
    }
    return el
  }
  ignoreEvent(e: Event) {
    // let video controls and image double-click work; single clicks on images still move the cursor in
    return e.target instanceof HTMLVideoElement || e.type === 'dblclick'
  }
}

class NodeLinkWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly label: string,
    readonly open: (id: string) => void,
  ) {
    super()
  }
  eq(other: NodeLinkWidget) {
    return other.id === this.id && other.label === this.label
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-md-node'
    el.textContent = this.label
    el.title = this.id
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.open(this.id)
    })
    return el
  }
  ignoreEvent() {
    return true
  }
}

const WIKI = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g

function build(view: EditorView, opts: LivePreviewOptions): DecorationSet {
  const { state } = view
  const active = new Set<number>()
  if (view.hasFocus) {
    for (const r of state.selection.ranges) {
      for (let l = state.doc.lineAt(r.from).number; l <= state.doc.lineAt(r.to).number; l++) active.add(l)
    }
  }
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number)
  const decos: Range<Decoration>[] = []
  const lineDeco = (from: number, to: number, cls: string) => {
    for (let pos = from; pos <= to;) {
      const l = state.doc.lineAt(pos)
      decos.push(line(cls).range(l.from))
      pos = l.to + 1
    }
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name
        if (headings[name]) {
          decos.push(line(headings[name]).range(state.doc.lineAt(node.from).from))
        } else if (inlineStyles[name]) {
          if (node.to > node.from) decos.push(mark(inlineStyles[name]).range(node.from, node.to))
        } else if (name === 'Blockquote') {
          lineDeco(node.from, node.to, 'cm-md-quote')
        } else if (name === 'FencedCode' || name === 'CodeBlock') {
          lineDeco(node.from, node.to, 'cm-md-codeblock')
          return false
        } else if (name === 'HorizontalRule') {
          if (!isActive(node.from)) decos.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to))
        } else if (name === 'Image') {
          const url = node.node.getChild('URL')
          if (url && !isActive(node.from)) {
            const src = state.sliceDoc(url.from, url.to)
            const alt = state.sliceDoc(node.from + 2, state.sliceDoc(node.from, node.to).indexOf(']') + node.from)
            decos.push(Decoration.replace({ widget: new MediaWidget(src, alt) }).range(node.from, node.to))
          }
          return false
        } else if (name === 'Link') {
          const marks = node.node.getChildren('LinkMark')
          if (marks.length >= 2) {
            const textFrom = marks[0].to
            const textTo = marks[1].from
            if (textTo > textFrom) decos.push(mark('cm-md-link').range(textFrom, textTo))
            if (!isActive(node.from)) {
              decos.push(hide.range(marks[0].from, marks[0].to))
              decos.push(hide.range(marks[1].from, node.to))
            }
          }
          return false
        } else if (!isActive(node.from)) {
          if (name === 'HeaderMark' || name === 'QuoteMark') {
            const next = state.sliceDoc(node.to, node.to + 1)
            decos.push(hide.range(node.from, node.to + (next === ' ' ? 1 : 0)))
          } else if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
            decos.push(hide.range(node.from, node.to))
          } else if (name === 'CodeMark' && node.node.parent?.name === 'InlineCode') {
            decos.push(hide.range(node.from, node.to))
          } else if (name === 'ListMark') {
            const item = node.node.parent
            const isTask = !!item?.getChild('Task')
            const text = state.sliceDoc(node.from, node.to)
            if (isTask) decos.push(hide.range(node.from, Math.min(node.to + 1, item!.to)))
            else if (/^[-*+]$/.test(text)) decos.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to))
          }
        }
        if (name === 'TaskMarker') {
          const checked = /x/i.test(state.sliceDoc(node.from, node.to))
          decos.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to))
        }
      },
    })

    // [[node-id]] / [[node-id|alias]] links are not markdown syntax; find them by regex.
    const text = state.sliceDoc(from, to)
    for (const m of text.matchAll(WIKI)) {
      const start = from + m.index
      const end = start + m[0].length
      if (isActive(start)) {
        decos.push(mark('cm-md-link').range(start, end))
        continue
      }
      const id = m[1].trim()
      const label = m[2]?.trim() || state.field(nodeTitles).get(id) || id
      decos.push(Decoration.replace({ widget: new NodeLinkWidget(id, label, opts.open) }).range(start, end))
    }
  }
  return Decoration.set(decos, true)
}

/** Ctrl/Cmd-click on a rendered markdown link opens it externally. */
const linkClick = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!(e.metaKey || e.ctrlKey) || e.button !== 0) return false
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
    if (pos == null) return false
    let node = syntaxTree(view.state).resolveInner(pos, 1) as ReturnType<typeof syntaxTree>['topNode'] | null
    while (node && node.name !== 'Link') node = node.parent
    const url = node?.getChild('URL')
    if (!url) return false
    e.preventDefault()
    window.open(view.state.sliceDoc(url.from, url.to), '_blank', 'noreferrer')
    return true
  },
})

export function livePreview(opts: LivePreviewOptions): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view, opts)
      }
      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          u.focusChanged ||
          u.startState.field(nodeTitles) !== u.state.field(nodeTitles) ||
          syntaxTree(u.startState) !== syntaxTree(u.state)
        ) {
          this.decorations = build(u.view, opts)
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
  return [nodeTitles, plugin, linkClick, EditorView.contentAttributes.of({ class: 'cm-md-live' })]
}
