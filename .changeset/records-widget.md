---
'@maquest/core': minor
'@maquest/mcp': minor
'@maquest/desktop': minor
---

Records replace cards tabs: abilities, spells, moves and inventory are now a project-defined `records` field instead of markdown parsed by Maquest.

- A `records` field holds `[{ name, text, … }]`; its `item` is the schema of one record (fields with any other widget), and `field-invalid` reports records that miss required keys, have keys the item doesn't define, or values that don't fit.
- The sheet lists records grouped by an item field (`groupBy`, ordered by its options) with group filters and a search that marks matches; each record shows its facts as chips and its full description. `style: "cards"` shows tiles that open on hover. Toggles and small meters in records (uses, prepared) set with a click, and the form edits, adds, moves and removes records.
- Records named like a library node, or `[[id]]`, link to it and show its text on hover; `shared-card` is now `shared-record`.
- Custom checks scoped to a fields tab read its fields, records as `## Group` and `- **Name** (facts) — text` lines; a fields tab with values counts for `require.tabs`.
- The `cards` tab kind is gone: setting one is refused, and a hand-written one reads as prose and is reported with how to move it to records.
