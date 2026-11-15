---
'@maquest/core': minor
'@maquest/mcp': minor
'@maquest/desktop': minor
---

Sheets are now defined entirely by each project; Maquest no longer knows any game system.

- Types list their **fields** (`types.<id>.fields`) with a widget each: text (with choices), subtitle, quote, stat, toggle, meter (bar, ring, dots, boxes, progress clock), scores (grid, bars, radar chart, dots, optional modifier), pairs, tags, list, refs and table. Meters, ratings and toggles can be set with a click.
- **Tabs** come in three kinds: `fields` tabs (listed fields or titled sections), `prose` and `cards` (body sections). Fields no tab shows appear as properties under the title. Types can `extend` another type and `omit` fields.
- Node data lives in one place, `fields:`, which now holds numbers, lists and maps too. Old `stats:` are read as fields and saved that way on the next write.
- Checks: `field-missing`, `field-invalid` (shape, choices, range), `field-alias` (a value under another name, with a fix) and `broken-ref` replace the statblock rules; `shared-ability` is now `shared-card`. Invalid type definitions are reported instead of breaking the project.
- Removed: statblock presets (`dnd-2024`, `pf2e`, …), `systems`, per-node `system`, the `abilities` tab kind (now `cards`, only where configured) and the built-in list of ability heading names and library type ids. A config that still has `systems` is reported with how to move it.
