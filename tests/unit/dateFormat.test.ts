// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { formatDate, formatTimestamp, formatRelative, toDateInputValue } from '../../src/lib/dateFormat'

describe('dateFormat utilities', () => {
  describe('formatDate', () => {
    it('formats ISO date string as "DD MMM YYYY"', () => {
      expect(formatDate('2025-01-15T10:30:00Z')).toBe('15 Jan 2025')
    })

    it('returns "Not available" for null/undefined', () => {
      expect(formatDate(null)).toBe('Not available')
      expect(formatDate(undefined)).toBe('Not available')
      expect(formatDate('')).toBe('Not available')
    })

    it('returns "Not available" for invalid date strings', () => {
      expect(formatDate('not-a-date')).toBe('Not available')
    })

    it('handles Date objects', () => {
      const date = new Date(2025, 0, 15) // Jan 15, 2025
      expect(formatDate(date)).toBe('15 Jan 2025')
    })

    it('handles numeric timestamps', () => {
      const ts = new Date(2025, 5, 20).getTime() // Jun 20, 2025
      expect(formatDate(ts)).toBe('20 Jun 2025')
    })
  })

  describe('formatTimestamp', () => {
    it('formats ISO timestamp as "DD MMM YYYY, HH:mm"', () => {
      const result = formatTimestamp(new Date(2025, 0, 15, 14, 30))
      expect(result).toBe('15 Jan 2025, 14:30')
    })

    it('zero-pads hours and minutes', () => {
      const result = formatTimestamp(new Date(2025, 0, 1, 9, 5))
      expect(result).toBe('1 Jan 2025, 09:05')
    })

    it('returns "Not available" for falsy input', () => {
      expect(formatTimestamp(null)).toBe('Not available')
      expect(formatTimestamp(undefined)).toBe('Not available')
    })
  })

  describe('formatRelative', () => {
    it('returns "Just now" for very recent timestamps', () => {
      const now = new Date()
      const tenSecondsAgo = new Date(now.getTime() - 10_000)
      expect(formatRelative(tenSecondsAgo, now)).toBe('Just now')
    })

    it('returns minutes ago for timestamps within the hour', () => {
      const now = new Date()
      const thirtyMinAgo = new Date(now.getTime() - 30 * 60_000)
      expect(formatRelative(thirtyMinAgo, now)).toBe('30 minutes ago')
    })

    it('returns singular "minute" for 1 minute', () => {
      const now = new Date()
      const oneMinAgo = new Date(now.getTime() - 61_000)
      expect(formatRelative(oneMinAgo, now)).toBe('1 minute ago')
    })

    it('returns hours ago for timestamps within the day', () => {
      const now = new Date()
      const threeHoursAgo = new Date(now.getTime() - 3 * 3600_000)
      expect(formatRelative(threeHoursAgo, now)).toBe('3 hours ago')
    })

    it('returns "Yesterday" for 1 day ago', () => {
      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 25 * 3600_000)
      expect(formatRelative(oneDayAgo, now)).toBe('Yesterday')
    })

    it('returns days ago for timestamps within 7 days', () => {
      const now = new Date()
      const fiveDaysAgo = new Date(now.getTime() - 5 * 86400_000)
      expect(formatRelative(fiveDaysAgo, now)).toBe('5 days ago')
    })

    it('returns absolute date for timestamps older than 7 days', () => {
      const now = new Date(2025, 0, 20)
      const tenDaysAgo = new Date(2025, 0, 10)
      expect(formatRelative(tenDaysAgo, now)).toBe('10 Jan 2025')
    })

    it('returns absolute date for future timestamps', () => {
      const now = new Date(2025, 0, 15)
      const future = new Date(2025, 0, 20)
      expect(formatRelative(future, now)).toBe('20 Jan 2025')
    })

    it('returns "Not available" for null', () => {
      expect(formatRelative(null)).toBe('Not available')
    })
  })

  describe('toDateInputValue', () => {
    it('converts ISO timestamp to YYYY-MM-DD', () => {
      expect(toDateInputValue('2025-01-15T10:30:00Z')).toBe('2025-01-15')
    })

    it('preserves already-formatted YYYY-MM-DD strings', () => {
      expect(toDateInputValue('1994-09-08')).toBe('1994-09-08')
    })

    it('handles Date objects', () => {
      const date = new Date(2025, 0, 15)
      expect(toDateInputValue(date)).toBe('2025-01-15')
    })

    it('returns empty string for null/undefined/empty', () => {
      expect(toDateInputValue(null)).toBe('')
      expect(toDateInputValue(undefined)).toBe('')
      expect(toDateInputValue('')).toBe('')
    })

    it('returns empty string for invalid dates', () => {
      expect(toDateInputValue('not-a-date')).toBe('')
    })

    it('handles ISO timestamps with timezone offsets', () => {
      // This should parse and extract the date portion
      const result = toDateInputValue('1994-09-08T00:00:00.000Z')
      expect(result).toBe('1994-09-08')
    })
  })
})
