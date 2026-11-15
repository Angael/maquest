---
'@maquest/desktop': minor
---

Agents editing a project through Maquest recover from mistakes more safely:

- Batches of node writes and connections are checked as a whole before anything changes, so one bad item no longer leaves earlier items half-applied. Results list every item as applied, failed or not run, including when a batch stops part-way.
- Agents can create a node with a chosen id (`create: true`); an unknown id is never silently turned into a new node. "Node not found" errors suggest similar ids and point guideline names like `style` to the guidelines tool. Hierarchy errors name the node and parent involved.
- Reads stay within a size budget (whole nodes only) and list the nodes left out; a node too large on its own returns a heading outline, and its body can be read by section or line range, or from the file directly. Missing ids no longer block the rest of a read.
- Failed exact text edits show where the text is and what it says now, without guessing a replacement.
- Clearing live notes is refused if you changed them after the agent last saw them, so new notes are never dropped unseen.
- Whole nested group trees can be built on a board in one step, followed by an automatic layout.
- Long bodies can be passed as a local file (`bodyFile`) instead of inline text.
- Updating project settings without a name no longer fails or clears the description.
