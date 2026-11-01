import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { UpdateStatus } from '../../../main/updater'

const ID = 'app-update'

function Progress({ percent }: { percent: number }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-800">
        <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <span className="tabular-nums">{Math.floor(percent)}%</span>
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
