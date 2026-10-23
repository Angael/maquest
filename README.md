# Maquest

A desktop app for writing stories, novels, screenplays and tabletop RPG campaigns. You talk to your AI agent (Claude Code, Codex, Cursor…) and it edits the project through a built-in MCP server. You watch the changes appear on the canvas and edit by hand where you want.

- Stories → chapters → scenes, plus characters, locations, factions, items, free notes
- Node canvas with free and typed connections (`leads-to`, `branches-to`, `foreshadows`, `involves`, `member-of`, …). Connections can be named, each type has its own color and line style, and you can filter them
- Backlog for raw ideas, which you can promote to anything later
- Images and videos on the canvas, embedded in markdown, and attached to nodes
- Built-in writing guidelines (general, RPG, screenplay) that each project can override; also editable by the agent
- Everything is plain markdown and JSON in a folder, so it works with git

## Canvas and editing

- Drag a selection box on empty canvas to select several cards; Shift-click or Ctrl/⌘-click adds to the selection. Drag a selected card to move the group.
- Undo persisted canvas edits with **Ctrl/⌘+Z**; redo with **Ctrl+Y** or **Ctrl/⌘+Shift+Z**. Editing text keeps the editor's own undo history.
- Choose a view mode for everyday filtering. **Advanced** exposes individual node and connection filters and the full list of connection types.
- Pin a card to keep its position during auto-layout. Movable cards are placed around pinned cards; pins are saved in the node's markdown frontmatter.
- Connections drawn from a card's top, right, bottom, or left connector keep those attachment sides. Older connections without saved sides still attach automatically.
- Select a card or connection to emphasize its immediate neighborhood and dim unrelated graph content.
- Press **Delete** outside a text editor to delete the current selection, including selections made in the sidebar. Node deletion asks for confirmation.
- Drag the inspector's left divider to resize it, or focus the divider and use the arrow keys. Its width is remembered.

Undo/redo history belongs to the open desktop session, not the project files or MCP server. Conflicting external edits are protected rather than silently overwritten.

## Develop

```sh
pnpm install
pnpm dev
```

Checks: `pnpm test` covers history restoration/conflicts and lossless markdown roundtrips; `pnpm typecheck` checks all packages. Run `pnpm build` after app changes so the installed desktop launcher uses the updated build.

## Using it with an agent

Create or open a project in the app. The app writes `.mcp.json` (plus Codex and Cursor configs) and an `AGENTS.md` into the project folder. Then:

```sh
cd path/to/my-campaign
claude    # or codex / cursor
```

The agent starts the `maquest` MCP server only for that folder. Edits apply to the files right away, and the app updates live (it doesn't need to be open).

See [AGENTS.md](AGENTS.md) for the architecture, file format and guidelines.
