import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Card Component - shadcn/ui pattern with MIHAS extensions
 * 
 * Follows shadcn/ui Card pattern with additional variants for MIHAS design system.
 * Uses CSS transitions instead of framer-motion for better performance.
 * Respects prefers-reduced-motion via CSS media queries.
 * 
 * @requirements 4.2, 4.3, 4.4, 4.5
 */

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'elevated' | 'gradient' | 'interactive'
  hover?: boolean
}

export function Card({ className, variant = 'default', hover = false, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        // Base styles - shadcn/ui pattern
        'rounded-lg bg-card text-card-foreground shadow-sm',
        // CSS-based animation that respects prefers-reduced-motion
        'transition-all duration-200 ease-out',
        'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1',
        // Variant styles
        variant === 'default' && 'border border-border',
        variant === 'gradient' && 'border border-transparent bg-gradient-to-br from-card via-card to-primary/5',
        variant === 'elevated' && 'shadow-lg border border-border',
        variant === 'interactive' && 'border border-border cursor-pointer hover:shadow-md hover:brightness-[0.98] active:scale-[0.99] active:brightness-95',
        // Hover effect (optional)
        hover && 'cursor-pointer hover:shadow-lg hover:shadow-primary/10 hover:brightness-[0.98] motion-safe:hover:-translate-y-1',
        className
      )}
      {...props}
    />
  )
}

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col space-y-1.5 card-padding', className)}
      {...props}
    />
  )
}

type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>

export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      data-slot="card-title"
      className={cn('font-semibold leading-none tracking-tight text-foreground', className)}
      style={{ fontSize: 'var(--type-lg)' }}
      {...props}
    />
  )
}

type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-muted-foreground', className)}
      style={{ fontSize: 'var(--type-sm)' }}
      {...props}
    />
  )
}

type CardContentProps = React.HTMLAttributes<HTMLDivElement>

export function CardContent({ className, ...props }: CardContentProps) {
  return (
    <div
      data-slot="card-content"
      className={cn('card-padding pt-0', className)}
      {...props}
    />
  )
}

type CardFooterProps = React.HTMLAttributes<HTMLDivElement>

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center card-padding pt-0', className)}
      {...props}
    />
  )
}
