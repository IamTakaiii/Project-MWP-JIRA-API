import { Elysia, t } from 'elysia'
import { JiraService } from '@/services'
import { getCredentialsFromCookie } from '@/middleware'
import type { CookieRecord } from '@/lib/cookie'

/** Search options for filtering tasks */
interface TaskSearchOptions {
  searchText?: string
  status?: string
}

/**
 * Task search routes (requires authentication)
 */
export const tasksRoutes = new Elysia({ prefix: '/my-tasks' })
  /**
   * Search for tasks assigned to current user
   */
  .post(
    '/',
    async ({ body, cookie }) => {
      const credentials = getCredentialsFromCookie(cookie as CookieRecord)
      const { searchText, status } = body

      const options: TaskSearchOptions = {}
      if (searchText !== undefined) options.searchText = searchText
      if (status !== undefined) options.status = status

      return JiraService.searchMyTasks(credentials, options)
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
