import { createAnalytics, ignoreThisBrowser, isBrowserIgnored } from 'minalytics'
import type { ProjectKind } from '@maquest/core/schema'

/**
 * Anonymous, cookieless usage statistics (pulse.widacki.me). Only the packaged app sends anything:
 * dev mode, e2e runs and the checkout launcher stay silent. Never send titles, paths or other project content.
 */
type Events = {
  project_created: { kind: ProjectKind }
  project_opened: { source: 'recent' | 'folder'; kind: string }
  node_created: { type: string }
  edge_added: { type: string }
  board_created: void
  manuscript_exported: void
  agent_command_copied: void
  update_installed: void
  usage_stats_disabled: void
}

export const analytics = createAnalytics<Events>({
  endpoint: 'https://pulse.widacki.me',
  site: 'maquest',
  version: window.maquest.appInfo.version,
  enabled: window.maquest.appInfo.packaged,
  // Views are app state, not URLs: App reports them with `pageview` (see usePageview).
  autoPageviews: false,
})

/** The "anonymous usage statistics" setting: persists and applies immediately. */
export const usageStatsEnabled = () => !isBrowserIgnored()
export function setUsageStats(on: boolean) {
  if (!on) analytics.track('usage_stats_disabled')
  ignoreThisBrowser(!on)
}

type Call = { method: string; args: unknown[]; result: unknown }

/** Events derived from main-process calls, so every caller (palette, menus, canvas) is counted the same way. */
export function trackCall({ method, args, result }: Call) {
  const kind = (result as { config?: { kind?: string } } | null)?.config?.kind ?? 'unknown'
  switch (method) {
    case 'pickFolder': {
      if (!result) return
      const create = args[0] as { kind: ProjectKind } | undefined
      if (create) analytics.track('project_created', { kind: create.kind })
      else analytics.track('project_opened', { source: 'folder', kind })
      return
    }
    case 'open':
      return analytics.track('project_opened', { source: 'recent', kind })
    case 'createNode':
      return analytics.track('node_created', { type: (args[0] as { type: string }).type })
    case 'createMap':
      return analytics.track('node_created', { type: 'map' })
    case 'addEdge':
      return analytics.track('edge_added', { type: (args[0] as { type?: string }).type ?? 'auto' })
    case 'createBoard':
      return analytics.track('board_created')
    case 'exportManuscript':
      if (result) analytics.track('manuscript_exported')
      return
  }
}
