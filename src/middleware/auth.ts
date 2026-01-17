import { createLogger, AuthenticationError } from '@/lib'
import { getSessionIdFromCookie, type CookieRecord } from '@/lib/cookie'
import { SessionService } from '@/services/session.service'
import type { JiraCredentials } from '@/types'

const log = createLogger('AuthMiddleware')

export function getCredentialsFromCookie(cookie: CookieRecord): JiraCredentials {
  const sessionId = getSessionIdFromCookie(cookie)

  log.debug({
    sessionId: sessionId ? 'present' : 'missing',
    cookieKeys: Object.keys(cookie || {}),
  }, 'Getting credentials from cookie')

  if (!sessionId) {
    log.warn('No session ID found in cookies')
    throw new AuthenticationError('No session found. Please login first.')
  }

  const credentials = SessionService.getCredentials(sessionId)
  if (!credentials) {
    log.warn({ sessionId }, 'Session expired or invalid')
    throw new AuthenticationError('Session expired. Please login again.')
  }

  log.debug({
    jiraUrl: credentials.jiraUrl,
    email: credentials.email,
  }, 'Credentials validated successfully')

  return credentials
}
