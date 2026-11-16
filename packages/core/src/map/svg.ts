/** A tiny SVG element tree: rendered to a string (export, thumbnails) or converted to React elements (editor). */
export type SvgAttrs = Record<string, string | number | undefined>
export type SvgEl = { tag: string; attrs: SvgAttrs; children: (SvgEl | string)[] }

export const h = (tag: string, attrs: SvgAttrs = {}, ...children: (SvgEl | string | null | undefined | false)[]): SvgEl => ({
  tag,
  attrs,
  children: children.filter((c): c is SvgEl | string => !!c || c === ''),
})

const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export function svgString(el: SvgEl | string): string {
  if (typeof el === 'string') return escape(el)
  const attrs = Object.entries(el.attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escape(String(v))}"`)
    .join('')
  if (!el.children.length) return `<${el.tag}${attrs}/>`
  return `<${el.tag}${attrs}>${el.children.map(svgString).join('')}</${el.tag}>`
}

/** Compact number formatting for path data. */
export const num = (n: number) => String(Math.round(n * 1000) / 1000)
