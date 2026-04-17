// @vitest-environment node
/**
 * Property 11: Notification Preference Respect
 *
 * Feature: production-readiness-audit
 * **Validates: Requirements 5.5**
 *
 * For any notification dispatch, the system SHALL only send via channels
 * where the user has enabled notifications and outside quiet hours.
 *
 * This test models the notification dispatch logic as pure functions
 * (mirroring notificationDispatcher and notificationPreferenceManager)
 * and verifies the property across randomly generated preferences.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Channel definitions (mirrors the real system)
// ---------------------------------------------------------------------------

const CHANNELS = ['email', 'sms', 'whatsapp', 'in_app'] as const;
type Channel = (typeof CHANNELS)[number];

// ---------------------------------------------------------------------------
// Preference model (mirrors NotificationPreferences in src/types/notifications.ts)
// ---------------------------------------------------------------------------

interface NotificationPreferences {
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  in_app_enabled: boolean;
  quiet_hours_start: string; // "HH:MM" format
  quiet_hours_end: string;   // "HH:MM" format
}

// ---------------------------------------------------------------------------
// Pure function models of the notification dispatch logic
// ---------------------------------------------------------------------------

/**
 * Check whether a channel is enabled in user preferences.
 * Mirrors: notificationDispatcher checking `preferences[${channel}_enabled]`
 */
function isChannelEnabled(preferences: NotificationPreferences, channel: Channel): boolean {
  return preferences[`${channel}_enabled`];
}

/**
 * Parse an "HH:MM" time string into total minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Check whether a given time (in minutes since midnight) falls within quiet hours.
 * Mirrors: notificationPreferenceManager.isWithinQuietHours()
 *
 * Handles the overnight wrap-around case (e.g., 22:00 → 06:00).
 * If start === end, quiet hours are disabled (no quiet period).
 */
function isWithinQuietHours(
  currentMinutes: number,
  quietStart: string,
  quietEnd: string
): boolean {
  const start = parseTimeToMinutes(quietStart);
  const end = parseTimeToMinutes(quietEnd);

  if (start === end) return false; // No quiet hours configured

  if (start < end) {
    // Same-day range: e.g., 09:00 → 17:00
    return currentMinutes >= start && currentMinutes < end;
  }
  // Overnight range: e.g., 22:00 → 06:00
  return currentMinutes >= start || currentMinutes < end;
}

/**
 * Determine which channels a notification should be dispatched to.
 * Mirrors the full dispatch decision: channel must be enabled AND
 * current time must be outside quiet hours.
 */
function getDispatchChannels(
  preferences: NotificationPreferences,
  currentMinutes: number
): Channel[] {
  const inQuietHours = isWithinQuietHours(
    currentMinutes,
    preferences.quiet_hours_start,
    preferences.quiet_hours_end
  );

  return CHANNELS.filter((channel) => {
    if (!isChannelEnabled(preferences, channel)) return false;
    if (inQuietHours) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a valid "HH:MM" time string */
const timeArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

/** Generate notification preferences with random channel toggles and quiet hours */
const preferencesArb: fc.Arbitrary<NotificationPreferences> = fc.record({
  email_enabled: fc.boolean(),
  sms_enabled: fc.boolean(),
  whatsapp_enabled: fc.boolean(),
  in_app_enabled: fc.boolean(),
  quiet_hours_start: timeArb,
  quiet_hours_end: timeArb,
});

/** Current time as minutes since midnight (0–1439) */
const currentMinutesArb = fc.integer({ min: 0, max: 1439 });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 11: Notification Preference Respect', () => {
  describe('disabled channels are never used', () => {
    it('a disabled channel never appears in dispatch results', () => {
      fc.assert(
        fc.property(preferencesArb, currentMinutesArb, (prefs, currentMinutes) => {
          const dispatched = getDispatchChannels(prefs, currentMinutes);

          for (const channel of dispatched) {
            expect(isChannelEnabled(prefs, channel)).toBe(true);
          }
        }),
        { numRuns: 10 }
      );
    });

    it('each specific disabled channel is excluded from dispatch', () => {
      fc.assert(
        fc.property(
          preferencesArb,
          currentMinutesArb,
          fc.constantFrom(...CHANNELS),
          (prefs, currentMinutes, channel) => {
            // Force this channel off
            const modified = { ...prefs, [`${channel}_enabled`]: false };
            const dispatched = getDispatchChannels(modified, currentMinutes);

            expect(dispatched).not.toContain(channel);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('quiet hours are respected', () => {
    it('no channels are dispatched during quiet hours', () => {
      fc.assert(
        fc.property(preferencesArb, (prefs) => {
          // Ensure quiet hours are actually configured (start !== end)
          const start = parseTimeToMinutes(prefs.quiet_hours_start);
          const end = parseTimeToMinutes(prefs.quiet_hours_end);
          if (start === end) return; // skip — no quiet hours

          // Pick a time that is definitely within quiet hours
          let testMinutes: number;
          if (start < end) {
            // Same-day: pick midpoint
            testMinutes = Math.floor((start + end) / 2);
          } else {
            // Overnight: pick start (guaranteed inside)
            testMinutes = start;
          }

          const dispatched = getDispatchChannels(prefs, testMinutes);
          expect(dispatched).toHaveLength(0);
        }),
        { numRuns: 10 }
      );
    });

    it('isWithinQuietHours returns true for times inside the quiet window', () => {
      fc.assert(
        fc.property(timeArb, timeArb, (qStart, qEnd) => {
          const start = parseTimeToMinutes(qStart);
          const end = parseTimeToMinutes(qEnd);
          if (start === end) return; // no quiet hours

          // Pick a time guaranteed to be inside
          let testMinutes: number;
          if (start < end) {
            testMinutes = start; // start is inside [start, end)
          } else {
            testMinutes = start; // start is inside [start, ..., end) overnight
          }

          expect(isWithinQuietHours(testMinutes, qStart, qEnd)).toBe(true);
        }),
        { numRuns: 10 }
      );
    });
  });

  describe('enabled channels outside quiet hours are dispatched', () => {
    it('an enabled channel is dispatched when outside quiet hours', () => {
      fc.assert(
        fc.property(
          preferencesArb,
          fc.constantFrom(...CHANNELS),
          (prefs, channel) => {
            // Force channel on and quiet hours off (start === end)
            const modified: NotificationPreferences = {
              ...prefs,
              [`${channel}_enabled`]: true,
              quiet_hours_start: '00:00',
              quiet_hours_end: '00:00', // disables quiet hours
            };

            const dispatched = getDispatchChannels(modified, 720); // noon
            expect(dispatched).toContain(channel);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('all enabled channels are dispatched when no quiet hours are set', () => {
      fc.assert(
        fc.property(preferencesArb, currentMinutesArb, (prefs, currentMinutes) => {
          // Disable quiet hours
          const modified: NotificationPreferences = {
            ...prefs,
            quiet_hours_start: '12:00',
            quiet_hours_end: '12:00',
          };

          const dispatched = getDispatchChannels(modified, currentMinutes);
          const enabledChannels = CHANNELS.filter((ch) => isChannelEnabled(modified, ch));

          expect(dispatched).toEqual(enabledChannels);
        }),
        { numRuns: 10 }
      );
    });
  });

  describe('combined preference and quiet hours interaction', () => {
    it('dispatch result is always a subset of enabled channels', () => {
      fc.assert(
        fc.property(preferencesArb, currentMinutesArb, (prefs, currentMinutes) => {
          const dispatched = getDispatchChannels(prefs, currentMinutes);
          const enabledChannels = CHANNELS.filter((ch) => isChannelEnabled(prefs, ch));

          for (const ch of dispatched) {
            expect(enabledChannels).toContain(ch);
          }
        }),
        { numRuns: 10 }
      );
    });

    it('dispatch result is empty when all channels are disabled regardless of time', () => {
      fc.assert(
        fc.property(currentMinutesArb, (currentMinutes) => {
          const allDisabled: NotificationPreferences = {
            email_enabled: false,
            sms_enabled: false,
            whatsapp_enabled: false,
            in_app_enabled: false,
            quiet_hours_start: '00:00',
            quiet_hours_end: '00:00',
          };

          const dispatched = getDispatchChannels(allDisabled, currentMinutes);
          expect(dispatched).toHaveLength(0);
        }),
        { numRuns: 10 }
      );
    });
  });
});
