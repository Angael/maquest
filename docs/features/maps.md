# Map maker — live feature note

Living document for the map maker. Keep it current: update **Status** and **Log** whenever map work lands, so the
feature can continue across conversations and agents. Branch for the first iteration: `feat/map-maker`.

## Requirements (from the author)

- [x] Export a map to SVG.
- [x] Maps can be placed on the canvas as nodes.
- [x] Layers; any object can be on several layers. Use case: "town before the battle" / "town after the battle" and a
      quick swap between them.
- [x] The map maker understands **walls** and **paths**:
  - [x] rooms, doors, curves, circles, rectangles, rotating them;
  - [x] boolean operators (a circle cuts out of / merges with what is under it);
  - [x] curves can be joined together.
- [x] Simple image placement.
- [x] Painting colors / textures underneath (terrain).
- [x] Light, vision and fog of war: drag player tokens through the map, the map reveals what they see.
- [x] Grid:
  - [x] customizable cell count;
  - [x] ruler: straight line, or "cells the cursor passed through", measured center to center;
  - [x] grid unit (e.g. D&D 2024 "5 ft", or "100 m") so the ruler reports real distances.

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

Phase 1 is implemented on branch `feat/map-maker`. All requirements above have a first working version.

| Area                                                                                                                     | State | Where                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------- |
| Schema, ids, layers helpers, `stringifyMap` (one object per line)                                                        | done  | `packages/core/src/map/schema.ts`                                                            |
| Geometry: flattening, booleans (`polygon-clipping`), door cuts, sight, fog merge, ruler math                             | done  | `packages/core/src/map/geometry.ts`                                                          |
| SVG renderer (editor, thumbnails, export), textures                                                                      | done  | `packages/core/src/map/render.ts`, `textures.ts`, `svg.ts`                                   |
| Batch ops + agent summaries (`applyMapOps`, `mapSummary`)                                                                | done  | `packages/core/src/map/ops.ts`                                                               |
| `map` node type, storage, rename/delete, undo history                                                                    | done  | `project.ts` (`readMap`/`writeMap`/`editMap`), `apps/desktop/src/main/history.ts`            |
| MCP `map` tool (read / edit / export)                                                                                    | done  | `packages/mcp/src/index.ts`                                                                  |
| Editor view: tool rail, tool options, viewport (pan/zoom, select, move, rotate, resize, point + handle editing, marquee) | done  | `apps/desktop/src/renderer/src/components/map/`                                              |
| Room/area shapes (rect, ellipse, polygon with curves, freehand), Alt = subtract                                          | done  | `MapViewport.tsx`                                                                            |
| Walls, paths, brush (color or texture), doors snapped to walls, images (pick or drop files), labels, lights, tokens      | done  | `MapViewport.tsx`                                                                            |
| Combine (bake) and join/close lines                                                                                      | done  | `MapPanel.tsx` → core `bakeObjects`/`joinObjects`                                            |
| Layers panel, exclusive groups with a swap control, "draw on layer"                                                      | done  | `MapPanel.tsx`                                                                               |
| Grid size, unit, diagonal rule, color/opacity, export px per cell                                                        | done  | `MapPanel.tsx`                                                                               |
| Ruler: cells walked (center to center) and straight line                                                                 | done  | `MapViewport.tsx`                                                                            |
| Fog of war, ambient light/dim/dark, darkvision, lights; GM / Players view                                                | done  | core `sight`, `MapViewport.tsx`                                                              |
| Canvas card thumbnail + inspector preview, Map tab in the title bar                                                      | done  | `MapThumb.tsx`, `StoryCard.tsx`                                                              |
| SVG export (menu: map only / with tokens / as players see it / no grid)                                                  | done  | `handlers.ts` `exportMapSvg`                                                                 |
| Tests                                                                                                                    | done  | `packages/core/src/map.test.ts`, `packages/mcp/src/server.test.ts`, `tests/e2e/maps.spec.ts` |

### Phase 2 (polish, branch `feat/map-polish`)

| Area                                                                                                                                                                                                  | Where                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Maps view (list: new, edit, play, rename, duplicate, delete) and one title-bar tab per open map                                                                                                       | `MapList.tsx`, `TopBar.tsx`, `store.ts` (`maps`, `openMap`, `closeMap`) |
| Maps section in the sidebar (click opens, middle click opens a background tab)                                                                                                                        | `Sidebar.tsx`                                                           |
| Project defaults for new maps (`maquest.json` → `maps`), editable in the Maps view, "Use for new maps" from a map; MCP `project` `maps`                                                               | core `MapDefaults`, `emptyMap`                                          |
| Panels split: floating selection inspector, scene panel (fog, tokens, layers, toggleable), Map settings popover (size, distances, grid, look)                                                         | `MapPanel.tsx`, `MapEditor.tsx`                                         |
| Number fields step from their value (↑/↓, Shift ×10, Alt ÷10), drag the label to scrub; radii shown in map units                                                                                      | `fields.tsx`                                                            |
| Eraser tool (E), right click / Esc cancels any drawing or drag                                                                                                                                        | `MapViewport.tsx`                                                       |
| Canvas handles: token size and vision/darkvision rings, light bright/dim rings, door ends, label size; double-click toggles doors                                                                     | `MapViewport.tsx`                                                       |
| Wall materials (`texture`), solid closed walls (`fill`: roofs, rock); textures brick, rock, shingles, thatch                                                                                          | core `schema.ts`, `render.ts`, `textures.ts`                            |
| Soft fog edge that lets players glimpse walls and 1.6 cells into solid structures they see the side of                                                                                                | core `render.ts` `fogOverlay`                                           |
| Vision: no boolean clipping in the visibility polygon (fixed blank sight at some positions), snapped retries for booleans, closed doors seal their whole cut (fixed light leaks next to angled doors) | core `geometry.ts`                                                      |

### Phase 3 (toolbar, branch `feat/map-toolbar`)

- Left rail in separate groups: pointer (select, pan, eraser), build (room, wall, door, light), paint (area, brush,
  path, image, label), measure (ruler). Build and paint hide while viewing as the players.
- Tool options open beside the active tool (a flyout), not along the top.
- Token dock (bottom): place a player character (K), enemy (X) or NPC (N), each with its own color and vision preset
  (`TOKEN_PRESETS` in `edit.ts`), and pick tokens. Light dock (bottom left): daylight / dim / dark, fog on/off, reset
  explored. Layers moved into a popover; the right panel is gone.
- Rooms: `op` `separate` keeps the room's own walls inside other rooms; `light` overrides the ambient light inside
  (core `lightZones`: zones by ambient and rooms, then lights; `Sight.dark`/`dusk` drive the shading); named rooms
  show their name in the middle for the GM.
- Snapping per tool (`snaps` in `mapStore.ts`): rooms, walls, doors and tokens snap to cells, lights to half cells;
  paint, paths, labels and images are free. Ctrl flips it. Moving snaps like the finest thing being moved.
- The GM sees (dimmed) and can grab things outside the map; a selection can be dragged by its box.
- A right press while dragging with the left button cancels (pointerdown never fires for a second button).
- The player window is gone: Play in the Maps view opens the map in the Players view in the same window.

### Known gaps (next candidates)

- No in-editor clipboard (copy/paste between maps); duplicate (Ctrl+D) only.
- Adding/removing single points on an existing path (only moving points and handles).
- Hex grids.
- Fog: no manual GM reveal/hide brush; explored fog is stored as polygons and can grow on very long sessions.
- Image objects do not block sight; no "wall from image" tracing.
- Per-structure floor/wall styles (today one floor and wall style per map; walls can override color/width).
- Undo for map edits uses the app-wide history (each commit is a step; token drags count too).

## Ideas / later

- Hex grids.
- Snap to wall endpoints, path node editing with handles in the editor.
- Texture library management, stamps/asset packs.
- Multi-level maps (floors).

## Log

- 2026-11-16 — Feature started; requirements and design written down.
- 2026-11-16 — Phase 1 implemented: core model + geometry + renderer, MCP `map` tool, editor view with all tools,
  layers, grid/ruler, fog of war, SVG export, canvas thumbnails, unit + MCP + e2e tests.
- 2026-11-16 — Phase 2: Maps view and map tabs, player window, project map defaults, panel split, eraser, canvas
  handles, wall materials and solid structures, soft fog glimpse, vision robustness and door leak fixes.
- 2026-11-16 — Phase 3: grouped tool rail with flyout options, token and light docks, token kinds, rooms with own
  walls and light, room names, per-tool snapping, off-map grabbing, player window replaced by Play.
