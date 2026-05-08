/**
 * ApplicationsTableView Component
 * Enhanced table view for applications using EnhancedDataTable with StatusIndicator
 * 
 * @requirements 6.3, 6.5 - Enhanced data tables with shadcn/ui and 8starlabs StatusIndicator
 */

import React, { useCallback, useMemo } from 'react';
import { Eye, FileText, Mail, User } from 'lucide-react';
import { EnhancedDataTable, type Column } from '@/components/admin/EnhancedDataTable';
import { DraftBadge } from '@/components/admin/applications/DraftBadge';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dateFormat';
import { getPaymentStatusLabel, normalizePaymentStatus } from '@/lib/paymentStatus';

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

export function ApplicationsTableView({
  applications,
  onViewDetails,
  selectedIds = [],
  onSelectionChange,
  loading = false,
  className,
}: ApplicationsTableViewProps) {
  // Format date helper
  const formatTableDate = useCallback((dateString: string) => {
    if (!dateString) return '-';
    const result = formatDate(dateString);
    return result === 'Not available' ? '-' : result;
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
      render: (value: unknown) => (
        <span className="font-mono text-sm text-primary">{String(value)}</span>
      ),
    },
    {
      key: 'full_name',
      header: 'Applicant',
      sortable: true,
      filterable: true,
      render: (value: unknown, row: ApplicationSummary) => (
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-words font-medium text-foreground">{String(value)}</span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1 break-all">
              <Mail className="h-3 w-3 shrink-0" />
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
      render: (value: unknown, row: ApplicationSummary) => (
        <div className="flex min-w-0 flex-col">
          <span className="break-words text-sm font-medium">{String(value)}</span>
          <span className="break-words text-xs text-muted-foreground">{row.intake}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      filterable: true,
      align: 'center',
      render: (value: unknown, row: ApplicationSummary) => {
        const strValue = String(value ?? '')
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
          draft: { color: 'bg-gray-100 text-gray-800 border-gray-300', label: 'DRAFT' },
          submitted: { color: 'bg-blue-100 text-blue-800 border-blue-300', label: 'SUBMITTED' },
          under_review: { color: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: 'UNDER REVIEW' },
          waitlisted: { color: 'bg-purple-100 text-purple-800 border-purple-300', label: 'WAITLISTED' },
          conditionally_approved: { color: 'bg-amber-100 text-amber-800 border-amber-300', label: 'CONDITIONAL' },
          approved: { color: 'bg-green-100 text-green-800 border-green-300', label: 'APPROVED' },
          enrolled: { color: 'bg-emerald-100 text-emerald-800 border-emerald-300', label: 'ENROLLED' },
          rejected: { color: 'bg-red-100 text-red-800 border-red-300', label: 'REJECTED' },
          withdrawn: { color: 'bg-slate-100 text-slate-800 border-slate-300', label: 'WITHDRAWN' },
          expired: { color: 'bg-orange-100 text-orange-800 border-orange-300', label: 'EXPIRED' },
          enrollment_expired: { color: 'bg-orange-100 text-orange-800 border-orange-300', label: 'ENROLLMENT EXPIRED' },
        };
        const config = statusConfig[strValue] || { color: 'bg-gray-100 text-foreground border-gray-300', label: strValue?.toUpperCase() || 'UNKNOWN' };
        return (
          <span className={`inline-flex max-w-full min-w-0 items-center rounded-md border px-2 py-0.5 text-center text-xs font-medium leading-tight ${config.color}`}>
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
      render: (value: unknown) => {
        const normalized = normalizePaymentStatus(String(value ?? ''));
        const badgeStyles: Record<string, string> = {
          not_paid: 'bg-slate-100 text-slate-800 border-slate-300',
          pending_review: 'bg-orange-100 text-orange-800 border-orange-300',
          verified: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          deferred: 'bg-sky-100 text-sky-800 border-sky-300',
          rejected: 'bg-rose-100 text-rose-800 border-rose-300',
        };

        return (
          <span className={`inline-flex max-w-full min-w-0 items-center rounded-md border px-2 py-0.5 text-center text-xs font-medium leading-tight ${badgeStyles[normalized]}`}>
            {getPaymentStatusLabel(normalized)}
          </span>
        );
      },
    },
    {
      key: 'points',
      header: 'Points',
      sortable: true,
      align: 'center',
      width: '80px',
      render: (value: unknown, row: ApplicationSummary) => {
        const numValue = Number(value) || 0
        return (
        <div className="flex flex-col items-center">
          <span className={cn('font-semibold', getPointsColor(numValue))}>
            {numValue > 0 ? numValue : '-'}
          </span>
          {row.total_subjects > 0 && (
            <span className="text-xs text-muted-foreground">
              {row.total_subjects} subj
            </span>
          )}
        </div>
        )
      },
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      width: '120px',
      render: (value: unknown, row: ApplicationSummary) => (
        <div className="flex flex-col">
          <span className="text-sm">{formatTableDate(String(value ?? '') || row.created_at)}</span>
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
  const handleSelectionChange = useCallback((ids: (string | number | boolean | undefined)[]) => {
    onSelectionChange?.(ids.filter((id): id is string => typeof id === 'string'));
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
      className={cn('overflow-hidden rounded-lg border border-border bg-white shadow-sm', className)}
      striped
    />
  );
}

export default ApplicationsTableView;
