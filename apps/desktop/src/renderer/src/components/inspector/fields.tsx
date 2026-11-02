import { forwardRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Select as BaseSelect } from '@base-ui/react/select'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn, menuItem, popupSurface } from '../ui'

/*
 * Inspector property-list building blocks (Linear/Notion style): a fixed label column and value controls that read as
 * plain text until hovered or focused.
 */

/** Borderless control: transparent at rest, hover tint, quiet inset hairline while focused. */
export const ghost =
  'w-full min-w-0 rounded-[5px] bg-transparent px-1.5 text-sm text-fg outline-none transition-[background-color,box-shadow] duration-100 placeholder:text-fg-faint hover:bg-hover focus:bg-surface focus:shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus-visible:outline-none'

export function PropertyRow({
  label,
  htmlFor,
  id,
  children,
  className,
}: {
  label: ReactNode
  /** Id of the control the label names. */
  htmlFor?: string
  /** Id for the label itself, for groups that reference it with aria-labelledby. */
  id?: string
  children: ReactNode
  className?: string
}) {
  const Tag = htmlFor ? 'label' : 'div'
  return (
    <div className={cn('group/row flex min-h-7 items-start gap-2', className)}>
      <Tag id={id} htmlFor={htmlFor} className="flex h-7 w-[88px] shrink-0 items-center truncate text-xs text-fg-subtle">
        {label}
      </Tag>
      <div className="flex min-h-7 min-w-0 flex-1 items-center">{children}</div>
    </div>
  )
}

export type SelectOption = { value: string; label: string; icon?: ReactNode }

/**
 * Ghost-styled select (Base UI): reads as plain text at rest; the popup sizes to its options instead of stretching to
 * the row, and matches the app's menus. `leading` sits before the value (icon, dot); `muted` greys an empty value.
 */
export function GhostSelect({
  id,
  value,
  options,
  onValueChange,
  leading,
  muted,
  className,
  'aria-label': ariaLabel,
}: {
  id?: string
  value: string
  options: readonly SelectOption[]
  onValueChange: (value: string) => void
  leading?: ReactNode
  muted?: boolean
  className?: string
  'aria-label'?: string
}) {
  const current = options.find((o) => o.value === value)
  return (
    <BaseSelect.Root value={value} onValueChange={(v) => v != null && v !== value && onValueChange(v)}>
      <BaseSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          ghost,
          'group/select relative flex h-7 cursor-default items-center gap-1.5 pr-6 text-left data-[popup-open]:bg-hover',
          muted && 'text-fg-faint',
          className,
        )}
      >
        {leading && <span className="flex shrink-0 items-center">{leading}</span>}
        <span className="min-w-0 truncate">{current?.label ?? value}</span>
        <ChevronDown
          size={13}
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-fg-faint opacity-0 transition-opacity duration-100 group-hover/select:opacity-100 group-focus-visible/select:opacity-100 group-data-[popup-open]/select:opacity-100"
        />
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner alignItemWithTrigger={false} side="bottom" align="start" sideOffset={4} className="z-[60]">
          <BaseSelect.Popup className={cn(popupSurface, 'popup-motion max-h-[min(var(--available-height),20rem)] min-w-40 overflow-y-auto')}>
            {options.map((o) => (
              <BaseSelect.Item key={o.value} value={o.value} className={cn(menuItem, 'relative pr-7 data-[selected]:text-fg')}>
                {o.icon && <span className="flex w-3.5 shrink-0 items-center justify-center">{o.icon}</span>}
                <BaseSelect.ItemText className="min-w-0 truncate">{o.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator className="absolute right-2 flex items-center text-accent-text">
                  <Check size={14} aria-hidden />
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}

/** Single-logical-line text that wraps and grows; Enter never inserts a newline. */
export const GhostText = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function GhostText({ className, onKeyDown, ...p }, ref) {
  return (
    <textarea
      ref={ref}
      rows={1}
      {...p}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.preventDefault()
        onKeyDown?.(e)
      }}
      className={cn(ghost, 'block resize-none py-1 leading-5 [field-sizing:content]', className)}
    />
  )
})

/** Collapses pasted/typed newlines so values stay one line on disk. */
export const oneLine = (s: string) => s.replaceAll(/\s*\n\s*/g, ' ')

export function Chip({ children, onRemove, removeLabel, className }: { children: ReactNode; onRemove?: () => void; removeLabel?: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 max-w-full items-center rounded bg-active text-xs text-fg-muted', onRemove ? 'pr-0.5 pl-1.5' : 'px-1.5', className)}>
      <span className="min-w-0 truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
          className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-[3px] text-fg-faint outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <X size={11} aria-hidden />
        </button>
      )}
    </span>
  )
}

const split = (s: string) =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

/** Tag chips with an inline input: Enter or comma adds, Backspace on an empty input removes the last tag. */
export function TagInput({ id, tags, onChange }: { id: string; tags: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('')
  const commit = (raw: string) => {
    const added = split(raw).filter((t) => !tags.includes(t))
    if (added.length) onChange([...new Set([...tags, ...added])])
    setText('')
  }
  return (
    <div
      className="flex min-h-7 w-full min-w-0 cursor-text flex-wrap items-center gap-1 rounded-[5px] px-1.5 py-1 transition-[background-color,box-shadow] duration-100 focus-within:bg-surface focus-within:shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-hover"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault()
          document.getElementById(id)?.focus()
        }
      }}
    >
      {tags.map((t) => (
        <Chip key={t} removeLabel={`Remove tag ${t}`} onRemove={() => onChange(tags.filter((x) => x !== t))}>
          {t}
        </Chip>
      ))}
      <input
        id={id}
        value={text}
        placeholder={tags.length ? '' : 'Add tags…'}
        autoComplete="off"
        spellCheck={false}
        className="h-5 min-w-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint focus-visible:outline-none"
        onChange={(e) => {
          const v = e.target.value
          if (v.includes(',')) {
            const cut = v.lastIndexOf(',')
            commit(v.slice(0, cut))
            setText(v.slice(cut + 1).trimStart())
          } else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(text)
          } else if (e.key === 'Backspace' && !text && tags.length) {
            e.preventDefault()
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => text.trim() && commit(text)}
      />
    </div>
  )
}

export function SectionHeading({ children, count, action }: { children: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <div className="mb-1 flex h-6 items-center gap-1.5">
      <h3 className="text-xs font-medium text-fg-subtle">{children}</h3>
      {count != null && count > 0 && <span className="tabular text-xs text-fg-faint">{count}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
}
