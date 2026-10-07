export type IssueRow = { number: number; title: string }

export type CurrentSource = 'branch' | 'session' | null

export type NextSource = 'session' | 'plan' | null

export type Column = { current: IssueRow | null; next: IssueRow[] }

export type Dial = {
  columns: Column[]
  currentFrom: CurrentSource
  nextFrom: NextSource
  error: string | null
  refreshedAt: number | null
}

export type ColumnFocus = { current: number | null; next: number[] }

export type Focus = { columns: ColumnFocus[] }

declare module 'claude-code' {
  interface PluginState {
    'issue-dial': { dial: Dial; focus: Focus }
  }
}
