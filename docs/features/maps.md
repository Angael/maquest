# Map maker — live feature note

Living document for the map maker. Keep it current: update **Status** and **Log** whenever map work lands, so the
feature can continue across conversations and agents. Branch for the first iteration: `feat/map-maker`.

## Requirements (from the author)

- [ ] Export a map to SVG.
- [ ] Maps can be placed on the canvas as nodes.
- [ ] Layers; any object can be on several layers. Use case: "town before the battle" / "town after the battle" and a
      quick swap between them.
- [ ] The map maker understands **walls** and **paths**:
  - [ ] rooms, doors, curves, circles, rectangles, rotating them;
  - [ ] boolean operators (a circle cuts out of / merges with what is under it);
  - [ ] curves can be joined together.
- [ ] Simple image placement.
- [ ] Painting colors / textures underneath (terrain).
- [ ] Light, vision and fog of war: drag player tokens through the map, the map reveals what they see.
- [ ] Grid:
  - [ ] customizable cell count;
  - [ ] ruler: straight line, or "cells the cursor passed through", measured center to center;
  - [ ] grid unit (e.g. D&D 2024 "5 ft", or "100 m") so the ruler reports real distances.

## Design

### Storage

- A map is a node of built-in type `map` (folder `maps/`), so it can be placed on boards, linked, searched and read
  like any node. Its markdown body is free-form notes (GM notes, keyed areas).
- The geometry lives next to it in `maps/<id>.map.json` (node `src` points to it). Plain JSON, diffable, the source of
  truth; the app watches it and refreshes open map views live.
- Schema, geometry and SVG rendering are in `packages/core/src/map/` (browser-safe, exported as `@maquest/core/map`),
  shared by the app editor, canvas thumbnails, SVG export and the MCP server.

### Model (`MapDoc`)

- `grid`: `cols`, `rows`, `size` (px per cell), `unit` (`amount` + `name`, e.g. 5 ft), `diagonal` rule
  (`alternate` 5-10-5 / `equal` / `euclid`), `show`, `color`, `opacity`.
- `layers`: `{ id, name, visible, group? }`. Layers sharing a `group` are exclusive: showing one hides the others,
  which is the before/after swap. Objects list the layers they are on (`layers: []` = always shown).
- `objects` (z-order = array order, drawn in kind bands: terrain, rooms, walls/paths, doors, images, labels):
  - `area` — painted terrain: closed shape filled with a color or texture; `op: subtract` erases paint below it.
  - `room` — closed shape; all visible rooms combine in order (`op: add` merges, `op: subtract` cuts) into one floor
    region whose outline becomes walls automatically.
  - `wall` — free-standing wall line (open/closed, curves), blocks sight.
  - `path` — decorative stroke (road, river, brush stroke), never blocks sight.
  - `door` — sits on a wall; cuts the wall, blocks sight while closed.
  - `image` — media file placed on the map.
  - `label` — text.
  - `light` — light source with bright/dim radius.
- Shapes: `rect` (w, h, corner radius), `ellipse` (rx, ry), `path` (points with optional bezier handles, open or
  closed). Every object has `x`, `y`, `rotation`.
- `tokens`: name, cell position, size, color, optional linked node (character), `vision` (radius in grid units,
  darkvision), `player` (reveals fog).
- `fog`: `enabled`, `ambient` (`light` / `dim` / `dark`), `explored` polygons (merged as players move), reset.

### Geometry

- Curves are flattened to polylines for booleans, walls and vision; rendering keeps real bezier SVG paths where no
  boolean is involved.
- Booleans use `polygon-clipping` (union / difference / intersection). Non-destructive by default (`op` per object,
  recomputed live); "Combine" in the editor bakes selected shapes into one path.
- Vision: ray-cast visibility polygon from each player token against wall segments (room outlines, walls, closed
  doors), clipped to the vision radius; lit areas come from lights' own visibility polygons when ambient is dark.

### MCP

- `write` with `type: map` creates the node and an empty map document.
- One `map` tool: `read` (summary first: size, grid, layers, object counts; `full` for objects), `edit` (batch ops:
  add / update / remove objects, layers, tokens, grid, fog), `export` (SVG file into `media/` or a given path).

## Status

Phase 1 (this iteration) — core model, renderer, editor, canvas node, MCP, SVG export.

| Area                                    | State       |
| --------------------------------------- | ----------- |
| Live note                               | done        |
| Core schema + geometry + booleans       | in progress |
| SVG renderer (core) + export            | todo        |
| Map node type + storage                 | todo        |
| Editor view (tools, select/move/rotate) | todo        |
| Layers panel + exclusive swap           | todo        |
| Grid settings + ruler (line / cells)    | todo        |
| Images, terrain painting, textures      | todo        |
| Tokens, vision, lights, fog of war      | todo        |
| Canvas node thumbnail                   | todo        |
| MCP `map` tool                          | todo        |
| Tests (unit + e2e)                      | todo        |

## Ideas / later

- Hex grids.
- Snap to wall endpoints, path node editing with handles in the editor.
- Player-facing second window (GM vs player view).
- Texture library management, stamps/asset packs.
- Multi-level maps (floors).

## Log

- 2026-11-16 — Feature started; requirements and design written down.
