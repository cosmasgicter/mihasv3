import React from 'react'
import { cn } from '@/lib/utils'

interface PageLayoutProps {
  children: React.ReactNode
  className?: string
  background?: 'default' | 'gradient' | 'white' | 'gray'
}

interface PageContentProps {
  children: React.ReactNode
  className?: string
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '7xl' | 'full'
}

const backgroundClasses = {
  default: 'bg-muted',
  gradient: 'bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-blue-950 dark:to-purple-950 transition-colors duration-500',
  white: 'bg-white',
  gray: 'bg-accent dark:bg-gray-200'
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full'
}

export function PageLayout({ children, className, background = 'gradient' }: PageLayoutProps) {
  return (
    <div className={cn('page-container', backgroundClasses[background], className)}>
      {children}
    </div>
  )
}

export function PageContent({ children, className, maxWidth = '7xl' }: PageContentProps) {
  return (
    <main className="w-full">
      <div className={cn('content-wrapper', maxWidthClasses[maxWidth], 'mx-auto', className)}>
        {children}
      </div>
    </main>
  )
}

export function PageSection({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('py-4 sm:py-6 lg:py-8', className)}>
      {children}
    </section>
  )
}