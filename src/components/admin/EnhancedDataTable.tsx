/**
 * EnhancedDataTable Component
 * A sortable, filterable data table with pagination and smooth transitions
 * 
 * @requirements 6.3, 6.5 - Enhanced data tables with shadcn/ui
 * 
 * Features:
 * - Sortable columns with visual indicators
 * - Filterable data with search
 * - Pagination with smooth transitions
 * - 8starlabs StatusIndicator integration
 * - Responsive design with mobile card view
 * - Reduced motion support
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
} from 'lucide-react';
import { StatusBadge } from '@/components/8starlabs/status-indicator';
import { cn } from '@/lib/utils';

// Types
export type SortDirection = 'asc' | 'desc' | null;

export interface Column<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
  statusMapping?: Record<string, 'operational' | 'degraded' | 'down' | 'idle' | 'pending' | 'success' | 'error' | 'warning'>;
}

export interface EnhancedDataTableProps<T extends object> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  // Pagination
  pageSize?: number;
  pageSizeOptions?: number[];
  // Sorting
  defaultSortKey?: keyof T | string;
  defaultSortDirection?: SortDirection;
  // Filtering
  searchable?: boolean;
  searchPlaceholder?: string;
  // Selection
  selectable?: boolean;
  selectedRows?: T[keyof T][];
  onSelectionChange?: (selectedIds: T[keyof T][]) => void;
  // Actions
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  // Loading
  loading?: boolean;
  // Empty state
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  // Styling
  className?: string;
  compact?: boolean;
  striped?: boolean;
  // Mobile
  mobileBreakpoint?: number;
}

// Pagination component with smooth transitions
function TablePagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const showPages = 5;
    
    if (totalPages <= showPages + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      
      if (currentPage > 3) pages.push('ellipsis');
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) pages.push(i);
      
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      
      pages.push(totalPages);
    }
    
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-border">
      {/* Items info */}
      <div className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{startItem}</span> to{' '}
        <span className="font-medium text-foreground">{endItem}</span> of{' '}
        <span className="font-medium text-foreground">{totalItems}</span> results
      </div>

      {/* Page size selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            currentPage === 1
              ? 'text-muted-foreground cursor-not-allowed'
              : 'hover:bg-muted text-foreground'
          )}
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>

        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            currentPage === 1
              ? 'text-muted-foreground cursor-not-allowed'
              : 'hover:bg-muted text-foreground'
          )}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1 mx-2">
          {getPageNumbers().map((page, index) =>
            page === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={cn(
                  'min-w-[32px] h-8 px-2 rounded-md text-sm font-medium transition-colors',
                  currentPage === page
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                {page}
              </button>
            )
          )}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            currentPage === totalPages
              ? 'text-muted-foreground cursor-not-allowed'
              : 'hover:bg-muted text-foreground'
          )}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            currentPage === totalPages
              ? 'text-muted-foreground cursor-not-allowed'
              : 'hover:bg-muted text-foreground'
          )}
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}


// Sort indicator component
function SortIndicator({ direction }: { direction: SortDirection }) {
  if (!direction) {
    return (
      <div className="flex flex-col ml-1 opacity-30">
        <ChevronUp className="h-3 w-3 -mb-1" />
        <ChevronDown className="h-3 w-3" />
      </div>
    );
  }

  return direction === 'asc' ? (
    <ChevronUp className="h-4 w-4 ml-1 text-primary" />
  ) : (
    <ChevronDown className="h-4 w-4 ml-1 text-primary" />
  );
}

// Table skeleton for loading state
function TableSkeleton({ columns, rows }: { columns: number; rows: number }) {
  return (
    <div className="animate-pulse">
      <div className="h-12 bg-muted rounded-t-lg" />
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 px-4 py-3 border-b border-border"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={colIndex}
              className="h-4 bg-muted rounded flex-1"
              style={{ maxWidth: `${100 / columns}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Main component
export function EnhancedDataTable<T extends object>({
  data,
  columns,
  keyField,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [5, 10, 20, 50],
  defaultSortKey,
  defaultSortDirection = null,
  searchable = true,
  searchPlaceholder = 'Search...',
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  onRowClick,
  rowActions,
  loading = false,
  emptyMessage = 'No data available',
  emptyIcon,
  className,
  compact = false,
  striped = false,
}: EnhancedDataTableProps<T>) {
  
  
  // State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortKey, setSortKey] = useState<keyof T | string | null>(defaultSortKey || null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
  const [searchQuery, setSearchQuery] = useState('');

  // Get nested value from object
  const getNestedValue = useCallback((obj: T, path: string): unknown => {
    return path.split('.').reduce((acc: unknown, part: string) => {
      if (acc !== null && acc !== undefined && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[part]
      }
      return undefined
    }, obj as unknown);
  }, []);

  // Filter data
  const filteredData = useMemo(() => {
    if (!searchQuery) return data;

    const query = searchQuery.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        if (!col.filterable && col.filterable !== undefined) return false;
        const value = getNestedValue(row, col.key as string);
        return String(value).toLowerCase().includes(query);
      })
    );
  }, [data, searchQuery, columns, getNestedValue]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = getNestedValue(a, sortKey as string);
      const bValue = getNestedValue(b, sortKey as string);

      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const comparison = aValue < bValue ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortKey, sortDirection, getNestedValue]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Handle sort
  const handleSort = useCallback((key: keyof T | string) => {
    if (sortKey === key) {
      setSortDirection((prev) =>
        prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'
      );
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  }, [sortKey]);

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  // Handle page size change
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  // Handle selection
  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    
    const allIds = paginatedData.map((row) => row[keyField]);
    const allSelected = allIds.every((id) => selectedRows.includes(id));
    
    if (allSelected) {
      onSelectionChange(selectedRows.filter((id) => !allIds.includes(id)));
    } else {
      onSelectionChange([...new Set([...selectedRows, ...allIds])]);
    }
  }, [paginatedData, keyField, selectedRows, onSelectionChange]);

  const handleSelectRow = useCallback((id: T[keyof T]) => {
    if (!onSelectionChange) return;
    
    if (selectedRows.includes(id)) {
      onSelectionChange(selectedRows.filter((rowId) => rowId !== id));
    } else {
      onSelectionChange([...selectedRows, id]);
    }
  }, [selectedRows, onSelectionChange]);

  // Render cell content
  const renderCell = useCallback((column: Column<T>, row: T, index: number): React.ReactNode => {
    const value = getNestedValue(row, column.key as string);

    if (column.render) {
      return column.render(value, row, index);
    }

    // Handle status columns with StatusIndicator
    // value must be a string key to index into statusMapping
    if (column.statusMapping && (typeof value === 'string' || typeof value === 'number') && value in column.statusMapping) {
      const statusKey = String(value);
      return (
        <StatusBadge
          status={column.statusMapping[statusKey]}
          label={statusKey.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
        />
      );
    }

    if (value === null || value === undefined) return '-';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '-';
  }, [getNestedValue]);

  if (loading) {
    return (
      <div className={cn('bg-card rounded-xl border border-border overflow-hidden', className)}>
        <TableSkeleton columns={columns.length} rows={pageSize} />
      </div>
    );
  }

  return (
    <div className={cn('bg-card rounded-xl border border-border overflow-hidden', className)}>
      {/* Search and filters */}
      {searchable && (
        <div className="p-4 border-b border-border">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full h-10 pl-10 pr-10 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      paginatedData.length > 0 &&
                      paginatedData.every((row) => selectedRows.includes(row[keyField]))
                    }
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={cn(
                    'px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider',
                    column.align === 'center' && 'text-center',
                    column.align === 'right' && 'text-right',
                    column.sortable && 'cursor-pointer select-none hover:bg-muted/80 transition-colors'
                  )}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className={cn(
                    'flex items-center',
                    column.align === 'center' && 'justify-center',
                    column.align === 'right' && 'justify-end'
                  )}>
                    {column.header}
                    {column.sortable && (
                      <SortIndicator
                        direction={sortKey === column.key ? sortDirection : null}
                      />
                    )}
                  </div>
                </th>
              ))}
              {rowActions && <th className="w-12 px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            
              {paginatedData.length > 0 ? (
                paginatedData.map((row, index) => (
                  <tr className={cn(
                      'border-b border-border transition-colors',
                      striped && index % 2 === 1 && 'bg-muted/30',
                      onRowClick && 'cursor-pointer',
                      selectedRows.includes(row[keyField]) && 'bg-primary/5'
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(row[keyField])}
                          onChange={() => handleSelectRow(row[keyField])}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={String(column.key)}
                        className={cn(
                          'px-4 text-sm text-foreground',
                          compact ? 'py-2' : 'py-3',
                          column.align === 'center' && 'text-center',
                          column.align === 'right' && 'text-right'
                        )}
                      >
                        {renderCell(column, row, index)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}
                    className="px-4 py-12 text-center"
                  >
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      {emptyIcon}
                      <p>{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              )}
            
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sortedData.length > 0 && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={sortedData.length}
          pageSizeOptions={pageSizeOptions}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}

export default EnhancedDataTable;
