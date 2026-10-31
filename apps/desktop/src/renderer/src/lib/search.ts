import { defaultFilter } from 'cmdk'

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
 * cmdk filter that ranks by the item's title (its first keyword) before falling back to fuzzy matching:
 * exact title > title prefix > word prefix > substring > one-typo word prefix > fuzzy.
 */
export function paletteFilter(value: string, search: string, keywords?: string[]): number {
  const q = norm(search)
  if (!q) return 1
  const title = norm(keywords?.[0] ?? '')
  const fuzzy = defaultFilter(value, search, keywords) // 0..1
  if (!title) return fuzzy
  if (title === q) return 10
  if (title.startsWith(q)) return 8
  const words = title.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.some((w) => w.startsWith(q))) return 6
  if (title.includes(q)) return 4
  if (q.length >= 3 && words.some((w) => within1(w.slice(0, q.length), q) || within1(w, q))) return 3
  return fuzzy
}
