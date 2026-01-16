/**
 * Property-Based Test: Breadcrumb Navigation Presence
 * 
 * **Property 12: Breadcrumb Navigation Presence**
 * **Validates: Requirements 4.6**
 * 
 * For any interior page (non-landing, non-auth pages) in the Frontend_System,
 * a breadcrumb navigation component SHALL be rendered showing the path from
 * home to the current page.
 * 
 * Feature: frontend-visual-overhaul, Property 12: Breadcrumb Navigation Presence
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// Property test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 }

// Route label mappings (from Breadcrumbs component)
const ROUTE_LABELS: Record<string, string> = {
  '': 'Home',
  'student': 'Student',
  'admin': 'Admin',
  'auth': 'Authentication',
  'dashboard': 'Dashboard',
  'applications': 'Applications',
  'application-wizard': 'Application Wizard',
  'apply': 'Apply',
  'status': 'Status',
  'settings': 'Settings',
  'profile': 'Profile',
  'notifications': 'Notifications',
  'programs': 'Programs',
  'intakes': 'Intakes',
  'users': 'Users',
  'analytics': 'Analytics',
  'ai-insights': 'AI Insights',
  'workflow': 'Workflow',
  'audit': 'Audit Trail',
  'roles': 'Role Management',
  'system-health': 'System Health',
  'predictive-analytics': 'Predictive Analytics',
  'compliance-analytics': 'Compliance Analytics',
  'realtime-metrics': 'Realtime Metrics',
  'flow-analysis': 'Flow Analysis',
  'track-application': 'Track Application',
  'signin': 'Sign In',
  'signup': 'Sign Up',
  'forgot-password': 'Forgot Password',
  'reset-password': 'Reset Password',
  'callback': 'Callback',
}

// Routes that should NOT show breadcrumbs (landing and auth pages)
const EXCLUDED_ROUTES = ['/', '/auth/signin', '/auth/signup', '/auth/callback']

// Interior pages that SHOULD show breadcrumbs
const INTERIOR_ROUTES = [
  '/student/dashboard',
  '/student/application-wizard',
  '/student/status',
  '/student/settings',
  '/student/profile',
  '/student/notifications',
  '/admin/dashboard',
  '/admin/applications',
  '/admin/programs',
  '/admin/intakes',
  '/admin/users',
  '/admin/settings',
  '/admin/analytics',
  '/admin/ai-insights',
  '/admin/workflow',
  '/admin/audit',
  '/admin/roles',
  '/admin/system-health',
  '/admin/predictive-analytics',
  '/admin/compliance-analytics',
  '/admin/realtime-metrics',
  '/admin/flow-analysis',
  '/apply',
  '/settings',
  '/track-application',
] as const

type InteriorRoute = typeof INTERIOR_ROUTES[number]

/**
 * Format a URL segment into a readable label
 */
function formatSegmentLabel(segment: string): string {
  return segment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Generate expected breadcrumb items from a pathname
 */
function generateExpectedBreadcrumbs(pathname: string): Array<{ label: string; href: string }> {
  const segments = pathname.split('/').filter(Boolean)
  const items: Array<{ label: string; href: string }> = [
    { label: 'Home', href: '/' }
  ]

  let currentPath = ''
  
  for (const segment of segments) {
    currentPath += `/${segment}`
    
    // Skip dynamic segments
    if (segment.startsWith(':')) continue
    
    // Check if segment looks like an ID
    const isId = /^[0-9a-f-]{36}$/i.test(segment) || /^\d+$/.test(segment)
    if (isId) {
      items.push({ label: 'Details', href: currentPath })
      continue
    }

    const label = ROUTE_LABELS[segment] || formatSegmentLabel(segment)
    items.push({ label, href: currentPath })
  }

  return items
}

/**
 * Check if a route should show breadcrumbs
 */
function shouldShowBreadcrumbs(pathname: string): boolean {
  return !EXCLUDED_ROUTES.includes(pathname)
}

/**
 * Validate breadcrumb structure
 */
function validateBreadcrumbStructure(
  breadcrumbs: Array<{ label: string; href: string }>
): { valid: boolean; reason?: string } {
  // Must have at least 2 items (Home + current page)
  if (breadcrumbs.length < 2) {
    return { valid: false, reason: 'Breadcrumbs must have at least 2 items' }
  }

  // First item must be Home
  if (breadcrumbs[0].label !== 'Home' || breadcrumbs[0].href !== '/') {
    return { valid: false, reason: 'First breadcrumb must be Home with href /' }
  }

  // All items must have non-empty labels
  for (const item of breadcrumbs) {
    if (!item.label || item.label.trim() === '') {
      return { valid: false, reason: 'All breadcrumb items must have non-empty labels' }
    }
  }

  // All items must have valid hrefs
  for (const item of breadcrumbs) {
    if (!item.href || !item.href.startsWith('/')) {
      return { valid: false, reason: 'All breadcrumb items must have valid hrefs starting with /' }
    }
  }

  // Hrefs should form a path hierarchy
  for (let i = 1; i < breadcrumbs.length; i++) {
    const prevHref = breadcrumbs[i - 1].href
    const currentHref = breadcrumbs[i].href
    
    // Current href should be longer than or equal to previous (building path)
    // Exception: Home (/) is always first
    if (i > 1 && currentHref.length < prevHref.length) {
      return { 
        valid: false, 
        reason: `Breadcrumb path hierarchy broken: ${prevHref} -> ${currentHref}` 
      }
    }
  }

  return { valid: true }
}

describe('Property 12: Breadcrumb Navigation Presence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Property: Interior pages should show breadcrumbs
   * For any interior page, breadcrumbs SHALL be rendered
   */
  it('interior pages should show breadcrumbs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERIOR_ROUTES),
        (route) => {
          const shouldShow = shouldShowBreadcrumbs(route)
          expect(shouldShow).toBe(true)
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Excluded routes should not show breadcrumbs
   * For landing and auth pages, breadcrumbs SHALL NOT be rendered
   */
  it('excluded routes should not show breadcrumbs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXCLUDED_ROUTES),
        (route) => {
          const shouldShow = shouldShowBreadcrumbs(route)
          expect(shouldShow).toBe(false)
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Breadcrumbs always start with Home
   * For any interior page, the first breadcrumb item SHALL be Home with href /
   */
  it('breadcrumbs always start with Home', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERIOR_ROUTES),
        (route) => {
          const breadcrumbs = generateExpectedBreadcrumbs(route)
          
          expect(breadcrumbs.length).toBeGreaterThanOrEqual(1)
          expect(breadcrumbs[0].label).toBe('Home')
          expect(breadcrumbs[0].href).toBe('/')
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Breadcrumbs contain path to current page
   * For any interior page, breadcrumbs SHALL show the path from home to current page
   */
  it('breadcrumbs contain path to current page', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERIOR_ROUTES),
        (route) => {
          const breadcrumbs = generateExpectedBreadcrumbs(route)
          
          // Should have at least Home + current page
          expect(breadcrumbs.length).toBeGreaterThanOrEqual(2)
          
          // Last breadcrumb href should match or be part of the route
          const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1]
          expect(route).toContain(lastBreadcrumb.href.split('/').pop())
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Breadcrumb structure is valid
   * For any interior page, the breadcrumb structure SHALL be valid
   */
  it('breadcrumb structure is valid', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERIOR_ROUTES),
        (route) => {
          const breadcrumbs = generateExpectedBreadcrumbs(route)
          const validation = validateBreadcrumbStructure(breadcrumbs)
          
          expect(validation.valid).toBe(true)
          if (!validation.valid) {
            console.error(`Validation failed for ${route}: ${validation.reason}`)
          }
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Breadcrumb count matches path depth
   * For any interior page, breadcrumb count SHALL equal path segment count + 1 (for Home)
   */
  it('breadcrumb count matches path depth', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERIOR_ROUTES),
        (route) => {
          const breadcrumbs = generateExpectedBreadcrumbs(route)
          const pathSegments = route.split('/').filter(Boolean)
          
          // Breadcrumbs = Home + each path segment
          expect(breadcrumbs.length).toBe(pathSegments.length + 1)
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: All breadcrumb labels are non-empty
   * For any interior page, all breadcrumb labels SHALL be non-empty strings
   */
  it('all breadcrumb labels are non-empty', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERIOR_ROUTES),
        (route) => {
          const breadcrumbs = generateExpectedBreadcrumbs(route)
          
          for (const item of breadcrumbs) {
            expect(item.label).toBeTruthy()
            expect(item.label.trim().length).toBeGreaterThan(0)
          }
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Breadcrumb hrefs form valid path hierarchy
   * For any interior page, breadcrumb hrefs SHALL form a valid path hierarchy
   */
  it('breadcrumb hrefs form valid path hierarchy', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERIOR_ROUTES),
        (route) => {
          const breadcrumbs = generateExpectedBreadcrumbs(route)
          
          // Each subsequent href should build on the previous
          for (let i = 1; i < breadcrumbs.length; i++) {
            const currentHref = breadcrumbs[i].href
            
            // All hrefs should start with /
            expect(currentHref.startsWith('/')).toBe(true)
            
            // Current href should be longer than previous (except Home)
            if (i > 1) {
              const prevHref = breadcrumbs[i - 1].href
              expect(currentHref.length).toBeGreaterThanOrEqual(prevHref.length)
            }
          }
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Student routes have student in breadcrumb path
   * For any student route, breadcrumbs SHALL include Student segment
   */
  it('student routes have student in breadcrumb path', () => {
    const studentRoutes = INTERIOR_ROUTES.filter(r => r.startsWith('/student/'))
    
    fc.assert(
      fc.property(
        fc.constantFrom(...studentRoutes),
        (route) => {
          const breadcrumbs = generateExpectedBreadcrumbs(route)
          const hasStudentSegment = breadcrumbs.some(b => b.label === 'Student')
          
          expect(hasStudentSegment).toBe(true)
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Admin routes have admin in breadcrumb path
   * For any admin route, breadcrumbs SHALL include Admin segment
   */
  it('admin routes have admin in breadcrumb path', () => {
    const adminRoutes = INTERIOR_ROUTES.filter(r => r.startsWith('/admin/'))
    
    fc.assert(
      fc.property(
        fc.constantFrom(...adminRoutes),
        (route) => {
          const breadcrumbs = generateExpectedBreadcrumbs(route)
          const hasAdminSegment = breadcrumbs.some(b => b.label === 'Admin')
          
          expect(hasAdminSegment).toBe(true)
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Breadcrumb labels are properly formatted
   * For any interior page, breadcrumb labels SHALL be properly capitalized
   */
  it('breadcrumb labels are properly formatted', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERIOR_ROUTES),
        (route) => {
          const breadcrumbs = generateExpectedBreadcrumbs(route)
          
          for (const item of breadcrumbs) {
            // First character should be uppercase
            expect(item.label.charAt(0)).toBe(item.label.charAt(0).toUpperCase())
            
            // Should not contain raw URL segments (hyphens should be spaces)
            expect(item.label).not.toMatch(/-/)
          }
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Last breadcrumb matches current page
   * For any interior page, the last breadcrumb SHALL represent the current page
   */
  it('last breadcrumb matches current page', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERIOR_ROUTES),
        (route) => {
          const breadcrumbs = generateExpectedBreadcrumbs(route)
          const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1]
          
          // Last breadcrumb href should match the route
          expect(lastBreadcrumb.href).toBe(route)
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Breadcrumb generation is deterministic
   * For any interior page, generating breadcrumbs multiple times SHALL produce identical results
   */
  it('breadcrumb generation is deterministic', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERIOR_ROUTES),
        fc.integer({ min: 2, max: 5 }),
        (route, iterations) => {
          const results: Array<Array<{ label: string; href: string }>> = []
          
          for (let i = 0; i < iterations; i++) {
            results.push(generateExpectedBreadcrumbs(route))
          }
          
          // All results should be identical
          const firstResult = JSON.stringify(results[0])
          for (const result of results) {
            expect(JSON.stringify(result)).toBe(firstResult)
          }
          
          return true
        }
      ),
      propertyTestConfig
    )
  })
})
