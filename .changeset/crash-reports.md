---
'@maquest/desktop': patch
---

Maquest no longer fails silently. A project that can’t be opened on launch no longer stops the app from starting: the start screen explains what went wrong, and unreadable projects stay in Recent with a warning. Crashes in the window, the main process or during startup show the error instead of a blank or missing window, with a “Copy prompt for your agent” button that has your agent report the problem on GitHub and propose a fix. Errors are also written to a log file.
