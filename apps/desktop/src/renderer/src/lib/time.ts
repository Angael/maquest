const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' })
/** A date and time in the user's locale, e.g. for tooltips. */
export const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
]

/** "just now", "5 min. ago", "yesterday"… for an ISO date; null when it can't be read. */
export function ago(iso: string) {
  let value = (Date.parse(iso) - Date.now()) / 60_000
  if (Number.isNaN(value)) return null
  if (Math.abs(value) < 1) return 'just now'
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return relative.format(Math.round(value), unit)
    value /= size
  }
  return null
}
