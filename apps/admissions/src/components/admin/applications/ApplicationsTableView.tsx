/**
 * ApplicationsTableView Component
 * Enhanced table view for applications using EnhancedDataTable with StatusIndicator
 * 
 * @requirements 6.3, 6.5 - Enhanced data tables with shadcn/ui and 8starlabs StatusIndicator
 */

import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileText } from 'lucide-react';
import { EnhancedDataTable, type Column } from '@/components/admin/EnhancedDataTable';
import { DraftBadge } from '@/components/admin/applications/DraftBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { cn } from '@/lib/utils';
import { getPaymentStatusLabel, normalizePaymentStatus } from '@/lib/paymentStatus';
import { documentStateText } from '@/lib/adminQueueText';
import type { ApplicationStatus } from '@/types/applicationStatus';
import type { ApplicationSummary } from '@/hooks/admin/useApplicationsData';
interface ApplicationsTableViewProps {
  applications: ApplicationSummary[];
  onViewDetails: (id: string) => void;
  onStatusUpdate: (id: string, status: string) => void | Promise<void>;
  /** The review route for a row, so the applicant's name is a real link (task 30.4). */
  reviewHref?: (id: string) => string;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  loading?: boolean;
  className?: string;
}
/**
 * The queue as a table (platform-simplification tasks 30.1 and 30.4, R17.1, R17.4,
 * R17.5). Columns: applicant, application number, programme, status (the row's
 * one badge), payment and documents as plain text. The server page is shown
 * whole: `RosterPagination` is the queue's one pager, and the filters above are
 * its one search.
 */
export function ApplicationsTableView({
  applications,
  onViewDetails,
  reviewHref,
  selectedIds = [],
  onSelectionChange,
  loading = false,
  className,
}: ApplicationsTableViewProps) {
  const columns: Column<ApplicationSummary>[] = useMemo(() => [
    {
      key: 'full_name',
      header: 'Applicant',
      sortable: true,
      render: (value: unknown, row: ApplicationSummary) => (
        reviewHref ? (
          <Link
            to={reviewHref(row.id)}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex min-h-touch items-center break-words font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {String(value)}
          </Link>
        ) : (
          <span className="break-words font-medium text-foreground">{String(value)}</span>
        )
      ),
    },
    {
      key: 'application_number',
      header: 'Application number',
      sortable: true,
      render: (value: unknown) => (
        <span className="font-mono text-sm text-foreground">{String(value)}</span>
      ),
    },
    {
      key: 'program',
      header: 'Programme',
      sortable: true,
      render: (value: unknown, row: ApplicationSummary) => (
        <div className="flex min-w-0 flex-col">
          <span className="break-words text-sm">{String(value)}</span>
          <span className="break-words text-sm text-muted-foreground">{row.intake}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (value: unknown, row: ApplicationSummary) => (
        row.isDraft ? (
          <DraftBadge
            completionPercentage={row.completionPercentage}
            lastUpdated={row.lastUpdated || row.created_at}
          />
        ) : (
          <StatusPill status={String(value ?? '') as ApplicationStatus} />
        )
      ),
    },
    {
      key: 'payment_status',
      header: 'Payment',
      sortable: true,
      render: (value: unknown) => (
        <span className="text-sm text-foreground">
          {getPaymentStatusLabel(normalizePaymentStatus(String(value ?? '')))}
        </span>
      ),
    },
    {
      key: 'current_document_count',
      header: 'Documents',
      render: (_value: unknown, row: ApplicationSummary) => (
        <span className="text-sm text-foreground">
          {documentStateText(row.current_document_count, row.verified_document_count) ?? 'Not available'}
        </span>
      ),
    },
  ], [reviewHref]);
  // Row actions renderer. Same label as the card's command (task 30.2): both
  // open the review route, so they carry one name.
  const rowActions = useCallback((row: ApplicationSummary) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onViewDetails(row.id);
      }}
      className="inline-flex min-h-touch items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
    >
      <Eye className="h-4 w-4" aria-hidden="true" />
      Open review
    </button>
  ), [onViewDetails]);

  // Handle row click
  const handleRowClick = useCallback((row: ApplicationSummary) => {
    onViewDetails(row.id);
  }, [onViewDetails]);

  // Handle selection change
  const handleSelectionChange = useCallback((ids: (string | number | boolean | null | undefined)[]) => {
    onSelectionChange?.(ids.filter((id): id is string => typeof id === 'string'));
  }, [onSelectionChange]);

  return (
    <EnhancedDataTable
      data={applications}
      columns={columns}
      keyField="id"
      pageSize={Math.max(applications.length, 1)}
      showPagination={false}
      defaultSortKey="submitted_at"
      defaultSortDirection="desc"
      searchable={false}
      selectable={!!onSelectionChange}
      rowSelectionLabel={(row) => `Select application ${row.application_number}`}
      selectedRows={selectedIds}
      onSelectionChange={handleSelectionChange}
      onRowClick={handleRowClick}
      rowActions={rowActions}
      loading={loading}
      emptyMessage="No applications found"
      emptyIcon={<FileText className="h-12 w-12 text-muted-foreground" />}
      className={cn('overflow-hidden rounded-lg border border-border bg-card shadow-sm', className)}
      striped
    />
  );
}

export default ApplicationsTableView;
