/**
 * A duplicate student route, redirecting to the canonical one it duplicated.
 *
 * admissions-v2 task 10.6 — R13.13 ("duplicate routes SHALL redirect to it"),
 * finding **STU-23**.
 *
 * `<Navigate to="/student/application/:id/status">` would send the student to a
 * literal `:id`, so a duplicate route whose canonical successor is parameterised
 * needs the params read at render time. That is the whole of this component: it
 * reads the params React Router already matched, builds the canonical path from
 * them, and replaces the history entry so Back does not bounce the student
 * between two URLs for the same application.
 *
 * `replace` matters for a reason beyond tidiness. Without it the duplicate URL
 * stays on the stack, so a student who presses Back lands on the redirect again
 * and is pushed forward again — the classic bounce that makes a redirect feel
 * like a broken page.
 *
 * The query string and hash are carried across: a bookmark of the duplicate may
 * legitimately carry state the canonical route understands, and dropping it
 * would turn a redirect into a partial data loss.
 */
import { Navigate, useLocation, useParams } from 'react-router-dom'

interface DuplicateRouteRedirectProps {
  /**
   * Build the canonical path from the params React Router matched on the
   * duplicate route. Returning `null` means the duplicate could not be mapped
   * (a missing param), in which case the student is sent to `fallback` instead
   * of to a malformed URL.
   */
  canonicalPath: (params: Readonly<Record<string, string | undefined>>) => string | null
  /** Where an unmappable duplicate goes. */
  fallback: string
}

export function DuplicateRouteRedirect({ canonicalPath, fallback }: DuplicateRouteRedirectProps) {
  const params = useParams()
  const location = useLocation()

  const target = canonicalPath(params)
  if (!target) {
    return <Navigate to={fallback} replace />
  }

  return <Navigate to={`${target}${location.search}${location.hash}`} replace />
}

export default DuplicateRouteRedirect
