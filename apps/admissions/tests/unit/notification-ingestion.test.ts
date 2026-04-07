/**
 * Feature: realtime-sse-system
 *
 * Property tests for notification SSE ingestion logic:
 * - Property 16: Notification SSE event prepend and unread count
 * - Property 17: normalizeNotificationPayload preserves data
 * - Property 18: Notification deduplication by id
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { normalizeNotificationPayload } from '@/hooks/useStudentNotifications'
import type { StudentNotification } from '@/types/notifications'

// ---------------------------------------------------------------------------
// Helpers — pure replicas of the module-internal prepend / dedup / countUnread
// logic from useStudentNotifications.ts so we can property-test the algorithms
// without touching module-level mutable state.
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPES = ['info', 'success', 'warning', 'error'] as const

function countUnread(notifications: StudentNotification[]): number {
  return notifications.filter((n) => !n.read).length
}

/**
 * Prepend a notification to a list, skipping if an entry with the same id
 * already exists (mirrors the real prependNotification).
 */
function prependNotification(
  list: StudentNotification[],
  notification: StudentNotification,
): StudentNotification[] {
  if (list.some((n) => n.id === notification.id)) return list
  return [notification, ...list]
}

/**
 * Process a sequence of notifications through prepend+dedup, returning the
 * final list (mirrors how the SSE handler calls prependNotification for each
 * incoming event).
 */
function processNotificationSequence(
  events: StudentNotification[],
): StudentNotification[] {
  let list: StudentNotification[] = []
  for (const event of events) {
    list = prependNotification(list, event)
  }
  return list
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const notificationTypeArb = fc.constantFrom(...NOTIFICATION_TYPES)

/** Generate a valid ISO date string from a safe timestamp range. */
const isoDateArb = fc
  .integer({ min: 946684800000, max: 1893456000000 }) // 2000-01-01 to 2030-01-01
  .map((ts) => new Date(ts).toISOString())

const studentNotificationArb: fc.Arbitrary<StudentNotification> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  content: fc.string({ minLength: 0, maxLength: 200 }),
  type: notificationTypeArb,
  read: fc.boolean(),
  action_url: fc.option(fc.webUrl(), { nil: undefined }),
  created_at: isoDateArb,
  read_at: fc.option(isoDateArb, { nil: undefined }),
})

/** Generate a notification that is guaranteed unread. */
const unreadNotificationArb: fc.Arbitrary<StudentNotification> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  content: fc.string({ minLength: 0, maxLength: 200 }),
  type: notificationTypeArb,
  read: fc.constant(false),
  action_url: fc.option(fc.webUrl(), { nil: undefined }),
  created_at: isoDateArb,
  read_at: fc.constant(undefined),
})


// ---------------------------------------------------------------------------
// Property 16: Notification SSE event prepend and unread count
// ---------------------------------------------------------------------------

/**
 * Feature: realtime-sse-system, Property 16: Notification SSE event prepend and unread count
 *
 * Validates: Requirements 7.1
 *
 * For any existing notification list and any new notification SSE event, after
 * ingestion the notification list length should increase by one, the new
 * notification should be at the front of the list, and the unread count should
 * increase by one (assuming the new notification is unread).
 */
describe('Property 16: Notification SSE event prepend and unread count', () => {
  it('prepending a new unread notification increases list length by 1, places it first, and increments unread count', () => {
    fc.assert(
      fc.property(
        fc.array(studentNotificationArb, { minLength: 0, maxLength: 30 }),
        unreadNotificationArb,
        (existingList, newNotification) => {
          // Ensure the new notification id is not already in the list
          fc.pre(!existingList.some((n) => n.id === newNotification.id))

          const prevLength = existingList.length
          const prevUnread = countUnread(existingList)

          const updated = prependNotification(existingList, newNotification)

          // Length increases by exactly 1
          expect(updated.length).toBe(prevLength + 1)

          // New notification is at the front
          expect(updated[0]).toEqual(newNotification)

          // Unread count increases by 1 (new notification is unread)
          expect(countUnread(updated)).toBe(prevUnread + 1)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('existing notifications are preserved in order after prepend', () => {
    fc.assert(
      fc.property(
        fc.array(studentNotificationArb, { minLength: 1, maxLength: 20 }),
        unreadNotificationArb,
        (existingList, newNotification) => {
          fc.pre(!existingList.some((n) => n.id === newNotification.id))

          const updated = prependNotification(existingList, newNotification)

          // The tail of the updated list should be the original list
          expect(updated.slice(1)).toEqual(existingList)
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property 17: normalizeNotificationPayload preserves data
// ---------------------------------------------------------------------------

/**
 * Feature: realtime-sse-system, Property 17: normalizeNotificationPayload preserves data
 *
 * Validates: Requirements 7.2
 *
 * For any SSE notification payload containing id, title, message/content, type,
 * is_read/read, and created_at, normalizeNotificationPayload should produce a
 * StudentNotification object where all fields are correctly mapped and no data
 * is lost.
 */
describe('Property 17: normalizeNotificationPayload preserves data', () => {
  it('maps canonical fields (content, read) correctly', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 0, maxLength: 200 }),
        notificationTypeArb,
        fc.boolean(),
        isoDateArb,
        (id, title, content, type, read, createdAt) => {
          const payload = {
            id,
            title,
            content,
            type,
            read,
            created_at: createdAt,
          }

          const result = normalizeNotificationPayload(payload)

          expect(result.id).toBe(id)
          expect(result.title).toBe(title)
          expect(result.content).toBe(content)
          expect(result.type).toBe(type)
          expect(result.read).toBe(read)
          expect(result.created_at).toBe(createdAt)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('maps alternative fields (message → content, is_read → read)', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 0, maxLength: 200 }),
        notificationTypeArb,
        fc.boolean(),
        isoDateArb,
        (id, title, message, type, isRead, createdAt) => {
          const payload = {
            id,
            title,
            message,
            type,
            is_read: isRead,
            created_at: createdAt,
          }

          const result = normalizeNotificationPayload(payload)

          expect(result.id).toBe(id)
          expect(result.title).toBe(title)
          // message maps to content when content is absent
          expect(result.content).toBe(message)
          expect(result.type).toBe(type)
          // is_read maps to read when read is absent
          expect(result.read).toBe(isRead)
          expect(result.created_at).toBe(createdAt)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('preserves optional action_url and read_at when present', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 0, maxLength: 200 }),
        notificationTypeArb,
        fc.boolean(),
        isoDateArb,
        fc.webUrl(),
        isoDateArb,
        (id, title, content, type, read, createdAt, actionUrl, readAt) => {
          const payload = {
            id,
            title,
            content,
            type,
            read,
            created_at: createdAt,
            action_url: actionUrl,
            read_at: readAt,
          }

          const result = normalizeNotificationPayload(payload)

          expect(result.action_url).toBe(actionUrl)
          expect(result.read_at).toBe(readAt)
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property 18: Notification deduplication by id
// ---------------------------------------------------------------------------

/**
 * Feature: realtime-sse-system, Property 18: Notification deduplication by id
 *
 * Validates: Requirements 7.5
 *
 * For any sequence of notification events where some share the same id, after
 * processing all events, the notification list should contain at most one entry
 * per unique id.
 */
describe('Property 18: Notification deduplication by id', () => {
  it('after processing any sequence, the list contains at most one entry per unique id', () => {
    fc.assert(
      fc.property(
        fc.array(studentNotificationArb, { minLength: 1, maxLength: 40 }),
        (events) => {
          const result = processNotificationSequence(events)

          const ids = result.map((n) => n.id)
          const uniqueIds = new Set(ids)

          // Every id appears exactly once
          expect(ids.length).toBe(uniqueIds.size)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('duplicate ids are dropped — only the first occurrence is kept', () => {
    fc.assert(
      fc.property(
        fc.array(studentNotificationArb, { minLength: 2, maxLength: 30 }),
        (events) => {
          const first = events[0]!
          // Introduce guaranteed duplicates: repeat the first event at the end
          const withDuplicates: StudentNotification[] = [...events, first]

          const result = processNotificationSequence(withDuplicates)

          // The duplicate should not increase the count
          const idsInResult = result.filter((n) => n.id === first.id)
          expect(idsInResult.length).toBe(1)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('result length equals the number of unique ids in the input', () => {
    fc.assert(
      fc.property(
        fc.array(studentNotificationArb, { minLength: 1, maxLength: 40 }),
        (events) => {
          const result = processNotificationSequence(events)

          const uniqueInputIds = new Set(events.map((e) => e.id))

          expect(result.length).toBe(uniqueInputIds.size)
        },
      ),
      { numRuns: 100 },
    )
  })
})
