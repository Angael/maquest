---
'@maquest/desktop': patch
---

Syncing with the git remote now commits uncommitted changes in the project folder (such as new live notes) before pulling, so they are pushed instead of left behind. Changes outside the project folder and gitignored files are left untouched.
