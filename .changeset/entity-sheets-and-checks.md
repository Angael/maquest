---
'@maquest/desktop': minor
---

Entity sheets and Maquest checks.

- Characters, monsters and other entities can have a statblock from any game system (D&D 2024, Pathfinder 2e, OSR, Blades in the Dark, Call of Cthulhu, generic, or one the project defines or extends). Statblocks render as a proper sheet with key facts, score grids and chips, are edited through a form generated from the system, and their key stats show as chips on canvas cards.
- A node's `# Headings` become tabs next to the statblock, in the order its type defines. Ability tabs show each ability as a small card, grouped by `##` headings (Actions, Reactions, 1/day, Level 2 spells…); hovering a card shows the full text, clicking keeps it open.
- Rules library types (e.g. Spells): ability cards with the same name show the library node's text, so shared rules text lives in one place.
- New Problems menu in the title bar: Maquest checks the project as it changes (broken links and connections, nodes on no board, empty groups, missing or malformed statblocks, stats kept in fields, copied rules text, overlong documents, too few clues…) and lists each issue with where, why and what to do, quick fixes and "ignore for this node". Rules are configurable per project, including custom checks.
- Agents get the same checks: a summary in `overview`, the full report with `overview({ checks: true })`, and the issues of the nodes they just wrote. They can set statblocks, systems, tabs and check rules through the existing tools.
