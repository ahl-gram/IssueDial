import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const ISSUES: Record<number, { title: string; state: string }> = {
  42: { title: 'The issue in hand', state: 'OPEN' },
  57: { title: 'Planned next', state: 'OPEN' },
}

const PANE = {
  plugin: 'issue-dial',
  component: 'Pane',
  requestId: 'issue-dial',
  props: {
    title: 'Issue dial',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 12 },
    view: { kind: 'main' },
  },
} as const

type Fake = { calls: string[]; reads: string[]; tools: string[] }

function fake(on: Parameters<TestBody>[1], origin: string, plan = ''): Fake {
  const seen: Fake = { calls: [], reads: [], tools: [] }

  on('session.cwd', () => ({ value: '/w' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('prompt.compose', () => ({ sections: [] }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.register', (_$, e) => {
    seen.tools.push(e.name)

    return { value: { tool: `mcp__issue-dial__${e.name}` } }
  })
  on('clock.now', () => ({ value: 1 }))
  on('fs.read', (_$, e) => {
    seen.reads.push((e as unknown as { path: string }).path)

    return { value: plan }
  })
  on('process.run', (_$, e) => {
    const joined = e.argv.join(' ')
    seen.calls.push(joined)
    const ok = (stdout: string) => ({
      value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })

    if (joined === 'git remote get-url origin') return ok(`${origin}\n`)
    if (joined === 'git branch --show-current') return ok('main\n')
    if (joined === 'git worktree list --porcelain') return ok('worktree /w\nHEAD 1\n')
    if (e.argv[1] === 'api' && e.argv[2] === 'graphql') {
      const numbers = [...joined.matchAll(/number: (\d+)/g)].map(match => Number(match[1]))
      const repository = Object.fromEntries(numbers.map(n => [`i${n}`, ISSUES[n] ? { number: n, ...ISSUES[n] } : {}]))

      return ok(JSON.stringify({ data: { repository } }))
    }
    if (e.argv[1] === 'api') return ok('[]')

    throw new Error(`unexpected ${joined}`)
  })

  return seen
}

const START = { cwd: '/w', surface: null, isInteractive: false } as const

const COMPOSE = {
  model: 'test-model',
  promptModel: 'test-model',
  surfaces: [],
  tools: [],
  outputStyle: null,
  traits: [],
  sections: [],
} as const

async function focusText($: Parameters<TestBody>[0]): Promise<string | undefined> {
  const composed = await $.prompt.compose(COMPOSE)

  return composed.sections.find(section => section.id === 'issue-dial:focus')?.text
}

test('with no repo list the dial turns on in any GitHub repo and reads that repo', async ($, on) => {
  const seen = fake(on, 'git@github.com:octo/widgets.git')

  await $.session.start(START)
  const text = await focusText($)

  expect(text).toContain('mcp__issue-dial__set_focus')
  expect(text).not.toMatch(/Alex|Vellum/)
  expect(seen.tools).toEqual(['set_focus'])

  await $.tool.call({ tool: 'mcp__issue-dial__set_focus', current: 42, next: [] } as never)

  expect(seen.calls.some(call => call.includes('repos/octo/widgets/issues'))).toBe(true)
  expect(seen.calls.some(call => call.includes('owner: "octo", name: "widgets"'))).toBe(true)
  expect(seen.calls.some(call => call.includes('Vellum'))).toBe(false)
})

test('a repo off the list leaves the dial off', { options: { repos: ['octo/gadgets'] } }, async ($, on) => {
  const seen = fake(on, 'https://github.com/octo/widgets.git')

  await $.session.start(START)

  expect(await focusText($)).toBe(undefined)
  expect(seen.tools).toEqual([])
  expect(seen.calls.some(call => call.startsWith('gh '))).toBe(false)
})

test('a repo on the list turns the dial on', { options: { repos: ['Octo/Widgets'] } }, async ($, on) => {
  fake(on, 'https://github.com/octo/widgets.git')

  await $.session.start(START)

  expect(await focusText($)).toContain('mcp__issue-dial__set_focus')
})

test('a remote that is not GitHub leaves the dial off', async ($, on) => {
  const seen = fake(on, 'https://gitlab.com/octo/widgets.git')

  await $.session.start(START)

  expect(await focusText($)).toBe(undefined)
  expect(seen.tools).toEqual([])
})

test(
  'the plan file and its heading come from the options',
  { options: { planFile: 'PLAN.md', planHeading: 'Up next' } },
  async ($, on) => {
    const seen = fake(on, 'https://github.com/octo/widgets.git', '## Next steps\n#99\n\n## Up next\n1. #57\n')

    await $.session.start(START)
    const answered = await $.tool.call({ tool: 'mcp__issue-dial__set_focus', current: 42, next: [] } as never)

    expect(seen.reads).toContain('/w/PLAN.md')
    expect(JSON.stringify(answered)).toContain('now Issue #42 (from session), next Issue #57.')

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
    const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)

    expect(texts.some(text => text.includes('next: PLAN.md'))).toBe(true)
    await ui.unmount()
  },
)
