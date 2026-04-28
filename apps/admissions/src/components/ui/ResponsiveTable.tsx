import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

interface Column<T> {
  key: keyof T
  header: string
  render?: (value: T[keyof T], row: T) => React.ReactNode
  priority: 'always' | 'desktop'
}

export interface ResponsiveTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  emptyState?: React.ReactNode
  loading?: boolean
  caption?: string
  className?: string
}

const SKELETON_ROWS = 5

function TableSkeleton<T>({ columns }: { columns: Column<T>[] }) {
  return (
    <>
      {/* Desktop skeleton */}
      <div className="hidden md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th key={String(col.key)} scope="col" className="px-4 py-3 text-left">
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <tr key={i} className="border-b border-border">
                {columns.map((col) => (
                  <td key={String(col.key)} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile skeleton */}
      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </>
  )
}

function TableView<T>({
  columns,
  data,
  onRowClick,
  caption,
}: {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  caption?: string
}) {
  return (
    <table className="w-full border-collapse" aria-label={caption}>
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead className="sticky top-0 z-10">
        <tr className="border-b border-border/40 bg-muted/50 ">
          {columns.map((col) => (
            <th
              key={String(col.key)}
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, rowIndex) => (
          <tr
            key={rowIndex}
            className={cn(
              'border-b border-border/40 transition-colors hover:bg-muted/30',
              onRowClick && 'cursor-pointer'
            )}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            role={onRowClick ? 'button' : undefined}
            aria-label={onRowClick ? `View details for row ${rowIndex + 1}` : undefined}
            onKeyDown={
              onRowClick
                ? (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onRowClick(row)
                    }
                  }
                : undefined
            }
          >
            {columns.map((col) => {
              const value = row[col.key]
              return (
                <td key={String(col.key)} className="px-4 py-3 text-sm">
                  {col.render ? col.render(value, row) : String(value ?? '')}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CardView<T>({
  columns,
  data,
  onRowClick,
}: {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
}) {
  const alwaysColumns = columns.filter((col) => col.priority === 'always')
  const primaryColumn = alwaysColumns[0]
  const secondaryColumns = alwaysColumns.slice(1)

  return (
    <div className="flex flex-col gap-3" role="list">
      {data.map((row, rowIndex) => {
        const primaryValue = primaryColumn
          ? primaryColumn.render
            ? primaryColumn.render(row[primaryColumn.key], row)
            : String(row[primaryColumn.key] ?? '')
          : null

        return (
          <div
            key={rowIndex}
            className={cn(
              'rounded-lg border border-border bg-card p-4 transition-shadow duration-fast',
              onRowClick && 'cursor-pointer hover:shadow-md'
            )}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            role="listitem"
            onKeyDown={
              onRowClick
                ? (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onRowClick(row)
                    }
                  }
                : undefined
            }
          >
            {primaryValue && (
              <div className="text-sm font-semibold text-foreground mb-2">
                {primaryValue}
              </div>
            )}
            {secondaryColumns.length > 0 && (
              <dl className="space-y-1">
                {secondaryColumns.map((col) => {
                  const value = col.render
                    ? col.render(row[col.key], row)
                    : String(row[col.key] ?? '')
                  return (
                    <div key={String(col.key)} className="flex justify-between text-sm">
                      <dt className="text-muted-foreground">{col.header}</dt>
                      <dd className="text-foreground font-medium">{value}</dd>
                    </div>
                  )
                })}
              </dl>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ResponsiveTable<T>({
  columns,
  data,
  onRowClick,
  emptyState,
  loading,
  caption,
  className,
}: ResponsiveTableProps<T>) {
  if (loading) {
    return (
      <div className={className}>
        <TableSkeleton columns={columns} />
      </div>
    )
  }

  if (data.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>
  }

  return (
    <div className={className}>
      {/* Desktop: standard table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border/60">
        <TableView
          columns={columns}
          data={data}
          onRowClick={onRowClick}
          caption={caption}
        />
      </div>
      {/* Mobile: stacked card layout */}
      <div className="md:hidden">
        <CardView
          columns={columns.filter((col) => col.priority === 'always')}
          data={data}
          onRowClick={onRowClick}
        />
      </div>
    </div>
  )
}
