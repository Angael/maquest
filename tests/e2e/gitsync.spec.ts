import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { Project } from '../../packages/core/src/index'
import { test, expect } from './fixtures'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' })

test.describe('git sync on open', () => {
  test.use({
    prepare: {
      run: (project) => {
        // Publish the project to a bare "web" remote, then push a new note from a second clone.
        const remote = `${project.root}.git`
        const other = `${project.root}-other`
        git(project.root, 'init', '-q', '-b', 'main')
        git(project.root, 'add', '-A')
        git(project.root, 'commit', '-qm', 'init')
        git(path.dirname(remote), 'clone', '-q', '--bare', project.root, remote)
        git(project.root, 'remote', 'add', 'origin', remote)
        git(project.root, 'fetch', '-q', 'origin')
        git(project.root, 'branch', '-q', '--set-upstream-to=origin/main')
        git(path.dirname(remote), 'clone', '-q', remote, other)
        const remoteProject = new Project(other)
        const hall = remoteProject.listNodes().find((n) => n.title === 'Hall')!
        remoteProject.updateNode(hall.id, { title: 'Attic' })
        git(other, 'add', '-A')
        git(other, 'commit', '-qm', 'rename')
        git(other, 'push', '-q')
      },
    },
  })

  test('pulls remote changes and shows a toast', async ({ desktop: { page } }) => {
    await expect(page.getByRole('status')).toContainText('Project updated to the latest version')
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Attic' })).toBeVisible()
  })
})
