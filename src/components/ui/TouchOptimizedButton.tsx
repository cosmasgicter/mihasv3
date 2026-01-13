import React, { ReactNode, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { useEnhancedResponsive, useDeviceOptimizations } from '@/hooks/useEnhancedResponsive'
import { Loader2 } from 'lucide-react'

interface TouchOptimizedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
  touchOptimized?: boolean
  hapticFeedback?: boolean
}

/**
 * Touch-optimized button with proper sizing, feedback, and accessibility
 */
export function TouchOptimizedButton({
  children,
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  touchOptimized = true,
  hapticFeedback = true,
  disabled,
  onClick,
  ...props
}: TouchOptimizedButtonProps) {
  const responsive = useEnhancedResponsive()
  const optimizations = useDeviceOptimizations()

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return

    // Haptic feedback for touch devices
    if (hapticFeedback && responsive.isTouch && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }

    onClick?.(event)
  }

  const baseClasses = cn(
    'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'active:scale-95 transform',
    touchOptimized && responsive.isTouch && 'touch-manipulation select-none',
    fullWidth && 'w-full',
    disabled && 'opacity-50 cursor-not-allowed',
    loading && 'cursor-wait'
  )

  const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-secondary',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground focus:ring-ring',
    ghost: 'hover:bg-accent hover:text-accent-foreground focus:ring-ring',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive'
  }

  const getSizeClasses = () => {
    const minTouchTarget = optimizations.minTouchTarget
    
    if (touchOptimized && responsive.isTouch) {
      return {
        sm: `h-[${Math.max(36, minTouchTarget)}px] px-3 text-sm gap-2`,
        md: `h-[${Math.max(44, minTouchTarget)}px] px-4 text-base gap-2`,
        lg: `h-[${Math.max(52, minTouchTarget)}px] px-6 text-lg gap-3`,
        xl: `h-[${Math.max(60, minTouchTarget)}px] px-8 text-xl gap-3`
      }[size]
    }

    return {
      sm: 'h-9 px-3 text-sm gap-2',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-11 px-8 text-base gap-2',
      xl: 'h-12 px-8 text-base gap-3'
    }[size]
  }

  const renderContent = () => {
    if (loading) {
      return (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {children && <span>Loading...</span>}
        </>
      )
    }

    if (icon && iconPosition === 'left') {
      return (
        <>
          {icon}
          {children && <span>{children}</span>}
        </>
      )
    }

    if (icon && iconPosition === 'right') {
      return (
        <>
          {children && <span>{children}</span>}
          {icon}
        </>
      )
    }

    return children
  }

  return (
    <button
      className={cn(
        baseClasses,
        variantClasses[variant],
        getSizeClasses(),
        className
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {renderContent()}
    </button>
  )
}

interface TouchOptimizedIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  touchOptimized?: boolean
  hapticFeedback?: boolean
}

/**
 * Touch-optimized icon button with proper accessibility
 */
export function TouchOptimizedIconButton({
  icon,
  label,
  className,
  variant = 'ghost',
  size = 'md',
  loading = false,
  touchOptimized = true,
  hapticFeedback = true,
  disabled,
  onClick,
  ...props
}: TouchOptimizedIconButtonProps) {
  const responsive = useEnhancedResponsive()
  const optimizations = useDeviceOptimizations()

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return

    // Haptic feedback for touch devices
    if (hapticFeedback && responsive.isTouch && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }

    onClick?.(event)
  }

  const baseClasses = cn(
    'inline-flex items-center justify-center rounded-lg transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'active:scale-95 transform',
    touchOptimized && responsive.isTouch && 'touch-manipulation select-none',
    disabled && 'opacity-50 cursor-not-allowed',
    loading && 'cursor-wait'
  )

  const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-secondary',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground focus:ring-ring',
    ghost: 'hover:bg-accent hover:text-accent-foreground focus:ring-ring',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive'
  }

  const getSizeClasses = () => {
    const minTouchTarget = optimizations.minTouchTarget
    
    if (touchOptimized && responsive.isTouch) {
      return {
        sm: `w-[${Math.max(36, minTouchTarget)}px] h-[${Math.max(36, minTouchTarget)}px]`,
        md: `w-[${Math.max(44, minTouchTarget)}px] h-[${Math.max(44, minTouchTarget)}px]`,
        lg: `w-[${Math.max(52, minTouchTarget)}px] h-[${Math.max(52, minTouchTarget)}px]`
      }[size]
    }

    return {
      sm: 'w-8 h-8',
      md: 'w-10 h-10',
      lg: 'w-12 h-12'
    }[size]
  }

  const getIconSize = () => {
    return {
      sm: 'w-4 h-4',
      md: 'w-5 h-5',
      lg: 'w-6 h-6'
    }[size]
  }

  return (
    <button
      className={cn(
        baseClasses,
        variantClasses[variant],
        getSizeClasses(),
        className
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      aria-label={label}
      title={label}
      {...props}
    >
      {loading ? (
        <Loader2 className={cn(getIconSize(), 'animate-spin')} />
      ) : (
        <div className={getIconSize()}>
          {icon}
        </div>
      )}
    </button>
  )
}