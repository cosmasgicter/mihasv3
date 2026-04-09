/**
 * MIHAS Design System - Component Variants
 * Standardized component styling patterns
 */

export const buttonVariants = {
  primary: 'bg-primary hover:bg-primary/90 text-white font-semibold',
  secondary: 'bg-secondary hover:bg-secondary/90 text-foreground font-semibold',
  success: 'bg-success hover:bg-success/90 text-white font-semibold',
  error: 'bg-error hover:bg-error/90 text-white font-semibold',
  outline: 'border-2 border-primary text-primary hover:bg-primary/5 font-semibold',
  ghost: 'hover:bg-primary/5 text-primary font-medium',
  gradient: 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold',
} as const

export const buttonSizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
  xl: 'px-8 py-4 text-xl',
} as const

export const cardVariants = {
  default: 'bg-card border border-border rounded-xl p-6',
  elevated: 'bg-card shadow-lg rounded-xl p-6',
  gradient: 'bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border border-primary/30',
  flat: 'bg-card rounded-xl p-6',
} as const

export const inputVariants = {
  default: 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  error: 'w-full rounded-lg border-2 border-error bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
} as const

export const badgeVariants = {
  success: 'bg-success/10 text-success-foreground border border-success/30 px-2 py-1 rounded-full text-xs font-semibold',
  error: 'bg-error/10 text-error-foreground border border-error/30 px-2 py-1 rounded-full text-xs font-semibold',
  warning: 'bg-warning/10 text-warning-foreground border border-warning/30 px-2 py-1 rounded-full text-xs font-semibold',
  info: 'bg-primary/10 text-primary-foreground border border-primary/30 px-2 py-1 rounded-full text-xs font-semibold',
  neutral: 'bg-muted text-foreground border border-border px-2 py-1 rounded-full text-xs font-semibold',
} as const

export const layoutPatterns = {
  page: 'min-h-screen bg-background',
  container: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
  section: 'py-12 sm:py-16 lg:py-20',
  card: 'bg-card rounded-xl p-6 border border-border',
} as const
