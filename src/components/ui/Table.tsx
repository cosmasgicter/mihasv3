import React from 'react'
import { cn } from '@/lib/utils'

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  responsive?: boolean
}

export function Table({ className, responsive = true, ...props }: TableProps) {
  return (
    <div className={cn(responsive && 'overflow-x-auto')}>
      <table
        className={cn(
          'min-w-full divide-y divide-border',
          className
        )}
        {...props}
      />
    </div>
  )
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('bg-muted', className)}
      {...props}
    />
  )
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn('divide-y divide-border bg-card', className)}
      {...props}
    />
  )
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('hover:bg-muted/50 transition-colors', className)}
      {...props}
    />
  )
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-left text-xs font-medium text-body uppercase tracking-wider',
        className
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('px-4 py-3 text-sm text-foreground', className)}
      {...props}
    />
  )
}

interface MobileCardProps {
  data: Record<string, any>
  fields: Array<{ key: string; label: string; render?: (value: any) => React.ReactNode }>
  actions?: React.ReactNode
}

export function MobileCard({ data, fields, actions }: MobileCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      {fields.map(field => (
        <div key={field.key}>
          <dt className="text-xs font-medium text-body uppercase">{field.label}</dt>
          <dd className="mt-1 text-sm text-body">
            {field.render ? field.render(data[field.key]) : data[field.key]}
          </dd>
        </div>
      ))}
      {actions && <div className="pt-3 border-t border-border">{actions}</div>}
    </div>
  )
}
