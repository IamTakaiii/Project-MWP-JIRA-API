import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'
import { createLogger } from '@/lib'

const log = createLogger('Database')

const sqlite = new Database('sessions.db', { create: true })

export const db = drizzle(sqlite, { schema })

log.info('Drizzle ORM initialized with Bun SQLite')

process.on('SIGINT', () => {
  sqlite.close()
  log.info('Database connection closed')
  process.exit(0)
})
