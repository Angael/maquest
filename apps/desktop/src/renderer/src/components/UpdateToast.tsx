import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { UpdateStatus } from '../../../main/updater'

const ID = 'app-update'

function Progress({ percent }: { percent: number }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <div
        role="progressbar"
        aria-label="Download progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(percent)}
        className="h-1 flex-1 overflow-hidden rounded-full bg-active"
      >
        <div
          className="h-full origin-left rounded-full bg-accent transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
      <span className="tabular w-8 text-right text-2xs text-fg-subtle">{Math.floor(percent)}%</span>
    </div>
  )
}

/** Follows a background app update: download progress, then a restart prompt; it also installs on quit if dismissed. */
export function UpdateToast() {
  // Dismissal is per stage, so hiding the download toast still lets the "ready" prompt appear.
  const dismissed = useRef<UpdateStatus['state']>(undefined)
  useEffect(
    () =>
      window.maquest.onUpdateStatus((status) => {
        if (dismissed.current === status.state) return
        const opts = {
          id: ID,
          duration: Infinity,
          closeButton: true,
          onDismiss: () => (dismissed.current = status.state),
        }
        if (status.state === 'downloading')
          toast.loading(`Downloading Maquest ${status.to}`, {
            ...opts,
            description: (
              <>
                Updating from {status.from} to {status.to}
                <Progress percent={status.percent} />
              </>
            ),
          })
        else if (status.state === 'ready')
          toast.success(`Maquest ${status.to} is ready`, {
            ...opts,
            description: `Updating from ${status.from} to ${status.to}`,
            action: { label: 'Restart', onClick: () => void window.maquest.installUpdate() },
          })
        else toast.warning(`Couldn't download Maquest ${status.to}`, { ...opts, description: status.reason })
      }),
    [],
  )
  return null
}
