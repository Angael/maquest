import { MaquestError } from './project'

/** Default size budget (characters) for one agent read, below common host limits for a single tool result. */
export const READ_BUDGET = 40_000

export type Heading = { line: number; level: number; title: string }

/** Markdown headings of a body with their 1-based line numbers; lines inside fenced code blocks are skipped. */
export function bodyHeadings(body: string): Heading[] {
  const out: Heading[] = []
  let fence: string | null = null
  body.split('\n').forEach((text, i) => {
    const f = /^\s*(```|~~~)/.exec(text)
    if (f) fence = fence === null ? f[1] : fence === f[1] ? null : fence
    if (fence !== null || f) return
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(text)
    if (h) out.push({ line: i + 1, level: h[1].length, title: h[2] })
  })
  return out
}

export type BodySlice = { text: string; from: number; to: number; total: number }

/**
 * Part of a body: a section (heading title, case-insensitive; the heading plus everything up to the next heading
 * of the same or a higher level) or a 1-based inclusive line range. Throws with the available headings when the
 * section is missing or ambiguous.
 */
export function sliceBody(body: string, sel: { section?: string; from?: number; to?: number }): BodySlice {
  const lines = body.split('\n')
  const total = lines.length
  let from = 1
  let to = total
  if (sel.section !== undefined) {
    const want = sel.section
      .replace(/^#+\s*/, '')
      .trim()
      .toLowerCase()
    const headings = bodyHeadings(body)
    const exact = headings.filter((h) => h.title.toLowerCase() === want)
    const loose = exact.length ? exact : headings.filter((h) => h.title.toLowerCase().includes(want))
    const list = (hs: Heading[]) =>
      hs
        .slice(0, 40)
        .map((h) => `line ${h.line}: ${'#'.repeat(h.level)} ${h.title}`)
        .join('; ') + (hs.length > 40 ? `; +${hs.length - 40} more` : '')
    if (!loose.length)
      throw new MaquestError(
        `Section not found: ${sel.section}. ${headings.length ? `Headings: ${list(headings)}` : 'The body has no headings; use lines instead.'}`,
      )
    if (loose.length > 1) throw new MaquestError(`Section "${sel.section}" matches ${loose.length} headings: ${list(loose)}. Use the full heading or lines.`)
    const h = loose[0]
    const next = headings.find((x) => x.line > h.line && x.level <= h.level)
    from = h.line
    to = next ? next.line - 1 : total
  }
  if (sel.from !== undefined) from = Math.max(from, sel.from)
  if (sel.to !== undefined) to = Math.min(to, sel.to)
  if (from > total) throw new MaquestError(`Line ${from} is past the end of the body (${total} lines)`)
  if (to < from) throw new MaquestError(`Empty line range ${from}–${to}`)
  return { text: lines.slice(from - 1, to).join('\n'), from, to, total }
}

/** Keeps whole lines of `text` up to `budget` characters (at least one line); `lines` is how many were kept. */
export function clipLines(text: string, budget: number): { text: string; lines: number; clipped: boolean } {
  const lines = text.split('\n')
  let used = 0
  let kept = 0
  while (kept < lines.length && (kept === 0 || used + lines[kept].length + 1 <= budget)) used += lines[kept++].length + 1
  return { text: lines.slice(0, kept).join('\n'), lines: kept, clipped: kept < lines.length }
}

/**
 * Fills a size budget with whole parts in order, skipping parts that no longer fit so later, smaller ones can
 * still be included. Never splits a part.
 */
export function packByBudget<T extends { text: string }>(parts: readonly T[], budget: number, separator = 0): { included: T[]; omitted: T[] } {
  const included: T[] = []
  const omitted: T[] = []
  let used = 0
  for (const part of parts) {
    const cost = part.text.length + (included.length ? separator : 0)
    if (used + cost <= budget) {
      included.push(part)
      used += cost
    } else omitted.push(part)
  }
  return { included, omitted }
}
