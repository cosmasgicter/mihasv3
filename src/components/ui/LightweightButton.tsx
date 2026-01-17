import React from 'react'
import { cn } from '@/lib/utils'

/**
 * @deprecated Use `Button` from '@/components/ui/Button' instead.
 * This component will be removed in a future release.
 */
interface LightweightButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'gradient'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
}

/**
 * @deprecated Use `Button` from '@/components/ui/Button' instead.
 * This component will be removed in a future release.
 */
export function LightweightButton({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: LightweightButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50'
  
  const variantClasses = {
    primary: 'bg-primary text-gray-900 hover:bg-primary/90',
    secondary: 'bg-secondary text-gray-900 hover:bg-secondary/90',
    outline: 'border-2 border-card bg-transparent text-gray-900 hover:bg-card hover:text-primary',
    gradient: 'bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 text-gray-900 hover:shadow-lg'
  }
  
  const sizeClasses = {
    sm: 'h-9 px-4 text-sm',
    md: 'h-11 px-6 text-base',
    lg: 'h-12 px-8 text-lg',
    xl: 'h-16 px-10 text-xl'
  }

  return (
    <button
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      {children}
    </button>
  )
}