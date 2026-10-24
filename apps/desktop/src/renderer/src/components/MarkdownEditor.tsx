import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import { importFiles } from '../lib/actions'
import { isVideo, mediaUrl } from '../lib/api'
import { useNodes } from '../lib/queries'
import { useUI } from '../lib/store'

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

const editorTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '14px' },
  '.cm-gutters': { display: 'none' },
  '.cm-content': { fontFamily: 'var(--font-serif)', lineHeight: '1.7', padding: '8px 0' },
  '&.cm-focused': { outline: 'none' },
})

const basicSetup = { lineNumbers: false, foldGutter: false, highlightActiveLine: false }

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
          img: ({ src, alt }) => (typeof src === 'string' && isVideo(src) ? <video src={src} controls /> : <img src={src as string} alt={alt} />),
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
  const [mode, setMode] = useState<'write' | 'preview'>(value.trim() ? 'preview' : 'write')
  const extensions = useMemo(() => [markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping, mediaHandlers, editorTheme], [])
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })
  // Keep CodeMirror's listener/configuration stable while the controlled draft
  // updates. External value changes are already annotated by react-codemirror.
  const handleChange = useCallback((next: string) => onChangeRef.current(next), [])
  return (
    <div className="rounded-md border border-stone-800 bg-stone-900/50">
      <div className="flex gap-1 border-b border-stone-800 px-2 py-1 text-xs">
        {(['write', 'preview'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={clsx('rounded px-2 py-0.5 capitalize', mode === m ? 'bg-stone-800 text-stone-100' : 'text-stone-500 hover:text-stone-300')}
          >
            {m}
          </button>
        ))}
        <span className="ml-auto self-center text-stone-600">drop or paste images/videos · [[node-id]] links</span>
      </div>
      <div className="px-3">
        {mode === 'write' ? (
          <CodeMirror value={value} onChange={handleChange} theme="dark" extensions={extensions} basicSetup={basicSetup} minHeight="240px" />
        ) : (
          <div className="min-h-[240px] py-2" onDoubleClick={() => setMode('write')}>
            {value.trim() ? <MarkdownPreview source={value} /> : <div className="text-sm text-stone-600">Empty. Double-click to write.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
