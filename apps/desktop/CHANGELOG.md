# @maquest/desktop

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
