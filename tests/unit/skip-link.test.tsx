/**
 * Skip Link Visibility Unit Tests
 * 
 * Tests for skip link visibility states:
 * - Hidden by default
 * - Visible on focus
 * - Hidden on blur
 * 
 * Requirements: 4.1, 4.2, 4.3 - Skip links hidden by default, visible on focus
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SkipLink } from '@/components/ui/SkipLink'
import { SkipLinks } from '@/components/ui/SkipLinks'
import { skipLinkClasses, defaultSkipLinks } from '@/lib/accessibility-utils'

describe('Skip Link Visibility', () => {
  afterEach(() => {
    cleanup()
  })

  describe('SkipLink Component', () => {
    it('should render with sr-only class (hidden by default)', () => {
      render(<SkipLink href="#main-content">Skip to main content</SkipLink>)
      
      const link = screen.getByRole('link', { name: 'Skip to main content' })
      expect(link).toBeDefined()
      
      // Should have sr-only class for screen-reader-only visibility
      expect(link.classList.contains('sr-only')).toBe(true)
    })

    it('should have correct href attribute', () => {
      render(<SkipLink href="#main-content">Skip to main content</SkipLink>)
      
      const link = screen.getByRole('link', { name: 'Skip to main content' })
      expect(link.getAttribute('href')).toBe('#main-content')
    })

    it('should have focus:not-sr-only class for visibility on focus', () => {
      render(<SkipLink href="#main-content">Skip to main content</SkipLink>)
      
      const link = screen.getByRole('link', { name: 'Skip to main content' })
      
      // Check that the element has focus-related classes
      const classString = link.className
      expect(classString).toContain('focus:not-sr-only')
    })

    it('should have proper z-index when focused', () => {
      render(<SkipLink href="#main-content">Skip to main content</SkipLink>)
      
      const link = screen.getByRole('link', { name: 'Skip to main content' })
      const classString = link.className
      
      // Should have high z-index for visibility
      expect(classString).toContain('focus:z-[9999]')
    })

    it('should have proper positioning classes', () => {
      render(<SkipLink href="#main-content">Skip to main content</SkipLink>)
      
      const link = screen.getByRole('link', { name: 'Skip to main content' })
      const classString = link.className
      
      // Should have absolute positioning when focused
      expect(classString).toContain('focus:absolute')
      expect(classString).toContain('focus:left-4')
      expect(classString).toContain('focus:top-4')
    })

    it('should render with custom text', () => {
      render(<SkipLink href="#content">Custom skip text</SkipLink>)
      
      const link = screen.getByRole('link', { name: 'Custom skip text' })
      expect(link).toBeDefined()
      expect(link.textContent).toBe('Custom skip text')
    })

    it('should handle href without hash prefix', () => {
      render(<SkipLink href="main-content">Skip to main</SkipLink>)
      
      const link = screen.getByRole('link', { name: 'Skip to main' })
      // The component should handle both formats
      expect(link.getAttribute('href')).toContain('main-content')
    })
  })

  describe('SkipLinks Component', () => {
    it('should render default skip links', () => {
      render(<SkipLinks />)
      
      // Should render the default skip link to main content
      const mainContentLink = screen.getByRole('link', { name: 'Skip to main content' })
      expect(mainContentLink).toBeDefined()
    })

    it('should render custom skip links', () => {
      const customLinks = [
        { targetId: 'custom-content', label: 'Skip to custom content' },
        { targetId: 'sidebar', label: 'Skip to sidebar' },
      ]
      
      render(<SkipLinks links={customLinks} />)
      
      const customLink = screen.getByRole('link', { name: 'Skip to custom content' })
      const sidebarLink = screen.getByRole('link', { name: 'Skip to sidebar' })
      
      expect(customLink).toBeDefined()
      expect(sidebarLink).toBeDefined()
    })

    it('should have correct href for each link', () => {
      const customLinks = [
        { targetId: 'main', label: 'Skip to main' },
        { targetId: 'nav', label: 'Skip to nav' },
      ]
      
      render(<SkipLinks links={customLinks} />)
      
      const mainLink = screen.getByRole('link', { name: 'Skip to main' })
      const navLink = screen.getByRole('link', { name: 'Skip to nav' })
      
      expect(mainLink.getAttribute('href')).toBe('#main')
      expect(navLink.getAttribute('href')).toBe('#nav')
    })
  })

  describe('skipLinkClasses utility', () => {
    it('should include sr-only class', () => {
      expect(skipLinkClasses).toContain('sr-only')
    })

    it('should include focus:not-sr-only class', () => {
      expect(skipLinkClasses).toContain('focus:not-sr-only')
    })

    it('should include focus positioning classes', () => {
      expect(skipLinkClasses).toContain('focus:absolute')
      expect(skipLinkClasses).toContain('focus:left-4')
      expect(skipLinkClasses).toContain('focus:top-4')
    })

    it('should include focus z-index class', () => {
      expect(skipLinkClasses).toContain('focus:z-[9999]')
    })

    it('should include focus styling classes', () => {
      expect(skipLinkClasses).toContain('focus:px-4')
      expect(skipLinkClasses).toContain('focus:py-2')
      expect(skipLinkClasses).toContain('focus:rounded-lg')
    })

    it('should include focus ring classes', () => {
      expect(skipLinkClasses).toContain('focus:ring-2')
      expect(skipLinkClasses).toContain('focus:outline-none')
    })
  })

  describe('defaultSkipLinks configuration', () => {
    it('should have main-content as primary target', () => {
      expect(defaultSkipLinks.length).toBeGreaterThan(0)
      expect(defaultSkipLinks[0].targetId).toBe('main-content')
    })

    it('should have descriptive labels', () => {
      defaultSkipLinks.forEach(link => {
        expect(link.label).toBeDefined()
        expect(link.label.length).toBeGreaterThan(0)
      })
    })

    it('should not include footer as a target', () => {
      // Requirement 4.4: Skip links should point to main content, not footer
      const footerLink = defaultSkipLinks.find(link => link.targetId === 'footer')
      expect(footerLink).toBeUndefined()
    })
  })
})
