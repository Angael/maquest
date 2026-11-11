import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'

export type PullResult =
  /** Pulled new commits from the upstream branch. */
  | { status: 'updated'; branch: string; upstream: string; commits: number }
  /** Nothing to report: not a repo, no upstream, already up to date, git missing, ... */
  | { status: 'skipped'; reason: string }
  /** An update exists but was not applied, so the user should know. */
  | { status: 'blocked'; reason: string }
  /** Something went wrong talking to git or the remote. */
  | { status: 'failed'; reason: string }

export type PushResult =
  /** Sent local commits to the upstream branch. */
  | { status: 'pushed'; upstream: string; commits: number }
  /** The push was attempted (it looked safe) but git or the remote refused it. */
  | { status: 'failed'; reason: string }

/** The pull outcome, plus the push outcome when local commits were safe to publish afterwards. */
export type SyncResult = PullResult & { push?: PushResult }

class GitError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly missing = false,
  ) {
    super(message)
  }
}

function git(cwd: string, args: string[], timeout = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout,
        maxBuffer: 16 * 1024 * 1024,
        // Never block on credential prompts, editors or SSH host-key questions: fail fast instead.
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: '',
          SSH_ASKPASS: '',
          GCM_INTERACTIVE: 'never',
          GIT_EDITOR: 'true',
          GIT_MERGE_AUTOEDIT: 'no',
          GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes -o ConnectTimeout=10',
          LC_ALL: 'C',
        },
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        if (!err) return resolve(stdout.trim())
        const e = err as NodeJS.ErrnoException & { killed?: boolean }
        if (e.code === 'ENOENT') return reject(new GitError('git is not installed', '', true))
        if (e.killed) return reject(new GitError(`git ${args[0]} timed out`, String(stderr)))
        reject(new GitError(String(stderr).trim().split('\n').at(-1) || e.message, String(stderr)))
      },
    )
  })
}

const tryGit = (cwd: string, args: string[]) => git(cwd, args).catch(() => null)

/** Turns raw fetch stderr into something a writer understands. */
function fetchReason(err: unknown) {
  const msg = err instanceof GitError ? `${err.message}\n${err.stderr}` : String(err)
  if (/timed out|Could not resolve host|unable to access|Connection (refused|timed out)|Network is unreachable|Temporary failure/i.test(msg))
    return 'Could not reach the remote (offline?)'
  if (/Authentication failed|Permission denied|could not read Username|terminal prompts disabled|Host key verification/i.test(msg))
    return 'The remote needs credentials Maquest cannot provide'
  if (/does not appear to be a git repository|not found|couldn't find remote ref/i.test(msg)) return 'The remote repository or branch no longer exists'
  return err instanceof GitError ? err.message : 'Fetching from the remote failed'
}

/** Whether `root` is inside a git work tree (false when git is missing). */
export async function isGitRepo(root: string): Promise<boolean> {
  if (!fs.existsSync(root)) return false
  return (await tryGit(root, ['rev-parse', '--is-inside-work-tree'])) === 'true'
}

const inProgress = new Map<string, Promise<SyncResult>>()

/**
 * Brings the git repo containing `root` up to date with its upstream branch, but only when that is safe:
 * a fast-forward, or a merge that `git merge-tree` proves conflict-free. Uncommitted changes inside the project
 * folder are committed first so they get pushed; edits elsewhere in the repo are kept as they are.
 */
export function syncFromRemote(root: string): Promise<SyncResult> {
  const key = path.resolve(root)
  let run = inProgress.get(key)
  if (!run) {
    run = doSync(key)
      .catch((err: unknown): SyncResult => {
        if (err instanceof GitError && err.missing) return { status: 'skipped', reason: 'git is not installed' }
        return { status: 'failed', reason: err instanceof Error ? err.message : String(err) }
      })
      .finally(() => inProgress.delete(key))
    inProgress.set(key, run)
  }
  return run
}

async function doSync(root: string): Promise<SyncResult> {
  const pull = await doPull(root)
  if (!('ctx' in pull)) return pull
  const { ctx, ...result } = pull
  const push = await doPush(ctx)
  return push ? { ...result, push } : result
}

interface PushContext {
  top: string
  remote: string
  upstream: string
  /** Full ref of the upstream branch on the remote, e.g. refs/heads/main. */
  mergeRef: string
}

/**
 * Pushes local commits when that is a plain fast-forward of the upstream branch: the pull just left us
 * strictly ahead (never behind), so the remote accepts it without force. Anything else is left alone.
 */
async function doPush({ top, remote, upstream, mergeRef }: PushContext): Promise<PushResult | undefined> {
  const counts = await tryGit(top, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`])
  if (!counts) return undefined
  const [ahead, behind] = counts.split(/\s+/).map(Number)
  if (!ahead || behind) return undefined
  try {
    await git(top, ['push', '--quiet', '--no-recurse-submodules', remote, `HEAD:${mergeRef}`], 60_000)
  } catch (err) {
    const stderr = err instanceof GitError ? err.stderr : ''
    if (/rejected|non-fast-forward|fetch first/i.test(stderr)) return { status: 'failed', reason: 'The remote got new commits meanwhile; try again later' }
    if (/protected branch|pre-receive hook declined|GH006/i.test(stderr))
      return { status: 'failed', reason: 'The remote does not allow pushing to this branch' }
    return { status: 'failed', reason: fetchReason(err) }
  }
  return { status: 'pushed', upstream, commits: ahead }
}

/** A commit identity even for users who never configured one, rather than failing. */
async function identity(top: string) {
  return (await tryGit(top, ['config', 'user.email'])) ? [] : ['-c', 'user.name=Maquest', '-c', 'user.email=maquest@localhost']
}

/**
 * Commits every uncommitted change inside the project folder (new, edited and deleted files, honouring
 * .gitignore) so edits made in the app or by agents, like live notes, reach the remote. Changes elsewhere
 * in the repo, and anything the user staged outside the project folder, are left untouched.
 */
async function commitProjectChanges(root: string, top: string) {
  await git(root, ['add', '-A', '--', '.'])
  // Nothing staged under the project folder: diff exits 0.
  const dirty = await git(root, ['diff', '--cached', '--quiet', '--', '.']).then(
    () => false,
    () => true,
  )
  if (!dirty) return
  await git(top, [
    ...(await identity(top)),
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '--no-verify',
    '-m',
    'Save project changes',
    '--',
    path.relative(top, root) || '.',
  ])
}

async function doPull(root: string): Promise<PullResult | (PullResult & { ctx: PushContext })> {
  if (!fs.existsSync(root)) return { status: 'skipped', reason: 'Project folder is missing' }
  const top = await git(root, ['rev-parse', '--show-toplevel']).catch((err: unknown) => {
    if (err instanceof GitError && err.missing) throw err
    return null
  })
  if (!top) return { status: 'skipped', reason: 'Not a git repository' }

  if ((await tryGit(top, ['rev-parse', '--is-bare-repository'])) === 'true') return { status: 'skipped', reason: 'Bare repository' }
  const branch = await tryGit(top, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  if (!branch) return { status: 'skipped', reason: 'Detached HEAD' }
  if (!(await tryGit(top, ['rev-parse', '--verify', '--quiet', 'HEAD']))) return { status: 'skipped', reason: 'No commits yet' }
  const upstream = await tryGit(top, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
  if (!upstream) return { status: 'skipped', reason: 'Branch has no upstream' }

  // A merge, rebase, cherry-pick, etc. the user (or an agent) left half-done: never pile onto it.
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG']) {
    const p = await tryGit(top, ['rev-parse', '--git-path', marker])
    if (p && fs.existsSync(path.resolve(top, p))) return { status: 'blocked', reason: 'A git operation is in progress in this repository' }
  }
  if (await tryGit(top, ['ls-files', '--unmerged']).then((out) => out !== null && out !== ''))
    return { status: 'blocked', reason: 'The repository has unresolved conflicts' }

  try {
    await commitProjectChanges(root, top)
  } catch (err) {
    return { status: 'failed', reason: `Saving local changes failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  const remote = await tryGit(top, ['config', `branch.${branch}.remote`])
  try {
    // A local upstream (remote ".") needs no fetch.
    if (remote && remote !== '.') await git(top, ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', remote], 30_000)
  } catch (err) {
    return { status: 'failed', reason: fetchReason(err) }
  }

  const counts = await git(top, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`])
  const [ahead, behind] = counts.split(/\s+/).map(Number)
  const mergeRef = await tryGit(top, ['config', `branch.${branch}.merge`])
  // Pushing only makes sense to a real remote branch we just fetched.
  const ctx = remote && remote !== '.' && mergeRef?.startsWith('refs/heads/') ? { top, remote, upstream, mergeRef } : undefined
  const withCtx = (r: PullResult) => (ctx ? { ...r, ctx } : r)
  if (!behind) return withCtx({ status: 'skipped', reason: 'Already up to date' })

  if (ahead) {
    // Diverged: only merge when git can prove the result has no conflicts (merge-tree exits 1 on conflict).
    const clean = await git(top, ['merge-tree', '--write-tree', '--quiet', 'HEAD', upstream]).then(
      () => true,
      () => false,
    )
    if (!clean) return { status: 'blocked', reason: `Remote changes conflict with your local commits on ${branch}` }
  }

  try {
    if (ahead) {
      // A merge commit needs an identity; fall back to a neutral one rather than failing for users who never set it.
      await git(top, [...(await identity(top)), 'merge', '--no-edit', '--no-verify', '--no-autostash', upstream], 60_000)
    } else await git(top, ['merge', '--ff-only', '--no-autostash', upstream], 60_000)
  } catch (err) {
    // Leave the repo as we found it if git got as far as starting a merge.
    const mergeHead = await tryGit(top, ['rev-parse', '--git-path', 'MERGE_HEAD'])
    if (mergeHead && fs.existsSync(path.resolve(top, mergeHead))) await tryGit(top, ['merge', '--abort'])
    const stderr = err instanceof GitError ? err.stderr : ''
    if (/would be overwritten|untracked working tree files/i.test(stderr))
      return { status: 'blocked', reason: 'Uncommitted local changes touch the same files as the remote update' }
    return { status: 'failed', reason: err instanceof Error ? err.message : 'Updating failed' }
  }
  return withCtx({ status: 'updated', branch, upstream, commits: behind })
}
