import { Elysia } from 'elysia'
import { env } from '@/config'

export const healthRoutes = new Elysia({ prefix: '/health' })
  .get('/', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: process.uptime(),
  }))
  .get('/live', () => ({ status: 'live' }))
  .get('/ready', () => ({ status: 'ready' }))
