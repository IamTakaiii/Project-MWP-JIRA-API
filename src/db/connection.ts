import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
import { createLogger } from '@/lib'

const log = createLogger('Database')

const client = createClient({
  url: 'file:sessions.db',
})

export const db = drizzle(client, { schema })

log.info('Drizzle ORM initialized with libSQL')

process.on('SIGINT', () => {
  client.close()
  log.info('Database connection closed')
  process.exit(0)
})
