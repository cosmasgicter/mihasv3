import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

interface Column<T> {
  id?: string
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
                <th key={col.id ?? String(col.key)} scope="col" className="px-4 py-3 text-left">
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <tr key={i} className="border-b border-border">
                {columns.map((col) => (
                  <td key={col.id ?? String(col.key)} className="px-4 py-3">
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
              key={col.id ?? String(col.key)}
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
                <td key={col.id ?? String(col.key)} className="px-4 py-3 text-sm">
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

/**
 * The phone-width record list.
 *
 * R16.1 lets an admin table become a compact record list "without losing
 * commands, filters, state, or pagination". Until admissions-v2 task 11.4 this
 * view was handed only the `always` columns and **dropped every `desktop` one**,
 * so an operator on a phone could not see an intake's start date, end date or
 * seat capacity, an institution's code or active-programme count, or a
 * programme's duration at all — the record was silently shorter than the record
 * the server sent. Compact is a density decision; it is not licence to withhold
 * a field.
 *
 * Both priorities render now. `always` fields lead, `desktop` fields follow in
 * the same definition list, and the split still means something: it decides
 * order and prominence, not presence.
 */
function CardView<T>({
  columns,
  data,
  onRowClick,
}: {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
}) {
  // `priority` now decides only which column earns the card's headline. Every
  // other column follows in the order the table declares them, so the compact
  // record reads as the same record in the same order — and a column carrying the
  // row's commands stays where the table put it (last), instead of being
  // reshuffled into the middle of the card by a priority-first sort.
  const primaryColumn = columns.find((col) => col.priority === 'always') ?? columns[0]
  const secondaryColumns = columns.filter((col) => col !== primaryColumn)

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
                    <div
                      key={col.id ?? String(col.key)}
                      data-column-key={col.id ?? String(col.key)}
                      data-column-priority={col.priority}
                      /*
                        `flex-wrap` and `min-w-0`, because a two-column row at
                        320 px with a long value (a fee amount, an institution's
                        full name) used to push the card wider than the viewport.
                        The label and the value wrap onto separate lines instead.
                      */
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                    >
                      <dt className="min-w-0 break-words text-muted-foreground">{col.header}</dt>
                      <dd className="min-w-0 break-words text-right font-medium text-foreground">{value}</dd>
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
      {/*
        Mobile: stacked card layout.

        The whole column set is handed over. This used to be
        `columns.filter(col => col.priority === 'always')`, which is where the
        record got shorter than the record the server sent: `CardView` could not
        render a `desktop` field because it was never given one. `CardView` now
        owns the ordering decision (`always` first, `desktop` after) and renders
        both, so "compact" is about prominence rather than about presence.
      */}
      <div className="md:hidden">
        <CardView columns={columns} data={data} onRowClick={onRowClick} />
      </div>
    </div>
  )
}
