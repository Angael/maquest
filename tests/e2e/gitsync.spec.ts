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
    await expect(page.locator('[data-sonner-toast]')).toContainText('Project updated to the latest version')
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Attic' })).toBeVisible()
  })
})

test.describe('git push on open', () => {
  test.use({
    prepare: {
      run: (project) => {
        // Publish the project, then make a local commit the remote does not have yet.
        const remote = `${project.root}.git`
        git(project.root, 'init', '-q', '-b', 'main')
        git(project.root, 'add', '-A')
        git(project.root, 'commit', '-qm', 'init')
        git(path.dirname(remote), 'clone', '-q', '--bare', project.root, remote)
        git(project.root, 'remote', 'add', 'origin', remote)
        git(project.root, 'fetch', '-q', 'origin')
        git(project.root, 'branch', '-q', '--set-upstream-to=origin/main')
        const cellar = project.listNodes().find((n) => n.title === 'Cellar')!
        project.updateNode(cellar.id, { title: 'Vault' })
        git(project.root, 'add', '-A')
        git(project.root, 'commit', '-qm', 'rename')
      },
    },
  })

  test('pushes local commits and shows a toast', async ({ desktop: { page, project } }) => {
    await expect(page.locator('[data-sonner-toast]')).toContainText('Local changes pushed to remote')
    const remoteHead = execFileSync('git', ['rev-parse', 'main'], { cwd: `${project.root}.git` })
      .toString()
      .trim()
    const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project.root }).toString().trim()
    expect(remoteHead).toBe(localHead)
  })

  test('the title bar sync button confirms when already in sync', async ({ desktop: { page } }) => {
    await expect(page.locator('[data-sonner-toast]')).toContainText('Local changes pushed to remote')
    await page.getByRole('button', { name: 'Sync with git remote' }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Project is in sync with remote' })).toBeVisible()
  })
})

test('no sync button outside a git repo', async ({ desktop: { page } }) => {
  await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sync with git remote' })).toHaveCount(0)
})
