import { Elysia } from 'elysia'
import {
  buildSessionCookie,
  buildClearSessionCookie,
  getSessionCookieMaxAge,
  type CookieRecord,
} from '@/lib/cookie'
import { AuthController } from '@/controllers'
import { JiraCredentialsSchema } from '@/types'
import type { MeResponse } from '@/types/controllers/auth.types'

const controller = new AuthController()

export const authRoutes = new Elysia({ prefix: '/auth' })
  .post(
    '/login',
    async ({ body, set }) => {
      const { jiraUrl, email, apiToken } = body
      const sessionId = await controller.login(jiraUrl, email, apiToken)
      set.headers['Set-Cookie'] = buildSessionCookie(sessionId, getSessionCookieMaxAge())

      return {
        success: true,
        message: 'Login successful',
      }
    },
    {
      body: JiraCredentialsSchema,
      detail: {
        summary: 'Login',
        description: 'Authenticate with Jira credentials and create a session',
        tags: ['Auth'],
      },
    }
  )
  .get(
    '/me',
    ({ cookie }): MeResponse => controller.getSessionInfo(cookie as CookieRecord),
    {
      detail: {
        summary: 'Get current session',
        description: 'Get information about the current authenticated session',
        tags: ['Auth'],
      },
    }
  )
  .post(
    '/logout',
    ({ cookie, set }) => {
      controller.logout(cookie as CookieRecord)
      set.headers['Set-Cookie'] = buildClearSessionCookie()

      return { success: true, message: 'Logout successful' }
    },
    {
      detail: {
        summary: 'Logout',
        description: 'End the current session',
        tags: ['Auth'],
      },
    }
  )
