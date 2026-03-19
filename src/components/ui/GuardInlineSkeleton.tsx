import { UnifiedLoader } from '@/components/ui/UnifiedLoader'

interface GuardInlineSkeletonProps {
  label?: string
}

export function GuardInlineSkeleton({ label = 'Checking your session' }: GuardInlineSkeletonProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10" aria-busy="true" aria-live="polite">
      <div className="rounded-xl border border-border bg-card/60 p-4 shadow-sm">
        <UnifiedLoader variant="inline" size="sm" message={label} />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}
