# issue-dial

A Claude Code mod that keeps a small pane open beside your session, showing where you are in a GitHub repo's issues:

- **above**, the three issues most recently closed as completed, fading with age
- **in the middle**, the issue in hand, bold between two rules
- **below**, up to three open issues suggested next

Claude keeps it current. The mod gives Claude a `set_focus` tool and one line in its system prompt asking it to call that tool when the issue in hand changes or when the two of you agree what comes next.

## Where the numbers come from

| Slot | Source, first match wins |
|---|---|
| In hand | the branch name (`123-slug` or `feat/123-slug`), then what Claude last set |
| Next | what Claude last set, then the issue numbers in the plan section of your plan file |
| Closed | `gh api`, refreshed every five minutes and on the pane's Refresh button |

The plan file is optional. By default the dial reads `RESUME-HERE.md` at the root of the main checkout and takes every `#123` under the `## Next steps` heading, skipping `PR #123`. A missing file just means nothing is queued until Claude sets it.

## What it runs, and what leaves your machine

**Programs.** The mod runs five commands, all through one helper (`run()` in `hooks/register.tsx`), in the session's folder, each with a 20 second timeout:

| Command | Why |
|---|---|
| `git remote get-url origin` | at session start, to learn the repo's `owner/name` and decide whether the dial turns on |
| `git branch --show-current` | to take the issue in hand from a branch like `123-slug` |
| `git worktree list --porcelain` | to find the main checkout, where the plan file lives |
| `gh api repos/<owner>/<name>/issues?state=closed&sort=updated&direction=desc&per_page=50` | the recently closed issues for the top of the dial |
| `gh api graphql -f query=<query>` | one read-only query for the number, title and state of each issue on the dial: `{ repository(owner: "<owner>", name: "<name>") { i42: issueOrPullRequest(number: 42) { ... on Issue { number title state } } } }`, one `iN` entry per issue |

`<owner>`, `<name>` and the issue numbers are the only parts filled in at run time. It runs nothing else.

**Where data goes.** The only destination is `api.github.com`, through your own signed-in `gh`, and only in a repo where the dial is on: at session start, every five minutes and on Refresh, plus a title lookup after one of Claude's turns when the dial shows an issue it has not looked up yet. The requests carry the repo's `owner/name` and the issue numbers on the dial, which come from the branch name, the plan section of the plan file, or Claude's `set_focus` calls. Nothing else read locally is sent: not the rest of the plan file, not other files, not your conversation.

**Conversation.** The mod hooks `turn.complete` only to refresh the dial when one of Claude's own turns ends (not a subagent's). It reads no conversation text. It adds one sentence to Claude's system prompt naming the repo as `owner/name`, and its tool's replies list issue numbers. Issue titles stay in the pane.

**The one tool it answers.** The mod registers its own tool, `set_focus` (Claude sees it as `mcp__issue-dial__set_focus`), and serves it from a `tool.call` hook matched to that tool's name alone. That is how a mod implements a tool it registers; no other tool's calls reach the hook.

The privacy policy is [PRIVACY.md](PRIVACY.md).

## Requirements

- A Claude Code build with mods (tested on 2.1.288)
- `git`, and the GitHub CLI signed in (`gh auth login`)
- A repo whose `origin` is on github.com (https or ssh)

## Install

```
claude plugin marketplace add ahl-gram/IssueDial
claude plugin install issue-dial@issue-dial
```

The pane opens by itself in a terminal at least 144 columns wide. In a narrower one, type `/issue-dial` to open it.

## Options

Set them with `claude plugin configure issue-dial@issue-dial`, or in a session under `/plugin`, **Installed**, **Configure options**.

| Option | Default | What it does |
|---|---|---|
| `repos` | empty | The repos the dial turns on in, each as `owner/name` (case does not matter). Empty turns it on in every GitHub repo. |
| `planFile` | `RESUME-HERE.md` | The file, at the main checkout's root, whose plan section lists the issues to suggest next. |
| `planHeading` | `Next steps` | The text a `## ` heading starts with to begin the plan section. |

Outside a listed repo, or outside GitHub, the mod adds nothing: no tool, no prompt line, no pane.

## Development

```
claude plugin test .                               # unit and pane tests
claude plugin validate .claude-plugin/plugin.json  # the plugin manifest and hooks
claude plugin validate .                           # the marketplace manifest
```

To type-check, load the mod once (`claude --plugin-dir .`) so Claude Code writes `.claude-plugin/types/`, then run `tsc -p . --noEmit`. The eval suite and the command that runs it are in [evals/README.md](evals/README.md).

## License

MIT, see [LICENSE](LICENSE).
