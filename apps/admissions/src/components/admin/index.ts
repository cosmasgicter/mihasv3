/**
 * Admin Components Index
 * Re-exports all admin-related components
 */

// Dashboard components — DashboardSkeleton is canonical at @/components/ui/skeletons/DashboardSkeleton
//
// `RealtimeMetricsDisplay` and `QuickActionsPanel` were deleted by admissions-v2
// task 11.5 (R16.4 / R16.5, MAINT-02). Neither was mounted after task 9.2
// recomposed the admin dashboard, but both stayed exported from here, so the
// product still shipped a fake real-time surface (animated counters, an
// `animate-ping` "live" dot, and a "Real-time connection lost … Polling for
// updates" banner for a platform that has no realtime transport) and a
// permanently disabled "Export Data" control badged `Coming soon` next to a
// second copy of the dashboard's own numbers. Deleted for what they were, not
// merely for being unreferenced — the unreferenced-code sweep is task 12.4's.
export { DashboardActivityFeed } from './dashboard/DashboardActivityFeed';
export { DashboardQuickActions } from './dashboard/DashboardQuickActions';

// Data table components
export { EnhancedDataTable } from './EnhancedDataTable';
export type { Column, EnhancedDataTableProps, SortDirection } from './EnhancedDataTable';

// Error handling
export { AdminErrorBoundary } from './AdminErrorBoundary';
