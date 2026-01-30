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
  .post(
    '/export/history',
    async ({ body, cookie, set }) => {
      const buffer = await WorklogController.exportHistoryExcel(
        cookie as CookieRecord,
        body.startDate,
        body.endDate,
      )
      set.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      set.headers['Content-Disposition'] = `attachment; filename="worklog-${body.startDate}-${body.endDate}.xlsx"`
      return buffer
    },
    {
      body: t.Object({
        startDate: t.String({ pattern: DatePattern }),
        endDate: t.String({ pattern: DatePattern }),
      }),
      detail: { summary: 'Export worklog history to Excel', tags: ['Export'] },
    },
  )
  .post(
    '/export/epic-report',
    async ({ body, cookie, set }) => {
      const buffer = await WorklogController.exportEpicReportExcel(
        cookie as CookieRecord,
        body.epicKey,
      )
      set.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      set.headers['Content-Disposition'] = `attachment; filename="epic-report-${body.epicKey}.xlsx"`
      return buffer
    },
    {
      body: t.Object({ epicKey: t.String({ minLength: 1 }) }),
      detail: { summary: 'Export Epic report to Excel', tags: ['Export'] },
    },
  )
  .post(
    '/export/active-epics',
    async ({ body, cookie, set }) => {
      const buffer = await WorklogController.exportActiveEpicsExcel(
        cookie as CookieRecord,
        body.startDate,
        body.endDate,
      )
      set.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      set.headers['Content-Disposition'] = `attachment; filename="active-epics-${body.startDate}-${body.endDate}.xlsx"`
      return buffer
    },
    {
      body: t.Object({
        startDate: t.String({ pattern: DatePattern }),
        endDate: t.String({ pattern: DatePattern }),
      }),
      detail: { summary: 'Export active epics to Excel', tags: ['Export'] },
    },
  )
  .post(
    '/monthly-report',
    ({ body, cookie }) =>
      WorklogController.getMonthlyReport(cookie as CookieRecord, body.startDate, body.endDate),
    {
      body: t.Object({
        startDate: t.String({ pattern: DatePattern }),
        endDate: t.String({ pattern: DatePattern }),
      }),
      detail: { summary: 'Get monthly worklog report', tags: ['Report'] },
    },
  )
  .post(
    '/export/monthly-report',
    async ({ body, cookie, set }) => {
      const buffer = await WorklogController.exportMonthlyReportExcel(
        cookie as CookieRecord,
        body.startDate,
        body.endDate,
      )
      set.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      set.headers['Content-Disposition'] = `attachment; filename="monthly-report-${body.startDate}-${body.endDate}.xlsx"`
      return buffer
    },
    {
      body: t.Object({
        startDate: t.String({ pattern: DatePattern }),
        endDate: t.String({ pattern: DatePattern }),
      }),
      detail: { summary: 'Export monthly report to Excel', tags: ['Export'] },
    },
  )
  .post(
    '/monthly-report-by-project',
    ({ body, cookie }) =>
      WorklogController.getMonthlyReportByProject(cookie as CookieRecord, body.projectKey, body.startDate, body.endDate),
    {
      body: t.Object({
        projectKey: t.String({ minLength: 1 }),
        startDate: t.String({ pattern: DatePattern }),
        endDate: t.String({ pattern: DatePattern }),
      }),
      detail: { summary: 'Get monthly report by project', tags: ['Report'] },
    },
  )
  .post(
    '/monthly-report-by-board',
    ({ body, cookie }) =>
      WorklogController.getMonthlyReportByBoard(cookie as CookieRecord, body.boardId, body.startDate, body.endDate),
    {
      body: t.Object({
        boardId: t.Number(),
        startDate: t.String({ pattern: DatePattern }),
        endDate: t.String({ pattern: DatePattern }),
      }),
      detail: { summary: 'Get monthly report by board', tags: ['Report'] },
    },
  )
  .post(
    '/export/monthly-report-by-project',
    async ({ body, cookie, set }) => {
      const buffer = await WorklogController.exportMonthlyReportByProjectExcel(
        cookie as CookieRecord,
        body.projectKey,
        body.startDate,
        body.endDate,
      )
      set.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      set.headers['Content-Disposition'] = `attachment; filename="monthly-report-${body.projectKey}-${body.startDate}-${body.endDate}.xlsx"`
      return buffer
    },
    {
      body: t.Object({
        projectKey: t.String({ minLength: 1 }),
        startDate: t.String({ pattern: DatePattern }),
        endDate: t.String({ pattern: DatePattern }),
      }),
      detail: { summary: 'Export monthly report by project to Excel', tags: ['Export'] },
    },
  )
  .get(
    '/projects',
    ({ cookie }) => WorklogController.getMyProjects(cookie as CookieRecord),
    {
      detail: { summary: 'Get user projects', tags: ['Project'] },
    },
  )
  .get(
    '/boards',
    ({ cookie }) => WorklogController.getBoards(cookie as CookieRecord),
    {
      detail: { summary: 'Get boards', tags: ['Board'] },
    },
  )
  .post(
    '/export/monthly-report-by-board',
    async ({ body, cookie, set }) => {
      const buffer = await WorklogController.exportMonthlyReportByBoardExcel(
        cookie as CookieRecord,
        body.boardId,
        body.startDate,
        body.endDate,
      )
      set.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      set.headers['Content-Disposition'] = `attachment; filename="monthly-report-board-${body.boardId}-${body.startDate}-${body.endDate}.xlsx"`
      return buffer
    },
    {
      body: t.Object({
        boardId: t.Number(),
        startDate: t.String({ pattern: DatePattern }),
        endDate: t.String({ pattern: DatePattern }),
      }),
      detail: { summary: 'Export monthly report by board to Excel', tags: ['Export'] },
    },
  )
