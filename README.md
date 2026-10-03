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

## Data and privacy

The mod runs on your machine and its author receives nothing from it. In a repo where the dial is on, it reads three things from `git` and your plan file locally, and calls GitHub's API through your own signed-in `gh`: read-only requests for the recently closed issues and the titles of the issues on the dial. Claude sees one prompt sentence naming the repo and the tool's replies, which list issue numbers; issue titles stay in the pane. The details are in [PRIVACY.md](PRIVACY.md).

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
