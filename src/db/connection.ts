import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
import { createLogger } from '@/lib'

const log = createLogger('Database')

// Use /app/data for persistent storage in Docker
const dbPath = process.env['DATABASE_URL'] || 'file:./data/sessions.db'

const client = createClient({
  url: dbPath,
})

export const db = drizzle(client, { schema })

log.info({ dbPath }, 'Drizzle ORM initialized with libSQL')

process.on('SIGINT', () => {
  client.close()
  log.info('Database connection closed')
  process.exit(0)
})
