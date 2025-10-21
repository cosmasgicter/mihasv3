import React from 'react'
import { motion } from 'framer-motion'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { cardVariants } from '@/design-system/variants'

type CardProps = React.HTMLAttributes<HTMLDivElement> & 
  VariantProps<typeof cardVariants> & {
    hover?: boolean
  }

export function Card({ className, variant = 'default', hover = false, ...props }: CardProps) {
  const baseClasses = cn(cardVariants({ variant }), className)

  if (hover) {
    return (
      <motion.div
        className={baseClasses}
        whileHover={{ y: -4, transition: { duration: 0.2 } }}
        {...props}
      />
    )
  }

  return <div className={baseClasses} {...props} />
}

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div className={cn("flex flex-col space-y-1.5 p-4 md:p-6", className)} {...props} />
  )
}

type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>

export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn(
        "text-lg md:text-xl font-semibold text-foreground",
        className
      )}
      {...props}
    />
  )
}

type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p
      className={cn("text-sm text-foreground", className)}
      {...props}
    />
  )
}

type CardContentProps = React.HTMLAttributes<HTMLDivElement>

export function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn("p-4 md:p-6 pt-0", className)} {...props} />
}

type CardFooterProps = React.HTMLAttributes<HTMLDivElement>

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div className={cn("flex items-center p-4 md:p-6 pt-0", className)} {...props} />
  )
}