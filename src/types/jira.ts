import { t } from 'elysia'

// ============================================================================
// Request Body Schemas (for Elysia validation)
// ============================================================================

/**
 * Base credentials schema for Jira authentication
 */
export const JiraCredentialsSchema = t.Object({
  jiraUrl: t.String({
    minLength: 1,
    description: 'Jira instance URL (e.g., https://company.atlassian.net)',
  }),
  email: t.String({
    format: 'email',
    description: 'Jira account email',
  }),
  apiToken: t.String({
    minLength: 1,
    description: 'Jira API token',
  }),
})

/**
 * Worklog payload matching Jira API v3 format
 */
export const WorklogPayloadSchema = t.Object({
  timeSpent: t.Optional(
    t.String({ description: 'Time spent in Jira format (e.g., "1h 30m")' })
  ),
  timeSpentSeconds: t.Optional(
    t.Number({ minimum: 0, description: 'Time spent in seconds' })
  ),
  started: t.String({ description: 'ISO 8601 datetime when work started' }),
  comment: t.Optional(
    t.Object({
      type: t.Literal('doc'),
      version: t.Number(),
      content: t.Array(t.Any()),
    })
  ),
})

// ============================================================================
// TypeScript Types (derived from schemas)
// ============================================================================

export type JiraCredentials = typeof JiraCredentialsSchema.static
export type WorklogPayload = typeof WorklogPayloadSchema.static

// ============================================================================
// Response/Data Types
// ============================================================================

/**
 * Worklog item returned from history endpoint
 */
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

/**
 * Jira Issue from search results
 */
export interface JiraIssue {
  key: string
  fields: {
    summary: string
    status?: {
      name: string
      statusCategory?: {
        name: string
        colorName: string
      }
    }
    issuetype?: {
      name: string
      iconUrl: string
    }
    project?: {
      key: string
      name: string
    }
  }
}

/**
 * Jira API error response
 */
export interface JiraApiError {
  errorMessages?: string[]
  errors?: Record<string, string>
}
