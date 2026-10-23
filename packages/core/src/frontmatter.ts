import { parse, stringify } from 'yaml'

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = FM.exec(text)
  if (!m) return { data: {}, body: text }
  // The writer separates metadata and content with one blank line. Consume only
  // that separator; any additional leading whitespace belongs to the body.
  const remainder = text.slice(m[0].length)
  const body = remainder.replace(/^\r?\n/, '')
  return { data: (parse(m[1]) as Record<string, unknown>) ?? {}, body }
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean = Object.fromEntries(
    Object.entries(data).filter(([, v]) => {
      if (v === undefined || v === '') return false
      if (Array.isArray(v) && v.length === 0) return false
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false
      return true
    }),
  )
  return `---\n${stringify(clean).trimEnd()}\n---\n\n${body}`
}
