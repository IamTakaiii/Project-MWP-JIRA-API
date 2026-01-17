import { Elysia } from 'elysia'
import { env } from '@/config'
import { RateLimitError } from '@/lib'


const rateLimitStore = new Map<string, { count: number; resetTime: number }>()


setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60_000)


function getClientId(request: Request): string {
  // Try to get real IP from headers (for proxied requests)
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown'
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  return 'unknown'
}


export const rateLimitMiddleware = new Elysia({ name: 'rate-limit' })
  .onBeforeHandle(({ request, set }) => {
    const clientId = getClientId(request)
    const now = Date.now()

    let entry = rateLimitStore.get(clientId)

    // Initialize or reset if window expired
    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: now + env.RATE_LIMIT_WINDOW_MS,
      }
      rateLimitStore.set(clientId, entry)
    }

    entry.count++

    set.headers['X-RateLimit-Limit'] = env.RATE_LIMIT_MAX_REQUESTS.toString()
    set.headers['X-RateLimit-Remaining'] = Math.max(
      0,
      env.RATE_LIMIT_MAX_REQUESTS - entry.count
    ).toString()
    set.headers['X-RateLimit-Reset'] = Math.ceil(entry.resetTime / 1000).toString()

    if (entry.count > env.RATE_LIMIT_MAX_REQUESTS) {
      set.headers['Retry-After'] = Math.ceil(
        (entry.resetTime - now) / 1000
      ).toString()
      throw new RateLimitError()
    }
  })
