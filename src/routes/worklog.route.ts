import { WorklogController } from '@/controllers'
import type { CookieRecord } from '@/lib/cookie'
import { WorklogPayloadSchema } from '@/types'
import { Elysia, t } from 'elysia'

const DatePattern = '^\\d{4}-\\d{2}-\\d{2}$'

export const worklogRoutes = new Elysia({ prefix: '/worklog' })
  .post(
    '/',
    ({ body, cookie }) =>
      WorklogController.create(cookie as CookieRecord, body.taskId, body.payload),
    {
      body: t.Object({
        taskId: t.String({ minLength: 1 }),
        payload: WorklogPayloadSchema,
      }),
      detail: { summary: 'Create worklog', tags: ['Worklog'] },
    },
  )
  .put(
    '/',
    ({ body, cookie }) =>
      WorklogController.update(cookie as CookieRecord, body.issueKey, body.worklogId, body.payload),
    {
      body: t.Object({
        issueKey: t.String({ minLength: 1 }),
        worklogId: t.String({ minLength: 1 }),
        payload: WorklogPayloadSchema,
      }),
      detail: { summary: 'Update worklog', tags: ['Worklog'] },
    },
  )
  .delete(
    '/',
    ({ body, cookie }) =>
      WorklogController.remove(cookie as CookieRecord, body.issueKey, body.worklogId),
    {
      body: t.Object({
        issueKey: t.String({ minLength: 1 }),
        worklogId: t.String({ minLength: 1 }),
      }),
      detail: { summary: 'Delete worklog', tags: ['Worklog'] },
    },
  )
  .post(
    '/history',
    ({ body, cookie }) =>
      WorklogController.getHistory(cookie as CookieRecord, body.startDate, body.endDate),
    {
      body: t.Object({
        startDate: t.String({ pattern: DatePattern }),
        endDate: t.String({ pattern: DatePattern }),
      }),
      detail: { summary: 'Get worklog history', tags: ['Worklog'] },
    },
  )
  .post(
    '/epic-report',
    ({ body, cookie }) => WorklogController.getEpicReport(cookie as CookieRecord, body.epicKey),
    {
      body: t.Object({ epicKey: t.String({ minLength: 1 }) }),
      detail: { summary: 'Get Epic worklog report', tags: ['Worklog'] },
    },
  )
  .post(
    '/active-epics',
    ({ body, cookie }) =>
      WorklogController.getActiveEpics(cookie as CookieRecord, body.startDate, body.endDate),
    {
      body: t.Object({
        startDate: t.String({ pattern: DatePattern }),
        endDate: t.String({ pattern: DatePattern }),
      }),
      detail: { summary: 'Get Active Epics', tags: ['Worklog'] },
    },
  )
