import { createLogger } from '@/lib'
import { randomBytes } from 'crypto'
import type { JiraCredentials } from '@/types'
import { env } from '@/config'
import { db, sessions, type Session } from '@/db'
import { eq, or, lt, sql } from 'drizzle-orm'
import type { SessionInfo } from '@/types/services/session.types'

const log = createLogger('SessionService')

const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
const SESSION_IDLE_TIMEOUT_MS = env.SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000
const SESSION_ID_LENGTH = 32
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

log.info('Session service initialized with Drizzle ORM')

class SessionRepository {
  create(sessionId: string, credentials: JiraCredentials, timestamp: Date): void {
    db.insert(sessions)
      .values({
        sessionId,
        jiraUrl: credentials.jiraUrl,
        email: credentials.email,
        apiToken: credentials.apiToken,
        createdAt: timestamp,
        lastAccessed: timestamp,
      })
      .run()
  }

  findById(sessionId: string): Session | undefined {
    return db.select()
      .from(sessions)
      .where(eq(sessions.sessionId, sessionId))
      .get()
  }

  updateLastAccessed(sessionId: string, timestamp: Date): void {
    db.update(sessions)
      .set({ lastAccessed: timestamp })
      .where(eq(sessions.sessionId, sessionId))
      .run()
  }

  delete(sessionId: string): void {
    db.delete(sessions)
      .where(eq(sessions.sessionId, sessionId))
      .run()
  }

  deleteExpired(maxIdleTime: Date, maxAge: Date): number {
    const beforeCount = this.count()

    db.delete(sessions)
      .where(
        or(
          lt(sessions.lastAccessed, maxIdleTime),
          lt(sessions.createdAt, maxAge)
        )
      )
      .run()

    return beforeCount - this.count()
  }

  count(): number {
    const result = db.select({ count: sql<number>`count(*)` })
      .from(sessions)
      .get()
    return result?.count ?? 0
  }
}

class SessionValidator {
  isExpired(session: Session, now: number): boolean {
    const idleTime = now - session.lastAccessed.getTime()
    const totalAge = now - session.createdAt.getTime()
    return idleTime > SESSION_IDLE_TIMEOUT_MS || totalAge > SESSION_TTL_MS
  }
}

class SessionMapper {
  toCredentials(session: Session): JiraCredentials {
    return {
      jiraUrl: session.jiraUrl,
      email: session.email,
      apiToken: session.apiToken,
    }
  }

  toSessionInfo(session: Session, now: number): SessionInfo {
    return {
      createdAt: session.createdAt.getTime(),
      lastAccessed: session.lastAccessed.getTime(),
      age: now - session.createdAt.getTime(),
      idleTime: now - session.lastAccessed.getTime(),
    }
  }
}

class SessionIdGenerator {
  generate(): string {
    return randomBytes(SESSION_ID_LENGTH).toString('hex')
  }
}

class SessionManager {
  constructor(
    private repository: SessionRepository,
    private validator: SessionValidator,
    private mapper: SessionMapper,
    private idGenerator: SessionIdGenerator
  ) {}

  createSession(credentials: JiraCredentials): string {
    const sessionId = this.idGenerator.generate()
    const now = new Date()

    this.repository.create(sessionId, credentials, now)

    log.info(
      { sessionId, jiraUrl: credentials.jiraUrl, email: credentials.email },
      'Session created'
    )

    return sessionId
  }

  getCredentials(sessionId: string): JiraCredentials | null {
    const session = this.getValidSession(sessionId)
    return session ? this.mapper.toCredentials(session) : null
  }

  deleteSession(sessionId: string): void {
    this.repository.delete(sessionId)
    log.info({ sessionId }, 'Session deleted')
  }

  hasSession(sessionId: string): boolean {
    return this.getValidSession(sessionId) !== null
  }

  getSessionInfo(sessionId: string): SessionInfo | null {
    const session = this.repository.findById(sessionId)
    return session ? this.mapper.toSessionInfo(session, Date.now()) : null
  }

  getSessionCount(): number {
    return this.repository.count()
  }

  cleanupExpired(): void {
    const now = Date.now()
    const maxIdleTime = new Date(now - SESSION_IDLE_TIMEOUT_MS)
    const maxAge = new Date(now - SESSION_TTL_MS)

    const cleaned = this.repository.deleteExpired(maxIdleTime, maxAge)

    if (cleaned > 0) {
      log.debug({ cleaned }, 'Cleaned up expired sessions')
    }
  }

  private getValidSession(sessionId: string): Session | null {
    const session = this.repository.findById(sessionId)
    if (!session) return null

    const now = Date.now()

    if (this.validator.isExpired(session, now)) {
      this.repository.delete(sessionId)
      log.debug({ sessionId }, 'Session expired')
      return null
    }

    this.repository.updateLastAccessed(sessionId, new Date(now))
    return session
  }
}

const repository = new SessionRepository()
const validator = new SessionValidator()
const mapper = new SessionMapper()
const idGenerator = new SessionIdGenerator()
const manager = new SessionManager(repository, validator, mapper, idGenerator)

manager.cleanupExpired()
setInterval(() => manager.cleanupExpired(), CLEANUP_INTERVAL_MS)

export const SessionService = {
  createSession: (credentials: JiraCredentials) => manager.createSession(credentials),
  getCredentials: (sessionId: string) => manager.getCredentials(sessionId),
  deleteSession: (sessionId: string) => manager.deleteSession(sessionId),
  hasSession: (sessionId: string) => manager.hasSession(sessionId),
  getSessionInfo: (sessionId: string) => manager.getSessionInfo(sessionId),
  getSessionCount: () => manager.getSessionCount(),
}
