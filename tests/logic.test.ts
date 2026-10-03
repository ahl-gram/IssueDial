import { expect, test } from 'claude-code/testing'

import {
  buildWheel,
  fadeOf,
  fadedColor,
  issueFromBranch,
  latestCompleted,
  mainWorktree,
  nextStepsNumbers,
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
    '1. Alex picks the next lanes (#638 continues the epic; #727, #729, #733 are ready).',
    '2. Rebase PR #739, then #638 again.',
    '',
    '## Try it',
    'Issue #999',
  ].join('\n')

  expect(nextStepsNumbers(resume)).toEqual([638, 727, 729, 733])
  expect(nextStepsNumbers('# no sections here #12')).toEqual([])
})

test('the main checkout is the first worktree listed', async () => {
  const porcelain = 'worktree /a/Vellum\nHEAD 1\nbranch refs/heads/main\n\nworktree /a/Vellum/.claude/worktrees/x\n'

  expect(mainWorktree(porcelain)).toBe('/a/Vellum')
  expect(mainWorktree('')).toBe(null)
})

test('past is the three most recently closed-as-completed issues, by close date', async () => {
  const issues = [
    { number: 1, title: 'old but just commented', state: 'closed', state_reason: 'completed', closed_at: '2026-09-01T00:00:00Z' },
    { number: 2, title: 'pr', state: 'closed', state_reason: null, closed_at: '2026-10-03T09:00:00Z', pull_request: {} },
    { number: 3, title: 'dropped', state: 'closed', state_reason: 'not_planned', closed_at: '2026-10-03T08:00:00Z' },
    { number: 4, title: 'c', state: 'closed', state_reason: 'completed', closed_at: '2026-10-02T00:00:00Z' },
    { number: 5, title: 'a', state: 'closed', state_reason: 'completed', closed_at: '2026-10-03T07:00:00Z' },
    { number: 6, title: 'b', state: 'closed', state_reason: 'completed', closed_at: '2026-10-03T06:00:00Z' },
  ]

  expect(latestCompleted(issues).map(row => row.number)).toEqual([5, 6, 4])
})

test('next drops the issue in hand and anything already closed above it', async () => {
  expect(upcoming([638, 727, 668, 729], [668, 675, 638])).toEqual([727, 729])
})

test('the wheel reads oldest past at the top, now in the middle, nearest next first', async () => {
  const row = (number: number) => ({ number, title: `t${number}` })
  const wheel = buildWheel([row(668), row(675), row(621), row(1)], row(638), [row(727), row(729)])

  expect(wheel.map(slot => [slot.kind, slot.row?.number, slot.distance])).toEqual([
    ['past', 621, 3],
    ['past', 675, 2],
    ['past', 668, 1],
    ['current', 638, 0],
    ['next', 727, 1],
    ['next', 729, 2],
  ])
  expect(buildWheel([], null, [])).toEqual([{ kind: 'current', distance: 0, row: null }])
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
