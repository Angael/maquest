---
'@maquest/desktop': patch
---

Fixed the MCP server freezing when an agent nested a group inside another group whose content overlapped the group's current position. The group now goes into the first free spot in its parent.
