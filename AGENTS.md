# AGENTS.md — Maquest

Maquest is a desktop app for writing stories, novels, screenplays, and tabletop RPG (e.g. D&D) campaigns.
The user mostly talks to an **external AI agent** (Claude Code, Codex, etc.) that edits the story through Maquest's MCP server. The user edits only parts of it by hand in the app.

## Product scope

- **Markdown notes** connected in a **node graph** (a canvas where story lines can be linked).
- Hierarchy: **Story → Chapters → Scenes**. Notes can belong to any level or float free.
- **Entities** (first-class, with templates): **Characters, Locations, Factions, Items**.
- **Node graph** with two kinds of edges:
  - **Free links** between any two nodes (like an Obsidian graph).
  - **Typed edges** (e.g. `leads-to`, `branches-to`, `foreshadows`, `involves`, `located-at`, `member-of`, `owns`).
  - Every edge can have a **name/label**.
  - To avoid visual soup, each edge type has its own color and line style (solid, dashed, animated). You can filter edges by type and hide or show them.
- **Backlog / Inbox**: a place to dump raw ideas, TODOs, and first thoughts. Low friction, no structure needed. Items can later be promoted to notes, scenes, or chapters.
- **Media**: images and videos on the canvas, embedded in markdown notes, and attached to scenes and chapters.
- **Built-in writing guidelines**: a default set ships with the app. Each project can override it, and that is the only override layer (no global user layer). Everything can be discovered, read, and edited through MCP: agents find the guidelines and change the per-project overrides with MCP tools.
- **MCP is a core feature**: compact, but covers the whole domain. It should be local and only run when an agent is working in a Maquest project directory. Maquest does **not** ship its own agent harness or chat UI.

## Stack

- **Electron** desktop shell.
- **Package manager / runtime**: **pnpm + Node** only (no Bun). Build with **electron-vite**. pnpm workspaces monorepo.
- **Vite + React + TypeScript** SPA (latest versions) for the renderer.
- **Tailwind CSS** (latest).
- Prefer popular, well-maintained libraries over hand-rolled code. Only write it ourselves when a library gets in the way. Candidates:
  - State: **zustand**. Async/data: **TanStack Query**. Routing: **TanStack Router**.
  - Node canvas: **React Flow (@xyflow/react)**.
  - Markdown editing: an established editor (e.g. Milkdown / TipTap / CodeMirror 6).
  - Schemas/validation: **zod** (shared by app and MCP).
  - MCP: official **@modelcontextprotocol/sdk**.
  - UI primitives: shadcn/ui (Radix).

## Architecture principles

- **The files on disk are the source of truth.** A project is a plain folder of markdown files with frontmatter, plus `media/` and a small graph/metadata file. That way agents, git, and other editors can all work with it. The app and the MCP server read and write the same files, and the app watches for changes.
- **One shared core package** holds the domain model, file I/O, and validation. The Electron app and the MCP server both use it. No duplicated logic.
- **MCP is local, over stdio.** It is registered per project (e.g. a `.mcp.json` in the project folder), so it only starts when an agent works in that directory.
- **Compact MCP surface**: a few general tools (query/read/write/link/search), not dozens of narrow ones. Guidelines are exposed as MCP resources and prompts.
- Keep agent-facing output token-efficient: summaries first, full content on request.

## Writing guidelines (built-in defaults; user-overridable)

General rules the agent should follow when helping write:

1. **Character drives plot.** Every major character has a want, a need, and a flaw. Choices under pressure show who they are.
2. **Every scene changes something.** It has a goal, a conflict, and an outcome (a turn). If nothing changes, cut it or merge it.
3. **Structure is a tool, not a cage.** Three-act / Save the Cat / Hero's Journey / Kishōtenketsu are lenses. Use them to diagnose problems, not to fill in a template.
4. **Stakes escalate.** Raise the cost of failure. Make it personal before making it global.
5. **Setup → payoff.** Track foreshadowing (Chekhov's gun). Flag setups with no payoff and payoffs with no setup.
6. **Show, don't tell**, unless telling is faster and the moment doesn't matter.
7. **Consistency.** Respect established facts: timeline, names, geography, magic/tech rules. Check before you write.
8. **Theme comes out of conflict.** Don't preach. Let opposing values collide.
9. **Pacing.** Alternate tension and release. Vary scene length and intensity.
10. **Respect the author's voice.** Match the existing tone, tense, and POV. Suggest; don't rewrite wholesale unless asked.

RPG / campaign specifics:

- **Plan situations, not plots.** Players will derail you. Prepare factions, goals, and clocks, not fixed sequences.
- **Three-clue rule.** Every important conclusion gets at least three possible clues.
- Every NPC needs a want and a distinct hook (voice, mannerism). Keep NPC notes short and easy to run at the table.
- Locations: what's here, who's here, what happens if the players poke it.
- Give real choices with consequences. Track what the players did and change the world in response.
- Session prep should be skimmable: bullets, read-aloud text set apart, stat references linked.

Screenplay specifics: enter late, leave early. Write visually. Dialogue is subtext.

## Agent working rules

- Read the project's guidelines (built-in defaults plus project overrides) before making creative edits.
- Prefer small, targeted edits. Never silently delete user-written content.
- Put loose ideas in the backlog instead of forcing them into the structure.
- Keep links and graph edges in sync when you move or rename content.
- **Handle git yourself.** Commit your work as you go in small, logical commits with clear messages, without being asked. Branch off when it makes sense. Don't push, force-push, or rewrite history unless the user asks.
- Projects get their own `AGENTS.md` (template `AGENT_DOC` in `packages/core/src/project.ts`), which tells agents to manage git in the project folder the same way.

## Repository layout

```
packages/core     Domain model (zod schemas), file I/O, graph, guidelines (defaults + per-project overrides), templates.
                  Pure Node; "@maquest/core/schema" is browser-safe (types + constants only).
packages/mcp      Local stdio MCP server, bundled by tsup into one file (dist/index.js).
apps/desktop      Electron app (electron-vite): main = IPC handlers + chokidar watcher + maquest-media:// protocol,
                  renderer = React 19 + Tailwind 4 + React Flow + TanStack Query + zustand + CodeMirror.
```

Commands: `pnpm install`, `pnpm dev` (builds MCP, then runs the app), `pnpm build`, `pnpm typecheck`.
**Before committing, run `pnpm check:fix`.** It applies oxlint autofixes and oxfmt formatting, then runs lint, typecheck,
and tests (`pnpm check` does the same without changing files). Fix any remaining lint errors instead of disabling rules;
config lives in `.oxlintrc.json` / `.oxfmtrc.json` (no semicolons, single quotes, width 160).
**Installed app = this repo.** `pnpm install:desktop` (scripts/install-desktop.sh) builds and registers a
`~/.local/share/applications/maquest.desktop` launcher + icon that runs Electron against `apps/desktop` in this
checkout. It's a single-PC install, so there is no packaging step. **After any change to the app, run `pnpm build`**
so the installed launcher picks it up. Re-run `pnpm install:desktop` only when the icon (`apps/desktop/resources/icon.svg`)
or the launcher itself changes.
Open a project directly: `pnpm --filter @maquest/desktop exec electron . /path/to/project` (after a build).

## Project folder format

```
maquest.json        { name, kind: novel|screenplay|rpg|mixed }
graph.json          { edges: [{id, source, target, type, label}], boards: [{id, title, nodes?, phases: [{id, title}], layout: {nodeId: {x, y}}}] }
                    Boards are canvases; "main" (no `nodes`) shows everything. A node's phase = the column its x falls in (PHASE_WIDTH).
                    Edge labels are short names (≤ EDGE_LABEL_MAX); involves/located-at/member-of/owns render as chips on the source card.
stories/ chapters/ scenes/ notes/ characters/ locations/ factions/ items/ backlog/ media-nodes/
                    <id>.md — YAML frontmatter (type, title, parent, order, status, summary, tags, media, fields) + markdown body.
                    File name = id. Hierarchy is stored in `parent` (chapter→story, scene→chapter, note→any of those).
guidelines/<id>.md  Project override of a built-in guideline (same id) or a custom one (new id).
media/              Images/videos; referenced as media/<file> from bodies, `media`, or `src` (media nodes).
.mcp.json, .codex/config.toml, .cursor/mcp.json, AGENTS.md, CLAUDE.md   Written by the app so agents find the MCP server.
```

## MCP surface (keep it compact)

Tools: `overview`, `find`, `read`, `write` (batch create/update, incl. `clock`), `delete`, `connect` (batch edge ops, incl. `clue-for`), `board` (canvases + phase columns), `guidelines`, `media`, `project`.
Resources: `maquest://guidelines/{id}`. Prompts: `review`, `brainstorm`.
Add capabilities as options on existing tools before adding new tools. All logic lives in `@maquest/core`, so the app and MCP behave the same.
