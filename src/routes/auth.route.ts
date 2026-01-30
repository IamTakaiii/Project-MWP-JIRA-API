import { AuthController } from '@/controllers'
import {
  type CookieRecord,
  buildClearSessionCookie,
  buildSessionCookie,
  getSessionCookieMaxAge,
} from '@/lib/cookie'
import { JiraCredentialsSchema, type MeResponse } from '@/types'
import { Elysia } from 'elysia'

export const authRoutes = new Elysia({ prefix: '/auth' })
  .post(
    '/login',
    async ({ body, set }) => {
      const sessionId = await AuthController.login(body.jiraUrl, body.email, body.apiToken)
      set.headers['Set-Cookie'] = buildSessionCookie(sessionId, getSessionCookieMaxAge())
      return { success: true, message: 'Login successful' }
    },
    {
      body: JiraCredentialsSchema,
      detail: { summary: 'Login', tags: ['Auth'] },
    },
  )
  .get(
    '/me',
    ({ cookie }): Promise<MeResponse> => AuthController.getSessionInfo(cookie as CookieRecord),
    { detail: { summary: 'Get current session', tags: ['Auth'] } },
  )
  .post(
    '/logout',
    async ({ cookie, set }) => {
      await AuthController.logout(cookie as CookieRecord)
      set.headers['Set-Cookie'] = buildClearSessionCookie()
      return { success: true, message: 'Logout successful' }
    },
    { detail: { summary: 'Logout', tags: ['Auth'] } },
  )
