import { randomBytes } from 'crypto'
import { env } from '@/config'
import { type Session, db, sessions } from '@/db'
import { createLogger } from '@/lib'
import type { JiraCredentials, SessionInfo } from '@/types'
import { eq, lt, or, sql } from 'drizzle-orm'

const log = createLogger('SessionService')

const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 86400000
const SESSION_IDLE_MS = env.SESSION_IDLE_DAYS * 86400000
const CLEANUP_INTERVAL_MS = 3600000

log.info('Session service initialized')

// Repository functions
async function findSession(sessionId: string): Promise<Session | undefined> {
  return db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).get()
}

async function createSessionRecord(
  sessionId: string,
  credentials: JiraCredentials,
  now: Date,
): Promise<void> {
  await db.insert(sessions).values({
    sessionId,
    jiraUrl: credentials.jiraUrl,
    email: credentials.email,
    apiToken: credentials.apiToken,
    createdAt: now,
    lastAccessed: now,
  })
}

async function updateLastAccessed(sessionId: string, now: Date): Promise<void> {
  await db.update(sessions).set({ lastAccessed: now }).where(eq(sessions.sessionId, sessionId))
}

async function deleteSessionRecord(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.sessionId, sessionId))
}

async function cleanupExpiredSessions(): Promise<void> {
  const now = Date.now()
  const maxIdleTime = new Date(now - SESSION_IDLE_MS)
  const maxAge = new Date(now - SESSION_TTL_MS)

  const beforeCount =
    (await db.select({ count: sql<number>`count(*)` }).from(sessions).get())?.count ?? 0

  await db
    .delete(sessions)
    .where(or(lt(sessions.lastAccessed, maxIdleTime), lt(sessions.createdAt, maxAge)))

  const afterCount =
    (await db.select({ count: sql<number>`count(*)` }).from(sessions).get())?.count ?? 0

  const cleaned = beforeCount - afterCount
  if (cleaned > 0) {
    log.debug({ cleaned }, 'Cleaned up expired sessions')
  }
}

function isSessionExpired(session: Session, now: number): boolean {
  const idleTime = now - session.lastAccessed.getTime()
  const totalAge = now - session.createdAt.getTime()
  return idleTime > SESSION_IDLE_MS || totalAge > SESSION_TTL_MS
}

async function getValidSession(sessionId: string): Promise<Session | null> {
  const session = await findSession(sessionId)
  if (!session) return null

  const now = Date.now()

  if (isSessionExpired(session, now)) {
    await deleteSessionRecord(sessionId)
    log.debug({ sessionId }, 'Session expired')
    return null
  }

  await updateLastAccessed(sessionId, new Date(now))
  return session
}

// Public API
export async function createSession(credentials: JiraCredentials): Promise<string> {
  const sessionId = randomBytes(32).toString('hex')
  const now = new Date()

  await createSessionRecord(sessionId, credentials, now)
  log.info({ sessionId, jiraUrl: credentials.jiraUrl, email: credentials.email }, 'Session created')

  return sessionId
}

export async function getCredentials(sessionId: string): Promise<JiraCredentials | null> {
  const session = await getValidSession(sessionId)
  if (!session) return null

  return {
    jiraUrl: session.jiraUrl,
    email: session.email,
    apiToken: session.apiToken,
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  await deleteSessionRecord(sessionId)
  log.info({ sessionId }, 'Session deleted')
}

export async function hasSession(sessionId: string): Promise<boolean> {
  return (await getValidSession(sessionId)) !== null
}

export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  const session = await findSession(sessionId)
  if (!session) return null

  const now = Date.now()
  return {
    createdAt: session.createdAt.getTime(),
    lastAccessed: session.lastAccessed.getTime(),
    age: now - session.createdAt.getTime(),
    idleTime: now - session.lastAccessed.getTime(),
  }
}

export async function getSessionCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(sessions).get()
  return result?.count ?? 0
}

// Start cleanup interval
cleanupExpiredSessions()
setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS)
