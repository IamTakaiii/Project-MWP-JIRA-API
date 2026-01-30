import { AuthenticationError, createLogger } from '@/lib'
import type { CookieRecord } from '@/lib/cookie'
import { getSessionIdFromCookie } from '@/lib/cookie'
import { JiraService, SessionService } from '@/services'
import type { MeResponse } from '@/types'

const log = createLogger('AuthController')

export async function login(jiraUrl: string, email: string, apiToken: string): Promise<string> {
  try {
    await JiraService.getCurrentUser({ jiraUrl, email, apiToken })
  } catch {
    log.warn({ jiraUrl, email }, 'Invalid credentials during login')
    throw new AuthenticationError(
      'Invalid Jira credentials. Please check your URL, email, and API token.',
    )
  }

  return SessionService.createSession({ jiraUrl, email, apiToken })
}

export async function getSessionInfo(cookie: CookieRecord): Promise<MeResponse> {
  const sessionId = getSessionIdFromCookie(cookie)

  if (!sessionId || !(await SessionService.hasSession(sessionId))) {
    return { authenticated: false }
  }

  const credentials = await SessionService.getCredentials(sessionId)
  if (!credentials) {
    return { authenticated: false }
  }

  return {
    authenticated: true,
    jiraUrl: credentials.jiraUrl,
    email: credentials.email,
    sessionInfo: await SessionService.getSessionInfo(sessionId),
  }
}

export async function logout(cookie: CookieRecord): Promise<void> {
  const sessionId = getSessionIdFromCookie(cookie)
  if (sessionId) {
    await SessionService.deleteSession(sessionId)
  }
}
