import { Elysia, t } from 'elysia'
import { JiraService } from '@/services'
import { getCredentialsFromCookie } from '@/middleware'
import { WorklogPayloadSchema } from '@/types'
import type { CookieRecord } from '@/lib/cookie'

/**
 * Worklog management routes (requires authentication)
 */
export const worklogRoutes = new Elysia({ prefix: '/worklog' })
  /**
   * Create a new worklog entry
   */
  .post(
    '/',
    async ({ body, cookie }) => {
      const credentials = getCredentialsFromCookie(cookie as CookieRecord)
      const { taskId, payload } = body
      return JiraService.createWorklog(credentials, taskId, payload)
    },
    {
      body: t.Object({
        taskId: t.String({ minLength: 1 }),
        payload: WorklogPayloadSchema,
      }),
      detail: {
        summary: 'Create worklog',
        description: 'Create a new worklog entry for a Jira issue',
        tags: ['Worklog'],
      },
    }
  )

  /**
   * Update an existing worklog
   */
  .put(
    '/',
    async ({ body, cookie }) => {
      const credentials = getCredentialsFromCookie(cookie as CookieRecord)
      const { issueKey, worklogId, payload } = body
      return JiraService.updateWorklog(credentials, issueKey, worklogId, payload)
    },
    {
      body: t.Object({
        issueKey: t.String({ minLength: 1 }),
        worklogId: t.String({ minLength: 1 }),
        payload: WorklogPayloadSchema,
      }),
      detail: {
        summary: 'Update worklog',
        description: 'Update an existing worklog entry',
        tags: ['Worklog'],
      },
    }
  )

  /**
   * Delete a worklog
   */
  .delete(
    '/',
    async ({ body, cookie }) => {
      const credentials = getCredentialsFromCookie(cookie as CookieRecord)
      const { issueKey, worklogId } = body
      return JiraService.deleteWorklog(credentials, issueKey, worklogId)
    },
    {
      body: t.Object({
        issueKey: t.String({ minLength: 1 }),
        worklogId: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: 'Delete worklog',
        description: 'Delete a worklog entry',
        tags: ['Worklog'],
      },
    }
  )

  /**
   * Get worklog history for a date range
   */
  .post(
    '/history',
    async ({ body, cookie }) => {
      const credentials = getCredentialsFromCookie(cookie as CookieRecord)
      const { startDate, endDate } = body
      return JiraService.getWorklogHistory(credentials, startDate, endDate)
    },
    {
      body: t.Object({
        startDate: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
        endDate: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
      }),
      detail: {
        summary: 'Get worklog history',
        description: 'Get all worklogs for the current user within a date range',
        tags: ['Worklog'],
      },
    }
  )
