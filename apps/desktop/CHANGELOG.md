# @maquest/desktop

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
