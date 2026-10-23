import path from 'node:path'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  EDGE_DESCRIPTIONS,
  EDGE_TYPES,
  ENTITY_TYPES,
  EdgeType,
  EdgeHandle,
  GuidelineScope,
  NodeType,
  Project,
  ProjectKind,
  Status,
  type OutlineNode,
  type StoryNode,
} from '@maquest/core'

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const explicitRoot = arg('project') ?? process.env.MAQUEST_PROJECT
const startDir = explicitRoot ?? process.cwd()

function project(): Project {
  const root = explicitRoot ? path.resolve(explicitRoot) : Project.find(startDir)
  if (!root || !Project.isProject(root)) {
    throw new Error(`No Maquest project found at ${startDir}. Use the "project" tool with action "init" to create one.`)
  }
  return new Project(root)
}

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] })

/** Wraps a handler so errors come back to the agent as readable tool errors. */
function safe<A>(fn: (a: A) => string | Promise<string>) {
  return async (a: A) => {
    try {
      return text(await fn(a))
    } catch (e) {
      return { ...text(`Error: ${(e as Error).message}`), isError: true }
    }
  }
}

const line = (n: StoryNode) =>
  `- ${n.id} [${n.type}${n.status ? `, ${n.status}` : ''}] ${n.title}${n.summary ? ` — ${n.summary}` : ''}`

function outlineText(nodes: OutlineNode[], depth = 0): string {
  return nodes
    .map((n) => {
      const head = `${'  '.repeat(depth)}- ${n.id} [${n.type}${n.status ? `, ${n.status}` : ''}] ${n.title}${n.summary ? ` — ${n.summary}` : ''}`
      return n.children.length ? `${head}\n${outlineText(n.children, depth + 1)}` : head
    })
    .join('\n')
}

function nodeText(p: Project, n: StoryNode): string {
  const titles = new Map(p.listNodes().map((x) => [x.id, x.title]))
  const edges = p.edgesOf(n.id).map((e) => {
    const out = e.source === n.id
    const other = out ? e.target : e.source
    return `- (${e.id}) ${out ? '→' : '←'} ${e.type}${e.label ? ` "${e.label}"` : ''} ${other} (${titles.get(other) ?? '?'})${e.sourceHandle || e.targetHandle ? ` [handles: ${e.sourceHandle ?? 'auto'} → ${e.targetHandle ?? 'auto'}]` : ''}`
  })
  const children = p.children(n.id).map(line)
  const meta = [
    `id: ${n.id}`,
    `type: ${n.type}`,
    n.parent && `parent: ${n.parent} (${titles.get(n.parent) ?? '?'})`,
    n.order !== undefined && `order: ${n.order}`,
    n.status && `status: ${n.status}`,
    n.pinned !== undefined && `pinned: ${n.pinned}`,
    n.summary && `summary: ${n.summary}`,
    n.tags.length && `tags: ${n.tags.join(', ')}`,
    n.media.length && `media: ${n.media.join(', ')}`,
    n.src && `src: ${n.src}`,
    ...Object.entries(n.fields).map(([k, v]) => `${k}: ${v || '(empty)'}`),
  ].filter(Boolean)
  return [
    `# ${n.title}`,
    meta.join('\n'),
    edges.length ? `## Connections\n${edges.join('\n')}` : '',
    children.length ? `## Children\n${children.join('\n')}` : '',
    `## Body\n${n.body.trim() || '(empty)'}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

const server = new McpServer(
  { name: 'maquest', version: '0.1.0' },
  {
    instructions: `Maquest is a writing project: stories → chapters → scenes, plus entities (characters, locations, factions, items), free notes, a backlog of ideas, media, and a node graph of typed, labeled connections.
Workflow: call "overview" first. Read "guidelines" before creative work and follow them. Project overrides beat defaults.
Be proactive. Turn what the author says into project changes right away (write/connect), then briefly report what changed. Put loose ideas in the backlog (type "idea"). Keep connections in sync (involves, located-at, foreshadows, leads-to...).
Edits apply immediately to markdown files on disk, and the Maquest app updates live.`,
  },
)

server.registerTool(
  'overview',
  {
    title: 'Project overview',
    description:
      'Compact map of the whole project: config, story outline (stories > chapters > scenes), entities, notes, backlog, connection stats, guideline index. Start here.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  safe(() => {
    const p = project()
    const c = p.config()
    const all = p.listNodes()
    const edges = p.graph().edges
    const byType = (t: string) => all.filter((n) => n.type === t)
    const section = (title: string, nodes: StoryNode[]) => (nodes.length ? `## ${title}\n${nodes.map(line).join('\n')}` : '')
    const edgeStats = EDGE_TYPES.map((t) => [t, edges.filter((e) => e.type === t).length] as const)
      .filter(([, n]) => n)
      .map(([t, n]) => `${t}: ${n}`)
      .join(', ')
    return [
      `# ${c.name} (${c.kind})${c.description ? `\n${c.description}` : ''}`,
      `## Outline\n${outlineText(p.outline()) || '(no stories yet)'}`,
      ...ENTITY_TYPES.map((t) => section(`${t[0].toUpperCase()}${t.slice(1)}s`, byType(t))),
      section('Notes', byType('note')),
      section('Backlog', byType('idea')),
      section('Media nodes', byType('media')),
      `## Connections\n${edges.length} total${edgeStats ? ` (${edgeStats})` : ''}`,
      `## Guidelines (read with "guidelines")\n${p
        .guidelines({ applicableOnly: true })
        .map((g) => `- ${g.id}: ${g.title}${g.source !== 'default' ? ` [${g.source}]` : ''}`)
        .join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n')
  }),
)

server.registerTool(
  'find',
  {
    title: 'Find nodes',
    description: 'Search/list nodes. Returns one line per node (id, type, status, title, summary). All filters optional.',
    inputSchema: {
      type: z.array(NodeType).optional().describe('Node types to include'),
      parent: z.string().optional().describe('Only direct children of this node id'),
      tag: z.string().optional(),
      status: Status.optional(),
      text: z.string().optional().describe('Case-insensitive full-text match on title/summary/body/fields'),
    },
    annotations: { readOnlyHint: true },
  },
  safe((a) => {
    const nodes = project().listNodes(a)
    return nodes.length ? nodes.map(line).join('\n') : 'No matches.'
  }),
)

server.registerTool(
  'read',
  {
    title: 'Read nodes',
    description: 'Full content of nodes: metadata, fields, connections (with edge ids), children and markdown body.',
    inputSchema: { ids: z.array(z.string()).min(1) },
    annotations: { readOnlyHint: true },
  },
  safe(({ ids }) => {
    const p = project()
    return ids.map((id) => nodeText(p, p.requireNode(id))).join('\n\n---\n\n')
  }),
)

const WriteItem = z.object({
  id: z.string().optional().describe('Existing node id to update. Omit to create a new node.'),
  type: NodeType.optional().describe('Required when creating. Changing it on update converts the node.'),
  title: z.string().optional().describe('Required when creating'),
  parent: z
    .string()
    .nullable()
    .optional()
    .describe('chapter→story, scene→chapter, note→story/chapter/scene. null detaches.'),
  order: z.number().optional().describe('Position among siblings'),
  status: Status.nullable().optional(),
  summary: z.string().optional().describe('One-line summary (scenes: "X tries to Y, but Z, so W")'),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional().describe('Keep this node fixed during automatic canvas layout'),
  fields: z.record(z.string(), z.string()).optional().describe('Merged into the existing fields; "" removes a field'),
  body: z.string().optional().describe('Markdown body (replaces the existing body)'),
  appendBody: z.string().optional().describe('Markdown appended to the body'),
  media: z.array(z.string()).optional().describe('Attached media paths (media/...)'),
  src: z.string().optional().describe('For media nodes: media path shown on the canvas'),
})

server.registerTool(
  'write',
  {
    title: 'Create or update nodes',
    description: `Batch create/update nodes. Types: story, chapter, scene, note, character, location, faction, item, idea (backlog), media. New nodes get starter templates (fields like want/need/flaw for characters, goal/conflict/outcome for scenes). Markdown bodies may embed media: ![alt](media/file.png). Links to other nodes: [[node-id]].`,
    inputSchema: { nodes: z.array(WriteItem).min(1) },
  },
  safe(({ nodes }) => {
    const p = project()
    return nodes
      .map((n) => {
        if (n.id) {
          const { id, ...patch } = n
          const r = p.updateNode(id, patch)
          return `updated ${r.id} (${r.type}) ${r.title}`
        }
        if (!n.type || !n.title) throw new Error('Creating a node requires type and title')
        const r = p.createNode({
          ...n,
          type: n.type,
          title: n.title,
          parent: n.parent ?? undefined,
          status: n.status ?? undefined,
          body: n.appendBody ? `${n.body ?? ''}${n.appendBody}` : n.body,
        })
        return `created ${r.id} (${r.type}) ${r.title}`
      })
      .join('\n')
  }),
)

server.registerTool(
  'delete',
  {
    title: 'Delete nodes',
    description:
      'Delete nodes and their connections. Children are detached unless recursive=true. Prefer moving unwanted author content into the backlog over deleting it.',
    inputSchema: { ids: z.array(z.string()).min(1), recursive: z.boolean().optional() },
    annotations: { destructiveHint: true },
  },
  safe(({ ids, recursive }) => {
    const p = project()
    return `deleted: ${ids.flatMap((id) => p.deleteNode(id, { recursive })).join(', ')}`
  }),
)

server.registerTool(
  'connect',
  {
    title: 'Manage connections',
    description: `Add, update or remove graph connections between nodes. Edge types:\n${EDGE_TYPES.map((t) => `- ${t}: ${EDGE_DESCRIPTIONS[t]}`).join('\n')}\nLabels name the connection (e.g. "betrays", "rivals since childhood").`,
    inputSchema: {
      ops: z
        .array(
          z.object({
            action: z.enum(['add', 'update', 'remove']),
            id: z.string().optional().describe('Edge id (update/remove)'),
            source: z.string().optional(),
            target: z.string().optional(),
            type: EdgeType.optional(),
            label: z.string().optional(),
            sourceHandle: EdgeHandle.optional(),
            targetHandle: EdgeHandle.optional(),
          }),
        )
        .min(1),
    },
  },
  safe(({ ops }) => {
    const p = project()
    return ops
      .map((o) => {
        if (o.action === 'add') {
          if (!o.source || !o.target) throw new Error('add requires source and target')
          const e = p.addEdge({ source: o.source, target: o.target, type: o.type, label: o.label, sourceHandle: o.sourceHandle, targetHandle: o.targetHandle })
          return `edge ${e.id}: ${e.source} -${e.type}${e.label ? ` "${e.label}"` : ''}-> ${e.target}`
        }
        if (!o.id) throw new Error(`${o.action} requires edge id (see "read" output)`)
        if (o.action === 'remove') {
          p.removeEdge(o.id)
          return `removed edge ${o.id}`
        }
        const e = p.updateEdge(o.id, o)
        return `updated edge ${e.id}: ${e.source} -${e.type}${e.label ? ` "${e.label}"` : ''}-> ${e.target}`
      })
      .join('\n')
  }),
)

server.registerTool(
  'guidelines',
  {
    title: 'Writing guidelines',
    description:
      'Built-in writing guidelines merged with per-project overrides. Actions: list (index), read (full text, all applicable if no id), write (override or add custom; stored in guidelines/<id>.md), reset (remove the override and restore the default), disable/enable.',
    inputSchema: {
      action: z.enum(['list', 'read', 'write', 'reset', 'disable', 'enable']),
      id: z.string().optional(),
      title: z.string().optional(),
      body: z.string().optional().describe('Full markdown body for write'),
      scope: GuidelineScope.optional().describe('Which project kinds it applies to'),
    },
  },
  safe(({ action, id, title, body, scope }) => {
    const p = project()
    const fmt = (g: { id: string; title: string; scope: string; source: string; disabled?: boolean; body: string }) =>
      `## ${g.title} (${g.id}; ${g.scope}; ${g.source}${g.disabled ? '; disabled' : ''})\n${g.body}`
    switch (action) {
      case 'list':
        return p
          .guidelines({ includeDisabled: true })
          .map((g) => `- ${g.id}: ${g.title} [${g.scope}, ${g.source}${g.disabled ? ', disabled' : ''}]`)
          .join('\n')
      case 'read': {
        if (!id) return p.guidelines({ applicableOnly: true }).map(fmt).join('\n\n')
        const g = p.guideline(id)
        if (!g) throw new Error(`Unknown guideline: ${id}`)
        const d = g.source === 'override' ? p.defaultGuideline(id) : null
        return fmt(g) + (d ? `\n\n### Built-in default (overridden)\n${d.body}` : '')
      }
      case 'write':
        if (!id) throw new Error('write requires id')
        return `saved ${p.setGuideline(id, { title, body, scope }).id}`
      case 'reset':
        if (!id) throw new Error('reset requires id')
        p.resetGuideline(id)
        return `reset ${id}`
      case 'disable':
      case 'enable':
        if (!id) throw new Error(`${action} requires id`)
        p.setGuideline(id, { disabled: action === 'disable' })
        return `${action}d ${id}`
    }
  }),
)

server.registerTool(
  'media',
  {
    title: 'Media',
    description:
      'Import an image/video file into the project (copied to media/) or list media. After importing, embed it in a body (![alt](media/x.png)), attach it via write.media, or show it on the canvas as a media node (write type=media, src=path).',
    inputSchema: {
      action: z.enum(['import', 'list']),
      path: z.string().optional().describe('Absolute path of the file to import'),
      name: z.string().optional(),
    },
  },
  safe(({ action, path: src, name }) => {
    const p = project()
    if (action === 'list') return p.listMedia().join('\n') || 'No media.'
    if (!src) throw new Error('import requires path')
    return `imported ${p.importMedia(src, name)}`
  }),
)

server.registerTool(
  'project',
  {
    title: 'Project settings',
    description:
      'Update project settings (name, kind: novel|screenplay|rpg|mixed, description; kind selects which guidelines apply), or init a new project in the current directory.',
    inputSchema: {
      action: z.enum(['update', 'init']),
      name: z.string().optional(),
      kind: ProjectKind.optional(),
      description: z.string().optional(),
    },
  },
  safe(({ action, name, kind, description }) => {
    if (action === 'init') {
      const root = path.resolve(startDir)
      const p = Project.init(root, {
        name: name ?? path.basename(root),
        kind,
        description,
        mcp: {
          command: process.execPath,
          args: [process.argv[1]],
          env: process.env.ELECTRON_RUN_AS_NODE ? { ELECTRON_RUN_AS_NODE: '1' } : undefined,
        },
      })
      return `initialized ${p.config().name} at ${p.root}`
    }
    const c = project().updateConfig({ name, kind, description })
    return `project: ${c.name} (${c.kind})`
  }),
)

server.registerResource(
  'guideline',
  new ResourceTemplate('maquest://guidelines/{id}', {
    list: () => {
      try {
        return {
          resources: project()
            .guidelines()
            .map((g) => ({ uri: `maquest://guidelines/${g.id}`, name: g.title, mimeType: 'text/markdown' })),
        }
      } catch {
        return { resources: [] }
      }
    },
  }),
  { title: 'Writing guideline', mimeType: 'text/markdown' },
  (uri, { id }) => {
    const g = project().guideline(String(id))
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: g ? `# ${g.title}\n\n${g.body}` : 'Not found' }] }
  },
)

server.registerPrompt(
  'review',
  {
    title: 'Review against guidelines',
    description: 'Review a story/chapter/scene against the project guidelines.',
    argsSchema: { id: z.string().describe('Node id to review') },
  },
  ({ id }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Read node "${id}" and its children with the maquest tools, read all applicable guidelines, then review it: list concrete problems (structure, stakes, setup/payoff, consistency, pacing) with suggested fixes. Add backlog ideas for the fixes I approve.`,
        },
      },
    ],
  }),
)

server.registerPrompt(
  'brainstorm',
  {
    title: 'Brainstorm',
    description: 'Brainstorm ideas grounded in the current project.',
    argsSchema: { topic: z.string() },
  },
  ({ topic }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Call "overview", then brainstorm about: ${topic}. Give 3-5 distinct options consistent with established facts, recommend one, and save all options as backlog ideas.`,
        },
      },
    ],
  }),
)

await server.connect(new StdioServerTransport())
