import { useEffect } from 'react'
import { toast } from 'sonner'
import type { SyncResult } from '../../../main/gitSync'
import { api } from '../lib/api'
import { queryClient } from '../lib/queries'

/** Reports a sync outcome. `manual` (the title bar button) also confirms when nothing changed. */
function show(r: SyncResult, manual: boolean) {
  if (r.push?.status === 'pushed')
    toast.success('Local changes pushed to remote', {
      id: 'git-push',
      description: `Pushed ${r.push.commits} commit${r.push.commits === 1 ? '' : 's'} to ${r.push.upstream}`,
      duration: 6000,
    })
  else if (r.push) toast.warning("Couldn't push local changes to remote", { id: 'git-push', description: r.push.reason, duration: 10_000 })
  if (r.status === 'skipped') {
    if (manual && !r.push)
      toast(r.reason === 'Already up to date' ? 'Project is in sync with remote' : 'Nothing to sync', { id: 'git-sync', description: r.reason, duration: 4000 })
    return
  }
  if (r.status === 'updated')
    toast.success('Project updated to the latest version', {
      id: 'git-sync',
      description: `Pulled ${r.commits} new commit${r.commits === 1 ? '' : 's'} from ${r.upstream}`,
      duration: 6000,
    })
  else toast.warning("Couldn't update project from remote", { id: 'git-sync', description: r.reason, duration: 10_000 })
}

/** Pulls safe remote git updates, pushes local commits when that is a fast-forward, and reports the outcome. `isCurrent` drops stale results. */
export async function syncProject({ manual = false, isCurrent = () => true }: { manual?: boolean; isCurrent?: () => boolean } = {}) {
  try {
    const r = await api.syncFromRemote()
    if (!isCurrent()) return
    if (r.status === 'updated') void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'app' })
    show(r, manual)
  } catch (err) {
    if (isCurrent()) show({ status: 'failed', reason: err instanceof Error ? err.message : String(err) }, manual)
  }
}

/** Syncs once on project open; silent when there is nothing to say. */
export function SyncToast({ root }: { root: string }) {
  useEffect(() => {
    // A result for a previously open project is never shown.
    let alive = true
    void syncProject({ isCurrent: () => alive })
    return () => {
      alive = false
      toast.dismiss('git-sync')
      toast.dismiss('git-push')
    }
  }, [root])
  return null
}
