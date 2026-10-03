export type IssueRow = { number: number; title: string }

export type CurrentSource = 'branch' | 'session' | null

export type NextSource = 'session' | 'resume' | null

export type Dial = {
  past: IssueRow[]
  current: IssueRow | null
  next: IssueRow[]
  currentFrom: CurrentSource
  nextFrom: NextSource
  error: string | null
  refreshedAt: number | null
}

export type Focus = { current: number | null; next: number[] }

declare module 'claude-code' {
  interface PluginState {
    'issue-dial': { dial: Dial; focus: Focus }
  }
}
