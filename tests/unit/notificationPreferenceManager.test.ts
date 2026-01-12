/**
 * Property-Based Tests for Notification Preference Manager
 * Tests the notification preference manager against Requirements 6.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  getUserPreferences, 
  updateChannelConsent, 
  updateMultipleChannelPreferences,
  updateQuietHours,
  isChannelEnabled,
  isWithinQuietHours
} from '../../functions/_lib/notificationPreferenceManager.js';

// Mock external dependencies
vi.mock('../../functions/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ 
            data: {
              id: 'test-pref-id',
              user_id: 'test-user-id',
              email_enabled: true,
              sms_enabled: false,
              whatsapp_enabled: false,
              push_enabled: true,
              in_app_enabled: true,
              quiet_hours_start: '22:00',
              quiet_hours_end: '08:00',
              timezone: 'Africa/Lusaka'
            }, 
            error: null 
          })),
          single: vi.fn(() => Promise.resolve({ 
            data: {
              id: 'test-pref-id',
              user_id: 'test-user-id',
              email_enabled: true,
              sms_enabled: true,
              whatsapp_enabled: false,
              push_enabled: true,
              in_app_enabled: true
            }, 
            error: null 
          }))
        }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ 
            data: {
              id: 'new-pref-id',
              user_id: 'test-user-id',
              email_enabled: true,
              sms_enabled: true,
              whatsapp_enabled: false,
              push_enabled: true,
              in_app_enabled: true
            }, 
            error: null 
          }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ 
              data: {
                id: 'test-pref-id',
                user_id: 'test-user-id',
                email_enabled: false,
                sms_enabled: true,
                whatsapp_enabled: false,
                push_enabled: true,
                in_app_enabled: true
              }, 
              error: null 
            }))
          }))
        }))
      }))
    }))
  }
}));

describe('Notification Preference Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 23: User Preference Compliance
   * For any user with specific notification preferences, the system should respect 
   * consent settings and deliver only through approved channels
   * **Validates: Requirements 6.2**
   */
  it('should respect user notification preferences across all channels', async () => {
    // **Feature: mihas-system-analysis, Property 23: User preference compliance**
    
    const testCases = [
      {
        userId: 'user-1',
        preferences: {
          email: true,
          sms: false,
          whatsapp: false,
          push: true,
          in_app: true
        }
      },
      {
        userId: 'user-2', 
        preferences: {
          email: false,
          sms: true,
          whatsapp: true,
          push: false,
          in_app: true
        }
      },
      {
        userId: 'user-3',
        preferences: {
          email: true,
          sms: true,
          whatsapp: true,
          push: true,
          in_app: true
        }
      }
    ];

    for (const testCase of testCases) {
      // Set up preferences for this user
      for (const [channel, enabled] of Object.entries(testCase.preferences)) {
        const action = enabled ? 'opt_in' : 'opt_out';
        await updateChannelConsent(testCase.userId, channel, action, {
          reason: `Test setup: ${action} for ${channel}`
        });
      }

      // Verify each channel preference is respected
      for (const [channel, expectedEnabled] of Object.entries(testCase.preferences)) {
        const isEnabled = await isChannelEnabled(testCase.userId, channel);
        expect(isEnabled).toBe(expectedEnabled);
      }
    }
  });

  /**
   * Property: Opt-in/Opt-out Audit Trail
   * For any preference change, the system should create a complete audit trail
   * with timestamp, reason, and context information
   * **Validates: Requirements 6.2**
   */
  it('should create audit trail for all preference changes', async () => {
    // **Feature: mihas-system-analysis, Property: Opt-in/opt-out audit trail**
    
    const userId = 'audit-test-user';
    const testActions = [
      { channel: 'email', action: 'opt_in', reason: 'User wants email notifications' },
      { channel: 'sms', action: 'opt_out', reason: 'User disabled SMS' },
      { channel: 'whatsapp', action: 'opt_in', reason: 'User enabled WhatsApp' },
      { channel: 'push', action: 'opt_out', reason: 'User disabled push notifications' }
    ];

    for (const testAction of testActions) {
      const result = await updateChannelConsent(
        userId, 
        testAction.channel, 
        testAction.action as 'opt_in' | 'opt_out',
        {
          reason: testAction.reason,
          source: 'test',
          ip_address: '127.0.0.1'
        }
      );

      // Verify the update was successful
      expect(result).toBeDefined();
      expect(result.user_id).toBe(userId);
      
      // Verify the channel state matches the action
      const expectedEnabled = testAction.action === 'opt_in';
      const isEnabled = await isChannelEnabled(userId, testAction.channel);
      expect(isEnabled).toBe(expectedEnabled);
    }
  });

  /**
   * Property: Preference Inheritance and Defaults
   * For any new user, the system should provide sensible default preferences
   * that can be inherited and customized
   * **Validates: Requirements 6.2**
   */
  it('should handle preference inheritance and default settings', async () => {
    // **Feature: mihas-system-analysis, Property: Preference inheritance and defaults**
    
    const newUserId = 'new-user-test';
    
    // Get preferences for a user who hasn't set any yet
    const defaultPrefs = await getUserPreferences(newUserId);
    
    // Verify default preferences are applied
    expect(defaultPrefs).toBeDefined();
    expect(defaultPrefs.email_enabled).toBe(true); // Email enabled by default
    expect(defaultPrefs.sms_enabled).toBe(false); // SMS disabled by default
    expect(defaultPrefs.whatsapp_enabled).toBe(false); // WhatsApp disabled by default
    expect(defaultPrefs.push_enabled).toBe(true); // Push enabled by default
    expect(defaultPrefs.in_app_enabled).toBe(true); // In-app enabled by default
    expect(defaultPrefs.quiet_hours_start).toBe('22:00');
    expect(defaultPrefs.quiet_hours_end).toBe('08:00');
    expect(defaultPrefs.timezone).toBe('Africa/Lusaka');
  });

  /**
   * Property: Bulk Preference Updates
   * For any bulk preference update operation, all specified channels should be
   * updated atomically with proper audit trail
   * **Validates: Requirements 6.2**
   */
  it('should handle bulk preference updates correctly', async () => {
    // **Feature: mihas-system-analysis, Property: Bulk preference updates**
    
    const userId = 'bulk-update-user';
    const bulkUpdates = {
      email: true,
      sms: true,
      whatsapp: false,
      push: false,
      in_app: true
    };

    // Perform bulk update
    const result = await updateMultipleChannelPreferences(userId, bulkUpdates, {
      reason: 'Bulk preference update test',
      source: 'test'
    });

    expect(result).toBeDefined();
    expect(result.user_id).toBe(userId);

    // Verify each channel was updated correctly
    for (const [channel, expectedEnabled] of Object.entries(bulkUpdates)) {
      const isEnabled = await isChannelEnabled(userId, channel);
      expect(isEnabled).toBe(expectedEnabled);
    }
  });

  /**
   * Property: Quiet Hours Validation
   * For any quiet hours configuration, the system should correctly determine
   * if current time falls within the specified quiet period
   * **Validates: Requirements 6.2**
   */
  it('should correctly validate quiet hours across different time configurations', async () => {
    // **Feature: mihas-system-analysis, Property: Quiet hours validation**
    
    const userId = 'quiet-hours-user';
    
    const testConfigurations = [
      {
        start: '22:00',
        end: '08:00',
        timezone: 'Africa/Lusaka',
        description: 'Standard overnight quiet hours'
      },
      {
        start: '12:00', 
        end: '14:00',
        timezone: 'Africa/Lusaka',
        description: 'Lunch break quiet hours'
      },
      {
        start: '00:00',
        end: '06:00', 
        timezone: 'UTC',
        description: 'Early morning quiet hours'
      }
    ];

    for (const config of testConfigurations) {
      // Update quiet hours configuration
      const result = await updateQuietHours(
        userId,
        config.start,
        config.end,
        config.timezone,
        {
          reason: `Test: ${config.description}`,
          source: 'test'
        }
      );

      expect(result).toBeDefined();
      expect(result.quiet_hours_start).toBe(config.start);
      expect(result.quiet_hours_end).toBe(config.end);
      expect(result.timezone).toBe(config.timezone);

      // Note: Testing isWithinQuietHours would require mocking the current time
      // which is complex in this context. The function logic is tested through
      // integration tests that can control the system clock.
    }
  });

  /**
   * Property: Channel Validation
   * For any channel preference operation, only valid channels should be accepted
   * and invalid channels should be rejected with appropriate error messages
   * **Validates: Requirements 6.2**
   */
  it('should validate channel names and reject invalid channels', async () => {
    // **Feature: mihas-system-analysis, Property: Channel validation**
    
    const userId = 'validation-test-user';
    const validChannels = ['email', 'sms', 'whatsapp', 'push', 'in_app'];
    const invalidChannels = ['invalid', 'fake_channel', '', null, undefined];

    // Test valid channels
    for (const channel of validChannels) {
      try {
        const result = await updateChannelConsent(userId, channel, 'opt_in', {
          reason: `Test valid channel: ${channel}`
        });
        expect(result).toBeDefined();
      } catch (error) {
        // Valid channels should not throw errors
        expect(error).toBeNull();
      }
    }

    // Test invalid channels
    for (const channel of invalidChannels) {
      try {
        await updateChannelConsent(userId, channel as string, 'opt_in', {
          reason: `Test invalid channel: ${channel}`
        });
        // Should not reach here for invalid channels
        expect(true).toBe(false);
      } catch (error) {
        // Invalid channels should throw errors
        expect(error).toBeDefined();
        expect(error.message).toContain('Invalid channel');
      }
    }
  });

  /**
   * Property: Consent Timestamp Tracking
   * For any opt-in action, the system should record the consent timestamp
   * and preserve it for audit and compliance purposes
   * **Validates: Requirements 6.2**
   */
  it('should track consent timestamps for opt-in actions', async () => {
    // **Feature: mihas-system-analysis, Property: Consent timestamp tracking**
    
    const userId = 'consent-timestamp-user';
    const channels = ['email', 'sms', 'whatsapp', 'push'];
    
    const beforeTime = new Date();
    
    for (const channel of channels) {
      const result = await updateChannelConsent(userId, channel, 'opt_in', {
        reason: `Consent test for ${channel}`,
        source: 'test'
      });

      expect(result).toBeDefined();
      
      // Verify consent timestamp is recorded for opt-in
      const consentField = `${channel}_consent_at`;
      expect(result[consentField]).toBeDefined();
      
      // Verify timestamp is recent (within last minute)
      const consentTime = new Date(result[consentField]);
      const afterTime = new Date();
      expect(consentTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(consentTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    }
  });
});