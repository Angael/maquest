import { useEffect, useState, type ReactNode } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { cn } from './ui'

const isMac = window.maquest.platform === 'darwin'

/**
 * App-integrated window title bar. The whole bar drags the window (double-click maximizes, handled by the OS);
 * interactive children opt out automatically via `.app-drag` rules in styles.css.
 */
export function TitleBar({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <header
      className={cn(
        'app-drag flex h-[var(--titlebar-height)] shrink-0 items-center gap-2 border-b border-line bg-panel pr-0',
        isMac ? 'pl-[78px]' : 'pl-2',
        className,
      )}
      onDoubleClick={(event) => {
        // Frameless windows on Windows/Linux don't always maximize on double-click; do it for the bare bar only.
        if (!isMac && event.target === event.currentTarget) void window.maquest.window('toggleMaximize')
      }}
    >
      {children}
      {!isMac && <WindowControls />}
    </header>
  )
}

/** The app mark: an orange quill-ish glyph that also works at 16px. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-5', className)} aria-hidden>
      <rect width="24" height="24" rx="6" className="fill-accent" />
      <path d="M7 17V7.5l5 5.5 5-5.5V17" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="stroke-accent-fg" />
    </svg>
  )
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    void window.maquest.window('isMaximized').then(setMaximized)
    return window.maquest.onMaximized(setMaximized)
  }, [])
  const button =
    'flex h-[var(--titlebar-height)] w-11 items-center justify-center text-fg-subtle outline-none transition-colors duration-100 hover:bg-hover hover:text-fg focus-visible:bg-hover'
  return (
    <div className="ml-1 flex self-stretch" role="group" aria-label="Window">
      <button type="button" aria-label="Minimize" className={button} onClick={() => void window.maquest.window('minimize')}>
        <Minus size={15} strokeWidth={1.5} />
      </button>
      <button type="button" aria-label={maximized ? 'Restore' : 'Maximize'} className={button} onClick={() => void window.maquest.window('toggleMaximize')}>
        {maximized ? <Copy size={12} strokeWidth={1.5} className="-scale-x-100" /> : <Square size={12} strokeWidth={1.5} />}
      </button>
      <button
        type="button"
        aria-label="Close window"
        className={cn(button, 'hover:bg-[#c42b1c] hover:text-white')}
        onClick={() => void window.maquest.window('close')}
      >
        <X size={16} strokeWidth={1.5} />
      </button>
    </div>
  )
}
