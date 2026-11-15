import fs from 'node:fs'
import path from 'node:path'
import type { LayoutMode } from './layout'
import {
  MaquestError,
  applyEdits,
  checkNewId,
  hierarchyMessage,
  nodeNotFoundMessage,
  slugify,
  type BodyEdit,
  type CreateNodeInput,
  type Project,
  type UpdateNodeInput,
} from './project'
import { isStatKey } from './sheet'
import {
  ALLOWED_PARENTS,
  EDGE_LABEL_MAX,
  type Clock,
  type EdgeHandle,
  type EdgeType,
  type GroupColor,
  type NodeType,
  type Status,
  type StoryNode,
  type Edge,
} from './schema'

/** What happened to one item of a batch. Items run in order; a failure stops the batch. */
export type Outcome<R> =
  | { index: number; status: 'applied'; result: R }
  | { index: number; status: 'failed'; error: string }
  | { index: number; status: 'not-run' }

export type BatchResult<R> = {
  outcomes: Outcome<R>[]
  /** True when validation rejected the batch before anything was written. */
  rejected: boolean
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Runs a validated batch. When `problems` has any entry nothing runs: those items fail and the rest are not run.
 * Otherwise items run in order; a runtime failure stops the batch, keeping earlier items applied.
 */
function run<O, R>(ops: readonly O[], problems: readonly (string | undefined)[], exec: (op: O, i: number) => R): BatchResult<R> {
  if (problems.some(Boolean)) {
    return {
      rejected: true,
      outcomes: ops.map((_, index) => (problems[index] ? { index, status: 'failed', error: problems[index]! } : { index, status: 'not-run' })),
    }
  }
  const outcomes: Outcome<R>[] = []
  let stopped = false
  ops.forEach((op, index) => {
    if (stopped) return outcomes.push({ index, status: 'not-run' })
    try {
      outcomes.push({ index, status: 'applied', result: exec(op, index) })
    } catch (e) {
      stopped = true
      outcomes.push({ index, status: 'failed', error: message(e) })
    }
  })
  return { rejected: false, outcomes }
}

/** Runs `fn`, turning a thrown error into a problem message. */
function check(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (e) {
    return message(e)
  }
}

// ---------- body files ----------

/** Largest bodyFile accepted (bytes). */
export const BODY_FILE_MAX = 2_000_000

/**
 * Reads a markdown body from a file on the machine running Maquest, for bodies too long to pass inline. `file` is
 * absolute or relative to the project root. The file is only read: it must be UTF-8 text without frontmatter.
 */
export function readBodyFile(root: string, file: string): string {
  const abs = path.resolve(root, file)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    throw new MaquestError(`bodyFile not found: ${abs}${path.isAbsolute(file) ? '' : ` (relative paths resolve against the project root ${root})`}`)
  }
  if (!stat.isFile()) throw new MaquestError(`bodyFile is not a regular file: ${abs}`)
  if (stat.size > BODY_FILE_MAX) throw new MaquestError(`bodyFile is too large (${stat.size} bytes; max ${BODY_FILE_MAX}): ${abs}`)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(abs))
  } catch {
    throw new MaquestError(`bodyFile is not UTF-8 text: ${abs}`)
  }
  if (text.includes('\0')) throw new MaquestError(`bodyFile is not a text file: ${abs}`)
  text = text.replace(/^﻿/, '')
  if (/^---\r?\n/.test(text)) {
    throw new MaquestError(
      `bodyFile starts with a frontmatter block: ${abs}. Pass only the markdown body; set title, fields and other metadata in the write item.`,
    )
  }
  return text
}

// ---------- node writes ----------

export type WriteOp = {
  /** Existing node to update; with `create`, the id of the new node. */
  id?: string
  /** Create a new node (with `id` as its id when given). Without it, `id` always means an existing node. */
  create?: boolean
  newId?: string
  type?: NodeType
  title?: string
  parent?: string | null
  order?: number
  status?: Status | null
  summary?: string
  tags?: string[]
  pinned?: boolean
  fields?: Record<string, string | null>
  body?: string
  /** Path of a file whose content replaces the body (see readBodyFile). */
  bodyFile?: string
  appendBody?: string
  edits?: BodyEdit[]
  media?: string[]
  src?: string
  /** When creating: board to place the node on (default: the first board). */
  board?: string
  /** Also place the node on these boards. */
  boards?: string[]
  clock?: Clock | null
  /** Statblock system for this node (default: its type's); null falls back to the type's. */
  system?: string | null
  /** Statblock values, merged into the existing ones (null removes a key). */
  stats?: Record<string, unknown>
  /** Rules Maquest should not report for this node; null clears. */
  checks?: { off: string[] } | null
}

export type WriteResult = {
  action: 'created' | 'updated'
  node: StoryNode
  renamedFrom?: string
  /** Boards the node was placed on by this item. */
  boards: string[]
  /** The item wrote body text. */
  wroteBody: boolean
}

type Planned = { type: NodeType; title: string; parent?: string; body: string }

/**
 * Creates and updates nodes as one batch. Every item is first checked against the project as the earlier items
 * will have left it (so an item may use a parent, id or rename planned before it); if any check fails, nothing is
 * written. Items then run in order. A failure at that stage (e.g. the files changed meanwhile) stops the batch and
 * keeps the earlier items: each outcome says whether its item was applied, failed or not run.
 */
export function writeNodes(p: Project, ops: readonly WriteOp[]): BatchResult<WriteResult> {
  const types = new Set(p.types().map((t) => t.id))
  const systems = p.systems()
  const boards = p.boards()
  const guidelineIds = p.guidelines({ includeDisabled: true }).map((g) => g.id)
  const nodes = new Map<string, Planned>(p.listNodes().map((n) => [n.id, { type: n.type, title: n.title, parent: n.parent, body: n.body }]))
  /** Ids that failed items would have created or renamed to, to explain follow-on errors. */
  const lost = new Map<string, number>()
  const bodies: (string | undefined)[] = []

  const missing = (id: string) => {
    if (lost.has(id)) return `Node not found: ${id} (item ${lost.get(id)! + 1} would create it, but it has a problem)`
    return nodeNotFoundMessage(
      id,
      [...nodes].map(([k, v]) => ({ id: k, title: v.title })),
      guidelineIds,
    )
  }
  const parentOk = (id: string, type: NodeType, parent?: string) => {
    if (!parent) return
    if (parent === id) throw new MaquestError('A node cannot be its own parent')
    const par = nodes.get(parent)
    if (!par) throw new MaquestError(missing(parent))
    if (!ALLOWED_PARENTS[type]?.includes(par.type)) throw new MaquestError(hierarchyMessage(id, type, parent, par.type))
  }
  const boardOk = (id: string) => {
    if (!boards.some((b) => b.id === id)) throw new MaquestError(`Board not found: ${id}. Boards: ${boards.map((b) => b.id).join(', ')}`)
  }
  const typeOk = (type: NodeType) => {
    if (!types.has(type)) throw new MaquestError(`Unknown node type: ${type}. Types: ${[...types].join(', ')}`)
  }

  const problems = ops.map((op, i) =>
    check(() => {
      if (op.body !== undefined && op.bodyFile !== undefined) throw new MaquestError('Pass body or bodyFile, not both')
      if (op.system && !systems.has(op.system)) throw new MaquestError(`Unknown statblock system: ${op.system}. Systems: ${[...systems.keys()].join(', ')}`)
      for (const key of Object.keys(op.stats ?? {}))
        if (!isStatKey(key)) throw new MaquestError(`Invalid stat key "${key}": use letters, digits, dashes or underscores`)
      const fileBody = op.bodyFile === undefined ? undefined : readBodyFile(p.root, op.bodyFile)
      bodies[i] = fileBody
      const creating = op.create || op.id === undefined
      if (creating) {
        const planned = op.id === undefined ? undefined : slugify(op.id)
        try {
          if (op.newId !== undefined) throw new MaquestError('newId renames an existing node. To choose the id of a new node, pass id with create: true')
          if (op.edits?.length) throw new MaquestError('edits only apply to an existing node (pass its id without create)')
          if (!op.type || !op.title) throw new MaquestError('Creating a node requires type and title')
          typeOk(op.type)
          let id: string
          if (op.id !== undefined) {
            id = checkNewId(op.id)
            const taken = nodes.get(id)
            if (taken)
              throw new MaquestError(`Node already exists: ${id} (${taken.type} "${taken.title}"). To update it, drop create: true; or choose another id.`)
          } else {
            const base = slugify(op.title)
            id = base
            for (let n = 2; nodes.has(id); n++) id = `${base}-${n}`
          }
          parentOk(id, op.type, op.parent ?? undefined)
          if (op.board !== undefined) boardOk(op.board)
          else if (!boards.length) throw new MaquestError('The project has no board to place the node on')
          for (const b of op.boards ?? []) boardOk(b)
          const body = op.body ?? fileBody
          nodes.set(id, {
            type: op.type,
            title: op.title,
            parent: op.parent ?? undefined,
            body: op.appendBody ? `${body ?? ''}${op.appendBody}` : (body ?? ''),
          })
        } catch (e) {
          if (planned) lost.set(planned, i)
          throw e
        }
        return
      }
      const id = op.id!
      const cur = nodes.get(id)
      // A later item may refer to the new id of a rename that fails here.
      if (op.newId !== undefined) lost.set(slugify(op.newId), i)
      if (!cur) {
        throw new MaquestError(`${missing(id)}${op.type && op.title ? ' To create a new node with this id, add create: true.' : ''}`)
      }
      const type = op.type ?? cur.type
      typeOk(type)
      const parent = op.parent === null ? undefined : (op.parent ?? cur.parent)
      parentOk(id, type, parent)
      for (const b of op.boards ?? []) boardOk(b)
      let body = op.body ?? fileBody ?? cur.body
      if (op.edits?.length) body = applyEdits(body, op.edits, id)
      if (op.appendBody) body = `${body.trimEnd()}\n\n${op.appendBody}\n`
      const next = { ...cur, type, parent, body, title: op.title ?? cur.title }
      if (type !== cur.type) {
        for (const child of nodes.values()) if (child.parent === id && !ALLOWED_PARENTS[child.type]?.includes(type)) child.parent = undefined
      }
      if (op.newId !== undefined && slugify(op.newId) !== id) {
        const to = slugify(op.newId)
        if (nodes.has(to)) throw new MaquestError(`Node already exists: ${to}`)
        nodes.delete(id)
        nodes.set(to, next)
        for (const child of nodes.values()) if (child.parent === id) child.parent = to
      } else nodes.set(id, next)
      if (op.newId !== undefined) lost.delete(slugify(op.newId))
    }),
  )

  return run(ops, problems, (op, i) => {
    const wroteBody = op.body !== undefined || op.bodyFile !== undefined || op.appendBody !== undefined || !!op.edits?.length
    const body = op.body ?? bodies[i]
    const done: string[] = []
    try {
      if (op.create || op.id === undefined) {
        const { create: _c, newId: _n, board, boards: extra, bodyFile: _f, edits: _e, appendBody, ...input } = op
        const node = p.createNode({
          ...input,
          id: op.id,
          type: op.type!,
          title: op.title!,
          parent: op.parent ?? undefined,
          status: op.status ?? undefined,
          clock: op.clock ?? undefined,
          system: op.system ?? undefined,
          stats: op.stats && Object.fromEntries(Object.entries(op.stats).filter((e) => e[1] !== null)),
          checks: op.checks ?? undefined,
          fields: op.fields && Object.fromEntries(Object.entries(op.fields).filter((e): e is [string, string] => e[1] !== null)),
          body: appendBody ? `${body ?? ''}${appendBody}` : body,
        } satisfies CreateNodeInput)
        done.push(`created ${node.id}`)
        const placed = [p.board(board).id, ...(extra ?? [])].filter((b, k, all) => all.indexOf(b) === k)
        for (const b of placed) {
          p.updateBoard(b, { addNodes: [node.id] })
          done.push(`placed on ${b}`)
        }
        return { action: 'created', node: p.requireNode(node.id), boards: placed, wroteBody }
      }
      const { id, create: _c, newId, board: _b, boards: extra, bodyFile: _f, ...patch } = op
      let node = p.updateNode(id!, { ...patch, body } satisfies UpdateNodeInput)
      done.push(`updated ${id}`)
      if (newId) {
        node = p.renameNode(node.id, newId)
        done.push(`renamed to ${node.id}`)
      }
      for (const b of extra ?? []) {
        p.updateBoard(p.board(b).id, { addNodes: [node.id] })
        done.push(`placed on ${b}`)
      }
      return { action: 'updated', node, renamedFrom: node.id !== id ? id : undefined, boards: extra ?? [], wroteBody }
    } catch (e) {
      throw new MaquestError(done.length ? `${message(e)} (this item was partly applied: ${done.join(', ')})` : message(e))
    }
  })
}

// ---------- connections ----------

function checkLabel(l?: string) {
  if (l && l.length > EDGE_LABEL_MAX) throw new MaquestError(`Edge label too long (${l.length} > ${EDGE_LABEL_MAX}): ${JSON.stringify(l)}`)
}

export type EdgeOp = {
  action: 'add' | 'update' | 'remove'
  /** Edge id (update/remove). */
  id?: string
  source?: string
  target?: string
  type?: EdgeType
  label?: string
  sourceHandle?: EdgeHandle
  targetHandle?: EdgeHandle
}

export type EdgeResult = { action: 'added' | 'updated' | 'removed'; edge: Edge }

/** Adds, updates and removes connections as one batch, validated up front like writeNodes. */
export function connectNodes(p: Project, ops: readonly EdgeOp[]): BatchResult<EdgeResult> {
  const nodes = p.listNodes()
  const ids = new Set(nodes.map((n) => n.id))
  const guidelineIds = p.guidelines({ includeDisabled: true }).map((g) => g.id)
  const edges = new Map(p.graph().edges.map((e) => [e.id, e]))
  const node = (id: string) => {
    if (!ids.has(id)) throw new MaquestError(nodeNotFoundMessage(id, nodes, guidelineIds))
  }
  const problems = ops.map((o) =>
    check(() => {
      checkLabel(o.label)
      if (o.action === 'add') {
        if (!o.source || !o.target) throw new MaquestError('add requires source and target')
        node(o.source)
        node(o.target)
        return
      }
      if (!o.id) throw new MaquestError(`${o.action} requires edge id (see "read" output)`)
      if (!edges.has(o.id)) throw new MaquestError(`Edge not found: ${o.id} (edge ids are listed under Connections in "read" output)`)
      if (o.action === 'remove') edges.delete(o.id)
      else {
        if (o.source) node(o.source)
        if (o.target) node(o.target)
      }
    }),
  )
  return run(ops, problems, (o) => {
    if (o.action === 'add') {
      const edge = p.addEdge({ source: o.source!, target: o.target!, type: o.type, label: o.label, sourceHandle: o.sourceHandle, targetHandle: o.targetHandle })
      return { action: 'added', edge }
    }
    if (o.action === 'remove') {
      const edge = p.graph().edges.find((e) => e.id === o.id)
      p.removeEdge(o.id!)
      return { action: 'removed', edge: edge! }
    }
    return { action: 'updated', edge: p.updateEdge(o.id!, o) }
  })
}

// ---------- group trees ----------

export type GroupSpec = {
  title: string
  /** Cards to put in this group (placed on the board first if needed). */
  nodes?: string[]
  /**
   * Title of another group in the same tree, or an existing group's id or title. null = top level. Omitted: new
   * groups go to the top level, existing ones keep their parent.
   */
  parent?: string | null
  color?: GroupColor
}

export type GroupResult = { action: 'created' | 'updated'; id: string; title: string; parent?: string; nodes: number }

/**
 * Builds or extends nested groups on a board in one go. A spec whose title matches an existing group on the board
 * updates that group (adding the listed cards); other specs create groups. Parents are created before their
 * children whatever the order given. The tree is validated before anything changes. Unless `layout` is false,
 * the board is then auto-arranged.
 */
export async function applyGroupTree(
  p: Project,
  boardId: string | undefined,
  specs: readonly GroupSpec[],
  layout: LayoutMode | false = 'smart',
): Promise<BatchResult<GroupResult> & { arranged: boolean }> {
  const board = p.board(boardId)
  const nodes = p.listNodes()
  const ids = new Set(nodes.map((n) => n.id))
  const guidelineIds = p.guidelines({ includeDisabled: true }).map((g) => g.id)
  const byTitle = new Map(specs.map((s, i) => [s.title, i]))
  const existing = (ref: string) => board.groups.filter((g) => g.id === ref || g.title === ref)
  const owner = new Map<string, number>()

  const problems = specs.map((s, i) =>
    check(() => {
      if (!s.title.trim()) throw new MaquestError('A group needs a title')
      if (byTitle.get(s.title) !== i) throw new MaquestError(`Group title "${s.title}" is listed twice`)
      if (existing(s.title).length > 1) throw new MaquestError(`Board ${board.id} has several groups titled "${s.title}"; rename one first`)
      for (const n of s.nodes ?? []) {
        if (!ids.has(n)) throw new MaquestError(nodeNotFoundMessage(n, nodes, guidelineIds))
        if (owner.has(n)) throw new MaquestError(`${n} is also listed in group "${specs[owner.get(n)!].title}"`)
        owner.set(n, i)
      }
      if (s.parent) {
        if (s.parent === s.title) throw new MaquestError('A group cannot be its own parent')
        if (!byTitle.has(s.parent) && !existing(s.parent).length) {
          throw new MaquestError(`Parent group not found: ${s.parent} (not in this tree, nor a group on ${board.id})`)
        }
        // Follow parents within the tree to catch cycles.
        const seen = new Set([s.title])
        for (let at: string | undefined = s.parent; at !== undefined && byTitle.has(at); at = specs[byTitle.get(at)!].parent ?? undefined) {
          if (seen.has(at)) throw new MaquestError(`Group "${s.title}" is nested inside itself`)
          seen.add(at)
        }
      }
    }),
  )

  // Parents first: a stable depth sort within the tree.
  const depth = (s: GroupSpec, seen = 0): number =>
    s.parent && byTitle.has(s.parent) && seen < specs.length ? 1 + depth(specs[byTitle.get(s.parent)!], seen + 1) : 0
  const order = specs.map((s, i) => ({ s, i, d: problems.some(Boolean) ? 0 : depth(s) })).toSorted((a, b) => a.d - b.d || a.i - b.i)
  const made = new Map<string, string>()
  const resolve = (ref: string) => made.get(ref) ?? existing(ref)[0]?.id ?? ref

  const sorted = run(
    order.map((x) => x.s),
    order.map((x) => problems[x.i]),
    (s) => {
      const parent = s.parent === undefined ? undefined : s.parent === null ? null : resolve(s.parent)
      const current = p.board(board.id).groups.find((g) => g.title === s.title)
      const group = current
        ? p.updateGroup(board.id, current.id, { color: s.color, parent, addNodes: s.nodes })
        : p.createGroup(board.id, { title: s.title, color: s.color, parent: parent ?? undefined, nodes: s.nodes })
      made.set(s.title, group.id)
      return {
        action: current ? 'updated' : 'created',
        id: group.id,
        title: group.title,
        parent: group.parent,
        nodes: group.nodes.length,
      } satisfies GroupResult
    },
  )
  // Report in the order given.
  const outcomes = order.map((x, k) => ({ ...sorted.outcomes[k], index: x.i })).toSorted((a, b) => a.index - b.index)
  const ok = !sorted.rejected && outcomes.every((o) => o.status === 'applied')
  if (ok && layout !== false) await p.arrangeBoard(board.id, layout)
  return { rejected: sorted.rejected, outcomes, arranged: ok && layout !== false }
}
