# @maquest/desktop

## 0.17.1

### Patch Changes

- 3373923: Images in a note's text open full size on a single click again. Previously the first click switched the image to its raw markdown, so double-clicking it never opened the viewer.

## 0.17.0

### Minor Changes

- 7a6128a: Maquest now sends anonymous, cookieless usage statistics (which views are used, projects opened or created, nodes, links and boards created, manuscript exports and update installs) to help decide what to improve. No titles, text, paths or other project content are ever sent. Turn it off anytime with “Turn off anonymous usage statistics” in the command palette (Ctrl+K).

### Patch Changes

- 5eab993: Maquest no longer fails silently. A project that can’t be opened on launch no longer stops the app from starting: the start screen explains what went wrong, and unreadable projects stay in Recent with a warning. Crashes in the window, the main process or during startup show the error instead of a blank or missing window, with a “Copy prompt for your agent” button that has your agent report the problem on GitHub and propose a fix. Errors are also written to a log file.

## 0.16.1

### Patch Changes

- 1b46ae8: Fix middle-drag panning moving the canvas at double speed when the drag starts on a card or connection.

## 0.16.0

### Minor Changes

- 1c740ef: Remove the "Revised" status. Nodes still marked `revised` are migrated to `done` automatically when a project is read, and agents passing `revised` get `done`.

## 0.15.0

### Minor Changes

- a072afd: Right-click menus everywhere, so Maquest feels like a native app:

  - Text fields, editors and selections get the system edit menu: undo/redo, cut/copy/paste, spelling suggestions with
    "Add to dictionary", a "Check spelling while typing" switch, and "Search project for …" on selected text. Links and
    images get open/copy/view/show-in-folder actions.
  - Cards, connection lines and their labels, and group frames on the canvas have menus (status, add to board, copy
    link, reverse or retype a connection, rename, recolor and ungroup a group). F2 renames the selected card or group.
  - Sidebar rows rename in place (menu or F2) and offer new child, collapse, duplicate, status, show on canvas, show
    file and move to backlog; section headers create, collapse and customize types.
  - Node links, chips and inspector tabs (close others, to the left/right, all), board tabs, map tabs and cards, recent
    projects, backlog ideas (promote), media thumbnails (copy image, show in folder), guidelines and node types all
    have menus, and the map editor has one for its selection.
  - Menus open instantly at the pointer or from the Menu key / Shift+F10, highlight what they act on, and return focus
    when they close; menus match the dark theme.

- 30b6e15: Project checks can look inside one tab: `tab` limits a custom check to body tabs, `require.match` demands text, `headings` lists the allowed `##` headings, and `forbid` reports every offending line. Agents are told in AGENTS.md and the MCP instructions that they may tune checks and should turn the author's format rules into checks.
- 6ac2c20: Sheets, cards and the inspector now hold up to any data an agent writes, and Maquest reports what's too much.

  - Long text folds to a few lines with "Show more" (stat tiles, text lines, quotes, subtitles, list items, table cells, record descriptions); long lists show their first items with "Show all N" or "+N more" (tags, pairs, refs, list items, table rows), and records open 50 at a time. Chips and labels stay on one line, cut off with the full text on hover, and words that never end wrap instead of pushing the panel sideways.
  - Numbers read short everywhere: at most two decimals (`0.30000000000000004` shows `0.3`), compact from a million (`1.2M`, `988M`, `12.3T`), exponents for the extremes (`1.2e29`, `4e−6`); tiles shrink their type for long values, and the exact value is on hover. Files are unchanged.
  - Meters with more dots or boxes than fit (over 40), clocks with more than 12 segments, radars with more than 12 axes and score dots past 20 fall back to bars instead of drawing a wrong picture.
  - Canvas cards keep their size: titles clamp to three lines, over-long summaries to four, badges and reference chips stay short (+N for the rest).
  - New check "Oversized fields" (`field-oversized`, warn): text longer than its widget shows well, too many or too long items, words over 40 characters, numbers too big, small or precise to read, and styles that can't draw the value. The word limit is an option. "Long titles, summaries and tags" (`summary-length`) now also reports titles over 80 characters, tags over 32 and run-together words. Check messages quote at most a few values.
  - Agents are told how much a field holds when they write fields, and write results list oversized values with the rest of the problems.

- 13f61c8: Map maker: a new `map` node type for battle maps and floor plans, drawn in the app or by agents.

  - Maps sit on canvases like any node, with a live picture of the map on the card; open one to edit it. The map lives in `maps/<id>.map.json` next to the node.
  - Rooms combine in order: add merges, subtract (or Alt while drawing) cuts, and the outline becomes walls. Rectangles, ellipses, polygons with bezier curves and freehand shapes; move, resize, rotate, edit points and curve handles. Selected shapes can be baked into one shape (union, subtract, intersect, exclude) and open lines can be joined or closed.
  - Walls, doors (door, double, window, secret; open or closed), paths and brush strokes, painted areas with colors or textures (grass, stone, wood, water… or any project image), images, labels and lights.
  - Layers: objects and tokens can be on several layers; layers in the same group swap, e.g. a town before and after a battle.
  - Grid with any size and unit (5 ft, 100 m…) and a diagonal rule; the ruler measures a straight line or the cells the cursor walks through, center to center.
  - Tokens with vision and darkvision, lights, and fog of war: dragging player tokens reveals what they see; walls and closed doors block sight. Switch between the GM view and what the players see.
  - Export to SVG (map only, with tokens, or as players see it). Agents use the new `map` tool to read, edit (batched ops) and export maps.

- a651a63: Maps get their own view and tabs: a Maps list to create, open, rename, duplicate and delete maps, one tab per open map, maps in the sidebar, and an "Open as player" window that shows only what the players see. The editor separates the selection inspector, the fog/tokens/layers panel and a Map settings popover; new maps start from project-wide defaults (units, diagonal rule, look). New eraser tool, right click cancels drawing, and handles on the map resize tokens and their vision, lights, doors and labels. Walls can have materials and solid tops (roofs, rock) that players glimpse at the edge of the fog. Fixes vision that went blank at some positions and light leaking past angled doors, and number fields that stepped oddly.
- 9fedc03: Maps: the tool rail is split into groups with each tool's options beside it; tokens (player, enemy, NPC) and the scene light get their own floating docks. Rooms can keep their own walls inside other rooms and set their own light level, and named rooms show their name. Snapping is per tool (paint and decoration no longer snap), things outside the map can be grabbed, right click cancels a drag in progress, and Play opens a map as the players see it instead of a separate window.
- c3caeb2: New Maquest check "Missing status" (warn by default): every node should have a status (idea, draft, revised, done). Media nodes are skipped; the level and scope can be changed per project. Agents are told to set a status on every node they create.
- a889bae: Sheets are now defined entirely by each project; Maquest no longer knows any game system.

  - Types list their **fields** (`types.<id>.fields`) with a widget each: text (with choices), subtitle, quote, stat, toggle, meter (bar, ring, dots, boxes, progress clock), scores (grid, bars, radar chart, dots, optional modifier), pairs, tags, list, refs and table. Meters, ratings and toggles can be set with a click.
  - **Tabs** come in three kinds: `fields` tabs (listed fields or titled sections), `prose` and `cards` (body sections). Fields no tab shows appear as properties under the title. Types can `extend` another type and `omit` fields.
  - Node data lives in one place, `fields:`, which now holds numbers, lists and maps too. Old `stats:` are read as fields and saved that way on the next write.
  - Checks: `field-missing`, `field-invalid` (shape, choices, range), `field-alias` (a value under another name, with a fix) and `broken-ref` replace the statblock rules; `shared-ability` is now `shared-card`. Invalid type definitions are reported instead of breaking the project.
  - Removed: statblock presets (`dnd-2024`, `pf2e`, …), `systems`, per-node `system`, the `abilities` tab kind (now `cards`, only where configured) and the built-in list of ability heading names and library type ids. A config that still has `systems` is reported with how to move it.

- 9042e52: Quality-of-life pass across the app:

  - The command palette (Ctrl/⌘+K) runs commands, lists recently viewed nodes, searches document text with a highlighted passage, and creates a node from the query when nothing matches.
  - Keyboard shortcuts dialog (Ctrl/⌘+/), view shortcuts (Ctrl/⌘+1…5), Ctrl/⌘+O to open a folder, and undo/redo in the Backlog.
  - Back and forward through viewed nodes with Alt+←/→, the mouse's thumb buttons or the inspector header arrows.
  - Typing `[[` in a document suggests nodes to link; the tag field suggests tags already used in the project.
  - A footer under each document with word count, reading time, totals for stories and chapters, last edit time, and previous/next chapter or scene.
  - Export a story, chapter or scene as one Markdown manuscript. Agents see word counts in the outline.
  - Sidebar rows have a right-click menu and status dots, and collapsed sections and story branches are remembered. The node menu can copy a node's text and open its file in the default app.
  - Filter the Backlog by words and `#tags`.
  - Spellcheck in documents with suggestions in the right-click menu, plus a native Cut/Copy/Paste menu in text fields.
  - Unsaved edits are written before the window closes or the project switches; the window remembers its size and position; the window title shows the open node and project.

- c3caeb2: Records replace cards tabs: abilities, spells, moves and inventory are now a project-defined `records` field instead of markdown parsed by Maquest.

  - A `records` field holds `[{ name, text, … }]`; its `item` is the schema of one record (fields with any other widget), and `field-invalid` reports records that miss required keys, have keys the item doesn't define, or values that don't fit.
  - The sheet lists records grouped by an item field (`groupBy`, ordered by its options) with group filters and a search that marks matches; each record shows its facts as chips and its full description. `style: "cards"` shows tiles that open on hover. Toggles and small meters in records (uses, prepared) set with a click, and the form edits, adds, moves and removes records.
  - Records named like a library node, or `[[id]]`, link to it and show its text on hover; `shared-card` is now `shared-record`.
  - Custom checks scoped to a fields tab read its fields, records as `## Group` and `- **Name** (facts) — text` lines; a fields tab with values counts for `require.tabs`.
  - The `cards` tab kind is gone: setting one is refused, and a hand-written one reads as prose and is reported with how to move it to records.

- 67c8be6: Sheets are easier to discover and say more:

  - A type's tabs now show on every node of that type, even before the node has text for them. Any node, including a plain location or note, has an "Add tab" button that adds the tab to all nodes of its type (or only to this node) and links to the type's sheet settings.
  - Fields can have an `icon` (a lucide icon name), shown next to their label in stats, meters, toggles, text lines and blocks.
  - Fields can have `requiredWhen` (`{ kind: "Spell" }`), which makes them required only when other values match. In records, the condition reads the same record, so a spell without a level is reported.
  - A record with no text of its own now shows its library node's full description on the sheet, not just the summary.
  - New checks: `record-undescribed` reports records with no description and no library text. `field-duplicates-records` reports text fields that repeat a records group, such as a "Spells" text next to spell records.

### Patch Changes

- 01371af: Canvas: middle drag pans even with Ctrl held, and the scroll wheel zooms instead of panning.
- 01371af: Hide the tab strip when closing tabs leaves only the node you're viewing.
- 01371af: Middle click opens nodes in a new inspector tab from everywhere they link: markdown links in notes and documents, the sidebar, connections, contained nodes, connection endpoints, card references, linked records and sheet node fields, the backlog, problems and search. Middle clicks no longer autoscroll or paste into the editor.
- 64784bd: Sheet records keep the line breaks of their text: a single newline in a record's (or its library node's) description now shows as a new line instead of being folded into a space.

## 0.14.0

### Minor Changes

- 020d3a7: Entity sheets and Maquest checks.

  - Characters, monsters and other entities can have a statblock from any game system (D&D 2024, Pathfinder 2e, OSR, Blades in the Dark, Call of Cthulhu, generic, or one the project defines or extends). Statblocks render as a proper sheet with key facts, score grids and chips, are edited through a form generated from the system, and their key stats show as chips on canvas cards.
  - A node's `# Headings` become tabs next to the statblock, in the order its type defines. Ability tabs show each ability as a small card, grouped by `##` headings (Actions, Reactions, 1/day, Level 2 spells…); hovering a card shows the full text, clicking keeps it open.
  - Rules library types (e.g. Spells): ability cards with the same name show the library node's text, so shared rules text lives in one place.
  - New Problems menu in the title bar: Maquest checks the project as it changes (broken links and connections, nodes on no board, empty groups, missing or malformed statblocks, stats kept in fields, copied rules text, overlong documents, too few clues…) and lists each issue with where, why and what to do, quick fixes and "ignore for this node". Rules are configurable per project, including custom checks.
  - Agents get the same checks: a summary in `overview`, the full report with `overview({ checks: true })`, and the issues of the nodes they just wrote. They can set statblocks, systems, tabs and check rules through the existing tools.

## 0.13.0

### Minor Changes

- 822cc7c: Agents editing a project through Maquest recover from mistakes more safely:

  - Batches of node writes and connections are checked as a whole before anything changes, so one bad item no longer leaves earlier items half-applied. Results list every item as applied, failed or not run, including when a batch stops part-way.
  - Agents can create a node with a chosen id (`create: true`); an unknown id is never silently turned into a new node. "Node not found" errors suggest similar ids and point guideline names like `style` to the guidelines tool. Hierarchy errors name the node and parent involved.
  - Reads stay within a size budget (whole nodes only) and list the nodes left out; a node too large on its own returns a heading outline, and its body can be read by section or line range, or from the file directly. Missing ids no longer block the rest of a read.
  - Failed exact text edits show where the text is and what it says now, without guessing a replacement.
  - Clearing live notes is refused if you changed them after the agent last saw them, so new notes are never dropped unseen.
  - Whole nested group trees can be built on a board in one step, followed by an automatic layout.
  - Long bodies can be passed as a local file (`bodyFile`) instead of inline text.
  - Updating project settings without a name no longer fails or clears the description.

### Patch Changes

- 02b25cb: Two-finger touchpad scrolling now pans the canvas in every direction; pinch zooms. With a mouse wheel, hold Ctrl to zoom.

## 0.12.0

### Minor Changes

- 0bc2330: The image viewer has a zoom bar: a smooth slider for precise zoom, zoom in/out buttons, the current percentage, and one-click "100%" (actual pixels) and "Fit" buttons.

## 0.11.5

### Patch Changes

- 739e128: Syncing with the git remote now commits uncommitted changes in the project folder (such as new live notes) before pulling, so they are pushed instead of left behind. Changes outside the project folder and gitignored files are left untouched.

## 0.11.4

### Patch Changes

- 7f05017: Large canvases stay smoother: cards and lines off screen are no longer drawn, selecting a card only redraws the cards and lines whose highlight changes, and card images decode in the background.

## 0.11.3

### Patch Changes

- 97f3acd: The live notes editor now fills the whole panel and scrolls on its own when notes outgrow it. Agents check whether live notes are already handled and clear them once done, or raise open items with you.

## 0.11.2

### Patch Changes

- cb67c1d: Compile the app's interface with React Compiler for fewer unnecessary re-renders.

## 0.11.1

### Patch Changes

- 7cdadfa: Empty lines in markdown editors now have the same height as text lines, so pressing Enter or moving the cursor across them no longer makes the text below jump.
- 0720f26: Typing a bare list marker (`1.`, `-`) and pressing Enter no longer erases the line in markdown editors and live notes.

## 0.11.0

### Minor Changes

- 9da96a0: Add a git sync button to the title bar. It pulls safe remote updates and pushes local commits on demand, and only appears when the project folder is a git repository.

## 0.10.0

### Minor Changes

- 2b9bbe7: Live notes now open from a floating button in the corner where the panel appears, animate in and out, and can be resized by dragging the top-left corner (the size is remembered).

### Patch Changes

- 6bcce6a: Moving the cursor onto a blank line in the editor no longer makes it taller and shifts the text.

## 0.9.1

### Patch Changes

- a5c14d5: Ship the Maquest app icon in Linux and Windows builds instead of the default Electron icon.
- d58794c: Fix clicks in the editor landing on the line below when a rendered table sits above them.

## 0.9.0

### Minor Changes

- 2112ede: Redesigned interface. The window now has an app-integrated title bar with a project switcher, search field and window controls. A new warm dark palette keeps the orange accent and has stronger contrast. Inter is used for the interface, Literata for writing, and both fonts are bundled.

  - The sidebar can be collapsed (Ctrl+B) and resized.
  - The canvas has a single floating toolbar and a "View" popover in place of the always-open filter panel. Shortcuts moved from the permanent hint bar into tooltips and a shortcuts popover. The minimap is now optional, and cards are quieter and easier to read.
  - The inspector is a compact property list with the document as the main focus. Tags are chips, the summary and title are inline, and Delete asks for confirmation.
  - Backlog, Guidelines and Types share one page layout. Guidelines have on/off switches and clear agent-usage info, and the icon picker is faster.
  - Cards show their type as a tinted header band. Connection labels rise above cards on hover.
  - Inspector tabs have a context menu (close others, close to the left or right, close all), and inspector dropdowns open a compact menu.
  - The backlog capture box has separate title and details fields; Enter adds the idea.
  - Hovering on the canvas no longer re-renders the whole graph.

## 0.8.0

### Minor Changes

- 09f5814: Opening a project in a git repository now also pushes your local commits to the upstream branch when that is a plain fast-forward (after the safe pull, nothing on the remote is missing locally). A toast reports whether the push succeeded or why it failed.
- d747d88: Opening a project that lives in a git repository now pulls the latest changes from its upstream branch when that is conflict-free (a fast-forward, or a merge git proves clean), and shows a toast when the project was updated. Local edits that would be overwritten, conflicting history, in-progress git operations, offline remotes and missing credentials are detected and reported instead of touching your files.

### Patch Changes

- d747d88: Toasts now use a shared stacked notification style; git sync on open no longer fails to merge when git has no user identity configured.

## 0.7.0

### Minor Changes

- cc45e0b: - Inspector tabs: middle-click a card to open it in a new tab above the inspector and flip between several nodes (e.g. stat blocks in combat); × or middle-click closes a tab, double-click keeps a preview tab open.
  - Fix the canvas showing through the Backlog, Guidelines and Types views.

### Patch Changes

- b8cb612: - App updates now show a toast while the new version downloads, with the versions it updates from and to and download progress; failed downloads are reported instead of disappearing silently.
  - Release notes recommend the Linux AppImage, the only Linux build that updates itself.

## 0.6.0

### Minor Changes

- 0139333: Render markdown tables in the body editor; the raw table appears while the cursor is inside it.
- 0139333: Session-friendly polish:

  - Live notes: a floating scratchpad (Live notes button or Ctrl+J) saved to `live-notes.md`. The MCP server flags new notes to your agent as an important notice and lists them in the overview.
  - Switching between Canvas, Backlog and other views keeps the canvas position and each view's selection.
  - Clicking a board chip in the inspector opens that canvas and zooms to the node; the × on the chip removes it from the board.
  - Links in the markdown editor open on click (Ctrl+click on the line you're editing), including `[[node]]` links.
  - The caret is visible right after pressing Enter on an empty line.
  - Search ranks titles first and no longer shows random fuzzy matches that depended on the previous query.

## 0.5.0

### Minor Changes

- 72c54aa: Images and maps can now be viewed full size in a zoomable, pannable viewer. Click an inspector thumbnail or the expand button on a card, or double-click an image on a card or in the body editor. Scroll or pinch to zoom, drag to pan, Escape to close.
- 68fdf63: The content editor is now a single live-preview editor instead of separate Write and Preview tabs. Headings, bold, italic, strikethrough, inline code, links, quotes, lists, checkboxes, rules, images/videos and `[[node]]` links render as you type, and their markdown syntax only shows on the line you're editing. Checkboxes toggle on click, node links select the node, and Ctrl/Cmd+click opens web links in your browser. Files are never reformatted.

### Patch Changes

- 8358da9: Fixed the MCP server freezing when an agent nested a group inside another group whose content overlapped the group's current position. The group now goes into the first free spot in its parent.

## 0.4.0

### Minor Changes

- 1c30055: Reorder canvases by dragging their tabs, and reorder characters, locations, factions, items and notes by dragging them in the sidebar. A new read-only "All" canvas always shows every node. Cards are a little wider and show their full summary instead of cutting it off after two lines.
- 947b335: Node types are now configurable per project. A new Types view lets you rename any type, change its color and pick its icon from the full Lucide set, and add your own entity types (for example "Monster") with starter fields and body. Custom types get their own folder and sidebar section, show up in the canvas filters and "Promote to…" menus, and convert to and from existing types like notes. Agents can manage types through the MCP `project` tool, and `overview` lists them.

### Patch Changes

- 2aa1e1d: Search palette (Ctrl+K) now ranks exact and near-exact title matches first, tolerates one-letter typos, and no longer truncates entity names in favor of their summaries.
- c4486e2: Auto layout keeps your ordering: cards stay in their current top-to-bottom order within each canvas column, and packed groups fill strict rows in reading order instead of being tucked under one another.
- 5fba7b8: Groups edited by agents stay tidy: cards added to a group are packed into a grid, groups shrink to fit their content after cards move in or out, nesting a group moves it inside its parent instead of stretching the parent, and neighbouring groups are pushed aside instead of overlapping. The MCP `board` tool gains a `layout` action (the same auto-layout as the canvas button), shows group sizes and positions on `read`, and flags overlapping or mostly empty groups after edits.

## 0.3.0

### Minor Changes

- 6cceef1: Maquest now updates itself from GitHub Releases. The Windows installer and Linux AppImage check for a new version on launch, download it in the background and offer a Restart button; if you skip it, the update installs when you quit.
- a970ef2: Make large story rewrites easier for agents: `find` accepts several terms and shows the matching lines, `write` supports targeted find-and-replace `edits`, renaming ids with `newId` (links, connections, children and boards follow) and placing existing nodes on `boards`, and `delete` reports dangling `[[links]]` or hands everything over with `replaceWith`. Ids from titles with letters like `ł` or `ß` are now transliterated instead of cut, and agent config files are only rewritten when they change and are git-ignored in projects.

## 0.2.0

### Minor Changes

- aa15bd3: Add an "Author's style" guideline that agents fill in from the author's own pages and corrections, and include it when agents read or write scenes. Built-in guidelines are now shorter and focus on avoiding common AI writing habits; agents capture structure eagerly but write story prose only when asked. RPG advice moved from the agent instructions into the RPG guideline, so it no longer applies to other project kinds. The "Stakes, tension and pacing" guideline was merged into "Story structure and stakes".
- c05ea72: Auto-layout now has a style picker next to its button. The new default, Smart, follows links where cards are connected and packs unlinked cards and groups into a compact grid shaped to fit the screen, so boards no longer turn into one tall column. Grid packs everything in reading order, Flow → and Flow ↓ follow links (Flow → wraps long chains), and Classic keeps the previous layout. The chosen style is remembered.
- d5ecaf1: Track how often agents read and write each guideline (stored in guidelines/usage.json) and show the counts in the Guidelines list.
- 8b73a2c: Boards are now independent canvases. No board is special: each shows only the cards placed on it, any board can be deleted while another remains, and new cards land only on the board they were created on. Delete removes a card from the current board without deleting it (Shift+Delete deletes it everywhere). Copy/paste now places a reference to the same entity instead of copying it, and a new right-click card menu offers Copy reference, Duplicate (Ctrl+D, a real copy), Group, Remove from board and Delete everywhere. Existing projects keep every node on their main board. Agents can choose a board when creating nodes.
- 494fad9: Add a quick search palette (Ctrl+K or Ctrl+F) that finds any entity, board, or guideline and jumps to it on Enter.
- 07051b1: Copy and paste on the same board now adds another card for the same node, so one node can appear several times on a board. Delete on the canvas removes only the selected card; Delete in the sidebar deletes the node again.
- 7909ad5: Drag entries from the left sidebar onto the canvas to place them on the current board where you drop them. Dropping an entity that is already on the board adds another card for it.
- 043bb58: Fix sidebar entries with long names losing their left indent. The expand-arrow spacer no longer shrinks, so icons and names stay aligned with the rest of the list.

### Patch Changes

- eff40fc: Keep node titles and summaries short. Agents are told to write one-sentence summaries (under 160 characters) with full wording in the body, and `write` now returns a warning for long summaries or titles cut off with "…" instead of rejecting them. The Inspector's summary field wraps to show the whole text, and hovering a card's summary shows it in full.
- 43343e2: Fix group frames on the canvas. After dragging nested groups, their cards no longer get stuck at stale spots on screen, so auto layout, undo, and agent edits move them along with their groups again. Groups can now shrink from the top, left, and corner handles down to their content. The minimum size uses the real card sizes instead of a default, which removes the uneven extra padding. Resize edges are also easier to grab.
- 6173e47: Use icon segmented controls with hover labels for canvas views, line names, and references, and simplify connection help text.
- cb824c9: Clicking a sidebar entry whose card is off screen now pans the canvas to it, keeping the current zoom, and switches to another board when the entity isn't on the current one. Cards already in view no longer make the canvas jump.

## 0.1.1

### Patch Changes

- 7387ffc: Ship the first Windows and Linux desktop downloads with the bundled MCP server.
