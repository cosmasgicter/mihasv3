/**
 * Skip Links Component
 * 
 * Provides keyboard users a way to skip to main content areas.
 * WCAG 2.1 Level A requirement for keyboard navigation.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4 - Skip links hidden by default, visible on focus, correct targets
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

  // Calculate vertical offset for stacked skip links (each link 48px apart when focused)
  const getTopOffset = (index: number) => {
    if (index === 0) return 'focus:top-4'
    // Stack subsequent links below the first one
    return `focus:top-[${16 + (index * 48)}px]`
  }

  return (
    <div className={cn('skip-links-container', className)}>
      {links.map((link, index) => (
        <a
          key={link.targetId}
          href={`#${link.targetId}`}
          className={cn(
            skipLinkClasses,
            // Override top position for stacked links
            index > 0 && 'focus:top-16',
            index > 1 && 'focus:top-28'
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
 * 
 * @deprecated Import SkipLink directly from '@/components/ui/SkipLink' instead.
 * This re-export is maintained for backward compatibility only.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4 - Skip link visibility and correct targets
 */
// Re-export from the canonical SkipLink component for backward compatibility
export { SkipLink } from './SkipLink'

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
