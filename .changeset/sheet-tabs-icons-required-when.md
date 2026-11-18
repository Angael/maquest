---
'@maquest/desktop': minor
---

Sheets are easier to discover and say more:

- A type's tabs now show on every node of that type, even before the node has text for them. Any node, including a plain location or note, has an "Add tab" button that adds the tab to all nodes of its type (or only to this node) and links to the type's sheet settings.
- Fields can have an `icon` (a lucide icon name), shown next to their label in stats, meters, toggles, text lines and blocks.
- Fields can have `requiredWhen` (`{ kind: "Spell" }`), which makes them required only when other values match. In records, the condition reads the same record, so a spell without a level is reported.
- A record with no text of its own now shows its library node's full description on the sheet, not just the summary.
- New checks: `record-undescribed` reports records with no description and no library text. `field-duplicates-records` reports text fields that repeat a records group, such as a "Spells" text next to spell records.
