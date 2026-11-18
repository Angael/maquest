/** Browser-safe text helpers for prose: word counts, reading time and compiling a manuscript. */

const WIKI_LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

/** Markdown reduced to the words a reader sees: no images, link targets, code fences, comments or markup. */
export function proseText(markdown: string): string {
  return markdown
    .replaceAll(/<!--[\s\S]*?-->/g, ' ')
    .replaceAll(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, ' ')
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replaceAll(WIKI_LINK, (_, id: string, alias?: string) => alias ?? id.replaceAll('-', ' '))
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/<[^>\n]+>/g, ' ')
    .replaceAll(/^\s{0,3}(?:#{1,6}\s|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s)/gm, '')
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null
/** Scripts written without spaces between words. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u

/**
 * Words in a markdown text, as a word processor counts them: runs of letters or digits between spaces (so "well-known"
 * and "it's" are one word); text in scripts without spaces (Chinese, Japanese, Thai…) is split by the platform's word
 * segmenter.
 */
export function countWords(markdown: string): number {
  let words = 0
  for (const token of proseText(markdown).split(/\s+/)) {
    if (!/[\p{L}\p{N}]/u.test(token)) continue
    if (!segmenter || !UNSPACED.test(token)) words++
    else for (const s of segmenter.segment(token)) if (s.isWordLike) words++
  }
  return words
}

/** Minutes to read `words` at an unhurried 230 words per minute (at least 1 for any text). */
export const readingMinutes = (words: number) => (words ? Math.max(1, Math.round(words / 230)) : 0)

/** A node as the manuscript compiler sees it. */
export type ManuscriptNode = { id: string; title: string; body: string; children: ManuscriptNode[] }

/**
 * Pushes every ATX heading of a body `by` levels deeper (capped at h6), outside code fences, so a scene's own `# Beats`
 * nests under the scene's heading in the compiled document.
 */
export function demoteHeadings(body: string, by: number): string {
  let fence: string | null = null
  return body
    .split('\n')
    .map((line) => {
      const open = /^\s{0,3}(```|~~~)/.exec(line)?.[1]
      if (open) fence = fence === null ? open : fence === open ? null : fence
      if (fence !== null || open) return line
      return line.replace(/^(\s{0,3})(#{1,6})(?=\s|$)/, (_, indent: string, marks: string) => indent + '#'.repeat(Math.min(6, marks.length + by)))
    })
    .join('\n')
}

/**
 * One markdown document of a story, chapter or scene and everything under it, in outline order: each node's title as a
 * heading one level below its parent's, then its body with headings nested below that. `[[links]]` become their
 * alias or the linked node's title; `media` maps image paths (e.g. to absolute file paths) for a document read
 * outside the project.
 */
export function compileManuscript(root: ManuscriptNode, opts: { titles?: ReadonlyMap<string, string>; media?: (path: string) => string } = {}): string {
  const parts: string[] = []
  const walk = (n: ManuscriptNode, depth: number) => {
    parts.push(`${'#'.repeat(Math.min(6, depth + 1))} ${n.title}`)
    let body = n.body.replaceAll(WIKI_LINK, (_, id: string, alias?: string) => alias ?? opts.titles?.get(id.trim()) ?? id)
    if (opts.media) body = body.replaceAll(/(!\[[^\]]*\]\()(media\/[^)\s]+)/g, (_, head: string, path: string) => head + opts.media!(path))
    body = demoteHeadings(body.trim(), depth + 1)
    if (body) parts.push(body)
    for (const c of n.children) walk(c, depth + 1)
  }
  walk(root, 0)
  return `${parts.join('\n\n')}\n`
}
