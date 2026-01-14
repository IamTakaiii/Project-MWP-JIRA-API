import pino, { type LoggerOptions } from 'pino'
import { env } from '@/config'

/**
 * Pino logger instance configured for the environment
 */
const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: {
    env: env.NODE_ENV,
  },
  redact: {
    paths: ['apiToken', 'req.headers.authorization', '*.apiToken'],
    censor: '[REDACTED]',
  },
}

// Add transport for development
if (env.isDev) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  }
}

export const logger = pino(loggerOptions)

/**
 * Create a child logger with a specific context
 */
export function createLogger(context: string) {
  return logger.child({ context })
}
