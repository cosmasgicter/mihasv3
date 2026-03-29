/**
 * Admin Components Index
 * Re-exports all admin-related components
 */

// Dashboard components — DashboardSkeleton is canonical at @/components/ui/skeletons/DashboardSkeleton
export { DashboardMetricsCards } from './dashboard/DashboardMetricsCards';
export { DashboardActivityFeed } from './dashboard/DashboardActivityFeed';
export { DashboardQuickActions } from './dashboard/DashboardQuickActions';
export { QuickActionsPanel } from './QuickActionsPanel';
export { RealtimeMetricsDisplay } from './RealtimeMetricsDisplay';

// Data table components
export { EnhancedDataTable } from './EnhancedDataTable';
export type { Column, EnhancedDataTableProps, SortDirection } from './EnhancedDataTable';

// Monitoring components
export { RealtimeStatus } from './RealtimeStatus';

// Error handling
export { AdminErrorBoundary } from './AdminErrorBoundary';
