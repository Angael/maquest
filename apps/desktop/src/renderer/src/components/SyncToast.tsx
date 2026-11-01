import { useEffect } from 'react'
import { toast } from 'sonner'
import type { SyncResult } from '../../../main/gitSync'
import { api } from '../lib/api'
import { queryClient } from '../lib/queries'

function show(r: SyncResult) {
  if (r.status === 'skipped') return
  if (r.status === 'updated')
    toast.success('Project updated to the latest version', {
      id: 'git-sync',
      description: `Pulled ${r.commits} new commit${r.commits === 1 ? '' : 's'} from ${r.upstream}`,
      duration: 6000,
    })
  else toast.warning("Couldn't update project from remote", { id: 'git-sync', description: r.reason, duration: 10_000 })
}

/** On project open, pulls safe remote git updates and reports the outcome; silent when there is nothing to say. */
export function SyncToast({ root }: { root: string }) {
  useEffect(() => {
    // A result for a previously open project is never shown.
    let alive = true
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
      toast.dismiss('git-sync')
    }
  }, [root])
  return null
}
