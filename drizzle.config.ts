import { defineConfig } from 'drizzle-kit'

const getDbUrl = () => {
  if (process.env['DATABASE_URL']) {
    return process.env['DATABASE_URL'].replace('file:', '')
  }
  if (process.env['NODE_ENV'] === 'production') {
    return '/app/data/sessions.db'
  }
  return './data/sessions.db'
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: getDbUrl(),
  },
})
