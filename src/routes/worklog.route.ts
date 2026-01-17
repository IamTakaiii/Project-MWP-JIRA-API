import { Elysia, t } from 'elysia'
import { WorklogPayloadSchema } from '@/types'
import type { CookieRecord } from '@/lib/cookie'
import { WorklogController } from '@/controllers'

const controller = new WorklogController()

export const worklogRoutes = new Elysia({ prefix: '/worklog' })
  .post(
    '/',
    async ({ body, cookie }) => {
      const { taskId, payload } = body
      return controller.create(cookie as CookieRecord, taskId, payload)
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
  .put(
    '/',
    async ({ body, cookie }) => {
      const { issueKey, worklogId, payload } = body
      return controller.update(cookie as CookieRecord, issueKey, worklogId, payload)
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
  .delete(
    '/',
    async ({ body, cookie }) => {
      const { issueKey, worklogId } = body
      return controller.delete(cookie as CookieRecord, issueKey, worklogId)
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
  .post(
    '/history',
    async ({ body, cookie }) => {
      const { startDate, endDate } = body
      return controller.getHistory(cookie as CookieRecord, startDate, endDate)
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
