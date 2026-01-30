import { createLogger } from '@/lib'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

const log = createLogger('Database')

// Use absolute path for Docker (production), relative for local dev
const getDbPath = () => {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']
  if (process.env['NODE_ENV'] === 'production') return 'file:/app/data/sessions.db'
  return 'file:./sessions.db'
}

const dbPath = getDbPath()

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
