import { Link, useLocation } from 'react-router-dom'
import { pathFor } from '@/routes/routeRegistry'

/**
 * An `:applicationId` that is not a UUID is not an application anywhere: the
 * not-found state, which reveals nothing (platform-simplification task 30.2,
 * R17.2). A masked 404 from the backend is handled inside the workspace.
 *
 * As a page (below 1024 px) it carries the page's one `h1`; beside the queue the
 * queue's `PageShell` already does, so it uses `h2`.
 */
export function ReviewNotFound({ asPage }: { asPage: boolean }) {
  const { search } = useLocation()
  const Heading = asPage ? 'h1' : 'h2'
  return (
    <div
      className={asPage ? 'mx-auto max-w-xl p-6' : 'rounded-lg border border-border bg-card p-6'}
      data-testid="review-not-found"
    >
      <Heading className="text-xl font-semibold text-foreground">Application not found</Heading>
      <p className="mt-2 text-sm text-muted-foreground">This address does not match an application.</p>
      <Link
        to={`${pathFor('admin.applications')}${search}`}
        className="mt-4 inline-flex min-h-touch items-center text-sm font-medium text-primary underline"
      >
        Back to applications
      </Link>
    </div>
  )
}
