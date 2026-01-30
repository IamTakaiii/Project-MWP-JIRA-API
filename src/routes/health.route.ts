import { env } from '@/config'
import { Elysia } from 'elysia'

export const healthRoutes = new Elysia({ prefix: '/health' })
  .get('/', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: process.uptime(),
  }))
  .get('/live', () => ({ status: 'live' }))
  .get('/ready', () => ({ status: 'ready' }))
