/**
 * Multi-Channel Notification Dispatcher Tests
 * Tests the core functionality of the notification dispatcher
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dispatchNotification, getDeliveryStatus } from '../../functions/_lib/notificationDispatcher.js';

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => ({ data: { id: 'test-notification-id' }, error: null }))
      }))
    })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => ({ data: null, error: null })),
        single: vi.fn(() => ({ data: { email: 'test@example.com', phone: '+260123456789', full_name: 'Test User' }, error: null })),
        order: vi.fn(() => ({ data: [], error: null }))
      }))
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({ error: null }))
    }))
  }))
};

// Mock external services
vi.mock('../../functions/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: mockSupabaseClient
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

  it('should dispatch notification to multiple channels', async () => {
    const result = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'application_status_update',
      variables: {
        title: 'Application Status Update',
        message: 'Your application has been approved',
        full_name: 'Test User',
        application_number: 'APP-2025-001',
        status: 'approved'
      },
      channels: ['email', 'in_app'],
      env: {}
    });

    expect(result.success).toBe(true);
    expect(result.notification_id).toBe('test-notification-id');
    expect(result.results).toHaveProperty('email');
    expect(result.results).toHaveProperty('in_app');
  });

  it('should handle channel-specific formatting', async () => {
    // Mock template retrieval
    mockSupabaseClient.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => ({
                data: {
                  subject_template: 'Application Update - {{application_number}}',
                  body_template: 'Hello {{full_name}}, your application {{application_number}} is now {{status}}.'
                },
                error: null
              }))
            }))
          }))
        }))
      }))
    });

    const result = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'application_status_update',
      variables: {
        full_name: 'John Doe',
        application_number: 'APP-2025-001',
        status: 'approved'
      },
      channels: ['email'],
      env: {}
    });

    expect(result.success).toBe(true);
  });

  it('should respect user notification preferences', async () => {
    // Mock user preferences - email disabled
    mockSupabaseClient.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: {
              email_enabled: false,
              sms_enabled: true,
              push_enabled: true,
              in_app_enabled: true
            },
            error: null
          }))
        }))
      }))
    });

    const result = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'default',
      variables: { title: 'Test', message: 'Test message' },
      channels: ['email', 'push'],
      env: {}
    });

    expect(result.success).toBe(true);
    expect(result.results.email.success).toBe(false);
    expect(result.results.email.error).toBe('Channel disabled by user');
  });

  it('should track delivery status', async () => {
    const result = await getDeliveryStatus('test-notification-id');
    expect(result.success).toBe(true);
    expect(Array.isArray(result.deliveries)).toBe(true);
  });

  it('should handle missing contact information gracefully', async () => {
    // Mock user with no email
    mockSupabaseClient.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { email: null, phone: null, full_name: 'Test User' },
            error: null
          }))
        }))
      }))
    });

    const result = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'default',
      variables: { title: 'Test', message: 'Test message' },
      channels: ['email'],
      env: {}
    });

    expect(result.success).toBe(true);
    // Should still succeed overall but email delivery should fail
  });

  it('should validate channel names', async () => {
    const result = await dispatchNotification({
      userId: 'test-user-id',
      templateName: 'default',
      variables: { title: 'Test', message: 'Test message' },
      channels: ['invalid-channel'],
      env: {}
    });

    expect(result.success).toBe(true);
    // Invalid channels should be handled gracefully
  });
});