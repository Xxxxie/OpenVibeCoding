import { defineConfig } from 'drizzle-kit'
import path from 'path'

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db')

export default defineConfig({
  schema: './packages/server/src/db/schema.ts',
  out: './packages/server/src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: DB_PATH,
  },
})
