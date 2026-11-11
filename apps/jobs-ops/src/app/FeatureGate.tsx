import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { JobsOpsNotEnabled } from '@/app/JobsOpsNotEnabled'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { LoadingState } from '@/components/ui/LoadingState'
import { getPlatformMeta } from '@/services/api/platform'

/**
 * Router-root gate (platform-simplification task 12.2, requirement 3.6). It asks the
 * metadata endpoint first and mounts nothing else until the backend says jobs-ops is
 * on, so while it is off no feature query runs. The shell reads the same query key,
 * so the answer is shared rather than fetched twice.
 */
export function FeatureGate({ children }: { children: ReactNode }) {
  const meta = useQuery({ queryKey: ['platform-meta'], queryFn: getPlatformMeta })

  if (meta.isPending) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <LoadingState title="Checking jobs-ops" message="Asking the backend whether jobs-ops is enabled." />
      </main>
    )
  }
  if (meta.isError) {
    return (
      <ErrorDisplay
        variant="page"
        message="Could not reach the backend to check whether jobs-ops is enabled."
        onRetry={() => void meta.refetch()}
      />
    )
  }
  // The demo fallback is only returned when demo mode is on and the backend did not answer.
  if (!meta.data.features.jobsOps) return <JobsOpsNotEnabled />
  return <>{children}</>
}
