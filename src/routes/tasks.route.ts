import { Elysia, t } from 'elysia'
import type { CookieRecord } from '@/lib/cookie'
import { TaskController } from '@/controllers'
import type { TaskSearchOptions } from '@/types/controllers/task.types'

const controller = new TaskController()

export const tasksRoutes = new Elysia({ prefix: '/my-tasks' })
  .post(
    '/',
    async ({ body, cookie }) => {
      const { searchText, status } = body
      const options: TaskSearchOptions = {}
      if (searchText !== undefined) options.searchText = searchText
      if (status !== undefined) options.status = status

      return controller.searchMyTasks(cookie as CookieRecord, options)
    },
    {
      body: t.Object({
        searchText: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Search my tasks',
        description: 'Search for Jira issues assigned to the current user',
        tags: ['Tasks'],
      },
    }
  )
