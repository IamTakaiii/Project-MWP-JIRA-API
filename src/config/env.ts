/**
 * Environment configuration with type-safe defaults
 */
export const env = {
  // Server
  PORT: Number(process.env['PORT']) || 3001,
  HOST: process.env['HOST'] || '0.0.0.0',
  NODE_ENV: (process.env['NODE_ENV'] || 'development') as 'development' | 'production' | 'test',

  // CORS
  CORS_ORIGINS: process.env['CORS_ORIGINS']?.split(',').map((s) => s.trim()) || ['*'],

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Number(process.env['RATE_LIMIT_WINDOW_MS']) || 60_000,
  RATE_LIMIT_MAX_REQUESTS: Number(process.env['RATE_LIMIT_MAX_REQUESTS']) || 100,

  // Logging
  LOG_LEVEL: (process.env['LOG_LEVEL'] || 'info') as
    | 'trace'
    | 'debug'
    | 'info'
    | 'warn'
    | 'error'
    | 'fatal',

  // Session
  SESSION_TTL_DAYS: Number(process.env['SESSION_TTL_DAYS']) || 30,
  SESSION_IDLE_DAYS: Number(process.env['SESSION_IDLE_DAYS']) || 7,

  // Computed
  get isDev() {
    return this.NODE_ENV === 'development'
  },
  get isProd() {
    return this.NODE_ENV === 'production'
  },
} as const
