import { createElement, type ReactNode } from 'react'
import type { SvgEl } from '@maquest/core/map'

/** SVG attribute names React wants in camelCase (the rest pass through: data-*, aria-*, viewBox…). */
const camel = (name: string) => {
  if (name === 'class') return 'className'
  if (name.startsWith('data-') || name.startsWith('aria-')) return name
  return name.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** Converts a core SVG tree to React elements. */
export function toReact(el: SvgEl | string, key?: string | number): ReactNode {
  if (typeof el === 'string') return el
  const props: Record<string, unknown> = { key }
  for (const [k, v] of Object.entries(el.attrs)) if (v !== undefined) props[camel(k)] = v
  return createElement(el.tag, props, ...el.children.map((c, i) => toReact(c, i)))
}
