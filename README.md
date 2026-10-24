# Maquest

A desktop app for writing stories, novels, screenplays and tabletop RPG campaigns. You talk to your AI agent (Claude Code, Codex, Cursor…) and it edits the project through a built-in MCP server. You watch the changes appear on the canvas and edit by hand where you want.

- Stories → chapters → scenes, plus characters, locations, factions, items, free notes
- Node canvas with free and typed connections (`leads-to`, `branches-to`, `foreshadows`, `involves`, `member-of`, …). Connections can be named, each type has its own color and line style, and you can filter them
- Backlog for raw ideas, which you can promote to anything later
- Images and videos on the canvas, embedded in markdown, and attached to nodes
- Built-in writing guidelines (general, RPG, screenplay) that each project can override; also editable by the agent
- Everything is plain markdown and JSON in a folder, so it works with git

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
