import { t } from 'elysia'

// ============================================================================
// Request Schemas (Elysia validation)
// ============================================================================

export const JiraCredentialsSchema = t.Object({
  jiraUrl: t.String({ minLength: 1 }),
  email: t.String({ format: 'email' }),
  apiToken: t.String({ minLength: 1 }),
})

export const WorklogPayloadSchema = t.Object({
  timeSpent: t.Optional(t.String()),
  timeSpentSeconds: t.Optional(t.Number({ minimum: 0 })),
  started: t.String(),
  comment: t.Optional(
    t.Object({
      type: t.Literal('doc'),
      version: t.Number(),
      content: t.Array(t.Any()),
    }),
  ),
})

// ============================================================================
// Core Types
// ============================================================================

export type JiraCredentials = typeof JiraCredentialsSchema.static
export type WorklogPayload = typeof WorklogPayloadSchema.static

export interface SessionInfo {
  createdAt: number
  lastAccessed: number
  age: number
  idleTime: number
}

export interface TaskSearchOptions {
  searchText?: string
  status?: string
}

// ============================================================================
// Jira API Types
// ============================================================================

export interface JiraUser {
  accountId: string
  displayName: string
  emailAddress?: string
}

export interface JiraIssue {
  key: string
  fields: {
    summary: string
    status?: { name: string; statusCategory?: { name: string; colorName: string } }
    issuetype?: { name: string; iconUrl: string }
    project?: { key: string; name: string }
    parent?: { key: string; fields?: { summary: string } }
    worklog?: {
      startAt: number
      maxResults: number
      total: number
      worklogs: JiraWorklogEntry[]
    }
  }
}

export interface JiraWorklogEntry {
  id: string
  author?: JiraUser
  timeSpent: string
  timeSpentSeconds: number
  started?: string
  comment?: { content?: Array<{ content?: Array<{ text?: string }> }> }
  created: string
  updated: string
}

// ============================================================================
// Response Types
// ============================================================================

export interface WorklogItem {
  id: string
  issueKey: string
  issueSummary: string
  projectKey: string | undefined
  author: string | undefined
  authorAccountId: string | undefined
  timeSpent: string
  timeSpentSeconds: number
  started: string
  comment: string
  created: string
  updated: string
}

export interface UserWorklogSummary {
  accountId: string
  displayName: string
  totalTimeSeconds: number
  issues: string[]
}

export interface EpicWorklogReport {
  totalIssues: number
  totalTimeSeconds: number
  users: UserWorklogSummary[]
}

export interface ActiveEpic {
  key: string
  summary: string
  issuesCount: number
}

// Monthly Report Types
export interface MonthlyIssueWorklog {
  issueKey: string
  issueSummary: string
  timeSpentSeconds: number
}

export interface MonthlyUserEpicWorklog {
  accountId: string
  displayName: string
  emailAddress?: string
  totalTimeSeconds: number
  issues: MonthlyIssueWorklog[]
}

export interface MonthlyEpicReport {
  epicKey: string
  epicSummary: string
  totalTimeSeconds: number
  users: MonthlyUserEpicWorklog[]
}

export interface MonthlyReport {
  startDate: string
  endDate: string
  totalTimeSeconds: number
  epics: MonthlyEpicReport[]
}

export type MeResponse =
  | { authenticated: false }
  | { authenticated: true; jiraUrl: string; email: string; sessionInfo: SessionInfo | null }
