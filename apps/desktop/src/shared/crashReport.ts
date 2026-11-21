/**
 * Crash reports the user hands to their agent: what broke, where, and what to do with it (find or file a GitHub issue,
 * ideally open a fix). Shared by the main process (native dialogs) and the renderer (error screen, toasts); no Node or DOM APIs.
 */

export const REPO = 'Angael/maquest'

export type CrashReport = {
  /** What the app was doing, e.g. "Opening the last project on launch". */
  where: string
  message: string
  stack?: string
  /** "Maquest 1.2.3 (packaged), Electron 39, linux x64 6.1" */
  environment: string
  /** Error log on disk, which the agent can read for earlier errors. */
  logFile?: string
  /** The project folder, so the agent can look at the files that tripped Maquest up. Never posted. */
  projectRoot?: string
}

type Issue = { path: PropertyKey[]; message: string }

export function describeError(error: unknown): { message: string; stack?: string } {
  // Validation errors (zod) carry a JSON dump as their message; list the problems instead.
  const issues = (error as { issues?: Issue[] } | null)?.issues
  if (error instanceof Error && Array.isArray(issues) && issues.length)
    return { message: issues.map((i) => `${i.path.map(String).join('.') || 'value'}: ${i.message}`).join('\n'), stack: error.stack }
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack }
  if (typeof error === 'string') return { message: error }
  try {
    return { message: JSON.stringify(error) ?? String(error) }
  } catch {
    return { message: String(error) }
  }
}

const MAX_STACK_LINES = 40

/** The prompt the user pastes into Claude Code, Codex or another agent. */
export function agentPrompt(r: CrashReport): string {
  const stack = r.stack?.split('\n').slice(0, MAX_STACK_LINES).join('\n')
  const search = r.message.replaceAll(/["`\n]/g, ' ').slice(0, 80)
  return [
    'Maquest (the desktop app) hit an error. Please report it, and fix it if you can.',
    '',
    `What happened: ${r.where}`,
    `Error: ${r.message}`,
    ...(stack && stack !== r.message ? ['', 'Stack trace:', '```', stack, '```'] : []),
    '',
    `Environment: ${r.environment}`,
    ...(r.logFile ? [`Error log (earlier errors too): ${r.logFile}`] : []),
    ...(r.projectRoot ? [`Project folder (for local investigation only; never post its path or contents): ${r.projectRoot}`] : []),
    '',
    'Steps:',
    `1. Look for an existing issue: gh issue list --repo ${REPO} --state all --search "${search}"`,
    `2. If one exists, comment with anything new from this report. Otherwise create one: gh issue create --repo ${REPO}, with a short title, the error, the stack trace, the environment and steps to reproduce.`,
    `3. If you can find the cause in the source (https://github.com/${REPO}), fork the repo, fix it with a test, and open a pull request that references the issue.`,
    `4. If a file in the project folder triggers the error (for example malformed frontmatter or JSON), tell me which file and how to repair it.`,
    '',
    'Keep my project private: do not put note text, titles, file names or paths from my project in the issue or pull request.',
  ].join('\n')
}
