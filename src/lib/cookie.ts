import { env } from '@/config'

export const JIRA_SESSION_COOKIE = 'jira_session_id'

export interface CookieValue {
  value?: unknown
}

export type CookieRecord = Record<string, CookieValue>

export function getSessionIdFromCookie(cookie: CookieRecord): string | undefined {
  const value = cookie[JIRA_SESSION_COOKIE]?.value
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function buildSessionCookie(sessionId: string, maxAge: number): string {
  const secureFlag = env.isProd ? 'Secure;' : ''
  return `${JIRA_SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}; ${secureFlag}`
}

export function buildClearSessionCookie(): string {
  return buildSessionCookie('', 0)
}

export function getSessionCookieMaxAge(): number {
  return Math.floor(env.SESSION_TTL_DAYS * 24 * 60 * 60)
}
