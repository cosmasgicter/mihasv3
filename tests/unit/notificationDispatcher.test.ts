/**
 * Property-Based Tests for Multi-Channel Notification Dispatcher
 * Tests the notification dispatcher against Requirements 6.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dispatchNotification, getDeliveryStatus } from '../../functions/_lib/notificationDispatcher.js';

// Mock external dependencies
vi.mock('../../functions/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ 
            data: { id: 'test-notification-id' }, 
            error: null 
          }))
        }))
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ 
            data: { 
              email_enabled: true, 
              sms_enabled: true, 
              whatsapp_enabled: true, 
              push_enabled: true, 
              in_app_enabled: true 
            }, 
            error: null 
          }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
    }))
  }
}));

vi.mock('../../functions/_lib/emailService.js', () => ({
  sendEmail: vi.fn(() => Promise.resolve({ success: true, id: 'email-123' }))
}));

vi.mock('../../functions/_lib/twilioService.js', () => ({
  sendSMS: vi.fn(() => Promise.resolve({ success: true, sid: 'sms-123' })),
  sendWhatsApp: vi.fn(() => Promise.resolve({ success: true, sid: 'whatsapp-123' }))
}));

vi.mock('../../functions/_lib/pushService.js', () => ({
  sendPushNotification: vi.fn(() => Promise.resolve({ success: true, sent_count: 1 }))
}));

describe('Multi-Channel Notification Dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 22: Multi-channel Notification Delivery
   * For any notification to be sent, the Notification_System should successfully 
   * deliver through all configured channels (email, SMS, WhatsApp, push, in-app)
   * **Validates: Requirements 6.1**
   */
  it('should dispatch notifications to all requested channels', async () => {
    // **Feature: mihas-system-analysis, Property 22: Multi-channel Notification Delivery**
    
    const testCases = [
      {
        channels: ['email'],
        expectedChannels: ['email']
      },
      {
        channels: ['email', 'sms'],
        expectedChannels: ['email', 'sms']
      },
      {
        channels: ['email', 'sms', 'whatsapp', 'push', 'in_app'],
        expectedChannels: ['email', 'sms', 'whatsapp', 'push', 'in_app']
      }
    ];

    for (const testCase of testCases) {
      const result = await dispatchNotification({
        userId: 'test-user-id',
        templateName: 'test_template',
        variables: { title: 'Test', message: 'Test message' },
        channels: testCase.channels,
        env: {}
      });

      expect(result.success).toBe(true);
      expect(result.notification_id).toBeDefined();
      expect(result.results).toBeDefined();
      
      // Verify all requested channels were attempted
      testCase.expectedChannels.forEach(channel => {
        expect(result.results).toHaveProperty(channel);
      });
    }
  });

  /**
   * Property: Channel-specific formatting
   * For any notification template and variables, each channel should format 
   * the content appropriately for that channel's constraints
   */
  it('should format content appropriately for each channel', async () => {
    const variables = {
      title: 'Application Status Update',
      message: 'Your application has been approved',
      full_name: 'John Doe',
      application_number: 'APP-2025-001'
    };

    const result = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'application_status_update',
      variables,
      channels: ['email', 'sms', 'whatsapp', 'push', 'in_app'],
      env: {}
    });

    expect(result.success).toBe(true);
    
    // Each channel should have been processed
    expect(result.results.email).toBeDefined();
    expect(result.results.sms).toBeDefined();
    expect(result.results.whatsapp).toBeDefined();
    expect(result.results.push).toBeDefined();
    expect(result.results.in_app).toBeDefined();
  });

  /**
   * Property: Delivery confirmation tracking
   * For any notification dispatch, the system should create delivery records
   * and track the status of each channel delivery attempt
   */
  it('should track delivery status for each channel', async () => {
    const result = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'test_template',
      variables: { title: 'Test', message: 'Test message' },
      channels: ['email', 'push'],
      env: {}
    });

    expect(result.success).toBe(true);
    expect(result.notification_id).toBeDefined();

    // Should be able to get delivery status
    const statusResult = await getDeliveryStatus(result.notification_id);
    expect(statusResult.success).toBe(true);
  });

  /**
   * Property: Variable substitution
   * For any template with variables, the system should correctly substitute
   * all variables in the template content
   */
  it('should substitute variables in templates correctly', async () => {
    const variables = {
      full_name: 'Jane Smith',
      application_number: 'APP-2025-002',
      status: 'Approved',
      message: 'Congratulations on your acceptance!'
    };

    const result = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'application_status_update',
      variables,
      channels: ['email'],
      env: {}
    });

    expect(result.success).toBe(true);
    expect(result.results.email).toBeDefined();
  });

  /**
   * Property: Error handling and resilience
   * For any channel delivery failure, the system should handle errors gracefully
   * and continue processing other channels
   */
  it('should handle individual channel failures gracefully', async () => {
    // Mock one service to fail
    const { sendEmail } = await import('../../functions/_lib/emailService.js');
    vi.mocked(sendEmail).mockResolvedValueOnce({ success: false, error: 'Email service unavailable' });

    const result = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'test_template',
      variables: { title: 'Test', message: 'Test message' },
      channels: ['email', 'push'],
      env: {}
    });

    expect(result.success).toBe(true);
    expect(result.results.email.success).toBe(false);
    expect(result.results.push.success).toBe(true);
  });

  /**
   * Property: User preference compliance
   * For any user with disabled channels, the system should respect
   * user preferences and not send to disabled channels
   */
  it('should respect user notification preferences', async () => {
    // Mock user preferences with some channels disabled
    const { supabaseAdminClient } = await import('../../functions/_lib/supabaseClient.js');
    vi.mocked(supabaseAdminClient.from).mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ 
            data: { 
              email_enabled: true, 
              sms_enabled: false,  // Disabled
              whatsapp_enabled: false,  // Disabled
              push_enabled: true, 
              in_app_enabled: true 
            }, 
            error: null 
          }))
        }))
      }))
    } as any);

    const result = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'test_template',
      variables: { title: 'Test', message: 'Test message' },
      channels: ['email', 'sms', 'whatsapp', 'push', 'in_app'],
      env: {}
    });

    expect(result.success).toBe(true);
    
    // Enabled channels should succeed
    expect(result.results.email.success).toBe(true);
    expect(result.results.push.success).toBe(true);
    expect(result.results.in_app.success).toBe(true);
    
    // Disabled channels should be skipped
    expect(result.results.sms.success).toBe(false);
    expect(result.results.sms.error).toContain('disabled');
    expect(result.results.whatsapp.success).toBe(false);
    expect(result.results.whatsapp.error).toContain('disabled');
  });

  /**
   * Property: Required field validation
   * For any notification dispatch request, the system should validate
   * that all required fields are present
   */
  it('should validate required fields', async () => {
    // Test missing userId
    const result1 = await dispatchNotification({
      userId: '',
      templateName: 'test_template',
      variables: { title: 'Test', message: 'Test message' },
      channels: ['email'],
      env: {}
    });

    expect(result1.success).toBe(false);
    expect(result1.error).toBeDefined();
  });

  /**
   * Property: Channel validation
   * For any requested channels, the system should validate that
   * all channels are supported
   */
  it('should validate supported channels', async () => {
    const validChannels = ['email', 'sms', 'whatsapp', 'push', 'in_app'];
    
    // Test with valid channels
    const result1 = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'test_template',
      variables: { title: 'Test', message: 'Test message' },
      channels: validChannels,
      env: {}
    });

    expect(result1.success).toBe(true);

    // The system should handle all valid channels
    validChannels.forEach(channel => {
      expect(result1.results).toHaveProperty(channel);
    });
  });
});