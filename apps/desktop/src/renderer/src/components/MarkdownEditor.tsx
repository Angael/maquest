import { memo, useCallback, useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { openImage } from './Lightbox'
import { insertNewlineContinueMarkup, markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { insertNewlineAndIndent } from '@codemirror/commands'
import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { languages } from '@codemirror/language-data'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { importFiles } from '../lib/actions'
import { isVideo, mediaUrl } from '../lib/api'
import { useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { livePreview, setNodeTitles } from '../lib/livePreview'
import { cn } from './ui'

const NO_NODES: { id: string; title: string }[] = []
const embed = (paths: string[]) => paths.map((p) => `![${p.split('/').pop()}](${p})`).join('\n')

/**
 * Enter on a bare list marker the user just typed (`1.`, `-`, no trailing space) keeps the line.
 * CodeMirror's default treats it as an empty item and deletes the marker, so `1.` Enter `2.` Enter
 * would wipe each line. With a trailing space (`1. `) the default "exit the list" behavior stays.
 */
const listEnter = Prec.highest(
  keymap.of([
    {
      key: 'Enter',
      run: (view) => {
        const { state } = view
        const sel = state.selection.main
        if (!sel.empty) return insertNewlineContinueMarkup(view)
        const line = state.doc.lineAt(sel.head)
        if (sel.head === line.to && /^\s*(\d+[.)]|[-*+])$/.test(line.text)) return insertNewlineAndIndent(view)
        return insertNewlineContinueMarkup(view)
      },
    },
  ]),
)

/** Inserts dropped or pasted images/videos as markdown embeds. */
const mediaHandlers = EditorView.domEventHandlers({
  drop(e, view) {
    if (!e.dataTransfer?.files.length) return false
    e.preventDefault()
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head
    void importFiles(e.dataTransfer.files).then((ps) => {
      if (ps.length && view.dom.isConnected) view.dispatch({ changes: { from: Math.min(pos, view.state.doc.length), insert: `\n${embed(ps)}\n` } })
    })
    return true
  },
  paste(e, view) {
    const files = e.clipboardData?.files
    if (!files?.length) return false
    e.preventDefault()
    void importFiles(files).then((ps) => {
      if (ps.length && view.dom.isConnected) view.dispatch(view.state.replaceSelection(embed(ps)))
    })
    return true
  },
})

const editorTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent' },
    '.cm-gutters': { display: 'none' },
    // A little left padding keeps the caret at column 0 from being clipped by the scroller.
    '.cm-content': { padding: '8px 0 8px 2px', caretColor: 'var(--color-accent)' },
    '.cm-cursor': { borderLeftColor: 'var(--color-accent)', borderLeftWidth: '1.5px' },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--color-accent-soft) !important' },
  },
  { dark: true },
)

const basicSetup = { lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, syntaxHighlighting: false }

export function MarkdownPreview({ source }: { source: string }) {
  const { data: nodes = [] } = useNodes()
  const select = useUI((s) => s.select)
  // [[node-id]] wiki links -> clickable links to nodes
  const text = useMemo(
    () =>
      source.replaceAll(
        /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
        (_, id: string, alias?: string) => `[${alias ?? nodes.find((n) => n.id === id.trim())?.title ?? id}](#node:${id.trim()})`,
      ),
    [source, nodes],
  )
  return (
    <div className="prose-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith('media/') ? mediaUrl(url) : defaultUrlTransform(url))}
        components={{
          img: ({ src, alt }) =>
            typeof src === 'string' && isVideo(src) ? (
              <video src={src} controls />
            ) : (
              <img src={src as string} alt={alt} className="cursor-zoom-in" title="View full size" onClick={() => openImage(src as string)} />
            ),
          a: ({ href, children }) =>
            href?.startsWith('#node:') ? (
              <a href="#" onClick={(e) => (e.preventDefault(), select({ kind: 'node', id: href.slice(6) }))}>
                {children}
              </a>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Live-preview markdown editor. `variant="document"` is the borderless hero used for node content (prose width, no
 * frame); `boxed` (default) keeps a framed field. Syntax help appears only while the editor is focused and empty.
 */
export const MarkdownEditor = memo(function MarkdownEditor({
  value,
  onChange,
  label = 'Body',
  placeholder = 'Write here…',
  minHeight = '240px',
  hint = true,
  variant = 'boxed',
  fill = false,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
  placeholder?: string
  minHeight?: string
  hint?: boolean
  variant?: 'boxed' | 'document'
  /** Fill the parent's height; the editor scrolls internally when content overflows. */
  fill?: boolean
}) {
  const { data: nodes = NO_NODES } = useNodes()
  const [focused, setFocused] = useState(false)
  const select = useUI((s) => s.select)
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })
  const [view, setView] = useState<EditorView>()
  const titles = useMemo(() => new Map(nodes.map((n) => [n.id, n.title])), [nodes])
  useEffect(() => view?.dispatch({ effects: setNodeTitles.of(titles) }), [view, titles])
  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      listEnter,
      EditorView.lineWrapping,
      mediaHandlers,
      editorTheme,
      livePreview({ open: (id) => select({ kind: 'node', id }) }),
    ],
    [select],
  )
  // Keep CodeMirror's listener/configuration stable while the controlled draft
  // updates. External value changes are already annotated by react-codemirror.
  const handleChange = useCallback((next: string) => onChangeRef.current(next), [])
  const doc = variant === 'document'
  return (
    <div
      className={cn(
        'relative',
        fill && 'flex h-full flex-col',
        doc
          ? 'px-4 pt-1'
          : 'rounded-md bg-surface/60 px-3 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
      )}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false)}
    >
      <div className={cn(doc && 'max-w-[70ch]', fill && 'min-h-0 flex-1 [&>div]:h-full')}>
        <CodeMirror
          value={value}
          onChange={handleChange}
          theme="none"
          extensions={extensions}
          basicSetup={basicSetup}
          minHeight={minHeight}
          height={fill ? '100%' : undefined}
          placeholder={placeholder}
          aria-label={label}
          onCreateEditor={setView}
        />
      </div>
      {hint && focused && !value && (
        <p className={cn('pointer-events-none text-xs text-fg-faint', doc ? 'pb-2' : 'absolute right-3 bottom-2')}>
          <span translate="no" className="font-mono text-2xs text-fg-subtle">
            [[node-id]]
          </span>{' '}
          links a node · drop or paste images and videos
        </p>
      )}
    </div>
  )
})
