import { SkeletonCard, Skeleton } from '@/components/ui'

export function ApplicationsSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      
      <div className="bg-white rounded-lg p-4 sm:p-6 border border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-full sm:w-32" />
        </div>
      </div>
    </div>
  )
}
