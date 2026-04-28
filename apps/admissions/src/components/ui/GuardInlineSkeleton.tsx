import { Skeleton } from '@/components/ui'

interface GuardInlineSkeletonProps {
  label?: string
}

export function GuardInlineSkeleton({ label = 'Preparing your workspace' }: GuardInlineSkeletonProps) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-10" aria-busy="true" aria-live="polite">
      <div className="w-full max-w-md rounded-lg border border-border/60 bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3" role="status">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <div className="mt-5 space-y-2.5">
          <Skeleton className="h-3 w-2/3 rounded-full" />
          <Skeleton className="h-3 w-5/6 rounded-full" />
          <Skeleton className="h-3 w-1/2 rounded-full" />
        </div>
      </div>
    </div>
  )
}
