# Maquest

A desktop app for writing stories, novels, screenplays and tabletop RPG campaigns. You talk to your AI agent (Claude Code, Codex, Cursor…) and it edits the project through a built-in MCP server. You watch the changes appear on the canvas and edit by hand where you want.

- Stories → chapters → scenes, plus characters, locations, factions, items, free notes
- Node canvas with free and typed connections (`leads-to`, `branches-to`, `foreshadows`, `involves`, `member-of`, …). Connections can be named, each type has its own color and line style, and you can filter them
- Backlog for raw ideas, which you can promote to anything later
- Images and videos on the canvas, embedded in markdown, and attached to nodes
- Built-in writing guidelines (general, RPG, screenplay) that each project can override; also editable by the agent. An "Author's style" guideline captures the author's voice: the agent fills it in from their pages and corrections and sees it whenever it reads or writes scenes
- Entity sheets that each project defines: fields with widgets (meters, rings, clocks, ratings, radar charts, tables, searchable records…) and tabs. Nothing about any game or genre is built in
- Maquest checks: project-wide health checks (broken links, nodes on no board, missing required fields…) for you and the agent
- Everything is plain markdown and JSON in a folder, so it works with git

## Sheets

Every project decides what its entities hold. A D&D campaign can give monsters AC, HP and ability scores, a Persona-style game can give characters Knowledge, Guts and Charm on a radar chart, and a novel can skip all of it. Maquest itself knows no game system: sheets are data in `maquest.json`, usually written by your agent (`project` tool).

- **Fields.** A type lists its fields (`types.<id>.fields`): a key for plain text, or `{ key, label, widget, required, badge, options, min, max, … }`. Values live in the node's frontmatter under `fields:` as plain YAML (text, numbers, lists, maps), so they stay readable in git and other editors.
- **Widgets.** `text` (`options` make it a choice), `subtitle`, `quote`, `stat` (big number tile with a note), `toggle`, `meter` (bar, ring, dots, boxes or a progress clock), `scores` (grid, bars, radar or dots, with an optional `modifier` such as `{ base: 10, step: 2 }`), `pairs` (named values as chips), `tags`, `list`, `refs` (links to other nodes) and `table`. Meters, ratings and toggles can be set with a click; everything else edits with the pencil.
- **Tabs.** `types.<id>.tabs` orders the sheet. `fields` tabs show fields with their widgets (listed, grouped in `sections`, or all the rest); `prose` tabs are the body's `# Heading` sections. Fields that no tab shows sit as properties under the title. Body headings the type doesn't name still become tabs.
- **Records.** A `records` field holds a list of same-shaped entries (abilities, spells, moves, inventory) as `[{ name, text, … }]`. Its `item` is the schema of one record, made of fields with any other widget, and checks report records that don't fit it. The sheet shows them as a list grouped by an item field (`groupBy`, in that field's `options` order) with group filters and a search, each record with its facts as chips and its full text; `style: "cards"` packs them into tiles that open on hover. Toggles and meters inside records set with a click.
- **Reuse.** A type can `extend` another (e.g. monsters start from characters' fields) and `omit` fields. Mark a type as a **library** and records with the same name (or named `[[id]]`) link to that node and show its text, so shared reference text lives once.
- **Rules.** `required` fields, `options`, `min`/`max` and widget shapes are checked by Maquest checks, the same way a linter checks code; `badge` fields show as chips on canvas cards.

## Maquest checks

The warning/error button in the title bar lists what Maquest detected: broken links and connections, nodes on no board, empty groups, missing or malformed fields, values kept under another name of a field, record text copied between sheets, overlong documents, too few clues and more. Issues name the node, say why and what to do, and offer quick fixes or "ignore for this node". Rules are set per project (severity, options, scope by type or tag, and declarative custom checks: required fields, tags, tabs or text, forbidden text, allowed `##` headings and word limits, optionally inside one tab, including fields tabs, where records read as `## Group` and `- **Name** — text` lines) in `maquest.json` under `checks` and `customChecks`, or in the menu's Rules tab. Checks rerun shortly after any change. Agents see the same report through `overview({ checks: true })` and after each write.

## Canvas and editing

- **Right-click empty canvas**, or focus the canvas and press **A**, to open the Add menu at the pointer. Choose a node type to place it there; arrow keys and Enter also work, and Escape or clicking outside dismisses the menu. The toolbar **Add** button opens the same menu but places nodes at the canvas center. Middle-drag pans; double-click zooms. Creation shortcuts do not run while typing in editors.
- Drag a selection box on empty canvas to select several cards; Shift-click or Ctrl/⌘-click adds to the selection. Drag a selected card to move the group.
- Undo persisted canvas edits with **Ctrl/⌘+Z**; redo with **Ctrl+Y** or **Ctrl/⌘+Shift+Z**. Editing text keeps the editor's own undo history.
- Choose a view mode for everyday filtering. **Advanced** exposes individual node and connection filters and the full list of connection types.
- New lines default to **Auto**, using drag direction and card types: character/location/item → location uses `located-at`; character → faction uses `member-of`; character/faction → item uses `owns`; same-kind characters or factions use `relationship`; scene/chapter → character/faction/item uses `involves`; scene → scene uses `leads-to`. Scene/chapter → location also uses `located-at`; ambiguous pairs use `link`. Hierarchy is never inferred.
- Choose an explicit **Connect as** type in **Advanced** to override Auto; view presets do not change that choice. Switch back to **Auto** to resume inference. Newly drawn connection types are made visible; select a line to edit it. Existing saved connection defaults reset to Auto once on upgrade, preserving filters.
- Pin a card to keep its position during auto-layout. Movable cards are placed around pinned cards; pins are saved in the node's markdown frontmatter.
- Connections drawn from a card's top, right, bottom, or left connector keep those attachment sides. Older connections without saved sides still attach automatically.
- Select a card or connection to emphasize its immediate neighborhood. Unrelated cards stay at 65% opacity and connections at 50%, keeping connection targets visible.
- Press **Delete** outside a text editor to immediately delete the current selection, including selections made in the sidebar, without confirmation. Unselected children survive and are detached from deleted parents. Use undo to restore deleted nodes or connections.
- In Recent, **×** removes an entry from the list without touching project files. The trash button moves the project to the system trash immediately, without confirmation; restore it through your system trash if needed. Trash failures are shown inline (some Linux mounts, including `/tmp`, cannot be trashed); use **×** to dismiss those entries.
- Drag the inspector's left divider to resize it, or focus the divider and use the arrow keys. Its width is remembered.
- Click a sidebar section heading (Stories, Characters, Locations, Factions, Items, or Notes) to collapse or expand it independently; focused headings also support Enter and Space. The **+** button stays available when collapsed and expands the section when adding a node.

Undo/redo history belongs to the open desktop session, not the project files or MCP server. Conflicting external edits are protected rather than silently overwritten.

## Develop

```sh
pnpm install
pnpm dev
```

Checks: `pnpm test` covers history restoration/conflicts, lossless markdown roundtrips, and directional connection defaults; `pnpm typecheck` checks all packages. Run `pnpm build` after app changes so the installed desktop launcher uses the updated build.

Desktop smoke runs must use an isolated profile: `pnpm --filter @maquest/desktop exec electron . --user-data-dir=/tmp/maquest-check-profile /path/to/test-project`. Use a fresh temporary profile per run and remove it afterward, so test projects never enter the installed app's Recent list.

## Using it with an agent

Create or open a project in the app. The app writes `.mcp.json` (plus Codex and Cursor configs) and an `AGENTS.md` into the project folder. Then:

```sh
cd path/to/my-campaign
claude    # or codex / cursor
```

The agent starts the `maquest` MCP server only for that folder. Edits apply to the files right away, and the app updates live (it doesn't need to be open).

See [AGENTS.md](AGENTS.md) for the architecture, file format and guidelines.

### Desktop end-to-end tests

`pnpm test:e2e` builds the app and runs Playwright against the real Electron executable. On Linux, the runner always uses an isolated Xvfb display (install the `xvfb` package first), so test windows cannot appear on your desktop or take focus. For visible debugging, explicitly run `MAQUEST_E2E_HEADED=1 pnpm test:e2e`. No separate Playwright browser download is needed: Electron supplies Chromium.

Each test creates a temporary project and isolated user profile, closes Electron, and removes both afterward. The suite covers grouping selected cards, dragging a group with its contents, renaming, recoloring, ungrouping without losing cards, and watching external file edits. Persistence assertions read the project's files through core rather than mocking IPC. Failed tests save a screenshot and trace under `test-results/`; open a trace with `pnpm exec playwright show-trace <path-to-trace.zip>`.

`pnpm check` and `pnpm check:fix` run both the fast tests and this desktop suite. Keep fast domain tests in `pnpm test`; add desktop tests for behavior that depends on real pointer events, keyboard shortcuts, IPC, or file watching. Extend `tests/e2e/fixtures.ts` for shared setup. After an existing build, run `pnpm exec playwright test` directly for a quicker iteration.

## Releases

Download Windows x64 installers or Linux x64 AppImage/tarballs from [GitHub Releases](https://github.com/Angael/maquest/releases). Builds are unsigned.

On Linux, use the AppImage: it is the only Linux build that updates itself. Keep it at a fixed path (e.g. `~/.local/opt/maquest/Maquest.AppImage`) and point your launcher there; updates download in the background with a progress toast and install on restart. The tarball never auto-updates.

For releasable changes, run `pnpm changeset` and select `@maquest/desktop`. Changes merged to `main` accumulate in an automated **Version Packages** PR. Merge that PR when ready to bump the version and publish downloads after both platform builds pass. Ordinary changes do not publish releases. See [.changeset/README.md](.changeset/README.md) for setup and retries.
