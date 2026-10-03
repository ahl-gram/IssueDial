import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Dial, Focus, IssueRow } from '../types'
import {
  buildWheel,
  drumIndent,
  fadeOf,
  fadedColor,
  issueFromBranch,
  latestCompleted,
  mainWorktree,
  isAllowed,
  nextStepsNumbers,
  repoFromRemote,
  upcoming,
} from './logic'
import type { GhIssue, Repo } from './logic'

const PANE = 'issue-dial'
const TITLE = 'Issue dial'
const TOOL = 'set_focus'
const GITHUB_EVERY_MS = 5 * 60_000
const CLOSED_SAMPLE = 50
const PANE_ROWS = 12
const CLOSED_PURPLE = '#8957e5'
const OPEN_GREEN = '#2da44e'

const EMPTY: Dial = {
  past: [],
  current: null,
  next: [],
  currentFrom: null,
  nextFrom: null,
  error: null,
  refreshedAt: null,
}

const dial = atom({ plugin: 'issue-dial', key: 'dial' } as const, EMPTY)
const focus = atom({ plugin: 'issue-dial', key: 'focus' } as const, { current: null, next: [] } as Focus)

type Known = { title: string; isOpen: boolean }

type Setup = { repo: Repo; planFile: string; planHeading: string }

let setup: Setup | null = null
let closed: IssueRow[] | null = null
const known = new Map<number, Known>()

async function run($: EngineInterface, argv: string[], cwd?: string): Promise<string> {
  const { exitCode, stdout, stderr } = await $.process.run(argv, { cwd, timeoutMs: 20_000 })

  if (exitCode !== 0) {
    throw new Error(`${argv.slice(0, 2).join(' ')} exited ${exitCode}: ${stderr.trim().slice(0, 120)}`)
  }

  return stdout
}

async function readOr($: EngineInterface, path: string, fallback: string): Promise<string> {
  try {
    return await $.fs.read(path)
  } catch {
    return fallback
  }
}

async function fetchClosed($: EngineInterface, repo: Repo): Promise<IssueRow[]> {
  const path = `repos/${repo.owner}/${repo.name}/issues?state=closed&sort=updated&direction=desc&per_page=${CLOSED_SAMPLE}`

  return latestCompleted(JSON.parse(await run($, ['gh', 'api', path])) as GhIssue[])
}

async function learn($: EngineInterface, repo: Repo, numbers: readonly number[], isFresh: boolean): Promise<void> {
  const wanted = [...new Set(numbers)].filter(number => isFresh || !known.has(number))

  if (wanted.length === 0) {
    return
  }

  const fields = wanted
    .map(number => `i${number}: issueOrPullRequest(number: ${number}) { ... on Issue { number title state } }`)
    .join(' ')
  const query = `{ repository(owner: "${repo.owner}", name: "${repo.name}") { ${fields} } }`
  const reply = JSON.parse(await run($, ['gh', 'api', 'graphql', '-f', `query=${query}`])) as {
    data: { repository: Record<string, { number?: number; title?: string; state?: string } | null> }
  }

  for (const found of Object.values(reply.data.repository)) {
    if (found?.number !== undefined && found.title !== undefined) {
      known.set(found.number, { title: found.title, isOpen: found.state === 'OPEN' })
    }
  }
}

function rowOf(number: number): IssueRow {
  return { number, title: known.get(number)?.title ?? '(not an issue in this repo)' }
}

async function refresh($: EngineInterface, isFresh: boolean): Promise<void> {
  if (setup === null) {
    return
  }

  const { repo, planFile, planHeading } = setup

  try {
    const cwd = await $.session.cwd()
    const branch = await run($, ['git', 'branch', '--show-current'], cwd)
    const root = mainWorktree(await run($, ['git', 'worktree', 'list', '--porcelain'], cwd)) ?? cwd
    const plan = await readOr($, `${root}/${planFile}`, '')
    const held = await read($, focus)

    if (isFresh || closed === null) {
      closed = await fetchClosed($, repo)
    }

    const fromBranch = issueFromBranch(branch)
    const currentNumber = fromBranch ?? held.current
    const planned = held.next.length > 0 ? held.next : nextStepsNumbers(plan, planHeading)
    const past = closed
    const nextNumbers = upcoming(planned, [...past.map(row => row.number), ...(currentNumber === null ? [] : [currentNumber])])

    await learn($, repo, [...(currentNumber === null ? [] : [currentNumber]), ...nextNumbers], isFresh)

    const next = nextNumbers.filter(number => known.get(number)?.isOpen === true).map(rowOf)
    const refreshedAt = await $.clock.now()

    await update($, dial, (): Dial => ({
      past,
      current: currentNumber === null ? null : rowOf(currentNumber),
      next,
      currentFrom: fromBranch !== null ? 'branch' : held.current !== null ? 'session' : null,
      nextFrom: held.next.length > 0 ? 'session' : planned.length > 0 ? 'plan' : null,
      error: null,
      refreshedAt,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, dial, (previous): Dial => ({ ...previous, error: message }))
  }
}

function soon($: EngineInterface, isFresh: boolean): void {
  $.clock.after(0, () => void refresh($, isFresh))
}

async function githubRepo($: EngineInterface): Promise<Repo | null> {
  try {
    return repoFromRemote(await run($, ['git', 'remote', 'get-url', 'origin'], await $.session.cwd()))
  } catch {
    return null
  }
}

export const register: Register = (on, options) => {
  const repos = Array.isArray(options.repos) ? options.repos : []
  const planFile = typeof options.planFile === 'string' ? options.planFile : ''
  const planHeading = typeof options.planHeading === 'string' ? options.planHeading : ''

  on('session.start', async ($, e, next) => {
    const repo = await githubRepo($)
    setup = repo !== null && isAllowed(repo, repos) ? { repo, planFile, planHeading } : null

    if (setup !== null) {
      await $.command.register({ name: 'issue-dial', description: 'Show the issue dial: recently closed, in hand, next up' })
      await $.tool.register({
        name: TOOL,
        description:
          `Updates the user's issue-dial pane with the GitHub issue now being worked on in this repo and the issues suggested next, as this conversation has settled them. Call it when the issue in hand changes or when a next issue is agreed. \`current\` null and \`next\` empty hands both back to the branch name and ${planFile}.`,
        inputSchema: {
          type: 'object',
          properties: {
            current: { type: ['integer', 'null'], description: 'The issue number now being worked on, or null.' },
            next: { type: 'array', items: { type: 'integer' }, maxItems: 5, description: 'Suggested next issue numbers, most likely first.' },
          },
          required: ['current', 'next'],
        },
      })
      void $.ui.open({ id: PANE, title: TITLE, rows: PANE_ROWS })
      soon($, true)
      $.clock.every(GITHUB_EVERY_MS, () => void refresh($, true))
    }

    return next(e)
  })

  on('command.run', { command: 'issue-dial' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, rows: PANE_ROWS })
    soon($, true)

    return { text: 'Issue dial opened.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (setup !== null && e.agentId === undefined) {
      soon($, false)
    }

    return done
  })

  on('tool.call', { tool: /^mcp__issue-dial__set_focus$/ }, async ($, e) => {
    const input = e as unknown as { current?: unknown; next?: unknown }
    const current = Number.isInteger(input.current) ? (input.current as number) : null
    const next = Array.isArray(input.next) ? input.next.filter((n): n is number => Number.isInteger(n)).slice(0, 5) : []

    await update($, focus, () => ({ current, next }))
    await refresh($, false)

    const shown = await read($, dial)
    const named = (row: IssueRow | null) => (row === null ? 'none' : `Issue #${row.number}`)

    return {
      result: `Issue dial: now ${named(shown.current)} (from ${shown.currentFrom ?? 'nothing'}), next ${shown.next.map(named).join(', ') || 'none'}.${shown.error ? ` Refresh failed: ${shown.error}` : ''}`,
    }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    if (setup === null) {
      return composed
    }

    return {
      sections: [
        ...composed.sections,
        {
          id: 'issue-dial:focus',
          scope: 'session',
          text: `The user keeps an issue-dial pane open for ${setup.repo.owner}/${setup.repo.name}. When the issue in hand changes, or you and the user settle what comes next, call mcp__issue-dial__${TOOL} so it stays true. The branch name already sets the current issue while on an issue branch.`,
        },
      ],
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const state = await read($, dial)
    const width = Math.max(10, e.props.bodyColumns)
    const rule = '─'.repeat(width)
    const label = (row: IssueRow) => `Issue #${row.number}  ${row.title}`

    const wheel = buildWheel(state.past, state.current, state.next).map(slot => {
      const fade = fadeOf(slot.distance)

      if (fade === 'center') {
        return (
          <Box key="now" flexDirection="column">
            <Text dimColor>{rule}</Text>
            <Text bold color={slot.row === null ? undefined : OPEN_GREEN} wrap="truncate-end">
              {slot.row === null ? 'Nothing in hand' : label(slot.row)}
            </Text>
            <Text dimColor>{rule}</Text>
          </Box>
        )
      }

      return (
        <Text
          key={`${slot.kind}-${slot.distance}`}
          color={fadedColor(slot.kind === 'past' ? CLOSED_PURPLE : OPEN_GREEN, slot.distance)}
          wrap="truncate-end"
        >
          {drumIndent(slot.distance)}
          {slot.row === null ? '' : label(slot.row)}
        </Text>
      )
    })

    const sources = `now: ${state.currentFrom ?? 'none'} · next: ${state.nextFrom === 'plan' ? planFile : (state.nextFrom ?? 'none')}`

    return (
      <Box flexDirection="column">
        {state.refreshedAt === null && state.error === null && <Text dimColor>Reading the issues…</Text>}
        {state.past.length === 0 && state.refreshedAt !== null && <Text dimColor>No closed issues found.</Text>}
        {wheel}
        {state.next.length === 0 && state.refreshedAt !== null && <Text dimColor>Nothing queued next.</Text>}
        <Box>
          <Text dimColor wrap="truncate-end">
            {sources}{' '}
          </Text>
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => refresh($, true)} />
        </Box>
        {state.error !== null && (
          <Text color="red" wrap="truncate-end">
            {state.error}
          </Text>
        )}
      </Box>
    )
  })
}
