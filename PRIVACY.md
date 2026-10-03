# issue-dial privacy policy

Effective 2026-10-03.

issue-dial is a Claude Code mod that runs on your own machine. Its author runs no server for it and receives nothing from it: no analytics, no telemetry, no crash reports.

## What it reads on your machine

- Three read-only `git` commands in the session's folder: the `origin` remote, the current branch, and the worktree list (to find the main checkout).
- One file, the plan file you configure (by default `RESUME-HERE.md` at the main checkout's root), if it exists.

## What it sends to GitHub

Through your own signed-in GitHub CLI (`gh`), and only in a repo where the dial is turned on, it reads from `api.github.com`:

- the repo's 50 most recently closed issues, at session start, every five minutes, and when you press Refresh
- the title and state of the issue numbers shown on the dial

These requests are read-only and carry your own GitHub credentials, so GitHub's own privacy statement covers them. The mod never writes to GitHub.

## What reaches Claude

- One sentence added to Claude's system prompt, naming the repo as `owner/name`.
- The reply of its `set_focus` tool, which lists issue numbers.

These become part of your Claude Code conversation, handled like everything else in it. Issue titles stay in the pane and are not sent to Claude.

## Questions

Open an issue at https://github.com/ahl-gram/IssueDial/issues.
