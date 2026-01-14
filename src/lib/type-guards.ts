/**
 * Type guard utilities for runtime type checking
 */

/**
 * Type guard for Error-like objects
 * @param value - Unknown value to check
 * @returns True if value is Error-like (has message property)
 */
export function isErrorLike(value: unknown): value is Error {
  return value !== null && typeof value === 'object' && 'message' in value
}

/**
 * Type guard for non-empty string
 * @param value - Unknown value to check
 * @returns True if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
