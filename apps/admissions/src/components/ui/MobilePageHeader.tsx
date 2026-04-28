import React from 'react'
import { ArrowLeft } from '@/components/icons'
import { cn } from '@/lib/utils'

export interface MobilePageHeaderProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  actions?: React.ReactNode
  className?: string
}

export function MobilePageHeader({
  title,
  showBack,
  onBack,
  actions,
  className,
}: MobilePageHeaderProps) {
  return (
    <header
      className={cn(
        'fixed left-0 right-0 top-0 z-40 flex h-16 items-center md:hidden',
        'border-b border-border/60 bg-background shadow-sm',
        className
      )}
    >
      {/* Left: back button or spacer */}
      <div className="flex w-14 flex-shrink-0 items-center justify-center">
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {/* Center: page title */}
      <h2 className="flex-1 truncate px-2 text-center text-base font-bold tracking-tight text-foreground">
        {title}
      </h2>

      {/* Right: actions slot or spacer */}
      <div className="flex-shrink-0 min-w-[44px] pr-2 flex items-center justify-end">
        {actions}
      </div>
    </header>
  )
}
