import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { Plus } from 'lucide-react'
import { Button, Input, Popover, cn } from '../ui'
import './views.css'

/*
 * Shared layout for the full-width views (Backlog, Guidelines, Types): one page header pattern, one list pane,
 * one detail pane. Horizontal rhythm is 24px everywhere so the header, list text and editors line up.
 */

export function PageHeader({ title, count, description, children }: { title: string; count?: ReactNode; description: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex shrink-0 items-end gap-6 border-b border-line px-6 pt-5 pb-4">
      <div className="min-w-0 flex-1">
        <h1 className="flex items-baseline gap-2.5 font-serif text-xl font-semibold text-balance text-fg">
          {title}
          {count !== undefined && <span className="tabular font-sans text-sm font-normal text-fg-subtle">{count}</span>}
        </h1>
        <p className="mt-1 max-w-[72ch] text-sm text-pretty text-fg-subtle">{description}</p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  )
}

/** Header + list on the left + detail on the right. */
export function TwoPane({ header, list, listLabel, children }: { header: ReactNode; list: ReactNode; listLabel: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="flex min-h-0 flex-1">
        <nav aria-label={listLabel} className="w-72 shrink-0 overflow-y-auto overscroll-contain border-r border-line px-3 pt-2 pb-6">
          {list}
        </nav>
        <section className="min-w-0 flex-1 overflow-y-auto">{children}</section>
      </div>
    </div>
  )
}

export function ListGroup({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return (
    <div className="pt-3">
      <h2 className="flex h-6 items-center gap-1.5 px-3 text-xs font-medium text-fg-subtle">
        {label}
        {count !== undefined && <span className="tabular font-normal text-fg-faint">{count}</span>}
      </h2>
      <ul className="space-y-px">{children}</ul>
    </div>
  )
}

/** Row classes for list panes: 32px, accent tint when selected. */
export const listRow = (selected: boolean) =>
  cn(
    'relative flex h-8 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm outline-none transition-colors duration-100',
    selected ? 'bg-accent-soft text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
  )

/** Small on/off switch (Base UI). The hit area extends past the visual track. */
export function Switch({ checked, onChange, label, className }: { checked: boolean; onChange: (checked: boolean) => void; label: string; className?: string }) {
  return (
    <BaseSwitch.Root
      checked={checked}
      onCheckedChange={(c) => onChange(c)}
      aria-label={label}
      className={cn(
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full bg-line-strong p-0.5 transition-colors duration-100 outline-none after:absolute after:-inset-1.5 focus-visible:ring-2 focus-visible:ring-accent/70 data-[checked]:bg-fg-muted',
        className,
      )}
    >
      <BaseSwitch.Thumb className="size-3 rounded-full bg-fg-subtle shadow-sm transition-transform duration-150 ease-[var(--ease-out)] data-[checked]:translate-x-3 data-[checked]:bg-panel" />
    </BaseSwitch.Root>
  )
}

/** "New …" button that opens a small naming form. `create` returns an error message to keep the form open. */
export function CreateButton({
  label,
  fieldLabel,
  placeholder,
  hint,
  submitLabel,
  create,
}: {
  label: string
  fieldLabel: string
  placeholder: string
  hint?: (value: string) => ReactNode
  submitLabel: string
  create: (value: string) => Promise<string | null> | string | null
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    const failure = await create(value.trim())
    if (failure) return setError(failure)
    setValue('')
    setError(null)
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => (setOpen(o), o || setError(null))}
      trigger={
        <Button variant="subtle">
          <Plus size={14} aria-hidden className="-ml-0.5 text-fg-subtle" />
          {label}
        </Button>
      }
      className="w-72 p-3"
    >
      <form onSubmit={submit}>
        <label className="mb-1.5 block text-xs font-medium text-fg-subtle" htmlFor={id}>
          {fieldLabel}
        </label>
        <Input
          id={id}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => (setValue(e.target.value), setError(null))}
        />
        <div className="mt-2 min-h-4 text-2xs text-fg-faint" aria-live="polite">
          {error ? <span className="text-danger">{error}</span> : hint?.(value.trim())}
        </div>
        <div className="mt-2 flex justify-end gap-1.5">
          <Button size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" type="submit" variant="primary" disabled={!value.trim()}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Popover>
  )
}

/** Blocking confirmation for irreversible actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="dialog-backdrop fixed inset-0 z-[80] bg-black/50" />
        <AlertDialog.Popup className="dialog-popup fixed top-1/2 left-1/2 z-[80] w-[400px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-raised p-5 shadow-[var(--shadow-popover)] outline-none">
          <AlertDialog.Title className="text-base font-semibold text-fg">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 text-sm text-pretty text-fg-muted">{description}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
            <Button
              className="bg-danger text-app hover:bg-danger/90"
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
