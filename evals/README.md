# issue-dial evals

The dial turns itself on only in a GitHub repo, and an eval run starts in an empty folder, so every case scaffolds a git repo whose origin is `example-org/example-repo`. Without `--scaffold` and the tool grant, every positive case fails silently with "called 0x".

    claude plugin eval . --scaffold --trust-plugin --allow-tools 'mcp__issue-dial__set_focus' -j 4

In the eval sandbox `gh` has no credentials, so each call answers "Refresh failed": these cases check the call and its arguments, not what the pane shows. The without-plugin arm cannot call the tool at all, so `mention-only` passing there proves nothing; that grader was shown to fail once on a prompt that does switch issues.
