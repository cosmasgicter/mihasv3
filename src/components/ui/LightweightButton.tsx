import React from 'react'
import { cn } from '@/lib/utils'

interface LightweightButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'gradient'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
}

export function LightweightButton({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: LightweightButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50'
  
  const variantClasses = {
    primary: 'bg-primary text-white hover:bg-primary/90',
    secondary: 'bg-secondary text-white hover:bg-secondary/90',
    outline: 'border-2 border-white bg-transparent text-white hover:bg-white hover:text-primary',
    gradient: 'bg-gradient-to-r from-primary via-secondary to-accent text-white hover:shadow-lg'
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