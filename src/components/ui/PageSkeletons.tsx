import { Skeleton, StatsGridSkeleton, TableSkeleton, ChartSkeleton, FormSkeleton, ListSkeleton, PageHeaderSkeleton } from './Skeleton'

// Admin Dashboard Skeleton
export function AdminDashboardSkeleton() {
  return (
    <div className="space-y-8 p-6">
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <TableSkeleton rows={5} columns={5} />
    </div>
  )
}

// Admin Applications Skeleton
export function AdminApplicationsSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <PageHeaderSkeleton />
      <div className="flex gap-4 mb-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <TableSkeleton rows={10} columns={6} />
    </div>
  )
}

// Admin Analytics Skeleton
export function AdminAnalyticsSkeleton() {
  return (
    <div className="space-y-8 p-6">
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartSkeleton height={400} />
        <ChartSkeleton height={400} />
        <ChartSkeleton height={400} />
      </div>
      <ChartSkeleton height={300} />
    </div>
  )
}

// Admin Users Skeleton
export function AdminUsersSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <PageHeaderSkeleton />
      <div className="flex gap-4 mb-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      <TableSkeleton rows={8} columns={5} />
    </div>
  )
}

// Application Detail Skeleton
export function ApplicationDetailSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
      <div className="border-t pt-6">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  )
}

// Application Wizard Skeleton
export function ApplicationWizardSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <Skeleton className="h-2 w-full mb-4" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <FormSkeleton fields={6} />
      <div className="flex justify-between mt-8">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  )
}

// Settings Page Skeleton
export function SettingsPageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <ListSkeleton items={5} />
        </div>
        <div className="lg:col-span-2">
          <FormSkeleton fields={8} />
        </div>
      </div>
    </div>
  )
}

// Public Tracker Skeleton
export function PublicTrackerSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center space-y-4">
        <Skeleton className="h-10 w-96 mx-auto" />
        <Skeleton className="h-4 w-64 mx-auto" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-12 flex-1" />
        <Skeleton className="h-12 w-32" />
      </div>
      <div className="border rounded-xl p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  )
}

// Notification Settings Skeleton
export function NotificationSettingsSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <PageHeaderSkeleton />
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-3 w-96" />
            </div>
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Audit Trail Skeleton
export function AuditTrailSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <PageHeaderSkeleton />
      <div className="flex gap-4 mb-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <TableSkeleton rows={12} columns={6} />
    </div>
  )
}

// Monitoring Skeleton
export function MonitoringSkeleton() {
  return (
    <div className="space-y-8 p-6">
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={6} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton height={300} />
        <ChartSkeleton height={300} />
      </div>
      <ListSkeleton items={8} />
    </div>
  )
}

// Workflow Automation Skeleton
export function WorkflowAutomationSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ListSkeleton items={6} />
        </div>
        <div>
          <FormSkeleton fields={4} />
        </div>
      </div>
    </div>
  )
}

// AI Insights Skeleton
export function AIInsightsSkeleton() {
  return (
    <div className="space-y-8 p-6">
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={3} />
      <ChartSkeleton height={400} />
      <TableSkeleton rows={8} columns={5} />
    </div>
  )
}

// Batch Operations Skeleton
export function BatchOperationsSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
      <FormSkeleton fields={4} />
      <TableSkeleton rows={6} columns={4} />
    </div>
  )
}

// Programs/Intakes Skeleton
export function CatalogManagementSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between mb-6">
        <PageHeaderSkeleton />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="border rounded-xl p-6 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="flex gap-2 pt-4">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Role Management Skeleton
export function RoleManagementSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <Skeleton className="h-6 w-32 mb-4" />
          <ListSkeleton items={5} />
        </div>
        <div>
          <Skeleton className="h-6 w-32 mb-4" />
          <FormSkeleton fields={6} />
        </div>
      </div>
    </div>
  )
}

// Eligibility Management Skeleton
export function EligibilityManagementSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={3} />
      <TableSkeleton rows={10} columns={7} />
    </div>
  )
}
