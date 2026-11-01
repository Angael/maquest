---
'@maquest/desktop': minor
---

Opening a project that lives in a git repository now pulls the latest changes from its upstream branch when that is conflict-free (a fast-forward, or a merge git proves clean), and shows a toast when the project was updated. Local edits that would be overwritten, conflicting history, in-progress git operations, offline remotes and missing credentials are detected and reported instead of touching your files.
