/** Lowercase, accents stripped, trimmed: what searches compare. */
export const normalize = (s: string) => s.normalize('NFD').replaceAll(/\p{M}/gu, '').toLowerCase().trim()

/** Levenshtein distance capped at 2 (enough to spot one-letter typos). */
function within1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length] <= 1
}

/**
 * Score of one item for the query, from its texts (title first, then e.g. summary and tags):
 * exact title > title prefix > word prefix > substring > one-typo word prefix > match in other texts. 0 = no match.
 */
export function matchScore(search: string, texts: readonly string[]): number {
  const q = normalize(search)
  if (!q) return 1
  const title = normalize(texts[0] ?? '')
  if (title === q) return 10
  if (title.startsWith(q)) return 8
  const words = title.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.some((w) => w.startsWith(q))) return 6
  if (title.includes(q)) return 4
  if (q.length >= 3 && words.some((w) => within1(w.slice(0, q.length), q) || within1(w, q))) return 3
  const rest = texts.slice(1).map(normalize)
  if (rest.some((t) => t.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q)))) return 2
  if (rest.some((t) => t.includes(q))) return 1
  return 0
}

/** Items matching the query with their scores, best first; ties keep their original order. */
export function rankScored<T>(items: readonly T[], search: string, texts: (item: T) => string[]): { item: T; score: number }[] {
  if (!normalize(search)) return items.map((item) => ({ item, score: 1 }))
  return items
    .map((item, i) => ({ item, i, score: matchScore(search, texts(item)) }))
    .filter((x) => x.score > 0)
    .toSorted((a, b) => b.score - a.score || a.i - b.i)
    .map(({ item, score }) => ({ item, score }))
}

/** Items matching the query, best first; ties keep their original order. */
export function rankItems<T>(items: readonly T[], search: string, texts: (item: T) => string[]): T[] {
  return rankScored(items, search, texts).map((x) => x.item)
}

export type Snippet = { before: string; match: string; after: string }

/** Markdown syntax that would only clutter a one-line excerpt. */
const plainLine = (line: string, titles: ReadonlyMap<string, string>) =>
  line
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replaceAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id: string, alias?: string) => alias ?? titles.get(id.trim()) ?? id)
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
    .replaceAll(/(\*\*|__|\*|_|~~|`)(.+?)\1/g, '$2')
    .trim()

/**
 * The first line of `text` that contains the query (accent- and case-insensitive), cut to about `width` characters
 * around the match, which is marked when it can be located exactly. Null when nothing matches.
 */
export function findSnippet(text: string, search: string, titles: ReadonlyMap<string, string> = new Map(), width = 90): Snippet | null {
  const q = normalize(search)
  if (!q) return null
  for (const raw of text.split('\n')) {
    const line = plainLine(raw, titles)
    if (!normalize(line).includes(q)) continue
    const at = line.toLowerCase().indexOf(search.trim().toLowerCase())
    if (at < 0) return { before: '', match: '', after: line.length > width ? `${line.slice(0, width)}…` : line }
    const end = at + search.trim().length
    // About 24 characters of context before the match, starting at a word.
    let from = Math.max(0, Math.min(at - 24, line.length - width))
    const space = from > 0 ? line.indexOf(' ', from) : -1
    if (space >= 0 && space < at) from = space + 1
    const to = Math.max(end, Math.min(line.length, from + width))
    return {
      before: `${from > 0 ? '…' : ''}${line.slice(from, at)}`,
      match: line.slice(at, end),
      after: `${line.slice(end, to)}${to < line.length ? '…' : ''}`,
    }
  }
  return null
}
