---
'@maquest/core': minor
'@maquest/mcp': minor
'@maquest/desktop': minor
---

Map maker: a new `map` node type for battle maps and floor plans, drawn in the app or by agents.

- Maps sit on canvases like any node, with a live picture of the map on the card; open one to edit it. The map lives in `maps/<id>.map.json` next to the node.
- Rooms combine in order: add merges, subtract (or Alt while drawing) cuts, and the outline becomes walls. Rectangles, ellipses, polygons with bezier curves and freehand shapes; move, resize, rotate, edit points and curve handles. Selected shapes can be baked into one shape (union, subtract, intersect, exclude) and open lines can be joined or closed.
- Walls, doors (door, double, window, secret; open or closed), paths and brush strokes, painted areas with colors or textures (grass, stone, wood, water… or any project image), images, labels and lights.
- Layers: objects and tokens can be on several layers; layers in the same group swap, e.g. a town before and after a battle.
- Grid with any size and unit (5 ft, 100 m…) and a diagonal rule; the ruler measures a straight line or the cells the cursor walks through, center to center.
- Tokens with vision and darkvision, lights, and fog of war: dragging player tokens reveals what they see; walls and closed doors block sight. Switch between the GM view and what the players see.
- Export to SVG (map only, with tokens, or as players see it). Agents use the new `map` tool to read, edit (batched ops) and export maps.
