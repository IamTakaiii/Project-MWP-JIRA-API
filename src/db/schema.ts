import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable(
  'sessions',
  {
    sessionId: text('session_id').primaryKey(),
    jiraUrl: text('jira_url').notNull(),
    email: text('email').notNull(),
    apiToken: text('api_token').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastAccessed: integer('last_accessed', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    lastAccessedIdx: index('idx_sessions_last_accessed').on(table.lastAccessed),
  })
)

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
