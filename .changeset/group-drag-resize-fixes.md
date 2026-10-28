---
'@maquest/desktop': patch
---

Fix group frames on the canvas. After dragging nested groups, their cards no longer get stuck at stale spots on screen, so auto layout, undo, and agent edits move them along with their groups again. Groups can now shrink from the top, left, and corner handles down to their content. The minimum size uses the real card sizes instead of a default, which removes the uneven extra padding. Resize edges are also easier to grab.
