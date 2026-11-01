const norm = (s: string) => s.normalize('NFD').replaceAll(/\p{M}/gu, '').toLowerCase().trim()

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
  const q = norm(search)
  if (!q) return 1
  const title = norm(texts[0] ?? '')
  if (title === q) return 10
  if (title.startsWith(q)) return 8
  const words = title.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.some((w) => w.startsWith(q))) return 6
  if (title.includes(q)) return 4
  if (q.length >= 3 && words.some((w) => within1(w.slice(0, q.length), q) || within1(w, q))) return 3
  const rest = texts.slice(1).map(norm)
  if (rest.some((t) => t.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q)))) return 2
  if (rest.some((t) => t.includes(q))) return 1
  return 0
}

/** Items matching the query, best first; ties keep their original order. */
export function rankItems<T>(items: readonly T[], search: string, texts: (item: T) => string[]): T[] {
  if (!norm(search)) return [...items]
  return items
    .map((item, i) => ({ item, i, score: matchScore(search, texts(item)) }))
    .filter((x) => x.score > 0)
    .toSorted((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item)
}
