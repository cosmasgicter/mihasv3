/**
 * Unit tests for notification policy enforcement.
 *
 * Validates Requirements 13.3, 13.4, 13.5:
 * - Mandatory email types are correctly defined
 * - isMandatoryEmailType correctly classifies notification types
 * - Mandatory types always require email regardless of user preferences
 * - Non-mandatory types respect user opt-out
 */
import { describe, it, expect } from 'vitest';
import { MANDATORY_EMAIL_TYPES, isMandatoryEmailType } from '../../lib/notificationPolicy';

describe('Notification Policy Enforcement', () => {
  describe('MANDATORY_EMAIL_TYPES', () => {
    it('should include application_status_change', () => {
      expect(MANDATORY_EMAIL_TYPES).toContain('application_status_change');
    });

    it('should include payment_verified', () => {
      expect(MANDATORY_EMAIL_TYPES).toContain('payment_verified');
    });

    it('should include interview_scheduled', () => {
      expect(MANDATORY_EMAIL_TYPES).toContain('interview_scheduled');
    });

    it('should contain exactly 3 mandatory types', () => {
      expect(MANDATORY_EMAIL_TYPES).toHaveLength(3);
    });
  });

  describe('isMandatoryEmailType', () => {
    it('should return true for application_status_change', () => {
      expect(isMandatoryEmailType('application_status_change')).toBe(true);
    });

    it('should return true for payment_verified', () => {
      expect(isMandatoryEmailType('payment_verified')).toBe(true);
    });

    it('should return true for interview_scheduled', () => {
      expect(isMandatoryEmailType('interview_scheduled')).toBe(true);
    });

    it('should return false for info type', () => {
      expect(isMandatoryEmailType('info')).toBe(false);
    });

    it('should return false for marketing type', () => {
      expect(isMandatoryEmailType('marketing')).toBe(false);
    });

    it('should return false for general type', () => {
      expect(isMandatoryEmailType('general')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isMandatoryEmailType('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isMandatoryEmailType('APPLICATION_STATUS_CHANGE')).toBe(false);
      expect(isMandatoryEmailType('Payment_Verified')).toBe(false);
    });
  });

  describe('Policy enforcement logic', () => {
    // Simulate the shouldSendEmail logic from handleSend
    function shouldSendEmail(notificationType: string, emailEnabled: boolean): boolean {
      const mandatory = isMandatoryEmailType(notificationType);
      return mandatory || emailEnabled;
    }

    it('should always send email for mandatory types even when email is disabled', () => {
      for (const type of MANDATORY_EMAIL_TYPES) {
        expect(shouldSendEmail(type, false)).toBe(true);
      }
    });

    it('should always send email for mandatory types when email is enabled', () => {
      for (const type of MANDATORY_EMAIL_TYPES) {
        expect(shouldSendEmail(type, true)).toBe(true);
      }
    });

    it('should respect email opt-out for non-mandatory types', () => {
      expect(shouldSendEmail('info', false)).toBe(false);
      expect(shouldSendEmail('marketing', false)).toBe(false);
      expect(shouldSendEmail('general', false)).toBe(false);
    });

    it('should send email for non-mandatory types when email is enabled', () => {
      expect(shouldSendEmail('info', true)).toBe(true);
      expect(shouldSendEmail('marketing', true)).toBe(true);
    });
  });
});
