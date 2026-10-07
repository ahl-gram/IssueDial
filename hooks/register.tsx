import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Column, ColumnFocus, Dial, Focus, IssueRow } from '../types'
import {
  MAX_COLUMNS,
  buildWheel,
  columnsOf,
  drumIndent,
  fadeOf,
  fadedColor,
  heldColumns,
  issueFromBranch,
  mainWorktree,
  isAllowed,
  nextStepsNumbers,
  repoFromRemote,
  repoList,
  upcoming,
  usesPlan,
} from './logic'
import type { Repo } from './logic'

const PANE = 'issue-dial'
const TITLE = 'Issue dial'
const TOOL = 'set_focus'
const GITHUB_EVERY_MS = 5 * 60_000
const PANE_ROWS = 8
const COLUMN_GAP = 2
const OPEN_GREEN = '#2da44e'
const NO_COLUMN: Column = { current: null, next: [] }

const EMPTY: Dial = {
  columns: [],
  currentFrom: null,
  nextFrom: null,
  error: null,
  refreshedAt: null,
}

const dial = atom({ plugin: 'issue-dial', key: 'dial' } as const, EMPTY)
const focus = atom({ plugin: 'issue-dial', key: 'focus' } as const, { columns: [] } as Focus)

type Known = { title: string; isOpen: boolean }

type Setup = { repo: Repo; planFile: string; planHeading: string }

let setup: Setup | null = null
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
    const held = heldColumns(await read($, focus))
    const fromBranch = issueFromBranch(branch)
    const planned = nextStepsNumbers(plan, planHeading)
    const columns = columnsOf(held, fromBranch, planned)
    const inHand = columns.flatMap(column => (column.current === null ? [] : [column.current]))
    const nexts = columns.map(column => upcoming(column.next, inHand))

    await learn($, repo, [...inHand, ...nexts.flat()], isFresh)

    const refreshedAt = await $.clock.now()
    const fromPlan = usesPlan(held)

    await update($, dial, (): Dial => ({
      columns: columns.map((column, index) => ({
        current: column.current === null ? null : rowOf(column.current),
        next: (nexts[index] ?? []).filter(number => known.get(number)?.isOpen === true).map(rowOf),
      })),
      currentFrom: held.length > 0 ? 'session' : fromBranch !== null ? 'branch' : null,
      nextFrom: !fromPlan ? 'session' : planned.length > 0 ? 'plan' : null,
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
  const repos = repoList(options.repos)
  const planFile = typeof options.planFile === 'string' ? options.planFile : ''
  const planHeading = typeof options.planHeading === 'string' ? options.planHeading : ''

  on('session.start', async ($, e, next) => {
    const repo = await githubRepo($)
    setup = repo !== null && isAllowed(repo, repos) ? { repo, planFile, planHeading } : null

    if (setup !== null) {
      await $.command.register({ name: 'issue-dial', description: 'Show the issue dial: each issue in hand and what could follow it' })
      await $.tool.register({
        name: TOOL,
        description:
          `Updates the user's issue-dial pane: one column per issue being worked on in this repo at the same time (up to ${MAX_COLUMNS}, e.g. one per parallel lane), each with the issue in hand and the issues suggested to follow it. Choose each column's \`next\` the way you would suggest parallel pairings: open issues that could follow that column's issue without colliding with what the other columns have in hand, most likely first. Call it when an issue in hand changes, a lane starts or ends, or what comes next is agreed. \`columns\` empty hands the dial back to the branch name and ${planFile}.`,
        inputSchema: {
          type: 'object',
          properties: {
            columns: {
              type: 'array',
              maxItems: MAX_COLUMNS,
              description: 'One entry per issue in hand, in the order to show them left to right.',
              items: {
                type: 'object',
                properties: {
                  current: { type: ['integer', 'null'], description: 'The issue number this column has in hand, or null.' },
                  next: { type: 'array', items: { type: 'integer' }, maxItems: 5, description: 'Issue numbers that could follow it, most likely first.' },
                },
                required: ['current', 'next'],
              },
            },
          },
          required: ['columns'],
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

  on('tool.call', { tool: 'mcp__issue-dial__set_focus' }, async ($, e) => {
    const input = e as unknown as { columns?: unknown }
    const columns = (Array.isArray(input.columns) ? input.columns : []).slice(0, MAX_COLUMNS).map((column: unknown): ColumnFocus => {
      const { current, next } = (column ?? {}) as { current?: unknown; next?: unknown }

      return {
        current: Number.isInteger(current) ? (current as number) : null,
        next: Array.isArray(next) ? next.filter((n): n is number => Number.isInteger(n)).slice(0, 5) : [],
      }
    })

    await update($, focus, () => ({ columns }))
    await refresh($, false)

    const shown = await read($, dial)
    const named = (row: IssueRow | null) => (row === null ? 'none' : `Issue #${row.number}`)

    const said = (shown.columns.length > 0 ? shown.columns : [NO_COLUMN])
      .map(column => `now ${named(column.current)} (from ${shown.currentFrom ?? 'nothing'}), next ${column.next.map(named).join(', ') || 'none'}`)
      .join('; ')

    return {
      result: `Issue dial: ${said}.${shown.error ? ` Refresh failed: ${shown.error}` : ''}`,
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
          text: `The user keeps an issue-dial pane open for ${setup.repo.owner}/${setup.repo.name}: up to ${MAX_COLUMNS} columns, one per issue in hand (one per parallel lane), each with the issues that could follow it. When an issue in hand changes, a lane starts or ends, or you and the user settle what comes next, call mcp__issue-dial__${TOOL} so it stays true, choosing each column's next issues the way you would suggest parallel pairings. With no columns set, the branch name sets the issue in hand.`,
        },
      ],
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const state = await read($, dial)
    const shown = state.columns.length > 0 ? state.columns : [NO_COLUMN]
    const width = Math.max(10, e.props.bodyColumns)
    const columnWidth = Math.max(4, Math.floor((width - COLUMN_GAP * (shown.length - 1)) / shown.length))
    const rule = '─'.repeat(columnWidth)
    const label = (row: IssueRow) => (shown.length === 1 ? `Issue #${row.number}  ${row.title}` : `#${row.number} ${row.title}`)

    const columns = shown.map((column, index) => (
      <Box key={`column-${index}`} flexDirection="column" width={columnWidth}>
        {buildWheel(column.current, column.next).map(slot =>
          fadeOf(slot.distance) === 'center' ? (
            <Box key="now" flexDirection="column">
              <Text dimColor>{rule}</Text>
              <Text bold color={slot.row === null ? undefined : OPEN_GREEN} wrap="truncate-end">
                {slot.row === null ? 'Nothing in hand' : label(slot.row)}
              </Text>
              <Text dimColor>{rule}</Text>
            </Box>
          ) : (
            <Text key={`next-${slot.distance}`} color={fadedColor(OPEN_GREEN, slot.distance)} wrap="truncate-end">
              {drumIndent(slot.distance)}
              {slot.row === null ? '' : label(slot.row)}
            </Text>
          ),
        )}
        {column.next.length === 0 && state.refreshedAt !== null && (
          <Text dimColor wrap="truncate-end">
            Nothing queued next.
          </Text>
        )}
      </Box>
    ))

    const sources = `now: ${state.currentFrom ?? 'none'} · next: ${state.nextFrom === 'plan' ? planFile : (state.nextFrom ?? 'none')}`

    return (
      <Box flexDirection="column">
        {state.refreshedAt === null && state.error === null && <Text dimColor>Reading the issues…</Text>}
        <Box flexDirection="row" columnGap={COLUMN_GAP}>
          {columns}
        </Box>
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
