import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { app, clipboard, dialog } from 'electron'
import { agentPrompt, describeError, type CrashReport } from '../shared/crashReport'

/**
 * Failures never pass silently: every error is appended to a log file, and anything that breaks the app is shown to the
 * user with a prompt they can hand to their agent (see shared/crashReport.ts).
 */

export const logFile = () => path.join(app.getPath('logs'), 'errors.log')

export const environment = () =>
  `Maquest ${app.getVersion()} (${app.isPackaged ? 'packaged' : 'dev'}), Electron ${process.versions.electron}, ${process.platform} ${process.arch} ${os.release()}`

/** Appends to the error log; never throws. */
export function logError(where: string, error: unknown) {
  const { message, stack } = describeError(error)
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true })
    // Keep the log small: start over past 1 MB.
    if (fs.existsSync(logFile()) && fs.statSync(logFile()).size > 1_000_000) fs.rmSync(logFile())
    fs.appendFileSync(logFile(), `[${new Date().toISOString()}] ${environment()}\n${where}: ${stack ?? message}\n\n`)
  } catch {
    // Logging must never be the thing that breaks.
  }
  console.error(`[maquest] ${where}:`, error)
}

export function report(where: string, error: unknown, projectRoot?: string): CrashReport {
  return { where, ...describeError(error), environment: environment(), logFile: logFile(), projectRoot }
}

type Choice = 'continue' | 'reload' | 'quit'

let showing = false

/**
 * Logs the error and shows a native dialog with the error and a "Copy prompt for your agent" button.
 * Used where the renderer can't show it itself: main-process crashes, a renderer that died or never started.
 */
export async function showCrash(
  where: string,
  error: unknown,
  { actions = ['continue', 'quit'], win, projectRoot }: { actions?: Choice[]; win?: BrowserWindow | null; projectRoot?: string } = {},
): Promise<Choice> {
  logError(where, error)
  // One dialog at a time: a crash loop must not stack dialogs.
  if (showing) return 'continue'
  showing = true
  try {
    await app.whenReady()
    const r = report(where, error, projectRoot)
    const labels: Record<Choice, string> = { continue: 'Continue', reload: 'Reload window', quit: 'Quit Maquest' }
    const buttons = ['Copy prompt for your agent', ...actions.map((a) => labels[a])]
    const parent = win && !win.isDestroyed() ? win : undefined
    const options = {
      type: 'error' as const,
      title: 'Maquest ran into a problem',
      message: `Maquest ran into a problem: ${where.toLowerCase()}.`,
      detail: `${r.message}\n\nCopy the prompt below and give it to your agent (Claude Code, Codex, …): it will report the problem on GitHub and can propose a fix.\n\nError log: ${r.logFile}`,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      noLink: true,
    }
    while (true) {
      const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
      if (response !== 0) return actions[response - 1] ?? 'continue'
      clipboard.writeText(agentPrompt(r))
      options.detail = `Prompt copied. Paste it into your agent.\n\n${r.message}\n\nError log: ${r.logFile}`
    }
  } catch (dialogError) {
    // Without a working dialog, the OS error box still tells the user something.
    dialog.showErrorBox(
      'Maquest ran into a problem',
      `${where}\n\n${describeError(error).message}\n\nError log: ${logFile()}\n\n${describeError(dialogError).message}`,
    )
    return 'continue'
  } finally {
    showing = false
  }
}

/** Catches what slips through in the main process instead of letting it vanish or kill the app quietly. */
export function installCrashHandlers() {
  process.on('uncaughtException', (error) => {
    void showCrash('Unexpected error in the main process', error).then((choice) => choice === 'quit' && app.exit(1))
  })
  process.on('unhandledRejection', (reason) => logError('Unhandled promise rejection in the main process', reason))
}

/**
 * Watches a window's renderer: a crash, a page that fails to load, or a renderer that never starts (a blank window)
 * each show the crash dialog with a reload option.
 */
export function watchRenderer(win: BrowserWindow, load: () => void, projectRoot: () => string | undefined) {
  const consoleErrors: string[] = []
  const wc = win.webContents
  const handle = async (where: string, error: unknown) => {
    const choice = await showCrash(where, error, { actions: ['reload', 'quit'], win, projectRoot: projectRoot() })
    if (choice === 'quit') app.exit(1)
    else if (!win.isDestroyed()) load()
  }
  wc.on('console-message', (details) => {
    if (details.level === 'error') consoleErrors.push(details.message)
    if (consoleErrors.length > 20) consoleErrors.shift()
  })
  wc.on('preload-error', (_e, _path, error) => logError('Preload script failed', error))
  wc.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return
    void handle('The window crashed', new Error(`Renderer process gone: ${details.reason} (exit code ${details.exitCode})`))
  })
  wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    // -3 is an aborted load, e.g. a reload started while loading.
    if (!isMainFrame || code === -3) return
    void handle('The window failed to load', new Error(`${description} (${code}) loading ${url}`))
  })
  // The renderer marks <html data-booted> once React mounted; without it the window stays blank.
  wc.on('did-finish-load', () => {
    setTimeout(() => {
      if (win.isDestroyed()) return
      wc.executeJavaScript('document.documentElement.dataset.booted === "1"')
        .then((booted: boolean) => {
          if (!booted) void handle('The window failed to start', new Error(consoleErrors.join('\n') || 'The interface did not start (no error was reported).'))
        })
        .catch((error: unknown) => logError('Checking that the window started', error))
    }, 4000)
  })
}
