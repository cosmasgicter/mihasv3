import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  hover?: boolean
  gradient?: boolean
}

export function Card({ className, hover = false, gradient = false, ...props }: CardProps) {
  const baseClasses = cn(
    "rounded-lg bg-white dark:bg-gray-800 shadow-sm transition-all duration-200",
    gradient && "border border-transparent bg-gradient-to-br from-white via-white to-blue-50 dark:from-gray-800 dark:via-gray-800 dark:to-blue-950",
    !gradient && "border border-gray-200 dark:border-gray-700",
    hover && "hover:shadow-lg hover:shadow-blue-500/10 dark:hover:shadow-blue-400/10",
    className
  )

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
        "text-lg md:text-xl font-semibold text-gray-900 dark:text-gray-100",
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
      className={cn("text-sm text-gray-600 dark:text-gray-400", className)}
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