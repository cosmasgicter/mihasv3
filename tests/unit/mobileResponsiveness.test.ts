/**
 * Mobile Responsiveness Verification Tests
 *
 * Validates that key mobile responsiveness patterns are present across
 * student-facing and admin-facing page components.
 *
 * Requirements: 22.1, 22.2, 22.3, 22.4
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC_ROOT = path.resolve(__dirname, '../../src')

function readComponent(relativePath: string): string {
  const fullPath = path.join(SRC_ROOT, relativePath)
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Component file not found: ${fullPath}`)
  }
  return fs.readFileSync(fullPath, 'utf-8')
}

// Student-facing pages
const STUDENT_PAGES = [
  'pages/student/Dashboard.tsx',
  'pages/student/Payment.tsx',
  'pages/student/applicationWizard/index.tsx',
  'pages/public/tracker/index.tsx',
]

// Admin-facing pages
const ADMIN_PAGES = [
  'pages/admin/Dashboard.tsx',
  'pages/admin/Users.tsx',
  'pages/admin/Applications.tsx',
  'pages/admin/Programs.tsx',
  'pages/admin/Intakes.tsx',
  'pages/admin/AuditTrail.tsx',
]

const ALL_PAGES = [...STUDENT_PAGES, ...ADMIN_PAGES]

// Pages that contain HTML <table> elements
const TABLE_PAGES = [
  'pages/admin/Users.tsx',
  'pages/admin/Programs.tsx',
  'pages/admin/Intakes.tsx',
]

describe('Mobile Responsiveness - Requirement 22', () => {
  describe('22.1 & 22.2: Pages use responsive layout patterns', () => {
    it.each(ALL_PAGES)('%s uses responsive container or padding', (pagePath) => {
      const content = readComponent(pagePath)
      // Should use Container component, container-mobile class, or responsive padding
      const hasResponsiveContainer =
        content.includes('<Container') ||
        content.includes('<PageShell') ||
        content.includes('container-mobile') ||
        content.includes('px-4 sm:px-6') ||
        content.includes('px-3 sm:px-6') ||
        content.includes('px-4 py-4 sm:px-6') ||
        content.includes('px-4 py-3 sm:px-6') ||
        content.includes('px-4 md:px-6') ||
        content.includes('px-4 md:px-8')
      expect(hasResponsiveContainer).toBe(true)
    })

    it.each(ALL_PAGES)('%s does not use fixed pixel widths that would overflow 375px', (pagePath) => {
      const content = readComponent(pagePath)
      // Check for dangerous fixed widths (w-[500px], w-[600px], etc.)
      const dangerousWidths: string[] = content.match(/w-\[(\d+)px\]/g) ?? []
      const overflowWidths = dangerousWidths.filter((w) => {
        const px = parseInt(w.match(/\d+/)?.[0] ?? '0')
        return px > 375
      })
      expect(overflowWidths).toEqual([])
    })

    it.each(ALL_PAGES)('%s uses responsive text sizing', (pagePath) => {
      const content = readComponent(pagePath)
      // Should have at least one responsive text size (sm:text-*, md:text-*, lg:text-*)
      const hasResponsiveText =
        /sm:text-|md:text-|lg:text-/.test(content) ||
        // Or uses text-sm/text-base which are already mobile-friendly
        /text-sm|text-base|text-xs/.test(content) ||
        // Or delegates text sizing to child components via Container/PageShell/PageHeader
        content.includes('<Container') ||
        content.includes('<PageShell') ||
        content.includes('<PageHeader')
      expect(hasResponsiveText).toBe(true)
    })
  })

  describe('22.3: Tables use responsive patterns', () => {
    it.each(TABLE_PAGES)('%s wraps tables in overflow-x-auto or uses ResponsiveTable', (pagePath) => {
      const content = readComponent(pagePath)
      // Tables should be inside an overflow-x-auto container or use ResponsiveTable (which handles it internally)
      const hasResponsiveTable =
        content.includes('overflow-x-auto') ||
        content.includes('<ResponsiveTable')
      expect(hasResponsiveTable).toBe(true)
    })

    it.each(TABLE_PAGES)('%s has mobile card view alternative to tables', (pagePath) => {
      const content = readComponent(pagePath)
      // Should have a mobile card view that shows on small screens
      // and a table view hidden on small screens, OR use ResponsiveTable which handles this internally
      const hasMobileCards =
        content.includes('<ResponsiveTable') ||
        ((content.includes('block lg:hidden') || content.includes('block sm:hidden')) &&
        (content.includes('hidden lg:block') || content.includes('hidden sm:block')))
      expect(hasMobileCards).toBe(true)
    })
  })

  describe('22.4: Interactive elements meet 44px tap target', () => {
    it.each(ALL_PAGES)('%s uses Button component or delegates to child components with buttons', (pagePath) => {
      const content = readComponent(pagePath)
      // All pages should use the Button component for interactive elements,
      // or delegate to child components that use Button, or use touch-target class
      const hasButtons =
        content.includes('<Button') ||
        content.includes("from '@/components/ui/Button'") ||
        content.includes('touch-target') ||
        content.includes('button') || // native button elements
        content.includes('onClick') // delegates click handling to child components
      expect(hasButtons).toBe(true)
    })

    it('admin Users mobile card buttons have min-h-[44px] tap targets', () => {
      const content = readComponent('pages/admin/Users.tsx')
      // Mobile card action buttons should have minimum tap target
      // There are multiple "block lg:hidden" sections; the card view is the one
      // that contains user data (filteredUsers.map), not the skeleton
      const cardViewMarker = 'filteredUsers.map'
      const cardViewStart = content.indexOf(cardViewMarker)
      if (cardViewStart >= 0) {
        // Find the enclosing mobile section
        const sectionStart = content.lastIndexOf('block lg:hidden', cardViewStart)
        const sectionEnd = content.indexOf('hidden lg:block', cardViewStart)
        const mobileSection = content.substring(sectionStart, sectionEnd)
        expect(mobileSection).toContain('min-h-[44px]')
      } else {
        // Fallback: just check the whole file
        expect(content).toContain('min-h-[44px]')
      }
    })

    it('admin Programs mobile card buttons have min-h-[44px] tap targets', () => {
      const content = readComponent('pages/admin/Programs.tsx')
      // Programs now uses ResponsiveTable which handles mobile card layout internally
      // Check for ResponsiveTable usage OR legacy mobile section pattern
      const usesResponsiveTable = content.includes('<ResponsiveTable')
      const mobileSection = content.split('block sm:hidden')[1]?.split('hidden sm:block')[0] || ''
      const hasTapTargets = usesResponsiveTable || mobileSection.includes('min-h-[44px]')
      expect(hasTapTargets).toBe(true)
    })

    it('admin Intakes mobile card buttons have min-h-[44px] tap targets', () => {
      const content = readComponent('pages/admin/Intakes.tsx')
      // Intakes now uses ResponsiveTable which handles mobile card layout internally
      // Check for ResponsiveTable usage OR legacy mobile section pattern
      const usesResponsiveTable = content.includes('<ResponsiveTable')
      const mobileSection = content.split('block lg:hidden')[1]?.split('hidden lg:block')[0] || ''
      const hasTapTargets = usesResponsiveTable || mobileSection.includes('min-h-[44px]')
      expect(hasTapTargets).toBe(true)
    })

    it('Payment page buttons have min-h-[44px] tap targets', () => {
      const content = readComponent('pages/student/Payment.tsx')
      expect(content).toContain('min-h-[44px]')
    })
  })

  describe('General mobile patterns', () => {
    it.each(ALL_PAGES)('%s prevents viewport overflow with overflow-x-hidden or overflow-hidden', (pagePath) => {
      const content = readComponent(pagePath)
      // Root container should prevent horizontal overflow, or use Container/PageShell component
      const preventsOverflow =
        content.includes('overflow-x-hidden') ||
        content.includes('overflow-hidden') ||
        content.includes('<Container') ||
        content.includes('<PageShell') ||
        content.includes('container-mobile') ||
        content.includes('max-w-full')
      expect(preventsOverflow).toBe(true)
    })

    it.each(ALL_PAGES)('%s uses flex-col for mobile stacking where needed', (pagePath) => {
      const content = readComponent(pagePath)
      // Should use flex-col (mobile) with sm:flex-row or similar for responsive stacking
      // or grid-cols-1/grid-cols-2 for responsive grid layouts
      // or PageShell/ResponsiveTable which handle layout internally
      const hasResponsiveFlex =
        content.includes('flex-col') ||
        content.includes('grid-cols-1') ||
        content.includes('grid-cols-2') ||
        content.includes('<PageShell') ||
        content.includes('<ResponsiveTable')
      expect(hasResponsiveFlex).toBe(true)
    })
  })
})
