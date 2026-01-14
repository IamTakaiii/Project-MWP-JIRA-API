import { Database } from 'bun:sqlite'
import { createLogger } from '@/lib'
import { randomBytes } from 'crypto'
import type { JiraCredentials } from '@/types'
import { env } from '@/config'

const log = createLogger('SessionService')

// Session configuration from env
const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
const SESSION_IDLE_TIMEOUT_MS = env.SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000
const SESSION_ID_LENGTH = 32
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

// Initialize SQLite database
const db = new Database('sessions.db')

// Create sessions table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    jira_url TEXT NOT NULL,
    email TEXT NOT NULL,
    api_token TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_accessed INTEGER NOT NULL
  )
`)

// Create index for faster cleanup queries
db.run(`
  CREATE INDEX IF NOT EXISTS idx_sessions_last_accessed 
  ON sessions(last_accessed)
`)

log.info('SQLite session store initialized')

/** Session database row structure */
interface SessionRow {
  session_id: string
  jira_url: string
  email: string
  api_token: string
  created_at: number
  last_accessed: number
}

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

function isSessionExpired(row: SessionRow, now: number): boolean {
  const idleTime = now - row.last_accessed
  const totalAge = now - row.created_at
  return idleTime > SESSION_IDLE_TIMEOUT_MS || totalAge > SESSION_TTL_MS
}

function deleteSessionById(sessionId: string): boolean {
  const result = db.run('DELETE FROM sessions WHERE session_id = ?', [sessionId])
  return result.changes > 0
}

function updateLastAccessed(sessionId: string, now: number): void {
  db.run('UPDATE sessions SET last_accessed = ? WHERE session_id = ?', [now, sessionId])
}

function getSessionRow(sessionId: string): SessionRow | null {
  return db.query<SessionRow, [string]>(
    'SELECT * FROM sessions WHERE session_id = ?'
  ).get(sessionId) ?? null
}

function rowToCredentials(row: SessionRow): JiraCredentials {
  return {
    jiraUrl: row.jira_url,
    email: row.email,
    apiToken: row.api_token,
  }
}

function rowToSessionInfo(row: SessionRow, now: number): SessionInfo {
  return {
    createdAt: row.created_at,
    lastAccessed: row.last_accessed,
    age: now - row.created_at,
    idleTime: now - row.last_accessed,
  }
}

/**
 * Get valid session row with expiration check and sliding window update
 * @returns Valid session row or null if not found/expired
 */
function getValidSessionRow(sessionId: string): SessionRow | null {
  const row = getSessionRow(sessionId)
  if (!row) return null

  const now = Date.now()

  if (isSessionExpired(row, now)) {
    deleteSessionById(sessionId)
    log.debug({ sessionId }, 'Session expired')
    return null
  }

  // Sliding expiration: update last accessed time
  updateLastAccessed(sessionId, now)
  return row
}

function cleanupExpiredSessions(): void {
  const now = Date.now()
  const maxIdleTime = now - SESSION_IDLE_TIMEOUT_MS
  const maxAge = now - SESSION_TTL_MS

  const result = db.run(
    'DELETE FROM sessions WHERE last_accessed < ? OR created_at < ?',
    [maxIdleTime, maxAge]
  )

  if (result.changes > 0) {
    log.debug({ cleaned: result.changes }, 'Cleaned up expired sessions')
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
    const now = Date.now()

    db.run(
      `INSERT INTO sessions (session_id, jira_url, email, api_token, created_at, last_accessed)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, credentials.jiraUrl, credentials.email, credentials.apiToken, now, now]
    )

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
    const row = getValidSessionRow(sessionId)
    return row ? rowToCredentials(row) : null
  },

  /**
   * Delete session by ID
   * @param sessionId - Session ID to delete
   */
  deleteSession(sessionId: string): void {
    if (deleteSessionById(sessionId)) {
      log.info({ sessionId }, 'Session deleted')
    }
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
    const row = getSessionRow(sessionId)
    return row ? rowToSessionInfo(row, Date.now()) : null
  },

  /**
   * Get active session count for monitoring
   * @returns Number of active sessions
   */
  getSessionCount(): number {
    const result = db.query<{ count: number }, []>(
      'SELECT COUNT(*) as count FROM sessions'
    ).get()
    return result?.count ?? 0
  },
}
