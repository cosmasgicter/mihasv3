import { SkeletonDashboard } from '@/components/ui/Skeleton'

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-4 sm:py-6 lg:py-8">
        <SkeletonDashboard />
      </div>
    </div>
  )
}
