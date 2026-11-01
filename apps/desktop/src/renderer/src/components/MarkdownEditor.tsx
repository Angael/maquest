import { useCallback, useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { openImage } from './Lightbox'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { importFiles } from '../lib/actions'
import { isVideo, mediaUrl } from '../lib/api'
import { useNodes } from '../lib/queries'
import { useUI } from '../lib/store'
import { livePreview, setNodeTitles } from '../lib/livePreview'

const embed = (paths: string[]) => paths.map((p) => `![${p.split('/').pop()}](${p})`).join('\n')

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
    '.cm-content': { padding: '8px 0', caretColor: '#fbbf24' },
    '.cm-cursor': { borderLeftColor: '#fbbf24' },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(251, 191, 36, 0.2) !important' },
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

export function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: nodes = [] } = useNodes()
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
  return (
    <div className="rounded-md border border-stone-800 bg-stone-900/50">
      <div className="px-3">
        <CodeMirror
          value={value}
          onChange={handleChange}
          theme="none"
          extensions={extensions}
          basicSetup={basicSetup}
          minHeight="240px"
          placeholder="Write here…"
          aria-label="Body"
          onCreateEditor={setView}
        />
      </div>
      <div className="border-t border-stone-800 px-3 py-1 text-right text-xs text-stone-600">
        drop or paste images/videos · [[node-id]] links · Ctrl+click opens links
      </div>
    </div>
  )
}
