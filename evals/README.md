# issue-dial evals

The mod switches itself off outside a Vellum clone, so every case scaffolds a git repo with the Vellum origin. Without `--scaffold` and the tool grant, every positive case fails silently with "called 0x".

    claude plugin eval ~/.claude/skills/issue-dial --scaffold --trust-plugin --allow-tools 'mcp__issue-dial__set_focus' -j 4

In the sandbox `gh` has no credentials, so each call answers "Refresh failed": these cases check the call and its arguments, not what the pane shows.
