import { createLogger } from '@/lib'
import { randomBytes } from 'crypto'
import type { JiraCredentials } from '@/types'
import { env } from '@/config'
import { db, sessions, type Session } from '@/db'
import { eq, or, lt, sql } from 'drizzle-orm'

const log = createLogger('SessionService')

// Session configuration from env
const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
const SESSION_IDLE_TIMEOUT_MS = env.SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000
const SESSION_ID_LENGTH = 32
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

log.info('Session service initialized with Drizzle ORM')



/** Session info returned to clients */
export interface SessionInfo {
  createdAt: number
  lastAccessed: number
  age: number
  idleTime: number
}

// ============================================================================
// Private Helper Functions
// ============================================================================

function generateSessionId(): string {
  return randomBytes(SESSION_ID_LENGTH).toString('hex')
}

function isSessionExpired(session: Session, now: number): boolean {
  const idleTime = now - session.lastAccessed.getTime()
  const totalAge = now - session.createdAt.getTime()
  return idleTime > SESSION_IDLE_TIMEOUT_MS || totalAge > SESSION_TTL_MS
}

function updateLastAccessed(sessionId: string, now: Date): void {
  db.update(sessions)
    .set({ lastAccessed: now })
    .where(eq(sessions.sessionId, sessionId))
    .run()
}

function getSessionRow(sessionId: string): Session | undefined {
  return db.select()
    .from(sessions)
    .where(eq(sessions.sessionId, sessionId))
    .get()
}

function rowToCredentials(session: Session): JiraCredentials {
  return {
    jiraUrl: session.jiraUrl,
    email: session.email,
    apiToken: session.apiToken,
  }
}

function rowToSessionInfo(session: Session, now: number): SessionInfo {
  return {
    createdAt: session.createdAt.getTime(),
    lastAccessed: session.lastAccessed.getTime(),
    age: now - session.createdAt.getTime(),
    idleTime: now - session.lastAccessed.getTime(),
  }
}

/**
 * Get valid session row with expiration check and sliding window update
 * @returns Valid session row or null if not found/expired
 */
function getValidSessionRow(sessionId: string): Session | null {
  const session = getSessionRow(sessionId)
  if (!session) return null

  const now = Date.now()

  if (isSessionExpired(session, now)) {
    db.delete(sessions)
      .where(eq(sessions.sessionId, sessionId))
      .run()
    log.debug({ sessionId }, 'Session expired')
    return null
  }

  // Sliding expiration: update last accessed time
  updateLastAccessed(sessionId, new Date(now))
  return session
}

function cleanupExpiredSessions(): void {
  const now = Date.now()
  const maxIdleTime = new Date(now - SESSION_IDLE_TIMEOUT_MS)
  const maxAge = new Date(now - SESSION_TTL_MS)

  // Count before deletion
  const beforeResult = db.select({ count: sql<number>`count(*)` })
    .from(sessions)
    .get()
  const beforeCount = beforeResult?.count ?? 0
  
  db.delete(sessions)
    .where(
      or(
        lt(sessions.lastAccessed, maxIdleTime),
        lt(sessions.createdAt, maxAge)
      )
    )
    .run()

  // Count after deletion
  const afterResult = db.select({ count: sql<number>`count(*)` })
    .from(sessions)
    .get()
  const afterCount = afterResult?.count ?? 0
  const cleaned = beforeCount - afterCount

  if (cleaned > 0) {
    log.debug({ cleaned }, 'Cleaned up expired sessions')
  }
}

// Run cleanup on startup and periodically
cleanupExpiredSessions()
setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS)

// ============================================================================
// Public API
// ============================================================================

export const SessionService = {
  /**
   * Create a new session with credentials
   * @param credentials - Jira credentials to store
   * @returns Generated session ID
   */
  createSession(credentials: JiraCredentials): string {
    const sessionId = generateSessionId()
    const now = new Date()

    db.insert(sessions)
      .values({
        sessionId,
        jiraUrl: credentials.jiraUrl,
        email: credentials.email,
        apiToken: credentials.apiToken,
        createdAt: now,
        lastAccessed: now,
      })
      .run()

    log.info(
      { sessionId, jiraUrl: credentials.jiraUrl, email: credentials.email },
      'Session created'
    )

    return sessionId
  },

  /**
   * Get credentials from session with sliding expiration
   * @param sessionId - Session ID to lookup
   * @returns Credentials if session is valid, null otherwise
   */
  getCredentials(sessionId: string): JiraCredentials | null {
    const session = getValidSessionRow(sessionId)
    return session ? rowToCredentials(session) : null
  },

  /**
   * Delete session by ID
   * @param sessionId - Session ID to delete
   */
  deleteSession(sessionId: string): void {
    db.delete(sessions)
      .where(eq(sessions.sessionId, sessionId))
      .run()
    
    log.info({ sessionId }, 'Session deleted')
  },

  /**
   * Check if session exists and is valid
   * @param sessionId - Session ID to check
   * @returns True if session is valid
   */
  hasSession(sessionId: string): boolean {
    return getValidSessionRow(sessionId) !== null
  },

  /**
   * Get session info for debugging/monitoring
   * @param sessionId - Session ID to lookup
   * @returns Session info or null if not found
   */
  getSessionInfo(sessionId: string): SessionInfo | null {
    const session = getSessionRow(sessionId)
    return session ? rowToSessionInfo(session, Date.now()) : null
  },

  /**
   * Get active session count for monitoring
   * @returns Number of active sessions
   */
  getSessionCount(): number {
    const result = db.select({ count: sql<number>`count(*)` })
      .from(sessions)
      .get()
    return result?.count ?? 0
  },
}
