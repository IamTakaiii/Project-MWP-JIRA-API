import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { env } from '@/config'
import { logger } from '@/lib'
import { loggingMiddleware, errorHandlerMiddleware, rateLimitMiddleware } from '@/middleware'
import { healthRoutes, worklogRoutes, tasksRoutes, authRoutes } from '@/routes'

/**
 * Create and configure the Elysia application
 */
const app = new Elysia()
  // CORS configuration
  .use(
    cors({
      origin: env.CORS_ORIGINS.includes('*') ? true : env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    })
  )

  // Middleware
  .use(errorHandlerMiddleware)
  .use(loggingMiddleware)
  .use(rateLimitMiddleware)

  // API Routes
  .group('/api', (app) =>
    app
      .use(healthRoutes)
      .use(authRoutes)
      .use(worklogRoutes)
      .use(tasksRoutes)
  )

  // Root endpoint
  .get('/', () => ({
    name: 'JIRA Worklog API',
    version: '1.0.0',
    docs: '/api/health',
  }))

  // Start server
  .listen({
    port: env.PORT,
    hostname: env.HOST,
  })

// Startup message
logger.info(
  {
    port: env.PORT,
    host: env.HOST,
    env: env.NODE_ENV,
    cors: env.CORS_ORIGINS,
  },
  `🚀 Server running at http://${env.HOST}:${env.PORT}`
)

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down server...')
  app.stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

export type App = typeof app
