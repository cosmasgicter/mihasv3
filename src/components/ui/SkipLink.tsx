/**
 * Skip Link Component
 * Provides keyboard users a way to skip to main content
 * WCAG 2.1 Level A requirement
 */

import React from 'react'

interface SkipLinkProps {
  href?: string
  children?: React.ReactNode
}

export function SkipLink({ href = '#main-content', children = 'Skip to main content' }: SkipLinkProps) {
  return (
    <a
      href={href}
      className="skip-link fixed left-4 top-4 z-[9999] px-4 py-2 bg-blue-600 text-white font-medium rounded-lg shadow-lg transform -translate-y-full focus:translate-y-0 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      onClick={(e) => {
        e.preventDefault()
        const target = document.querySelector(href)
        if (target instanceof HTMLElement) {
          target.focus()
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }}
    >
      {children}
    </a>
  )
}
