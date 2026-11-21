import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Check, Copy, RotateCcw, X } from 'lucide-react'
import type { CrashReport } from '../../../shared/crashReport'
import { copyAgentPrompt, reportError } from '../lib/errors'
import { Button } from './ui'

type BoundaryProps = {
  children: ReactNode
  /** What the boundary guards, for the report: "Showing the project". */
  where: string
  /** Offered next to Reload, e.g. closing a project that keeps crashing. */
  onClose?: () => Promise<unknown>
  closeLabel?: string
}

/** Catches render errors below it and shows CrashScreen instead of a blank window. */
export class ErrorBoundary extends Component<BoundaryProps, { error: unknown; componentStack?: string }> {
  state: { error: unknown; componentStack?: string } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(_error: unknown, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? undefined })
  }

  render() {
    if (this.state.error === null) return this.props.children
    return (
      <CrashScreen
        where={this.props.where}
        error={this.state.error}
        componentStack={this.state.componentStack}
        onClose={this.props.onClose}
        closeLabel={this.props.closeLabel}
      />
    )
  }
}

/** A full-window error: what broke, and a prompt the user hands to their agent to report (and fix) it. */
export function CrashScreen({
  where,
  error,
  componentStack,
  onClose,
  closeLabel = 'Close project',
}: {
  where: string
  error: unknown
  componentStack?: string
  onClose?: () => Promise<unknown>
  closeLabel?: string
}) {
  const [report, setReport] = useState<CrashReport | null>(null)
  useEffect(() => {
    let live = true
    const stack =
      error instanceof Error && componentStack
        ? Object.assign(new Error(error.message), { stack: `${error.stack ?? error.message}\n\nComponent stack:${componentStack}` })
        : error
    void reportError(where, stack).then((r) => live && setReport(r))
    return () => {
      live = false
    }
  }, [where, error, componentStack])

  return (
    <div role="alert" className="flex h-full flex-col bg-app">
      {/* The window is frameless and the title bar may be what broke: a plain drag strip with a close button. */}
      <div className="app-drag flex h-10 shrink-0 items-center justify-end px-1.5">
        <Button variant="ghost" size="lg" aria-label="Close window" onClick={() => void window.maquest.window('close')}>
          <X size={16} aria-hidden />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-6">
        <div className="my-auto w-full max-w-[560px] pb-16">
          <ErrorReport report={report} title="Maquest ran into a problem" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="lg" onClick={() => window.location.reload()}>
              <RotateCcw size={14} aria-hidden />
              Reload
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="lg"
                onClick={() =>
                  void onClose()
                    .catch(() => {})
                    .finally(() => window.location.reload())
                }
              >
                <X size={14} aria-hidden />
                {closeLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The error, its details, and the "Copy prompt for your agent" action. Also used inline (the start screen). */
export function ErrorReport({ report, title, children }: { report: CrashReport | null; title: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-xl bg-panel p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold text-fg">{title}</h1>
          {report && <p className="mt-1 text-sm text-fg-muted">{report.where}.</p>}
          {report && (
            <p className="mt-2 max-h-40 overflow-y-auto rounded-md bg-danger-soft px-3 py-2 font-mono text-xs whitespace-pre-wrap wrap-anywhere text-danger">
              {report.message}
            </p>
          )}
          {children}
          <p className="mt-3 text-sm text-pretty text-fg-subtle">
            Give this prompt to your agent (Claude Code, Codex, …). It reports the problem on GitHub, and can propose a fix or tell you how to repair the
            project.
          </p>
          {report?.stack && (
            <details className="mt-3 text-xs text-fg-subtle">
              <summary className="cursor-default select-none hover:text-fg">Technical details</summary>
              <pre
                className="mt-2 max-h-56 overflow-auto rounded-md bg-surface p-2 font-mono text-2xs whitespace-pre-wrap wrap-anywhere text-fg-muted"
                data-allow-scroll
              >
                {report.stack}
              </pre>
              <p className="mt-2 wrap-anywhere">{report.environment}</p>
              {report.logFile && <p className="mt-1 font-mono text-2xs wrap-anywhere">{report.logFile}</p>}
            </details>
          )}
          <Button variant="primary" size="lg" className="mt-4" disabled={!report} onClick={() => report && void copyAgentPrompt(report).then(setCopied)}>
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? 'Prompt copied' : 'Copy prompt for your agent'}
          </Button>
        </div>
      </div>
    </div>
  )
}
