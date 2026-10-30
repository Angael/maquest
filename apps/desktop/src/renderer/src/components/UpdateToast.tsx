import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from './ui'

/** Shown once a new version has downloaded; it also installs on quit if dismissed. */
export function UpdateToast() {
  const [version, setVersion] = useState<string>()
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => window.maquest.onUpdateReady(setVersion), [])
  if (!version || dismissed) return null
  return (
    <div className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border border-stone-800 bg-stone-900 py-2 pr-2 pl-4 text-sm text-stone-200 shadow-xl">
      <span>Maquest {version} is ready</span>
      <Button variant="primary" onClick={() => void window.maquest.installUpdate()}>
        Restart
      </Button>
      <Button aria-label="Later" onClick={() => setDismissed(true)}>
        <X size={14} />
      </Button>
    </div>
  )
}
