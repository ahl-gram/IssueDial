import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const ISSUES: Record<number, { title: string; state: string }> = {
  638: { title: 'Sub 3: the defect', state: 'OPEN' },
  727: { title: 'Em-dashes in comments', state: 'OPEN' },
  729: { title: 'Agent files stop pointing into memory', state: 'OPEN' },
  733: { title: 'Closed since RESUME-HERE was written', state: 'CLOSED' },
  764: { title: 'Rewrite the specs', state: 'OPEN' },
  765: { title: 'Close moot work', state: 'OPEN' },
  785: { title: 'Blind sleeps become settles', state: 'OPEN' },
  791: { title: 'The agent roster', state: 'OPEN' },
  801: { title: 'Lettering loads only when drawn', state: 'OPEN' },
}

const RESUME = '## Next steps, in order\n1. Pick (#638 continues; #727, #729, #733 are ready).\n'

function fakeRun(argv: readonly string[]): string {
  const joined = argv.join(' ')

  if (joined === 'git remote get-url origin') return 'https://github.com/octo/widgets.git\n'
  if (joined === 'git branch --show-current') return 'main\n'
  if (joined === 'git worktree list --porcelain') return 'worktree /v\nHEAD 1\n'
  if (argv[1] === 'api' && argv[2] === 'graphql') {
    const numbers = [...joined.matchAll(/number: (\d+)/g)].map(match => Number(match[1]))
    const repository = Object.fromEntries(
      numbers.map(number => [`i${number}`, ISSUES[number] ? { number, ...ISSUES[number] } : {}]),
    )

    return JSON.stringify({ data: { repository } })
  }

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
    scroll: { offset: 0, bodyRows: 8 },
    view: { kind: 'main' },
  },
} as const

function answer(on: Parameters<TestBody>[1]): string[] {
  const calls: string[] = []

  on('session.cwd', () => ({ value: '/v' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__issue-dial__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.read', () => ({ value: RESUME }))
  on('clock.now', () => ({ value: 1 }))
  on('process.run', (_$, e) => {
    calls.push(e.argv.join(' '))

    return { value: { exitCode: 0, stdout: fakeRun(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  return calls
}

const START = { cwd: '/v', surface: null, isInteractive: false } as const

test('one column draws the issue in hand bold between rules, next below, nothing above', async ($, on) => {
  const calls = answer(on)

  await $.session.start(START)
  const answered = await $.tool.call({ tool: 'mcp__issue-dial__set_focus', columns: [{ current: 638, next: [] }] } as never)

  expect(JSON.stringify(answered)).toContain('now Issue #638 (from session), next Issue #727, Issue #729.')
  expect(calls.filter(call => call.startsWith('gh ')).every(call => call.startsWith('gh api graphql'))).toBe(true)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface } as never)
    const texts = (await ui.findAll({ type: 'Text' })).filter(found => found.text.includes('Issue #'))

    expect(texts.map(found => /#(\d+)/.exec(found.text)?.[1])).toEqual(['638', '727', '729'])
    expect(texts[0]?.props.bold).toBe(true)
    expect(texts.map(found => found.props.color)).toEqual(['#2da44e', '#2da44e', '#529465'])
    expect(await ui.find({ key: 'column-0' })).toBeDefined()
    expect(await ui.find({ key: 'column-1' })).toBe(undefined)
    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    await ui.unmount()
  }
})

test('two lanes draw two columns side by side, each its own issue in hand and its own next', async ($, on) => {
  answer(on)

  await $.session.start(START)
  const answered = await $.tool.call({
    tool: 'mcp__issue-dial__set_focus',
    columns: [
      { current: 801, next: [785, 764] },
      { current: 764, next: [765, 801] },
    ],
  } as never)

  expect(JSON.stringify(answered)).toContain(
    'now Issue #801 (from session), next Issue #785; now Issue #764 (from session), next Issue #765.',
  )

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  const bold = (await ui.findAll({ type: 'Text' })).filter(found => found.props.bold === true)

  expect(bold.map(found => /#(\d+)/.exec(found.text)?.[1])).toEqual(['801', '764'])
  expect(await ui.find({ key: 'column-1' })).toBeDefined()
  expect(await ui.find({ key: 'column-2' })).toBe(undefined)
  await ui.unmount()
})

test('three columns fit a narrow pane with short labels that keep the number', async ($, on) => {
  answer(on)

  await $.session.start(START)
  await $.tool.call({
    tool: 'mcp__issue-dial__set_focus',
    columns: [
      { current: 801, next: [785] },
      { current: 764, next: [765] },
      { current: 638, next: [791] },
      { current: 727, next: [] },
    ],
  } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 40 } } as never)
  const bold = (await ui.findAll({ type: 'Text' })).filter(found => found.props.bold === true)

  expect(bold.map(found => found.text.split(' ')[0])).toEqual(['#801', '#764', '#638'])
  expect(await ui.find({ key: 'column-3' })).toBe(undefined)
  await ui.unmount()
})

test('empty columns hand the dial back to the branch and the plan file', async ($, on) => {
  answer(on)

  await $.session.start(START)
  await $.tool.call({ tool: 'mcp__issue-dial__set_focus', columns: [{ current: 801, next: [] }] } as never)
  const answered = await $.tool.call({ tool: 'mcp__issue-dial__set_focus', columns: [] } as never)

  expect(JSON.stringify(answered)).toContain('now none (from nothing), next Issue #638, Issue #727, Issue #729.')
})

test('when gh fails the pane says so instead of going blank', async ($, on) => {
  on('session.cwd', () => ({ value: '/v' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__issue-dial__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.read', () => ({ value: RESUME }))
  on('process.run', (_$, e) =>
    e.argv[0] === 'git'
      ? { value: { exitCode: 0, stdout: fakeRun(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      : { value: { exitCode: 4, stdout: '', stderr: 'gh auth login', isStdoutTruncated: false, isStderrTruncated: false } },
  )

  await $.session.start(START)

  await $.tool.call({ tool: 'mcp__issue-dial__set_focus', columns: [] } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)

  expect(texts).toContain('Nothing in hand')
  expect(texts.some(text => text.includes('gh auth login'))).toBe(true)
  await ui.unmount()
})
