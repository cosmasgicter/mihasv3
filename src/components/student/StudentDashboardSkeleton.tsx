import { Skeleton, SkeletonCard, SkeletonText } from '@/components/ui'

export function StudentDashboardSkeleton() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-4 sm:py-6 lg:py-8 pb-20">
      <div className="mb-6 sm:mb-8">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-3 flex-1">
              <Skeleton className="h-8 sm:h-10 w-full max-w-xs bg-white/40" />
              <Skeleton className="h-5 w-full max-w-md bg-white/30" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-12 w-16 sm:w-20 bg-white/40" />
              <Skeleton className="h-4 w-24 sm:w-28 bg-white/30" />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 sm:mb-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Skeleton className="h-6 w-48 mb-3" />
              <SkeletonText lines={2} />
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <Skeleton className="h-10 w-28 sm:w-32" />
              <Skeleton className="h-10 w-28 sm:w-32" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="divide-y divide-gray-200">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 sm:p-6">
                  <SkeletonCard />
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 sm:p-6">
            <Skeleton className="h-6 w-40 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-xl">
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
            <Skeleton className="h-10 w-full mt-4" />
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 sm:p-6">
            <Skeleton className="h-6 w-48 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border-l-4 border-red-400 pl-3 p-3 bg-red-50 rounded-r-xl">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
