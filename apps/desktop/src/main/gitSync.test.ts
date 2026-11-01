import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { syncFromRemote } from './gitSync'

const run = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' })
    .toString()
    .trim()

function commit(dir: string, file: string, text: string) {
  fs.writeFileSync(path.join(dir, file), text)
  run(dir, 'add', '-A')
  run(dir, 'commit', '-qm', `edit ${file}`)
}

/** A bare "web" remote with two clones: `local` (the project) and `other` (someone pushing changes). */
function repos(t: { after: (fn: () => void) => void }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-sync-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const remote = path.join(tmp, 'remote.git')
  run(tmp, 'init', '-q', '--bare', '-b', 'main', remote)
  const local = path.join(tmp, 'local')
  run(tmp, 'clone', '-q', remote, local)
  run(local, 'checkout', '-qb', 'main')
  commit(local, 'a.md', 'one\n')
  commit(local, 'b.md', 'one\n')
  run(local, 'push', '-qu', 'origin', 'main')
  const other = path.join(tmp, 'other')
  run(tmp, 'clone', '-q', remote, other)
  return { tmp, remote, local, other }
}

test('fast-forwards when only the remote moved', async (t) => {
  const { local, other } = repos(t)
  commit(other, 'a.md', 'two\n')
  commit(other, 'c.md', 'new\n')
  run(other, 'push', '-q')
  assert.deepEqual(await syncFromRemote(local), { status: 'updated', branch: 'main', upstream: 'origin/main', commits: 2 })
  assert.equal(fs.readFileSync(path.join(local, 'a.md'), 'utf8'), 'two\n')
  assert.deepEqual(await syncFromRemote(local), { status: 'skipped', reason: 'Already up to date' })
})

test('works from a project folder nested inside the repo and keeps unrelated local edits', async (t) => {
  const { local, other } = repos(t)
  fs.mkdirSync(path.join(local, 'project'))
  fs.writeFileSync(path.join(local, 'b.md'), 'dirty\n')
  commit(other, 'a.md', 'two\n')
  run(other, 'push', '-q')
  assert.equal((await syncFromRemote(path.join(local, 'project'))).status, 'updated')
  assert.equal(fs.readFileSync(path.join(local, 'b.md'), 'utf8'), 'dirty\n')
})

test('merges diverged history when it is conflict-free', async (t) => {
  const { local, other } = repos(t)
  commit(other, 'a.md', 'remote\n')
  run(other, 'push', '-q')
  commit(local, 'b.md', 'local\n')
  assert.equal((await syncFromRemote(local)).status, 'updated')
  assert.equal(fs.readFileSync(path.join(local, 'a.md'), 'utf8'), 'remote\n')
  assert.equal(fs.readFileSync(path.join(local, 'b.md'), 'utf8'), 'local\n')
})

test('leaves conflicting diverged history alone', async (t) => {
  const { local, other } = repos(t)
  commit(other, 'a.md', 'remote\n')
  run(other, 'push', '-q')
  commit(local, 'a.md', 'local\n')
  const head = run(local, 'rev-parse', 'HEAD')
  assert.equal((await syncFromRemote(local)).status, 'blocked')
  assert.equal(run(local, 'rev-parse', 'HEAD'), head)
  assert.equal(run(local, 'status', '--porcelain'), '')
})

test('refuses when uncommitted edits touch incoming files', async (t) => {
  const { local, other } = repos(t)
  commit(other, 'a.md', 'remote\n')
  run(other, 'push', '-q')
  fs.writeFileSync(path.join(local, 'a.md'), 'mine\n')
  const result = await syncFromRemote(local)
  assert.equal(result.status, 'blocked')
  assert.equal(fs.readFileSync(path.join(local, 'a.md'), 'utf8'), 'mine\n')
})

test('skips folders that are not repos or have no upstream, and reports unreachable remotes', async (t) => {
  const { tmp, local, remote } = repos(t)
  const plain = path.join(tmp, 'plain')
  fs.mkdirSync(plain)
  assert.equal((await syncFromRemote(plain)).status, 'skipped')
  run(local, 'checkout', '-qb', 'solo')
  assert.deepEqual(await syncFromRemote(local), { status: 'skipped', reason: 'Branch has no upstream' })
  run(local, 'checkout', '-q', 'main')
  fs.renameSync(remote, `${remote}.gone`)
  assert.equal((await syncFromRemote(local)).status, 'failed')
})
