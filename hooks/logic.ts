import type { ColumnFocus, IssueRow } from '../types'

export type Fade = 'center' | 'near' | 'far'

export type WheelRow = {
  kind: 'current' | 'next'
  distance: number
  row: IssueRow | null
}

export const REACH = 3

export const MAX_COLUMNS = 3

export type Repo = { owner: string; name: string }

const GITHUB_REMOTE =
  /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com(?::\d+)?\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/

export function repoFromRemote(url: string): Repo | null {
  const [, owner, name] = GITHUB_REMOTE.exec(url.trim()) ?? []

  return owner && name ? { owner, name } : null
}

export function repoList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(/[\s,]+/)
  }

  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

export function isAllowed(repo: Repo, repos: readonly string[]): boolean {
  const listed = repos.map(entry => entry.trim().toLowerCase()).filter(entry => entry !== '')

  return listed.length === 0 || listed.includes(`${repo.owner}/${repo.name}`.toLowerCase())
}

export function issueFromBranch(branch: string): number | null {
  const match = /^(?:[\w.-]+\/)?(\d+)(?:-|$)/.exec(branch.trim())

  return match ? Number(match[1]) : null
}

export function nextStepsNumbers(plan: string, heading: string): number[] {
  const wanted = heading.trim().toLowerCase()
  const lines = plan.split('\n')
  const start = lines.findIndex(line => /^##\s/.test(line) && line.replace(/^##\s+/, '').toLowerCase().startsWith(wanted))

  if (start === -1) {
    return []
  }

  const rest = lines.slice(start + 1)
  const end = rest.findIndex(line => /^##\s/.test(line))
  const section = (end === -1 ? rest : rest.slice(0, end)).join('\n')
  const numbers = [...section.matchAll(/(?<!PR )#(\d+)/g)].map(match => Number(match[1]))

  return [...new Set(numbers)]
}

export function mainWorktree(porcelain: string): string | null {
  const first = porcelain.split('\n').find(line => line.startsWith('worktree '))

  return first ? first.slice('worktree '.length) : null
}

export function upcoming(numbers: readonly number[], exclude: readonly number[]): number[] {
  return numbers.filter(number => !exclude.includes(number))
}

export function heldColumns(focus: unknown): ColumnFocus[] {
  const columns = (focus as { columns?: unknown } | undefined)?.columns

  return Array.isArray(columns) ? (columns as ColumnFocus[]) : []
}

export function usesPlan(held: readonly ColumnFocus[]): boolean {
  return held.length === 0 || (held.length === 1 && held[0]?.next.length === 0)
}

export function columnsOf(held: readonly ColumnFocus[], fromBranch: number | null, planned: readonly number[]): ColumnFocus[] {
  if (held.length === 0) {
    return [{ current: fromBranch, next: [...planned] }]
  }

  return held.slice(0, MAX_COLUMNS).map(column => (usesPlan(held) ? { ...column, next: [...planned] } : column))
}

export function buildWheel(current: IssueRow | null, next: readonly IssueRow[]): WheelRow[] {
  const below = next.slice(0, REACH).map((row, index): WheelRow => ({ kind: 'next', distance: index + 1, row }))

  return [{ kind: 'current', distance: 0, row: current }, ...below]
}

export function fadeOf(distance: number): Fade {
  if (distance === 0) {
    return 'center'
  }

  return distance === 1 ? 'near' : 'far'
}

const MIDDLE_GRAY = 128
const FADE_BY_DISTANCE = [0, 0, 0.45, 0.7]

export function fadedColor(hex: string, distance: number): string {
  const amount = FADE_BY_DISTANCE[Math.min(distance, FADE_BY_DISTANCE.length - 1)] ?? 0
  const channels = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16))

  return `#${channels
    .map(channel => Math.round(channel + (MIDDLE_GRAY - channel) * amount).toString(16).padStart(2, '0'))
    .join('')}`
}

export function drumIndent(distance: number): string {
  return ' '.repeat(Math.max(0, distance - 1))
}

