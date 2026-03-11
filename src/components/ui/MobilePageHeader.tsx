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
        'fixed top-0 left-0 right-0 z-40 flex h-14 items-center md:hidden',
        'bg-background/95 backdrop-blur-sm border-b border-border',
        className
      )}
    >
      {/* Left: back button or spacer */}
      <div className="flex-shrink-0 w-14 flex items-center justify-center">
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {/* Center: page title */}
      <h2 className="flex-1 text-center text-lg font-semibold truncate px-2">
        {title}
      </h2>

      {/* Right: actions slot or spacer */}
      <div className="flex-shrink-0 w-14 flex items-center justify-center">
        {actions}
      </div>
    </header>
  )
}
