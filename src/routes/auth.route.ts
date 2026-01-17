import { Elysia } from 'elysia'
import { createLogger, AuthenticationError } from '@/lib'
import {
  getSessionIdFromCookie,
  buildSessionCookie,
  buildClearSessionCookie,
  getSessionCookieMaxAge,
  type CookieRecord,
} from '@/lib/cookie'
import { SessionService } from '@/services/session.service'
import { JiraService } from '@/services'
import { JiraCredentialsSchema } from '@/types'

const log = createLogger('AuthRoutes')

/** Response when user is not authenticated */
interface UnauthenticatedResponse {
  authenticated: false
}

/** Response when user is authenticated */
interface AuthenticatedResponse {
  authenticated: true
  jiraUrl: string
  email: string
  sessionInfo: {
    createdAt: number
    lastAccessed: number
    age: number
    idleTime: number
  } | null
}

type MeResponse = UnauthenticatedResponse | AuthenticatedResponse

/**
 * Authentication routes for Jira service
 */
export const authRoutes = new Elysia({ prefix: '/auth' })
  /**
   * Login - Store credentials in session
   * POST /api/auth/login
   */
  .post(
    '/login',
    async ({ body, set }) => {
      const { jiraUrl, email, apiToken } = body

      // Verify credentials by making a test API call
      try {
        await JiraService.getCurrentUser({ jiraUrl, email, apiToken })
      } catch {
        log.warn({ jiraUrl, email }, 'Invalid credentials during login')
        throw new AuthenticationError(
          'Invalid Jira credentials. Please check your URL, email, and API token.'
        )
      }

      // Create session and set cookie
      const sessionId = SessionService.createSession({ jiraUrl, email, apiToken })
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

  /**
   * Get current session info
   * GET /api/auth/me
   */
  .get(
    '/me',
    ({ cookie }): MeResponse => {
      const sessionId = getSessionIdFromCookie(cookie as CookieRecord)

      if (!sessionId || !SessionService.hasSession(sessionId)) {
        return { authenticated: false }
      }

      const credentials = SessionService.getCredentials(sessionId)
      if (!credentials) {
        return { authenticated: false }
      }

      return {
        authenticated: true,
        jiraUrl: credentials.jiraUrl,
        email: credentials.email,
        sessionInfo: SessionService.getSessionInfo(sessionId),
      }
    },
    {
      detail: {
        summary: 'Get current session',
        description: 'Get information about the current authenticated session',
        tags: ['Auth'],
      },
    }
  )

  /**
   * Logout - Delete session
   * POST /api/auth/logout
   */
  .post(
    '/logout',
    ({ cookie, set }) => {
      const sessionId = getSessionIdFromCookie(cookie as CookieRecord)

      if (sessionId) {
        SessionService.deleteSession(sessionId)
      }

      // Clear session cookie
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
