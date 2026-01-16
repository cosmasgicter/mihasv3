/**
 * Skip Links Component
 * 
 * Provides keyboard users a way to skip to main content areas.
 * WCAG 2.1 Level A requirement for keyboard navigation.
 * 
 * Requirements: 10.2, 10.3 - Skip links for keyboard navigation
 */

import React from 'react'
import { cn } from '@/lib/utils'
import { defaultSkipLinks, skipLinkClasses, type SkipLinkConfig } from '@/lib/accessibility-utils'

interface SkipLinksProps {
  /** Custom skip links configuration */
  links?: SkipLinkConfig[]
  /** Additional class names */
  className?: string
}

/**
 * Skip Links Component
 * 
 * Renders a list of skip links that are visually hidden until focused.
 * Allows keyboard users to quickly navigate to main content areas.
 */
export function SkipLinks({ links = defaultSkipLinks, className }: SkipLinksProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault()
    const target = document.getElementById(targetId)
    
    if (target) {
      // Make the target focusable if it isn't already
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1')
      }
      
      // Focus and scroll to the target
      target.focus()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className={cn('skip-links-container', className)}>
      {links.map((link, index) => (
        <a
          key={link.targetId}
          href={`#${link.targetId}`}
          className={cn(
            skipLinkClasses,
            // Stack multiple skip links
            index > 0 && 'focus:top-16'
          )}
          onClick={(e) => handleClick(e, link.targetId)}
        >
          {link.label}
        </a>
      ))}
    </div>
  )
}

/**
 * Single Skip Link Component (for backward compatibility)
 */
interface SingleSkipLinkProps {
  /** Target element ID (without #) */
  href?: string
  /** Link text */
  children?: React.ReactNode
  /** Additional class names */
  className?: string
}

export function SkipLink({
  href = '#main-content',
  children = 'Skip to main content',
  className,
}: SingleSkipLinkProps) {
  const targetId = href.replace('#', '')

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const target = document.getElementById(targetId)
    
    if (target) {
      // Make the target focusable if it isn't already
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1')
      }
      
      // Focus and scroll to the target
      target.focus()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <a
      href={href}
      className={cn(skipLinkClasses, className)}
      onClick={handleClick}
    >
      {children}
    </a>
  )
}

/**
 * Main Content Wrapper
 * 
 * Wraps main content and provides the target for skip links.
 */
interface MainContentProps {
  children: React.ReactNode
  className?: string
  id?: string
}

export function MainContent({
  children,
  className,
  id = 'main-content',
}: MainContentProps) {
  return (
    <main
      id={id}
      className={cn('outline-none', className)}
      tabIndex={-1}
      role="main"
    >
      {children}
    </main>
  )
}

/**
 * Navigation Landmark
 * 
 * Wraps navigation and provides the target for skip links.
 */
interface NavigationLandmarkProps {
  children: React.ReactNode
  className?: string
  id?: string
  label?: string
}

export function NavigationLandmark({
  children,
  className,
  id = 'navigation',
  label = 'Main navigation',
}: NavigationLandmarkProps) {
  return (
    <nav
      id={id}
      className={cn('outline-none', className)}
      tabIndex={-1}
      aria-label={label}
    >
      {children}
    </nav>
  )
}

/**
 * Footer Landmark
 * 
 * Wraps footer and provides the target for skip links.
 */
interface FooterLandmarkProps {
  children: React.ReactNode
  className?: string
  id?: string
}

export function FooterLandmark({
  children,
  className,
  id = 'footer',
}: FooterLandmarkProps) {
  return (
    <footer
      id={id}
      className={cn('outline-none', className)}
      tabIndex={-1}
    >
      {children}
    </footer>
  )
}
