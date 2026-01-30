import { defineConfig } from 'drizzle-kit'

// DATABASE_URL should be set in production (Docker)
// Format: file:/app/data/sessions.db
const dbUrl = process.env['DATABASE_URL']?.replace('file:', '') || './data/sessions.db'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbUrl,
  },
})
