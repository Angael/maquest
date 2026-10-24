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

- Commit as you go in small logical commits. Don't push or rewrite history unless asked.
- Before committing, run `pnpm check:fix` and fix lint errors rather than disabling rules.
- The installed desktop launcher runs this checkout, so run `pnpm build` after app changes.
- `pnpm check` and `pnpm check:fix` include Playwright tests against the built Electron app. Run the full check after changes; keep common user flows covered in `tests/e2e`. Tests use temporary projects and profiles. On Linux the runner always uses an isolated Xvfb display, which must be installed, so checks never interrupt the desktop. Use `MAQUEST_E2E_HEADED=1` only when visible debugging is explicitly requested.
- Add changesets (`pnpm changeset`) for releasable changes. Merging changes to `main` updates an automated Version Packages PR; it does not publish a release. Merge that PR when ready to release: its version bump triggers packaging and publication. Do not push or publish manually unless asked.
