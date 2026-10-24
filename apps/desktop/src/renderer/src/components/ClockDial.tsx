/** Blades-style progress clock: a circle split into `size` segments, `filled` of them shaded. */
export function ClockDial({ size, filled, radius = 14, onSet, label }: {
  size: number
  filled: number
  radius?: number
  /** Clicking segment i sets filled to i + 1 (or to i when it is already the last filled one). */
  onSet?: (filled: number) => void
  label?: string
}) {
  const r = radius
  const point = (i: number) => {
    const a = (i / size) * Math.PI * 2 - Math.PI / 2
    return `${r + Math.cos(a) * (r - 1)},${r + Math.sin(a) * (r - 1)}`
  }
  return (
    <svg width={r * 2} height={r * 2} role={onSet ? 'group' : 'img'} aria-label={label ?? `Clock ${filled} of ${size}`} className="shrink-0">
      {Array.from({ length: size }, (_, i) => {
        const on = i < filled
        return (
          <path
            key={i}
            d={`M${r},${r} L${point(i)} A${r - 1},${r - 1} 0 0 1 ${point(i + 1)} Z`}
            fill={on ? '#f59e0b' : '#292524'}
            stroke="#0c0a09"
            strokeWidth={1.5}
            className={onSet ? 'nodrag cursor-pointer hover:opacity-80' : undefined}
            onClick={onSet && ((event) => { event.stopPropagation(); onSet(filled === i + 1 ? i : i + 1) })}
          >
            {onSet && <title>{`Set to ${i + 1} of ${size}`}</title>}
          </path>
        )
      })}
      <circle cx={r} cy={r} r={r - 1} fill="none" stroke="#78716c" strokeWidth={1} />
    </svg>
  )
}
