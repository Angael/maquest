---
'@maquest/desktop': patch
---

Groups edited by agents stay tidy: cards added to a group are packed into a grid, groups shrink to fit their content after cards move in or out, nesting a group moves it inside its parent instead of stretching the parent, and neighbouring groups are pushed aside instead of overlapping. The MCP `board` tool gains a `layout` action (the same auto-layout as the canvas button), shows group sizes and positions on `read`, and flags overlapping or mostly empty groups after edits.
