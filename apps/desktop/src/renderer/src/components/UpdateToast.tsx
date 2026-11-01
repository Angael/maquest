import { useEffect, useState } from 'react'
import { CircleArrowUp, Download, TriangleAlert, X } from 'lucide-react'
import type { UpdateStatus } from '../../../main/updater'
import { Button } from './ui'

/** Follows a background app update: download progress, then a restart prompt; it also installs on quit if dismissed. */
export function UpdateToast() {
  const [status, setStatus] = useState<UpdateStatus>()
  // Dismissal is per stage, so hiding the download toast still lets the "ready" prompt appear.
  const [dismissed, setDismissed] = useState<UpdateStatus['state']>()
  useEffect(() => window.maquest.onUpdateStatus(setStatus), [])
  if (!status || dismissed === status.state) return null
  const icon = {
    downloading: <Download size={16} className="mt-0.5 shrink-0 text-sky-400" />,
    ready: <CircleArrowUp size={16} className="mt-0.5 shrink-0 text-emerald-400" />,
    failed: <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-400" />,
  }[status.state]
  const title = {
    downloading: `Downloading Maquest ${status.to}`,
    ready: `Maquest ${status.to} is ready`,
    failed: `Couldn't download Maquest ${status.to}`,
  }[status.state]
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex w-80 items-start gap-3 rounded-lg border border-stone-800 bg-stone-900 py-2 pr-2 pl-3 text-sm text-stone-200 shadow-xl"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-stone-400">{status.state === 'failed' ? status.reason : `Updating from ${status.from} to ${status.to}`}</div>
        {status.state === 'downloading' && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-stone-400">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-800">
              <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${status.percent}%` }} />
            </div>
            <span className="tabular-nums">{Math.floor(status.percent)}%</span>
          </div>
        )}
      </div>
      {status.state === 'ready' && (
        <Button variant="primary" onClick={() => void window.maquest.installUpdate()}>
          Restart
        </Button>
      )}
      <Button aria-label={status.state === 'ready' ? 'Later' : 'Dismiss'} onClick={() => setDismissed(status.state)}>
        <X size={14} />
      </Button>
    </div>
  )
}
