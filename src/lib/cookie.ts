import { env } from '@/config'

/** Cookie name for Jira session - unique per service to avoid conflicts */
export const JIRA_SESSION_COOKIE = 'jira_session_id'

/** Type for Elysia cookie value */
export interface CookieValue {
  value?: unknown
}

/** Type for Elysia cookie record */
export type CookieRecord = Record<string, CookieValue>

/**
 * Get session ID from cookie record
 * @param cookie - Elysia cookie record
 * @returns Session ID string or undefined if not found/invalid
 */
export function getSessionIdFromCookie(cookie: CookieRecord): string | undefined {
  const value = cookie[JIRA_SESSION_COOKIE]?.value
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Build Set-Cookie header value for session cookie
 * @param sessionId - Session ID to set (empty string to clear)
 * @param maxAge - Max age in seconds (0 to clear)
 */
export function buildSessionCookie(sessionId: string, maxAge: number): string {
  const secureFlag = env.isProd ? 'Secure;' : ''
  return `${JIRA_SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}; ${secureFlag}`
}

/**
 * Build Set-Cookie header to clear session cookie
 */
export function buildClearSessionCookie(): string {
  return buildSessionCookie('', 0)
}

/**
 * Calculate session cookie max age in seconds
 */
export function getSessionCookieMaxAge(): number {
  return Math.floor(env.SESSION_TTL_DAYS * 24 * 60 * 60)
}
