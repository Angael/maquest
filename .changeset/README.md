# Releases

Run `pnpm changeset`, select `@maquest/desktop`, choose a bump, and describe the change. Include that file with the change. Checks run on pull requests and pushes to `main`.

On `main`, the Version Packages workflow creates or updates a **Version Packages** PR. Pending changesets accumulate there; ordinary merges do not publish releases. Review and merge that PR when ready to release. It consumes the changesets, updates the desktop version and changelog, and triggers Windows x64 and Linux x64 builds. A GitHub release is published only after both builds succeed. No npm packages are published.

The Release workflow compares the desktop version with the commit's first parent and only publishes a version bump. Existing GitHub releases are skipped. To retry a failed release, manually dispatch Release and supply the original version commit SHA in `commit`; it must belong to `main`. This rebuilds the original release commit, even if development has continued.

Repository setup: in **Settings → Actions → General → Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests**. The version workflow uses the built-in GitHub token. GitHub does not trigger normal PR checks for PRs created or updated by that token; the Release workflow independently runs the full checks on the selected version commit before packaging.
