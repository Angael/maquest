---
'@maquest/desktop': minor
---

Make large story rewrites easier for agents: `find` accepts several terms and shows the matching lines, `write` supports targeted find-and-replace `edits`, renaming ids with `newId` (links, connections, children and boards follow) and placing existing nodes on `boards`, and `delete` reports dangling `[[links]]` or hands everything over with `replaceWith`. Ids from titles with letters like `ł` or `ß` are now transliterated instead of cut, and agent config files are only rewritten when they change and are git-ignored in projects.
