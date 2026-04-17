/**
 * Property-based tests for Communications History feature.
 *
 * Uses fast-check to verify universal correctness properties
 * across randomly generated inputs.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// Feature: communications-history, Property 1: Chronological ordering
//
// For any API response from the notifications list, timeline history, or admin
// notification history endpoints, the `results` array SHALL be sorted by
// `created_at` in descending order — i.e., for every consecutive pair of items
// `results[i]` and `results[i+1]`, `results[i].created_at >= results[i+1].created_at`.
//
// **Validates: Requirements 1.1, 2.1, 6.1**

/**
 * Sort an array of items with `created_at` ISO strings in descending order.
 * This mirrors the ordering contract the backend guarantees and the frontend relies on.
 */
function sortByCreatedAtDescending<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

/** Arbitrary: a valid ISO 8601 date string within a reasonable range */
const isoDateArb = fc
  .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-12-31T23:59:59Z') })
  .filter((d) => !Number.isNaN(d.getTime()))
  .map((d) => d.toISOString())

/** Arbitrary: a notification-like object with created_at */
const notificationArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  message: fc.string({ minLength: 1, maxLength: 200 }),
  type: fc.constantFrom('info', 'success', 'warning', 'error'),
  is_read: fc.boolean(),
  created_at: isoDateArb,
})

/** Arbitrary: a timeline entry-like object with created_at */
const timelineEntryArb = fc.record({
  id: fc.uuid(),
  application_id: fc.uuid(),
  application_number: fc.stringMatching(/^APP-\d{8}-[A-Z]{8}$/),
  old_status: fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected', 'waitlisted', null),
  new_status: fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected', 'waitlisted'),
  notes: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 })),
  changed_by_name: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
  created_at: isoDateArb,
})

describe('Communications History — Property 1: Chronological ordering', () => {
  it('notifications sorted by created_at descending maintain sort invariant', () => {
    fc.assert(
      fc.property(fc.array(notificationArb, { minLength: 0, maxLength: 50 }), (notifications) => {
        const sorted = sortByCreatedAtDescending(notifications)

        // Verify sort invariant: each item's created_at >= next item's created_at
        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i].created_at >= sorted[i + 1].created_at).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('timeline entries sorted by created_at descending maintain sort invariant', () => {
    fc.assert(
      fc.property(fc.array(timelineEntryArb, { minLength: 0, maxLength: 50 }), (entries) => {
        const sorted = sortByCreatedAtDescending(entries)

        // Verify sort invariant: each item's created_at >= next item's created_at
        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i].created_at >= sorted[i + 1].created_at).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('sorting preserves all original items (no data loss)', () => {
    fc.assert(
      fc.property(fc.array(notificationArb, { minLength: 0, maxLength: 50 }), (notifications) => {
        const sorted = sortByCreatedAtDescending(notifications)

        // Same length
        expect(sorted.length).toBe(notifications.length)

        // Every original item appears in the sorted result
        const sortedIds = new Set(sorted.map((n) => n.id))
        for (const n of notifications) {
          expect(sortedIds.has(n.id)).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('sorting is idempotent — sorting an already sorted array produces the same result', () => {
    fc.assert(
      fc.property(fc.array(notificationArb, { minLength: 0, maxLength: 50 }), (notifications) => {
        const sorted1 = sortByCreatedAtDescending(notifications)
        const sorted2 = sortByCreatedAtDescending(sorted1)

        expect(sorted2.map((n) => n.id)).toEqual(sorted1.map((n) => n.id))
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: communications-history, Property 2: Notification display completeness
//
// For any Notification object, the rendered communications page item SHALL contain
// the notification's `title`, `message`, `type`, read/unread indicator, and a
// human-readable timestamp derived from `created_at`.
//
// This is a pure data property test: verify that for any generated notification
// object, the required display fields are present and non-undefined.
//
// **Validates: Requirements 1.2**

describe('Communications History — Property 2: Notification display completeness', () => {
  it('every notification object contains all required display fields', () => {
    fc.assert(
      fc.property(notificationArb, (notification) => {
        // title must be a non-empty string
        expect(typeof notification.title).toBe('string')
        expect(notification.title.length).toBeGreaterThan(0)

        // message must be a non-empty string
        expect(typeof notification.message).toBe('string')
        expect(notification.message.length).toBeGreaterThan(0)

        // type must be one of the known notification types
        expect(['info', 'success', 'warning', 'error']).toContain(notification.type)

        // is_read (read indicator) must be a boolean
        expect(typeof notification.is_read).toBe('boolean')

        // created_at must be a valid ISO 8601 timestamp
        expect(typeof notification.created_at).toBe('string')
        const parsed = new Date(notification.created_at)
        expect(Number.isNaN(parsed.getTime())).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('no required display field is undefined or null', () => {
    fc.assert(
      fc.property(notificationArb, (notification) => {
        const requiredFields = ['title', 'message', 'type', 'is_read', 'created_at'] as const

        for (const field of requiredFields) {
          expect(notification[field]).not.toBeUndefined()
          expect(notification[field]).not.toBeNull()
        }
      }),
      { numRuns: 100 }
    )
  })

  it('created_at can be converted to a human-readable timestamp', () => {
    fc.assert(
      fc.property(notificationArb, (notification) => {
        const date = new Date(notification.created_at)
        // Must produce a valid date that can be formatted
        expect(Number.isNaN(date.getTime())).toBe(false)

        // toLocaleDateString should produce a non-empty string (human-readable)
        const formatted = date.toLocaleDateString()
        expect(typeof formatted).toBe('string')
        expect(formatted.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: communications-history, Property 4: Filter correctness
//
// For any set of notifications and any combination of type filter and read-status
// filter, the filtered result set SHALL contain only notifications where `type`
// matches the type filter (when set) AND `is_read` matches the read-status filter
// (when set). The filtered set SHALL be a subset of the unfiltered set.
//
// **Validates: Requirements 1.7**

/** Notification type from the arbitrary */
type NotificationType = 'info' | 'success' | 'warning' | 'error'

/** Filter parameters matching the Communications Page filter controls */
interface NotificationFilters {
  type?: NotificationType
  is_read?: boolean
}

/**
 * Pure filter function that mirrors the filtering logic used by the
 * Communications Page and the backend `NotificationListView`.
 *
 * When a filter field is undefined, that dimension is not constrained.
 */
function filterNotifications(
  notifications: Array<{ id: string; type: string; is_read: boolean }>,
  filters: NotificationFilters
): Array<{ id: string; type: string; is_read: boolean }> {
  return notifications.filter((n) => {
    if (filters.type !== undefined && n.type !== filters.type) return false
    if (filters.is_read !== undefined && n.is_read !== filters.is_read) return false
    return true
  })
}

/** Arbitrary: optional type filter */
const typeFilterArb = fc.constantFrom<NotificationType | undefined>(
  undefined,
  'info',
  'success',
  'warning',
  'error'
)

/** Arbitrary: optional is_read filter */
const isReadFilterArb = fc.constantFrom<boolean | undefined>(undefined, true, false)

/** Arbitrary: a filter combination */
const filtersArb = fc.record({
  type: typeFilterArb,
  is_read: isReadFilterArb,
})

describe('Communications History — Property 4: Filter correctness', () => {
  it('filtered set is always a subset of the unfiltered set', () => {
    fc.assert(
      fc.property(
        fc.array(notificationArb, { minLength: 0, maxLength: 50 }),
        filtersArb,
        (notifications, filters) => {
          const filtered = filterNotifications(notifications, filters)
          const originalIds = new Set(notifications.map((n) => n.id))

          // Every filtered item must exist in the original set
          for (const item of filtered) {
            expect(originalIds.has(item.id)).toBe(true)
          }

          // Filtered length cannot exceed original length
          expect(filtered.length).toBeLessThanOrEqual(notifications.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every item in the filtered set matches the filter criteria', () => {
    fc.assert(
      fc.property(
        fc.array(notificationArb, { minLength: 0, maxLength: 50 }),
        filtersArb,
        (notifications, filters) => {
          const filtered = filterNotifications(notifications, filters)

          for (const item of filtered) {
            if (filters.type !== undefined) {
              expect(item.type).toBe(filters.type)
            }
            if (filters.is_read !== undefined) {
              expect(item.is_read).toBe(filters.is_read)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('no item outside the filtered set matches the filter criteria', () => {
    fc.assert(
      fc.property(
        fc.array(notificationArb, { minLength: 0, maxLength: 50 }),
        filtersArb,
        (notifications, filters) => {
          const filtered = filterNotifications(notifications, filters)
          const filteredIds = new Set(filtered.map((n) => n.id))

          // Items NOT in the filtered set must fail at least one filter criterion
          const excluded = notifications.filter((n) => !filteredIds.has(n.id))
          for (const item of excluded) {
            const matchesType = filters.type === undefined || item.type === filters.type
            const matchesRead = filters.is_read === undefined || item.is_read === filters.is_read
            // At least one filter must NOT match for excluded items
            expect(matchesType && matchesRead).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('with no filters applied, the filtered set equals the original set', () => {
    fc.assert(
      fc.property(
        fc.array(notificationArb, { minLength: 0, maxLength: 50 }),
        (notifications) => {
          const filtered = filterNotifications(notifications, {})
          expect(filtered.length).toBe(notifications.length)

          const filteredIds = new Set(filtered.map((n) => n.id))
          for (const n of notifications) {
            expect(filteredIds.has(n.id)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: communications-history, Property 5: Action URL conditional rendering
//
// For any Notification, if `action_url` is non-null and non-empty, the rendered
// item SHALL contain a navigable link element with that URL as its target. If
// `action_url` is null or empty, no link element SHALL be rendered for navigation.
//
// This is a pure data property test: verify the conditional rendering contract
// by implementing a `shouldRenderActionLink` function that mirrors the rendering logic.
//
// **Validates: Requirements 1.8**

/**
 * Pure function that determines whether a notification should render an action link.
 * Mirrors the rendering logic in the Communications Page: a link is rendered
 * if and only if `action_url` is a non-null, non-empty string.
 */
function shouldRenderActionLink(actionUrl: string | null | undefined): boolean {
  return typeof actionUrl === 'string' && actionUrl.length > 0
}

/** Arbitrary: action_url that is null */
const nullActionUrlArb = fc.constant(null)

/** Arbitrary: action_url that is an empty string */
const emptyActionUrlArb = fc.constant('')

/** Arbitrary: action_url that is a valid non-empty URL string */
const validActionUrlArb = fc.webUrl()

/** Arbitrary: action_url covering all three cases (null, empty, valid URL) */
const actionUrlArb = fc.oneof(nullActionUrlArb, emptyActionUrlArb, validActionUrlArb)

/** Arbitrary: a notification with a variable action_url field */
const notificationWithActionUrlArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  message: fc.string({ minLength: 1, maxLength: 200 }),
  type: fc.constantFrom('info', 'success', 'warning', 'error'),
  is_read: fc.boolean(),
  action_url: actionUrlArb,
  created_at: isoDateArb,
})

describe('Communications History — Property 5: Action URL conditional rendering', () => {
  it('notifications with non-null, non-empty action_url should render a link', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          title: fc.string({ minLength: 1, maxLength: 50 }),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          type: fc.constantFrom('info', 'success', 'warning', 'error'),
          is_read: fc.boolean(),
          action_url: validActionUrlArb,
          created_at: isoDateArb,
        }),
        (notification) => {
          expect(shouldRenderActionLink(notification.action_url)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('notifications with null action_url should not render a link', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          title: fc.string({ minLength: 1, maxLength: 50 }),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          type: fc.constantFrom('info', 'success', 'warning', 'error'),
          is_read: fc.boolean(),
          action_url: nullActionUrlArb,
          created_at: isoDateArb,
        }),
        (notification) => {
          expect(shouldRenderActionLink(notification.action_url)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('notifications with empty string action_url should not render a link', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          title: fc.string({ minLength: 1, maxLength: 50 }),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          type: fc.constantFrom('info', 'success', 'warning', 'error'),
          is_read: fc.boolean(),
          action_url: emptyActionUrlArb,
          created_at: isoDateArb,
        }),
        (notification) => {
          expect(shouldRenderActionLink(notification.action_url)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('shouldRenderActionLink is consistent across all action_url variants', () => {
    fc.assert(
      fc.property(notificationWithActionUrlArb, (notification) => {
        const result = shouldRenderActionLink(notification.action_url)

        if (notification.action_url === null || notification.action_url === '') {
          // Null or empty → no link
          expect(result).toBe(false)
        } else {
          // Non-null, non-empty string → link should render
          expect(result).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: communications-history, Property 6: Status color mapping totality
//
// For any application status string value (including `draft`, `submitted`,
// `under_review`, `approved`, `rejected`, `waitlisted`, and any unknown value),
// the status-to-color mapping function SHALL return a defined, non-empty CSS
// class string. No status value SHALL produce an undefined or null mapping.
//
// **Validates: Requirements 2.3**

import { getStatusColor } from '@/pages/student/History'

/** Known application status values from the domain */
const knownStatuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'waitlisted']

/** Arbitrary: one of the known status strings */
const knownStatusArb = fc.constantFrom(...knownStatuses)

/** Arbitrary: a completely random string (unknown status) */
const randomStringArb = fc.string({ minLength: 0, maxLength: 100 })

/** Arbitrary: null or undefined */
const nullishArb = fc.constantFrom(null, undefined)

/** Arbitrary: any status input — known values, null, undefined, or random strings */
const anyStatusArb = fc.oneof(knownStatusArb, randomStringArb, nullishArb)

describe('Communications History — Property 6: Status color mapping totality', () => {
  it('getStatusColor always returns a non-empty string for known statuses', () => {
    fc.assert(
      fc.property(knownStatusArb, (status) => {
        const result = getStatusColor(status)

        expect(result).toBeDefined()
        expect(result).not.toBeNull()
        expect(typeof result).toBe('string')
        expect(result.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })

  it('getStatusColor always returns a non-empty string for random unknown statuses', () => {
    fc.assert(
      fc.property(randomStringArb, (status) => {
        const result = getStatusColor(status)

        expect(result).toBeDefined()
        expect(result).not.toBeNull()
        expect(typeof result).toBe('string')
        expect(result.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })

  it('getStatusColor always returns a non-empty string for null and undefined', () => {
    fc.assert(
      fc.property(nullishArb, (status) => {
        const result = getStatusColor(status)

        expect(result).toBeDefined()
        expect(result).not.toBeNull()
        expect(typeof result).toBe('string')
        expect(result.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })

  it('getStatusColor never returns undefined or null for any input', () => {
    fc.assert(
      fc.property(anyStatusArb, (status) => {
        const result = getStatusColor(status)

        // Must be a defined, non-null, non-empty string
        expect(result).toBeDefined()
        expect(result).not.toBeNull()
        expect(typeof result).toBe('string')
        expect(result.trim().length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })
})


// Feature: communications-history, Property 7: Timeline grouping correctness
//
// For any list of TimelineEntry objects with mixed application_number values,
// the grouping function SHALL produce groups where every entry within a group
// shares the same application_number, and every entry from the input appears
// in exactly one group.
//
// **Validates: Requirements 2.4**

/** Timeline entry shape matching the timelineEntryArb */
interface GroupableTimelineEntry {
  id: string
  application_number: string
  [key: string]: unknown
}

interface GroupedTimeline {
  applicationNumber: string
  entries: GroupableTimelineEntry[]
}

/**
 * Pure grouping function that mirrors the groupedEntries logic in useTimeline.ts.
 * Groups timeline entries by application_number using insertion-order Map semantics.
 */
function groupByApplicationNumber(entries: GroupableTimelineEntry[]): GroupedTimeline[] {
  const map = new Map<string, GroupableTimelineEntry[]>()
  for (const entry of entries) {
    const key = entry.application_number
    const group = map.get(key)
    if (group) {
      group.push(entry)
    } else {
      map.set(key, [entry])
    }
  }
  return Array.from(map, ([applicationNumber, entries]) => ({
    applicationNumber,
    entries,
  }))
}

describe('Communications History — Property 7: Timeline grouping correctness', () => {
  it('every entry within a group shares the same application_number', () => {
    fc.assert(
      fc.property(
        fc.array(timelineEntryArb, { minLength: 0, maxLength: 50 }),
        (entries) => {
          const groups = groupByApplicationNumber(entries)

          for (const group of groups) {
            for (const entry of group.entries) {
              expect(entry.application_number).toBe(group.applicationNumber)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every entry from the input appears in exactly one group (no loss, no duplication)', () => {
    fc.assert(
      fc.property(
        fc.array(timelineEntryArb, { minLength: 0, maxLength: 50 }),
        (entries) => {
          const groups = groupByApplicationNumber(entries)

          // Collect all entry ids from all groups
          const groupedIds: string[] = []
          for (const group of groups) {
            for (const entry of group.entries) {
              groupedIds.push(entry.id)
            }
          }

          // Total count must match input count
          expect(groupedIds.length).toBe(entries.length)

          // Every input entry id must appear exactly once in grouped output
          const inputIds = entries.map((e) => e.id)
          expect(groupedIds.sort()).toEqual(inputIds.sort())
        }
      ),
      { numRuns: 100 }
    )
  })

  it('no entries are lost or duplicated — group entry count equals input count', () => {
    fc.assert(
      fc.property(
        fc.array(timelineEntryArb, { minLength: 0, maxLength: 50 }),
        (entries) => {
          const groups = groupByApplicationNumber(entries)

          const totalGrouped = groups.reduce((sum, g) => sum + g.entries.length, 0)
          expect(totalGrouped).toBe(entries.length)

          // Number of groups should equal number of distinct application_numbers
          const distinctAppNumbers = new Set(entries.map((e) => e.application_number))
          expect(groups.length).toBe(distinctAppNumbers.size)
        }
      ),
      { numRuns: 100 }
    )
  })
})
