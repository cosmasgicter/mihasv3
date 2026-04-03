/**
 * Narrows an unknown catch variable to an Error instance.
 * Used across all catch blocks after enabling strict mode
 * (useUnknownInCatchVariables).
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value
  try {
    const message = String(value)
    return new Error(message || 'Unknown error')
  } catch {
    return new Error('Unknown error')
  }
}
