import React from 'react'
import { cn } from '@/lib/utils'
import { EnhancedLoadingSpinner } from './EnhancedLoadingSpinner'

interface MobileOptimizedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'touch' // 'touch' ensures 44px minimum
  loading?: boolean
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
  touchOptimized?: boolean // Force 44px minimum even for smaller sizes
}

export function MobileOptimizedButton({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  touchOptimized = true,
  children,
  disabled,
  ...props
}: MobileOptimizedButtonProps) {
  // Base classes for all buttons
  const baseClasses = cn(
    'inline-flex items-center justify-center gap-2 font-medium',
    'rounded-lg transition-all duration-200 ease-in-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:pointer-events-none',
    'select-none touch-manipulation', // Better mobile interaction
    // Touch optimization - ensure minimum 44px touch target
    touchOptimized && 'min-h-[44px] min-w-[44px]',
    fullWidth && 'w-full'
  )

  // Size variants with mobile-first approach
  const sizeClasses = {
    sm: cn(
      'text-sm px-3 py-2',
      touchOptimized ? 'min-h-[44px]' : 'h-8'
    ),
    md: cn(
      'text-sm px-4 py-2.5',
      touchOptimized ? 'min-h-[44px]' : 'h-10'
    ),
    lg: cn(
      'text-base px-6 py-3',
      'h-12' // Already meets touch target
    ),
    xl: cn(
      'text-lg px-8 py-4',
      'h-14' // Extra large for important actions
    ),
    touch: 'text-sm px-4 py-3 h-[44px] min-w-[44px]' // Explicitly touch-optimized
  }

  // Color variants with better contrast for mobile
  const variantClasses = {
    primary: cn(
      'bg-blue-600 text-white shadow-sm',
      'hover:bg-blue-700 active:bg-blue-800',
      'focus-visible:ring-blue-500'
    ),
    secondary: cn(
      'bg-accent text-foreground shadow-sm',
      'hover:bg-skeleton active:bg-muted',
      'focus-visible:ring-gray-500'
    ),
    outline: cn(
      'border-2 border-input bg-card text-foreground',
      'hover:bg-muted hover:border-gray-400',
      'active:bg-accent active:border-gray-500',
      'focus-visible:ring-gray-500'
    ),
    ghost: cn(
      'text-foreground hover:bg-accent active:bg-skeleton',
      'focus-visible:ring-gray-500'
    ),
    danger: cn(
      'bg-red-600 text-white shadow-sm',
      'hover:bg-red-700 active:bg-red-800',
      'focus-visible:ring-red-500'
    )
  }

  // Mobile-specific responsive adjustments
  const mobileClasses = cn(
    // Larger text and padding on mobile
    'sm:text-base sm:px-6 sm:py-3',
    // Better spacing for touch
    'active:scale-[0.98] transform transition-transform',
    // Ensure adequate contrast
    'font-medium'
  )

  const content = (
    <>
      {loading && (
        <EnhancedLoadingSpinner 
          size="sm" 
          color={variant === 'primary' ? 'secondary' : 'primary'} 
        />
      )}
      {!loading && icon && iconPosition === 'left' && (
        <span className="shrink-0">{icon}</span>
      )}
      {children && (
        <span className={cn(
          loading && 'opacity-70',
          // Ensure text doesn't break on mobile
          'whitespace-nowrap overflow-hidden text-ellipsis'
        )}>
          {children}
        </span>
      )}
      {!loading && icon && iconPosition === 'right' && (
        <span className="shrink-0">{icon}</span>
      )}
    </>
  )

  return (
    <button
      className={cn(
        baseClasses,
        sizeClasses[size],
        variantClasses[variant],
        mobileClasses,
        className
      )}
      disabled={loading || disabled}
      {...props}
    >
      {content}
    </button>
  )
}

// Floating Action Button (FAB) for mobile
export function FloatingActionButton({
  className,
  icon,
  position = 'bottom-right',
  ...props
}: {
  className?: string
  icon: React.ReactNode
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const positionClasses = {
    'bottom-right': 'fixed bottom-6 right-6',
    'bottom-left': 'fixed bottom-6 left-6', 
    'top-right': 'fixed top-6 right-6',
    'top-left': 'fixed top-6 left-6'
  }

  return (
    <button
      className={cn(
        // FAB styling
        'w-14 h-14 rounded-full shadow-lg',
        'bg-blue-600 text-white',
        'hover:bg-blue-700 active:bg-blue-800',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'transition-all duration-200 ease-in-out',
        'flex items-center justify-center',
        'z-50', // Ensure it's above other content
        'disabled:opacity-50 disabled:pointer-events-none',
        // Mobile optimizations
        'touch-manipulation select-none',
        'active:scale-95 transform',
        positionClasses[position],
        className
      )}
      {...props}
    >
      {icon}
    </button>
  )
}

// Button group for mobile-optimized layouts
export function MobileButtonGroup({
  children,
  orientation = 'horizontal',
  spacing = 'md',
  className
}: {
  children: React.ReactNode
  orientation?: 'horizontal' | 'vertical'
  spacing?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const spacingClasses = {
    sm: orientation === 'horizontal' ? 'space-x-2' : 'space-y-2',
    md: orientation === 'horizontal' ? 'space-x-3' : 'space-y-3', 
    lg: orientation === 'horizontal' ? 'space-x-4' : 'space-y-4'
  }

  return (
    <div className={cn(
      'flex',
      orientation === 'horizontal' ? 'flex-row' : 'flex-col',
      spacingClasses[spacing],
      // Mobile responsiveness
      'w-full',
      // Stack vertically on very small screens
      orientation === 'horizontal' && 'flex-col sm:flex-row',
      className
    )}>
      {children}
    </div>
  )
}

// Quick action buttons for common mobile patterns
export function QuickActionButton({
  label,
  icon,
  count,
  onClick,
  className
}: {
  label: string
  icon: React.ReactNode
  count?: number
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center',
        'min-h-[64px] min-w-[64px] p-2',
        'rounded-lg bg-card shadow-sm border border-border',
        'hover:bg-muted active:bg-accent',
        'transition-colors duration-200',
        'touch-manipulation select-none',
        className
      )}
    >
      <div className="relative">
        {icon}
        {count !== undefined && count > 0 && (
          <span className="absolute -top-2 -right-2 bg-destructive/5/300 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      <span className="text-xs font-medium text-muted-foreground mt-1 text-center">
        {label}
      </span>
    </button>
  )
}
