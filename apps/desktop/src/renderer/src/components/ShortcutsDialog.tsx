import { useEffect } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { useUI } from '../lib/store'
import { MOD, SHORTCUTS, type ShortcutGroup } from '../lib/shortcuts'
import { IconButton, Shortcut, cn } from './ui'

/** One area's shortcuts as label / key-cap rows. */
export function ShortcutList({ groups, className }: { groups: readonly ShortcutGroup[]; className?: string }) {
  return (
    <div className={className}>
      {groups.map(({ group, items }) => (
        <section key={group} className="break-inside-avoid pb-3">
          <h3 className="mb-1 text-2xs font-medium text-fg-subtle">{group}</h3>
          <ul>
            {items.map(([label, keys]) => (
              <li key={label} className="flex h-6 items-center justify-between gap-3 text-xs text-fg-muted">
                {label}
                <Shortcut keys={keys} className="shrink-0" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Ctrl+/ (or the command palette): every keyboard shortcut. Keyboard-opened, so it appears without animation. */
export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen)
  const setOpen = useUI((s) => s.setShortcutsOpen)
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key !== '/') return
      e.preventDefault()
      const ui = useUI.getState()
      ui.setShortcutsOpen(!ui.shortcutsOpen)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])
  return (
    <Dialog.Root open={open} onOpenChange={(o) => setOpen(o)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Popup
          className={cn(
            'fixed top-[12vh] left-1/2 z-[90] flex max-h-[76vh] w-[680px] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-panel shadow-[var(--shadow-popover)] outline-none',
          )}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-2 pl-5">
            <Dialog.Title className="flex-1 text-base font-semibold text-fg">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close render={<IconButton icon={X} label="Close" shortcut="Esc" size="sm" />} />
          </div>
          <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-2">
            <ShortcutList groups={[...SHORTCUTS.general, ...SHORTCUTS.canvas]} className="columns-2 gap-8" />
          </div>
          <p className="shrink-0 border-t border-line px-5 py-2.5 text-2xs text-fg-faint">
            Every action is also in the command palette ({MOD}+K). Map tools show their keys in the toolbar tooltips.
          </p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
