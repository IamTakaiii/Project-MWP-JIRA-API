import { TaskController } from '@/controllers'
import type { CookieRecord } from '@/lib/cookie'
import { Elysia, t } from 'elysia'

export const tasksRoutes = new Elysia({ prefix: '/my-tasks' }).post(
  '/',
  ({ body, cookie }) => {
    const options = {
      ...(body.searchText && { searchText: body.searchText }),
      ...(body.status && { status: body.status }),
    }
    return TaskController.searchMyTasks(cookie as CookieRecord, options)
  },
  {
    body: t.Object({
      searchText: t.Optional(t.String()),
      status: t.Optional(t.String()),
    }),
    detail: { summary: 'Search my tasks', tags: ['Tasks'] },
  },
)
