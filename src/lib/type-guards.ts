export function isErrorLike(value: unknown): value is Error {
  return value !== null && typeof value === 'object' && 'message' in value
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
