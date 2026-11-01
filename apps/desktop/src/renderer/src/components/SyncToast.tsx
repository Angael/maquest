import { useEffect, useState } from 'react'
import { CloudDownload, TriangleAlert, X } from 'lucide-react'
import type { SyncResult } from '../../../main/gitSync'
import { api } from '../lib/api'
import { queryClient } from '../lib/queries'
import { Button } from './ui'

/** On project open, pulls safe remote git updates and reports the outcome; silent when there is nothing to say. */
export function SyncToast({ root }: { root: string }) {
  // Keyed by root so a result for a previously open project is never shown.
  const [state, setState] = useState<{ root: string; result?: SyncResult }>()
  const result = state?.root === root ? state.result : undefined
  const setResult = (r?: SyncResult) => setState({ root, result: r })
  useEffect(() => {
    let alive = true
    const show = (r: SyncResult) => setState({ root, result: r })
    api
      .syncFromRemote()
      .then((r) => {
        if (!alive) return
        if (r.status === 'updated') void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' })
        show(r)
      })
      .catch((err: unknown) => alive && show({ status: 'failed', reason: err instanceof Error ? err.message : String(err) }))
    return () => {
      alive = false
    }
  }, [root])
  useEffect(() => {
    if (!result || result.status === 'skipped') return
    const timer = setTimeout(() => setState(undefined), result.status === 'updated' ? 6000 : 10_000)
    return () => clearTimeout(timer)
  }, [result])

  if (!result || result.status === 'skipped') return null
  const ok = result.status === 'updated'
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-start gap-3 rounded-lg border border-stone-800 bg-stone-900 py-2 pr-2 pl-3 text-sm text-stone-200 shadow-xl"
    >
      {ok ? <CloudDownload size={16} className="mt-0.5 shrink-0 text-emerald-400" /> : <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-400" />}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{ok ? 'Project updated to the latest version' : "Couldn't update project from remote"}</div>
        <div className="text-xs text-stone-400">
          {ok ? `Pulled ${result.commits} new commit${result.commits === 1 ? '' : 's'} from ${result.upstream}` : result.reason}
        </div>
      </div>
      <Button aria-label="Dismiss" onClick={() => setResult(undefined)}>
        <X size={14} />
      </Button>
    </div>
  )
}
