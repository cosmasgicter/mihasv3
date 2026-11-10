import { EmptyState } from '@/components/ui/EmptyState'

/**
 * Shown instead of the whole dashboard when the backend reports jobs-ops disabled
 * (platform-simplification task 12.2, requirement 3.6). It names the one setting an
 * operator changes. No feature route is mounted behind it.
 */
export function JobsOpsNotEnabled() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-10">
      <div className="w-full">
        <EmptyState
          title="Jobs-ops is not enabled"
          message="An operator turns it on by setting ENABLE_JOBS_OPS_ROUTES=true on the backend."
        />
      </div>
    </main>
  )
}
