import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'
import { createLogger } from '@/lib'

const log = createLogger('Database')

// Initialize SQLite database
const sqlite = new Database('sessions.db', { create: true })

// Create Drizzle instance
export const db = drizzle(sqlite, { schema })

log.info('Drizzle ORM initialized with Bun SQLite')

// Graceful shutdown
process.on('SIGINT', () => {
  sqlite.close()
  log.info('Database connection closed')
  process.exit(0)
})
