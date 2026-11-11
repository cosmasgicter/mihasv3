/**
 * Plain-text document state for an admin queue row (platform-simplification
 * task 30.4, R17.5). The row's one badge is the application status; payment and
 * documents are words, not more coloured chips.
 *
 * The counts are the server's (`current_document_count`,
 * `verified_document_count`: current versions, and of those the verified ones).
 * `null` means the server did not send them, and renders nothing rather than a
 * zero that would read as a fact.
 */
export function documentStateText(
  current: number | null | undefined,
  verified: number | null | undefined,
): string | null {
  if (typeof current !== 'number' || typeof verified !== 'number') return null
  if (current === 0) return 'None uploaded'
  return `${verified} of ${current} verified`
}
