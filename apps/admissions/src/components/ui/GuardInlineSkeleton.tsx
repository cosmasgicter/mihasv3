import { Skeleton } from '@/components/ui/skeleton'

interface GuardInlineSkeletonProps {
  label?: string
}

export function GuardInlineSkeleton({ label = 'Checking your session' }: GuardInlineSkeletonProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10" aria-busy="true" aria-live="polite">
      <div className="rounded-xl border border-border bg-card/60 p-4 shadow-sm">
        <div className="flex items-center gap-2" role="status">
          <Skeleton className="h-4 w-4 rounded-full" />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  )
}
