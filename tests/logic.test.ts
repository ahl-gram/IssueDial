import { expect, test } from 'claude-code/testing'

import {
  MAX_COLUMNS,
  buildWheel,
  columnsOf,
  heldColumns,
  fadeOf,
  fadedColor,
  isAllowed,
  issueFromBranch,
  mainWorktree,
  nextStepsNumbers,
  repoFromRemote,
  upcoming,
} from '../hooks/logic'

test('the issue in hand comes from a type/number-slug branch', async () => {
  expect(issueFromBranch('feat/668-nav-trail')).toBe(668)
  expect(issueFromBranch('chore/675-issue-pr-prefix-lint\n')).toBe(675)
  expect(issueFromBranch('638-trail')).toBe(638)
  expect(issueFromBranch('main')).toBe(null)
  expect(issueFromBranch('chore/agent-prompt-audit-fixes')).toBe(null)
  expect(issueFromBranch('worktree-fix+621-launch')).toBe(null)
})

test('next issues are the Next steps section, in order, without PR numbers', async () => {
  const resume = [
    '## Feature status',
    '- ready: **Issue #727**',
    '',
    '## Next steps, in order',
    '1. Pick the next lanes (#638 continues the epic; #727, #729, #733 are ready).',
    '2. Rebase PR #739, then #638 again.',
    '',
    '## Try it',
    'Issue #999',
  ].join('\n')

  expect(nextStepsNumbers(resume, 'Next steps')).toEqual([638, 727, 729, 733])
  expect(nextStepsNumbers('# no sections here #12', 'Next steps')).toEqual([])
})

test('next issues can come from a section with another heading', async () => {
  const plan = ['## Next steps', '1. #1', '', '## Up next', '- #42 then #57, after PR #9', '', '## Later', '#99'].join('\n')

  expect(nextStepsNumbers(plan, 'Up next')).toEqual([42, 57])
  expect(nextStepsNumbers(plan, 'up NEXT')).toEqual([42, 57])
  expect(nextStepsNumbers(plan, 'Missing')).toEqual([])
})

test('a GitHub origin names its owner and repo, whatever its URL form', async () => {
  expect(repoFromRemote('https://github.com/octo/widgets.git\n')).toEqual({ owner: 'octo', name: 'widgets' })
  expect(repoFromRemote('https://github.com/octo/widgets')).toEqual({ owner: 'octo', name: 'widgets' })
  expect(repoFromRemote('git@github.com:octo/my.widgets.git')).toEqual({ owner: 'octo', name: 'my.widgets' })
  expect(repoFromRemote('ssh://git@github.com/octo/widgets.git')).toEqual({ owner: 'octo', name: 'widgets' })
  expect(repoFromRemote('https://gitlab.com/octo/widgets.git')).toBe(null)
  expect(repoFromRemote('https://github.com.evil.example/octo/widgets.git')).toBe(null)
  expect(repoFromRemote('')).toBe(null)
})

test('an empty repo list allows every repo, a listed one only those, ignoring case', async () => {
  const repo = { owner: 'Octo', name: 'Widgets' }

  expect(isAllowed(repo, [])).toBe(true)
  expect(isAllowed(repo, ['octo/widgets'])).toBe(true)
  expect(isAllowed(repo, [' octo/widgets '])).toBe(true)
  expect(isAllowed(repo, ['octo/gadgets', 'other/widgets'])).toBe(false)
})

test('the main checkout is the first worktree listed', async () => {
  const porcelain = 'worktree /a/repo\nHEAD 1\nbranch refs/heads/main\n\nworktree /a/repo/.claude/worktrees/x\n'

  expect(mainWorktree(porcelain)).toBe('/a/repo')
  expect(mainWorktree('')).toBe(null)
})

test('next drops every column\'s issue in hand', async () => {
  expect(upcoming([638, 727, 668, 729], [668, 675, 638])).toEqual([727, 729])
})

test('the columns are the ones the session set, at most three, else one from the branch and the plan; a lone column with no next takes the plan', async () => {
  const set = [
    { current: 801, next: [391, 785] },
    { current: 764, next: [765] },
  ]
  const four = [...set, { current: 1, next: [] }, { current: 2, next: [] }]

  expect(columnsOf(set, 42, [57])).toEqual(set)
  expect(columnsOf(four, null, []).map(column => column.current)).toEqual([801, 764, 1])
  expect(MAX_COLUMNS).toBe(3)
  expect(columnsOf([], 42, [57, 63])).toEqual([{ current: 42, next: [57, 63] }])
  expect(columnsOf([], null, [])).toEqual([{ current: null, next: [] }])
  expect(columnsOf([{ current: 42, next: [] }], null, [57])).toEqual([{ current: 42, next: [57] }])
  expect(columnsOf([{ current: 42, next: [] }, { current: 7, next: [8] }], null, [57])).toEqual([
    { current: 42, next: [] },
    { current: 7, next: [8] },
  ])
})

test('a focus saved before columns existed reads as no columns', async () => {
  expect(heldColumns({ current: 801, next: [764] })).toEqual([])
  expect(heldColumns(undefined)).toEqual([])
  expect(heldColumns({ columns: [{ current: 801, next: [785] }] })).toEqual([{ current: 801, next: [785] }])
})

test('a column reads the issue in hand at the top, nearest next first, and nothing above it', async () => {
  const row = (number: number) => ({ number, title: `t${number}` })
  const wheel = buildWheel(row(638), [row(727), row(729), row(733), row(1)])

  expect(wheel.map(slot => [slot.kind, slot.row?.number, slot.distance])).toEqual([
    ['current', 638, 0],
    ['next', 727, 1],
    ['next', 729, 2],
    ['next', 733, 3],
  ])
  expect(buildWheel(null, [])).toEqual([{ kind: 'current', distance: 0, row: null }])
  expect([0, 1, 2, 3].map(fadeOf)).toEqual(['center', 'near', 'far', 'far'])
})

test('a row fades by blending its color toward middle gray, keeping the hue', async () => {
  expect([0, 1, 2, 3].map(distance => fadedColor('#8957e5', distance))).toEqual([
    '#8957e5',
    '#8957e5',
    '#8569b8',
    '#83749e',
  ])
  expect([1, 2, 3].map(distance => fadedColor('#2da44e', distance))).toEqual(['#2da44e', '#529465', '#678b71'])
})
