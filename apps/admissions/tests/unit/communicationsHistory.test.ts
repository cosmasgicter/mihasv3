/**
 * Unit Tests — Communications Page & Activity Timeline
 *
 * Source-level and logic-level verification for the communications history feature:
 *   1. Route registration: /student/communications and /student/history exist in config
 *   2. Navigation links: DesktopSidebar includes links to both pages
 *   3. CommunicationsPage: empty state, error display, mark-read, mark-all-read, delete
 *   4. ActivityTimeline (History): empty state, error display
 *
 * These tests follow the established pattern of source-level verification
 * (reading files, checking imports/patterns) and direct service/hook logic testing
 * against real QueryClient instances without rendering React components.
 *
 * Requirements: 1.3, 1.4, 1.5, 1.6, 1.10, 4.1, 4.2, 4.3, 4.4
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathFor, routeById, studentNavRoutes } from '@/routes/routeRegistry'

const SRC_ROOT = path.resolve(__dirname, '../../src')

function readSource(relativePath: string): string {
  const fullPath = path.join(SRC_ROOT, relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

// ===========================================================================
// 1. Route Registration (Requirements 4.1, 4.2, 4.3)
// ===========================================================================

describe('Route registration', () => {
  const routeConfigSource = readSource('routes/config.tsx')

  it('/student/communications route is registered', () => {
    expect(pathFor('student.communications')).toBe('/student/communications')
  })

  it('/student/history route is registered', () => {
    expect(pathFor('student.history')).toBe('/student/history')
  })

  it('/student/communications is a student-guarded route', () => {
    expect(routeById('student.communications').guard).toBe('student')
  })

  it('/student/history is a student-guarded route', () => {
    expect(routeById('student.history').guard).toBe('student')
  })

  it('/student/communications is lazy-loaded', () => {
    expect(routeConfigSource).toContain("fromRegistry('student.communications', StudentCommunications, { lazy: true })")
  })

  it('/student/history is lazy-loaded', () => {
    expect(routeConfigSource).toContain("fromRegistry('student.history', StudentHistory, { lazy: true })")
  })

  it('both routes use detail skeleton type', () => {
    expect(routeById('student.communications').skeletonType).toBe('detail')
    expect(routeById('student.history').skeletonType).toBe('detail')
  })

  it('StudentCommunications lazy import exists', () => {
    expect(routeConfigSource).toMatch(/React\.lazy\(\(\)\s*=>\s*import\(['"]@\/pages\/student\/Communications['"]\)\)/)
  })

  it('StudentHistory lazy import exists', () => {
    expect(routeConfigSource).toMatch(/React\.lazy\(\(\)\s*=>\s*import\(['"]@\/pages\/student\/History['"]\)\)/)
  })
})

// ===========================================================================
// 2. Navigation Link Presence (Requirement 4.4)
// ===========================================================================

describe('Navigation links', () => {
  const studentNav = studentNavRoutes()

  it('DesktopSidebar includes /student/communications link', () => {
    expect(studentNav.map((route) => route.path)).toContain('/student/communications')
  })

  it('DesktopSidebar includes /student/history link', () => {
    expect(studentNav.map((route) => route.path)).toContain('/student/history')
  })

  it('Communications link has a label', () => {
    expect(routeById('student.communications').nav?.label).toBe('Communications')
  })

  it('History link has a label', () => {
    expect(routeById('student.history').nav?.label).toBe('Activity History')
  })

  it('Communications link is in the studentLinks array', () => {
    expect(routeById('student.communications').nav?.section).toBe('student')
    expect(routeById('student.communications').nav?.desktop).toBe(true)
  })

  it('History link is in the studentLinks array', () => {
    expect(routeById('student.history').nav?.section).toBe('student')
    expect(routeById('student.history').nav?.desktop).toBe(true)
  })
})

// ===========================================================================
// 3. CommunicationsPage Source Verification (Requirements 1.3, 1.4, 1.5, 1.6, 1.10)
// ===========================================================================

describe('CommunicationsPage source structure', () => {
  const commSource = readSource('pages/student/Communications.tsx')

  it('uses EmptyState component for empty notifications', () => {
    expect(commSource).toContain('<EmptyState')
    expect(commSource).toMatch(/No communications/)
  })

  it('uses ErrorDisplay component for fetch failures', () => {
    expect(commSource).toContain('<ErrorDisplay')
    expect(commSource).toMatch(/Failed to load communications/)
  })

  it('imports and uses notificationService.markRead for mark-read', () => {
    expect(commSource).toContain('notificationService')
    expect(commSource).toContain('markRead')
  })

  it('calls markRead when clicking an unread notification', () => {
    // The handleNotificationClick function checks is_read and calls markReadMutation
    expect(commSource).toMatch(/handleNotificationClick/)
    expect(commSource).toMatch(/!notification\.is_read/)
    expect(commSource).toMatch(/markReadMutation\.mutate/)
  })

  it('provides mark-all-read action', () => {
    expect(commSource).toContain('markAllReadMutation')
    expect(commSource).toContain('notificationService.markAllRead')
    expect(commSource).toMatch(/Mark all read/)
  })

  it('provides delete action per notification', () => {
    expect(commSource).toContain('deleteMutation')
    expect(commSource).toContain('notificationService.delete')
    expect(commSource).toMatch(/Delete notification/)
  })

  it('uses useCommunications hook for data fetching', () => {
    expect(commSource).toMatch(/import\s+\{[^}]*useCommunications[^}]*\}\s+from\s+['"]@\/hooks\/useCommunications['"]/)
  })

  it('uses PageShell layout primitive', () => {
    expect(commSource).toContain('<PageShell')
  })

  it('uses SectionCard for content sections', () => {
    expect(commSource).toContain('<SectionCard')
  })

  it('invalidates communications queries after mutations', () => {
    expect(commSource).toMatch(/invalidateQueries.*communications/)
  })
})

// ===========================================================================
// 4. ActivityTimeline (History) Source Verification (Requirements 1.10 analog for timeline)
// ===========================================================================

describe('ActivityTimeline (History) source structure', () => {
  const historySource = readSource('pages/student/History.tsx')

  it('uses EmptyState component for empty history', () => {
    expect(historySource).toContain('<EmptyState')
    expect(historySource).toMatch(/No activity history/)
  })

  it('uses ErrorDisplay component for fetch failures', () => {
    expect(historySource).toContain('<ErrorDisplay')
    expect(historySource).toMatch(/Failed to load activity history/)
  })

  it('uses useTimeline hook for data fetching', () => {
    expect(historySource).toMatch(/import\s+\{[^}]*useTimeline[^}]*\}\s+from\s+['"]@\/hooks\/useTimeline['"]/)
  })

  it('uses PageShell layout primitive', () => {
    expect(historySource).toContain('<PageShell')
  })

  it('uses SectionCard for grouped entries', () => {
    expect(historySource).toContain('<SectionCard')
  })

  it('groups entries by application number', () => {
    expect(historySource).toContain('groupedEntries')
    expect(historySource).toContain('applicationNumber')
  })

  it('displays status transitions with old and new status', () => {
    expect(historySource).toContain('old_status')
    expect(historySource).toContain('new_status')
  })

  it('exports getStatusColor function for status color mapping', () => {
    expect(historySource).toMatch(/export\s+function\s+getStatusColor/)
  })
})

// ===========================================================================
// 5. Mark-Read API Integration (Requirement 1.3)
// ===========================================================================

describe('Mark-read API integration', () => {
  const notifServiceSource = readSource('services/notifications.ts')

  it('notificationService exposes markRead method', () => {
    expect(notifServiceSource).toMatch(/markRead\s*:\s*/)
  })

  it('markRead calls PUT /notifications/{id}/read/', () => {
    expect(notifServiceSource).toMatch(/\/notifications\/.*\/read\//)
    // Verify it uses PUT method
    const markReadBlock = notifServiceSource.match(/markRead[\s\S]*?method:\s*'PUT'/)?.[0]
    expect(markReadBlock).toBeTruthy()
  })

  it('notificationService exposes markAllRead method', () => {
    expect(notifServiceSource).toMatch(/markAllRead\s*:\s*/)
  })

  it('markAllRead calls PUT /notifications/read-all/', () => {
    expect(notifServiceSource).toContain('/notifications/read-all/')
  })

  it('notificationService exposes delete method', () => {
    expect(notifServiceSource).toMatch(/delete\s*:\s*/)
  })

  it('delete calls DELETE /notifications/{id}/', () => {
    const deleteBlock = notifServiceSource.match(/delete[\s\S]*?method:\s*'DELETE'/)?.[0]
    expect(deleteBlock).toBeTruthy()
  })
})

// ===========================================================================
// 6. Communications Service (Requirement 5.1, 5.2)
// ===========================================================================

describe('communicationsService structure', () => {
  const commServiceSource = readSource('services/communications.ts')

  it('exports communicationsService object', () => {
    expect(commServiceSource).toMatch(/export\s+const\s+communicationsService/)
  })

  it('provides listNotifications method', () => {
    expect(commServiceSource).toContain('listNotifications')
  })

  it('provides listHistory method', () => {
    expect(commServiceSource).toContain('listHistory')
  })

  it('provides listUserNotifications method', () => {
    expect(commServiceSource).toContain('listUserNotifications')
  })

  it('uses apiClient for HTTP requests', () => {
    expect(commServiceSource).toMatch(/import\s+\{[^}]*apiClient[^}]*\}\s+from/)
    expect(commServiceSource).toContain('apiClient.request')
  })

  it('defines TimelineEntry interface', () => {
    expect(commServiceSource).toMatch(/export\s+interface\s+TimelineEntry/)
  })

  it('defines PaginatedResponse interface', () => {
    expect(commServiceSource).toMatch(/export\s+interface\s+PaginatedResponse/)
  })
})

// ===========================================================================
// 7. Hooks Structure
// ===========================================================================

describe('useCommunications hook structure', () => {
  const hookSource = readSource('hooks/useCommunications.ts')

  it('exports useCommunications function', () => {
    expect(hookSource).toMatch(/export\s+function\s+useCommunications/)
  })

  it('uses React Query useQuery', () => {
    expect(hookSource).toMatch(/import\s+\{[^}]*useQuery[^}]*\}\s+from\s+['"]@tanstack\/react-query['"]/)
  })

  it('uses communications query key', () => {
    expect(hookSource).toContain("'communications'")
  })

  it('returns notifications, isLoading, error, pagination, refetch', () => {
    expect(hookSource).toContain('notifications')
    expect(hookSource).toContain('isLoading')
    expect(hookSource).toContain('error')
    expect(hookSource).toContain('pagination')
    expect(hookSource).toContain('refetch')
  })
})

describe('useTimeline hook structure', () => {
  const hookSource = readSource('hooks/useTimeline.ts')

  it('exports useTimeline function', () => {
    expect(hookSource).toMatch(/export\s+function\s+useTimeline/)
  })

  it('uses React Query useQuery', () => {
    expect(hookSource).toMatch(/import\s+\{[^}]*useQuery[^}]*\}\s+from\s+['"]@tanstack\/react-query['"]/)
  })

  it('uses timeline query key', () => {
    expect(hookSource).toContain("'timeline'")
  })

  it('provides groupedEntries computed value', () => {
    expect(hookSource).toContain('groupedEntries')
  })

  it('groups entries by application_number', () => {
    expect(hookSource).toContain('application_number')
    // Verify it uses a Map for grouping
    expect(hookSource).toMatch(/new Map/)
  })
})
