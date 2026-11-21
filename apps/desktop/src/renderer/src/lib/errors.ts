import { toast } from 'sonner'
import { agentPrompt, describeError, type CrashReport } from '../../../shared/crashReport'

/**
 * Renderer errors: logged by the main process and shown to the user with a prompt for their agent.
 * Uses the raw bridge rather than `api`, so it keeps working when the api layer is what broke.
 */

/** Logs the error in the main process and returns a report for it; builds one locally if the main process can't be reached. */
export async function reportError(where: string, error: unknown): Promise<CrashReport> {
  const { message, stack } = describeError(error)
  try {
    return (await window.maquest.invoke('reportError', [where, message, stack])) as CrashReport
  } catch {
    const { version, packaged } = window.maquest?.appInfo ?? { version: 'unknown', packaged: false }
    return { where, message, stack, environment: `Maquest ${version} (${packaged ? 'packaged' : 'dev'}), ${navigator.userAgent}` }
  }
}

export async function copyAgentPrompt(report: CrashReport) {
  try {
    await navigator.clipboard.writeText(agentPrompt(report))
    toast('Prompt copied. Paste it into your agent.')
    return true
  } catch {
    toast.error('Could not copy to the clipboard')
    return false
  }
}

/** Noise browsers report as errors that don't mean anything broke. */
const BENIGN = [/ResizeObserver loop/i]
const shown = new Set<string>()

/** An error toast with a "Copy prompt" action; the same message shows once per session. */
export async function toastError(where: string, error: unknown) {
  const { message } = describeError(error)
  if (BENIGN.some((re) => re.test(message))) return
  const report = await reportError(where, error)
  if (shown.has(message)) return
  shown.add(message)
  toast.error('Something went wrong', {
    description: message,
    duration: 15_000,
    action: { label: 'Copy prompt for agent', onClick: () => void copyAgentPrompt(report) },
  })
}

/** Errors nothing else caught (event handlers, async code) are logged and shown instead of failing silently. */
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => void toastError('Unexpected error in the window', event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => void toastError('Unhandled error in the window', event.reason))
}
