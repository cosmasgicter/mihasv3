/**
 * ApplicationsTableView Component
 * Enhanced table view for applications using EnhancedDataTable with StatusIndicator
 * 
 * @requirements 6.3, 6.5 - Enhanced data tables with shadcn/ui and 8starlabs StatusIndicator
 */

import React, { useCallback, useMemo } from 'react';
import { Eye, FileText, Mail, Phone, Calendar, User, AlertTriangle } from 'lucide-react';
import { EnhancedDataTable, type Column } from '@/components/admin/EnhancedDataTable';
import { DraftBadge } from '@/components/admin/applications/DraftBadge';
import { cn } from '@/lib/utils';

interface ApplicationSummary {
  id: string;
  application_number: string;
  full_name: string;
  email: string;
  phone: string;
  program: string;
  intake: string;
  institution: string;
  status: string;
  payment_status: string;
  submitted_at: string;
  created_at: string;
  total_subjects: number;
  points: number;
  days_since_submission: number;
  isDraft?: boolean;
  completionPercentage?: number;
  lastUpdated?: string;
}

interface ApplicationsTableViewProps {
  applications: ApplicationSummary[];
  onViewDetails: (id: string) => void;
  onStatusUpdate: (id: string, status: string) => void | Promise<void>;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  loading?: boolean;
  className?: string;
}

// Status mapping for 8starlabs StatusIndicator
const APPLICATION_STATUS_MAPPING: Record<string, 'operational' | 'degraded' | 'down' | 'idle' | 'pending' | 'success' | 'error' | 'warning'> = {
  draft: 'idle',
  submitted: 'pending',
  under_review: 'warning',
  approved: 'success',
  rejected: 'error',
};

const PAYMENT_STATUS_MAPPING: Record<string, 'operational' | 'degraded' | 'down' | 'idle' | 'pending' | 'success' | 'error' | 'warning'> = {
  not_paid: 'idle',
  pending_review: 'pending',
  verified: 'success',
  rejected: 'error',
};

export function ApplicationsTableView({
  applications,
  onViewDetails,
  onStatusUpdate,
  selectedIds = [],
  onSelectionChange,
  loading = false,
  className,
}: ApplicationsTableViewProps) {
  // Format date helper
  const formatDate = useCallback((dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  // Get points color based on value
  const getPointsColor = useCallback((points: number) => {
    if (points <= 15) return 'text-success';
    if (points <= 25) return 'text-warning';
    return 'text-error';
  }, []);

  // Define table columns
  const columns: Column<ApplicationSummary>[] = useMemo(() => [
    {
      key: 'application_number',
      header: 'App #',
      sortable: true,
      filterable: true,
      width: '120px',
      render: (value: string) => (
        <span className="font-mono text-sm text-primary">{value}</span>
      ),
    },
    {
      key: 'full_name',
      header: 'Applicant',
      sortable: true,
      filterable: true,
      render: (value: string, row: ApplicationSummary) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-foreground">{value}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {row.email}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'program',
      header: 'Program',
      sortable: true,
      filterable: true,
      render: (value: string, row: ApplicationSummary) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{value}</span>
          <span className="text-xs text-muted-foreground">{row.intake}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      filterable: true,
      align: 'center',
      render: (value: string, row: ApplicationSummary) => {
        if (row.isDraft) {
          return (
            <DraftBadge
              completionPercentage={row.completionPercentage || 0}
              lastUpdated={row.lastUpdated || row.created_at}
            />
          );
        }
        // For non-draft statuses, render the status badge manually
        const statusConfig: Record<string, { color: string; label: string }> = {
          submitted: { color: 'bg-blue-100 text-blue-800 border-blue-300', label: 'SUBMITTED' },
          under_review: { color: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: 'UNDER REVIEW' },
          approved: { color: 'bg-green-100 text-green-800 border-green-300', label: 'APPROVED' },
          rejected: { color: 'bg-red-100 text-red-800 border-red-300', label: 'REJECTED' },
        };
        const config = statusConfig[value] || { color: 'bg-gray-100 text-foreground border-gray-300', label: value?.toUpperCase() || 'UNKNOWN' };
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
            {config.label}
          </span>
        );
      },
    },
    {
      key: 'payment_status',
      header: 'Payment',
      sortable: true,
      filterable: true,
      align: 'center',
      statusMapping: PAYMENT_STATUS_MAPPING,
    },
    {
      key: 'points',
      header: 'Points',
      sortable: true,
      align: 'center',
      width: '80px',
      render: (value: number, row: ApplicationSummary) => (
        <div className="flex flex-col items-center">
          <span className={cn('font-semibold', getPointsColor(value))}>
            {value > 0 ? value : '-'}
          </span>
          {row.total_subjects > 0 && (
            <span className="text-xs text-muted-foreground">
              {row.total_subjects} subj
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      width: '120px',
      render: (value: string, row: ApplicationSummary) => (
        <div className="flex flex-col">
          <span className="text-sm">{formatDate(value || row.created_at)}</span>
          {row.days_since_submission > 0 && (
            <span className="text-xs text-muted-foreground">
              {row.days_since_submission}d ago
            </span>
          )}
        </div>
      ),
    },
  ], [formatDate, getPointsColor]);

  // Row actions renderer
  const rowActions = useCallback((row: ApplicationSummary) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onViewDetails(row.id);
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
    >
      <Eye className="h-4 w-4" />
      View
    </button>
  ), [onViewDetails]);

  // Handle row click
  const handleRowClick = useCallback((row: ApplicationSummary) => {
    onViewDetails(row.id);
  }, [onViewDetails]);

  // Handle selection change
  const handleSelectionChange = useCallback((ids: string[]) => {
    onSelectionChange?.(ids);
  }, [onSelectionChange]);

  return (
    <EnhancedDataTable
      data={applications}
      columns={columns}
      keyField="id"
      pageSize={10}
      pageSizeOptions={[10, 20, 50, 100]}
      defaultSortKey="submitted_at"
      defaultSortDirection="desc"
      searchable={true}
      searchPlaceholder="Search by name, email, or application number..."
      selectable={!!onSelectionChange}
      selectedRows={selectedIds}
      onSelectionChange={handleSelectionChange}
      onRowClick={handleRowClick}
      rowActions={rowActions}
      loading={loading}
      emptyMessage="No applications found"
      emptyIcon={<FileText className="h-12 w-12 text-muted-foreground/50" />}
      className={className}
      striped
    />
  );
}

export default ApplicationsTableView;
