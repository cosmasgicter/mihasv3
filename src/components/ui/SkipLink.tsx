/**
 * Skip Link Component
 * Provides keyboard users a way to skip to main content
 * WCAG 2.1 Level A requirement
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4 - Skip link visibility and correct targets
 */

import React from 'react'
import { cn } from '@/lib/utils'
import { skipLinkClasses } from '@/lib/accessibility-utils'

interface SkipLinkProps {
  href?: string
  children?: React.ReactNode
  className?: string
}

export function SkipLink({ 
  href = '#main-content', 
  children = 'Skip to main content',
  className 
}: SkipLinkProps) {
  const targetId = href.replace('#', '')
  
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const target = document.getElementById(targetId)
    if (target instanceof HTMLElement) {
      // Make the target focusable if it isn't already
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1')
      }
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
