/**
 * Heading Hierarchy Components
 * 
 * Provides semantic heading components that maintain proper hierarchy.
 * Ensures WCAG 2.1 compliance for heading structure.
 * 
 * Requirements: 10.4 - Proper heading hierarchy on all pages
 */

import React, { createContext, useContext, useMemo, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

interface HeadingContextValue {
  level: HeadingLevel
}

const HeadingContext = createContext<HeadingContextValue>({ level: 1 })

/**
 * HeadingLevelProvider
 * 
 * Sets the heading level context for child components.
 * Use this to establish the heading hierarchy in a section.
 */
interface HeadingLevelProviderProps {
  children: ReactNode
  level: HeadingLevel
}

export function HeadingLevelProvider({ children, level }: HeadingLevelProviderProps) {
  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({ level }), [level])
  
  return (
    <HeadingContext.Provider value={value}>
      {children}
    </HeadingContext.Provider>
  )
}

/**
 * useHeadingLevel
 * 
 * Hook to get the current heading level from context.
 */
export function useHeadingLevel(): HeadingLevel {
  const { level } = useContext(HeadingContext)
  return level
}

/**
 * Heading Component
 * 
 * Renders the appropriate heading element based on context or explicit level.
 */
interface HeadingProps {
  children: ReactNode
  className?: string
  /** Explicit level override */
  level?: HeadingLevel
  /** Visual size (can differ from semantic level) */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'
  /** ID for linking */
  id?: string
}

const sizeClasses = {
  xs: 'text-sm font-medium',
  sm: 'text-base font-medium',
  md: 'text-lg font-semibold',
  lg: 'text-xl font-semibold',
  xl: 'text-2xl font-bold',
  '2xl': 'text-3xl font-bold',
  '3xl': 'text-4xl font-bold',
  '4xl': 'text-5xl font-bold',
}

const defaultSizeForLevel: Record<HeadingLevel, keyof typeof sizeClasses> = {
  1: '3xl',
  2: '2xl',
  3: 'xl',
  4: 'lg',
  5: 'md',
  6: 'sm',
}

export function Heading({
  children,
  className,
  level: explicitLevel,
  size,
  id,
}: HeadingProps) {
  const contextLevel = useHeadingLevel()
  const level = explicitLevel || contextLevel
  const effectiveSize = size || defaultSizeForLevel[level]
  
  const Tag = `h${level}` as keyof JSX.IntrinsicElements
  
  return (
    <Tag
      id={id}
      className={cn(
        'text-foreground',
        sizeClasses[effectiveSize],
        className
      )}
    >
      {children}
    </Tag>
  )
}

/**
 * Section Component
 * 
 * A semantic section that automatically increments heading level.
 */
interface SectionProps {
  children: ReactNode
  className?: string
  /** ARIA label for the section */
  'aria-label'?: string
  /** ARIA labelledby for the section */
  'aria-labelledby'?: string
}

export function Section({
  children,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}: SectionProps) {
  const currentLevel = useHeadingLevel()
  const nextLevel = Math.min(currentLevel + 1, 6) as HeadingLevel
  
  return (
    <section
      className={className}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
    >
      <HeadingLevelProvider level={nextLevel}>
        {children}
      </HeadingLevelProvider>
    </section>
  )
}

/**
 * PageTitle Component
 * 
 * The main page title (h1). Should only be used once per page.
 */
interface PageTitleProps {
  children: ReactNode
  className?: string
  /** Subtitle text */
  subtitle?: string
  /** ID for linking */
  id?: string
}

export function PageTitle({
  children,
  className,
  subtitle,
  id,
}: PageTitleProps) {
  return (
    <div className={cn('mb-6', className)}>
      <h1
        id={id}
        className="text-3xl sm:text-4xl font-bold text-foreground"
      >
        {children}
      </h1>
      {subtitle && (
        <p className="mt-2 text-lg text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  )
}

/**
 * SectionTitle Component
 * 
 * A section title that uses the appropriate heading level from context.
 */
interface SectionTitleProps {
  children: ReactNode
  className?: string
  /** ID for linking */
  id?: string
  /** Description text */
  description?: string
}

export function SectionTitle({
  children,
  className,
  id,
  description,
}: SectionTitleProps) {
  const level = useHeadingLevel()
  
  return (
    <div className={cn('mb-4', className)}>
      <Heading level={level} id={id}>
        {children}
      </Heading>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  )
}

/**
 * HeadingCardTitle Component
 * 
 * A title for card components that uses heading hierarchy, typically h3 or h4.
 * Note: Use CardTitle from @/components/ui for standard card titles.
 */
interface HeadingCardTitleProps {
  children: ReactNode
  className?: string
  /** ID for linking */
  id?: string
}

export function HeadingCardTitle({
  children,
  className,
  id,
}: HeadingCardTitleProps) {
  const level = useHeadingLevel()
  
  return (
    <Heading
      level={level}
      size="lg"
      id={id}
      className={cn('mb-2', className)}
    >
      {children}
    </Heading>
  )
}

/**
 * VisuallyHidden Component
 * 
 * Hides content visually but keeps it accessible to screen readers.
 */
interface VisuallyHiddenProps {
  children: ReactNode
  as?: keyof JSX.IntrinsicElements
}

export function VisuallyHidden({
  children,
  as: Tag = 'span',
}: VisuallyHiddenProps) {
  return (
    <Tag className="sr-only">
      {children}
    </Tag>
  )
}
