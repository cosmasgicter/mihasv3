import React from 'react'
import { cn } from '@/lib/utils'

interface SkipLinkProps {
  href: string
  children: React.ReactNode
  className?: string
}

/**
 * Skip Link Component
 * Provides keyboard users a way to skip repetitive navigation
 * Visible only when focused
 */
export function SkipLink({ href, children, className }: SkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        // Hidden by default
        'sr-only',
        // Visible when focused
        'focus:not-sr-only',
        'focus:absolute',
        'focus:top-4',
        'focus:left-4',
        'focus:z-[9999]',
        // Styling
        'bg-primary',
        'text-primary-foreground',
        'px-4',
        'py-2',
        'rounded-lg',
        'font-medium',
        'shadow-lg',
        // Focus indicator
        'focus:outline-none',
        'focus:ring-4',
        'focus:ring-primary/50',
        // Animation
        'transition-all',
        'duration-200',
        className
      )}
    >
      {children}
    </a>
  )
}

/**
 * Skip Links Container
 * Groups multiple skip links at the top of the page
 */
export function SkipLinks({ children }: { children: React.ReactNode }) {
  return (
    <div className="skip-links" aria-label="Skip links">
      {children}
    </div>
  )
}
