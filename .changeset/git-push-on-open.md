---
'@maquest/desktop': minor
---

Opening a project in a git repository now also pushes your local commits to the upstream branch when that is a plain fast-forward (after the safe pull, nothing on the remote is missing locally). A toast reports whether the push succeeded or why it failed.
