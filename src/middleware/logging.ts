import { Elysia } from 'elysia'
import { logger, isErrorLike } from '@/lib'


const requestTimings = new WeakMap<Request, number>()

export const loggingMiddleware = new Elysia({ name: 'logging' })
  .onRequest(({ request }) => {
    requestTimings.set(request, Date.now())
    logger.info(
      {
        method: request.method,
        url: request.url,
      },
      'Incoming request'
    )
  })
  .onAfterResponse(({ request, response }) => {
    const startTime = requestTimings.get(request) ?? Date.now()
    const duration = Date.now() - startTime
    const status = response instanceof Response ? response.status : 200

    logger.info(
      {
        method: request.method,
        url: request.url,
        status,
        duration: `${duration}ms`,
      },
      'Request completed'
    )
  })
  .onError(({ request, error }) => {
    const startTime = requestTimings.get(request) ?? Date.now()
    const duration = Date.now() - startTime

    const errorMessage = isErrorLike(error) ? error.message : 'Unknown error'
    const errorStack = isErrorLike(error) ? error.stack : undefined

    logger.error(
      {
        method: request.method,
        url: request.url,
        error: errorMessage,
        stack: errorStack,
        duration: `${duration}ms`,
      },
      'Request error'
    )
  })
