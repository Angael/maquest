# Maquest

Desktop app for writing stories, novels, screenplays, and tabletop RPG campaigns. Users mostly work through an external agent (Claude Code, Codex, ...) that edits the project via Maquest's MCP server; the app is for viewing and light hand edits. Maquest ships no agent harness or chat UI.

Principles:

- A project is a plain folder of markdown + frontmatter files, `media/`, and `graph.json`. Files on disk are the source of truth; the app watches them, so agents, git, and other editors stay first-class.
- All domain logic lives in packages/core and is shared by the app and the MCP server. Don't duplicate it in either. `@maquest/core/schema` must stay browser-safe.
- MCP is local stdio, registered per project folder, and starts only when an agent works there.
- Keep the MCP surface small: add options to existing tools before adding new tools. Agent-facing output should be token-efficient, with summaries first and full content on request.
- Prefer established libraries over hand-rolled code.

Layout:

- packages/core: domain model, file I/O, graph, guidelines, templates
- packages/mcp: stdio MCP server
- apps/desktop: Electron app

Workflow:

- Agents own the complete delivery workflow: Git, changesets, pull requests, versioning, and releases. Do not hand routine delivery steps back to the user or ask for confirmation for them.
- Commit as you go in small logical commits. After required checks pass, automatically push completed changes to the appropriate remote branch. Create, update, and merge PRs when needed by the repository workflow; resolve routine conflicts and check failures yourself. Do not rewrite shared history or discard unrelated work.
- Before committing, run `pnpm check:fix` and fix lint errors rather than disabling rules.
- The installed desktop launcher runs this checkout, so run `pnpm build` after app changes.
- `pnpm check` and `pnpm check:fix` include Playwright tests against the built Electron app. Run the full check after changes; keep common user flows covered in `tests/e2e`. Tests use temporary projects and profiles. On Linux the runner always uses an isolated Xvfb display, which must be installed, so checks never interrupt the desktop. Use `MAQUEST_E2E_HEADED=1` only when visible debugging is explicitly requested.
- Automatically add changesets (`pnpm changeset`) for releasable changes, choosing the appropriate version bump and writing the release notes yourself. Workflow-only and documentation-only changes do not need a changeset.
- Keep development delivery separate from release publication. Changes merged to `main` accumulate in an automated Version Packages PR. Do not merge that PR merely because a commit was pushed.
- Agents also manage Version Packages PRs and releases: decide when a coherent set of changes is ready for a new version, review and merge the version PR, and verify publication and downloads. An explicit request to release should trigger this process immediately. Routine development pushes must not automatically create new versions. Do not require the user to run Git or changeset commands, manage PRs, or publish/retry releases.
