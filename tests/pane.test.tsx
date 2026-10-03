import { expect, test } from 'claude-code/testing'

const CLOSED = [
  { number: 668, title: 'Sub 2: The trail', state: 'closed', state_reason: 'completed', closed_at: '2026-10-03T17:00:00Z' },
  { number: 739, title: 'a PR', state: 'closed', closed_at: '2026-10-03T18:00:00Z', pull_request: {} },
  { number: 675, title: 'Move the source guards', state: 'closed', state_reason: 'completed', closed_at: '2026-10-03T05:00:00Z' },
  { number: 621, title: 'e2e launch retry', state: 'closed', state_reason: 'completed', closed_at: '2026-10-03T04:00:00Z' },
  { number: 687, title: 'start gate', state: 'closed', state_reason: 'completed', closed_at: '2026-10-03T00:00:00Z' },
]

const ISSUES: Record<number, { title: string; state: string }> = {
  638: { title: 'Sub 3: the defect', state: 'OPEN' },
  727: { title: 'Em-dashes in comments', state: 'OPEN' },
  729: { title: 'Agent files stop pointing into memory', state: 'OPEN' },
  733: { title: 'Closed since RESUME-HERE was written', state: 'CLOSED' },
}

const RESUME = '## Next steps, in order\n1. Alex picks (#638 continues; #727, #729, #733 are ready).\n'

function fakeRun(argv: readonly string[]): string {
  const joined = argv.join(' ')

  if (joined === 'git branch --show-current') return 'main\n'
  if (joined === 'git worktree list --porcelain') return 'worktree /v\nHEAD 1\n'
  if (argv[1] === 'api' && argv[2] === 'graphql') {
    const numbers = [...joined.matchAll(/number: (\d+)/g)].map(match => Number(match[1]))
    const repository = Object.fromEntries(
      numbers.map(number => [`i${number}`, ISSUES[number] ? { number, ...ISSUES[number] } : {}]),
    )

    return JSON.stringify({ data: { repository } })
  }
  if (argv[1] === 'api') return JSON.stringify(CLOSED)

  throw new Error(`unexpected ${joined}`)
}

const PANE = {
  plugin: 'issue-dial',
  component: 'Pane',
  requestId: 'issue-dial',
  props: {
    title: 'Issue dial',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 12 },
    view: { kind: 'main' },
  },
} as const

test('the dial draws past above, the issue in hand bold between rules, next below', async ($, on) => {
  on('session.cwd', () => ({ value: '/v' }))
  on('fs.read', () => ({ value: RESUME }))
  on('clock.now', () => ({ value: 1 }))
  on('process.run', (_$, e) => ({
    value: { exitCode: 0, stdout: fakeRun(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  const answered = await $.tool.call({ tool: 'mcp__issue-dial__set_focus', current: 638, next: [] } as never)

  expect(JSON.stringify(answered)).toContain('now Issue #638 (from session), next Issue #727, Issue #729.')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface } as never)
    const texts = (await ui.findAll({ type: 'Text' })).filter(found => found.text.includes('Issue #'))

    expect(texts.map(found => /#(\d+)/.exec(found.text)?.[1])).toEqual(['621', '675', '668', '638', '727', '729'])
    expect(texts[3]?.props.bold).toBe(true)
    expect(texts.some(found => found.props.dimColor === true)).toBe(false)
    expect(texts.map(found => found.props.color)).toEqual([
      '#83749e',
      '#8569b8',
      '#8957e5',
      '#2da44e',
      '#2da44e',
      '#529465',
    ])
    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    await ui.unmount()
  }
})

test('with no git or gh the pane says so instead of going blank', async ($, on) => {
  on('session.cwd', () => ({ value: '/v' }))
  on('process.run', () => ({
    value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  await $.tool.call({ tool: 'mcp__issue-dial__set_focus', current: null, next: [] } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)

  expect(texts).toContain('Nothing in hand')
  expect(texts.some(text => text.includes('not a git repository'))).toBe(true)
  await ui.unmount()
})
