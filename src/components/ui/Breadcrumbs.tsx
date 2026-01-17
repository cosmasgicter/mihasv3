/**
 * @deprecated This simple Breadcrumbs component is deprecated.
 * Use the full-featured Breadcrumbs from '@/components/navigation/Breadcrumbs' instead.
 * This file will be removed in a future version.
 * 
 * Migration:
 * - Replace `import { Breadcrumbs } from '@/components/ui/Breadcrumbs'`
 * - With `import { Breadcrumbs } from '@/components/navigation/Breadcrumbs'`
 * 
 * The navigation version provides:
 * - Auto-generation from route hierarchy
 * - React Router integration
 * - Proper ARIA attributes
 * - Schema.org structured data
 */
import React from 'react'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface BreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[]
}

export function Breadcrumbs({ className, items, ...props }: BreadcrumbsProps) {
  return (
    <nav className={cn('flex items-center text-sm', className)} {...props}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          {index > 0 && <ChevronRight className="h-4 w-4 mx-2 text-foreground/40" />}
          {item.href ? (
            <a
              href={item.href}
              className="text-foreground/60 hover:text-gray-900 transition-colors"
            >
              {item.label}
            </a>
          ) : (
            <span className="text-gray-900 font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  )
}
