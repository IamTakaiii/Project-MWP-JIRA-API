import { Elysia } from 'elysia'
import { AppError, isErrorLike } from '@/lib'
import { env } from '@/config'

interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
    stack?: string
  }
}

function buildErrorResponse(
  code: string,
  message: string,
  details?: unknown,
  stack?: string
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
      ...(stack !== undefined && { stack }),
    },
  }
}

/**
 * Global error handling middleware
 */
export const errorHandlerMiddleware = new Elysia({ name: 'error-handler' }).onError(
  ({ error, set }): ErrorResponse => {
    // Handle AppError instances
    if (error instanceof AppError) {
      set.status = error.statusCode
      return buildErrorResponse(
        error.code,
        error.message,
        error.details,
        env.isDev ? error.stack : undefined
      )
    }

    // Handle non-Error-like objects
    if (!isErrorLike(error)) {
      set.status = 500
      return buildErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred')
    }

    // Handle Elysia validation errors
    const errorWithCode = error as Error & { code?: string }
    if (error.name === 'ValidationError' || errorWithCode.code === 'VALIDATION') {
      set.status = 400
      return buildErrorResponse(
        'VALIDATION_ERROR',
        'Request validation failed',
        env.isDev ? error.message : undefined
      )
    }

    // Handle unknown errors
    set.status = 500
    return buildErrorResponse(
      'INTERNAL_ERROR',
      env.isProd ? 'An unexpected error occurred' : error.message,
      undefined,
      env.isDev ? error.stack : undefined
    )
  }
)
