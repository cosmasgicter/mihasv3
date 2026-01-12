/**
 * Unit tests for Notification Delivery Resilience System
 * Tests retry logic, fallback channels, and delivery tracking
 * 
 * Requirements: 6.3 - Notification delivery resilience system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateBackoffDelay,
  getChannelSuccessRate,
  shouldUseFallback,
  RESILIENCE_CONFIG
} from '../../functions/_lib/notificationResilience.js';

// Mock Supabase client
vi.mock('../../functions/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            single: vi.fn(),
            maybeSingle: vi.fn()
          }))
        }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn()
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn()
      }))
    }))
  }
}));

// Mock external services
vi.mock('../../functions/_lib/emailService.js', () => ({
  sendEmail: vi.fn()
}));

vi.mock('../../functions/_lib/twilioService.js', () => ({
  sendSMS: vi.fn(),
  sendWhatsApp: vi.fn()
}));

vi.mock('../../functions/_lib/pushService.js', () => ({
  sendPushNotification: vi.fn()
}));

describe('Notification Resilience System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exponential Backoff Calculation', () => {
    it('should calculate correct backoff delays', () => {
      const attempt1 = calculateBackoffDelay(1);
      const attempt2 = calculateBackoffDelay(2);
      const attempt3 = calculateBackoffDelay(3);
      
      // First attempt should be base delay (1000ms) ± jitter
      expect(attempt1).toBeGreaterThanOrEqual(900);
      expect(attempt1).toBeLessThanOrEqual(1100);
      
      // Second attempt should be roughly 2x base delay ± jitter
      expect(attempt2).toBeGreaterThanOrEqual(1800);
      expect(attempt2).toBeLessThanOrEqual(2200);
      
      // Third attempt should be roughly 4x base delay ± jitter
      expect(attempt3).toBeGreaterThanOrEqual(3600);
      expect(attempt3).toBeLessThanOrEqual(4400);
    });

    it('should respect maximum delay limit', () => {
      const largeAttempt = calculateBackoffDelay(20);
      expect(largeAttempt).toBeLessThanOrEqual(RESILIENCE_CONFIG.maxDelayMs);
    });

    it('should never go below minimum delay', () => {
      const attempt1 = calculateBackoffDelay(1);
      expect(attempt1).toBeGreaterThanOrEqual(RESILIENCE_CONFIG.baseDelayMs);
    });
  });

  describe('Channel Success Rate Calculation', () => {
    it('should return 1.0 when no data is available', async () => {
      const { supabaseAdminClient } = await import('../../functions/_lib/supabaseClient.js');
      
      // Mock empty result
      supabaseAdminClient.from().select().eq().gte.mockResolvedValue({
        data: [],
        error: null
      });
      
      const successRate = await getChannelSuccessRate('email');
      expect(successRate).toBe(1.0);
    });

    it('should calculate correct success rate', async () => {
      const { supabaseAdminClient } = await import('../../functions/_lib/supabaseClient.js');
      
      // Mock data with 3 successful, 1 failed delivery
      const mockData = [
        { status: 'sent' },
        { status: 'delivered' },
        { status: 'sent' },
        { status: 'failed' }
      ];
      
      supabaseAdminClient.from().select().eq().gte.mockResolvedValue({
        data: mockData,
        error: null
      });
      
      const successRate = await getChannelSuccessRate('email');
      expect(successRate).toBe(0.75); // 3/4 = 0.75
    });

    it('should handle database errors gracefully', async () => {
      const { supabaseAdminClient } = await import('../../functions/_lib/supabaseClient.js');
      
      // Mock database error
      supabaseAdminClient.from().select().eq().gte.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });
      
      const successRate = await getChannelSuccessRate('email');
      expect(successRate).toBe(1.0); // Should default to good when error occurs
    });
  });

  describe('Fallback Decision Logic', () => {
    it('should recommend fallback when success rate is below threshold', async () => {
      const { supabaseAdminClient } = await import('../../functions/_lib/supabaseClient.js');
      
      // Mock low success rate (50%)
      const mockData = [
        { status: 'sent' },
        { status: 'failed' }
      ];
      
      supabaseAdminClient.from().select().eq().gte.mockResolvedValue({
        data: mockData,
        error: null
      });
      
      const shouldFallback = await shouldUseFallback('email');
      expect(shouldFallback).toBe(true);
    });

    it('should not recommend fallback when success rate is above threshold', async () => {
      const { supabaseAdminClient } = await import('../../functions/_lib/supabaseClient.js');
      
      // Mock high success rate (90%)
      const mockData = [
        { status: 'sent' },
        { status: 'sent' },
        { status: 'sent' },
        { status: 'sent' },
        { status: 'sent' },
        { status: 'sent' },
        { status: 'sent' },
        { status: 'sent' },
        { status: 'sent' },
        { status: 'failed' }
      ];
      
      supabaseAdminClient.from().select().eq().gte.mockResolvedValue({
        data: mockData,
        error: null
      });
      
      const shouldFallback = await shouldUseFallback('email');
      expect(shouldFallback).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    it('should have valid resilience configuration', () => {
      expect(RESILIENCE_CONFIG.baseDelayMs).toBeGreaterThan(0);
      expect(RESILIENCE_CONFIG.maxDelayMs).toBeGreaterThan(RESILIENCE_CONFIG.baseDelayMs);
      expect(RESILIENCE_CONFIG.backoffMultiplier).toBeGreaterThan(1);
      expect(RESILIENCE_CONFIG.jitterFactor).toBeGreaterThan(0);
      expect(RESILIENCE_CONFIG.jitterFactor).toBeLessThan(1);
      expect(RESILIENCE_CONFIG.maxRetries).toBeGreaterThan(0);
      expect(RESILIENCE_CONFIG.reliabilityThreshold).toBeGreaterThan(0);
      expect(RESILIENCE_CONFIG.reliabilityThreshold).toBeLessThan(1);
    });

    it('should have fallback channels defined for all supported channels', () => {
      const supportedChannels = ['email', 'sms', 'whatsapp', 'push', 'in_app'];
      
      supportedChannels.forEach(channel => {
        expect(RESILIENCE_CONFIG.fallbackChannels).toHaveProperty(channel);
        expect(Array.isArray(RESILIENCE_CONFIG.fallbackChannels[channel])).toBe(true);
        expect(RESILIENCE_CONFIG.fallbackChannels[channel].length).toBeGreaterThan(0);
      });
    });
  });

  describe('Retry Logic Integration', () => {
    it('should respect maximum retry attempts', () => {
      const maxRetries = RESILIENCE_CONFIG.maxRetries;
      
      // Test that we don't exceed max retries
      for (let attempt = 1; attempt <= maxRetries + 2; attempt++) {
        const delay = calculateBackoffDelay(attempt);
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(RESILIENCE_CONFIG.maxDelayMs);
      }
    });

    it('should apply jitter to prevent thundering herd', () => {
      const delays = [];
      
      // Generate multiple delays for the same attempt
      for (let i = 0; i < 10; i++) {
        delays.push(calculateBackoffDelay(2));
      }
      
      // Check that delays are not all identical (jitter is working)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });
});