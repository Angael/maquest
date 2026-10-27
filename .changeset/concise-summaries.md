---
'@maquest/core': patch
'@maquest/mcp': patch
'@maquest/desktop': patch
---

Keep node titles and summaries short. Agents are told to write one-sentence summaries (under 160 characters) with full wording in the body, and `write` now returns a warning for long summaries or titles cut off with "…" instead of rejecting them. The Inspector's summary field wraps to show the whole text, and hovering a card's summary shows it in full.
