import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'elevated' | 'gradient' | 'interactive'
  hover?: boolean
}

export function Card({ className, variant = 'default', hover = false, ...props }: CardProps) {
  const baseClasses = cn(
    'rounded-lg bg-card shadow-sm transition-all duration-100',
    variant === 'gradient' && 'border border-transparent bg-gradient-to-br from-card via-card to-primary/5',
    variant === 'elevated' && 'shadow-lg',
    variant === 'interactive' && 'cursor-pointer hover:shadow-md hover:brightness-95 active:scale-[0.99]',
    variant === 'default' && 'border border-border',
    hover && 'hover:shadow-lg hover:shadow-blue-500/10 hover:brightness-95 cursor-pointer',
    className
  )

  const prefersReducedMotion = useReducedMotion()

  if (hover) {
    if (prefersReducedMotion) {
      return (
        <div className={baseClasses} {...props} />
      )
    }

    return (
      <motion.div
        className={baseClasses}
        whileHover={{ y: -4, transition: { duration: 0.2 } }}
        whileTap={{ scale: 0.995, transition: { duration: 0.08 } }}
        {...(props as any)}
      />
    )
  }

  // For non-hover cards, provide a gentle mount entrance when motion is allowed.
  if (prefersReducedMotion) {
    return <div className={baseClasses} {...props} />
  }

  return (
    <motion.div
      className={baseClasses}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      {...(props as any)}
    />
  )
}

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    // Use token-backed padding via `.card-padding` so spacing is centralized
    <div className={cn('flex flex-col space-y-1.5 card-padding', className)} {...props} />
  )
}

type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>

export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn('font-semibold text-foreground', className)}
      style={{ fontSize: 'var(--type-lg)' }}
      {...props}
    />
  )
}

type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p
      className={cn('text-foreground', className)}
      style={{ fontSize: 'var(--type-sm)' }}
      {...props}
    />
  )
}

type CardContentProps = React.HTMLAttributes<HTMLDivElement>

export function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn('card-padding pt-0', className)} {...props} />
}

type CardFooterProps = React.HTMLAttributes<HTMLDivElement>

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div className={cn('flex items-center card-padding pt-0', className)} {...props} />
  )
}