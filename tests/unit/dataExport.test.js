/**
 * Unit tests for Secure Multi-Format Data Export
 * Tests PDF, Excel, and CSV export with anonymization
 * 
 * Requirements: 5.5 - Secure multi-format data export
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EXPORT_CONFIG,
  removeSensitiveFields,
  anonymizeData
} from '../../functions/_lib/dataExport.js';

// Mock Supabase client
vi.mock('../../functions/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          limit: vi.fn()
        })),
        in: vi.fn(() => ({
          limit: vi.fn()
        })),
        gte: vi.fn(() => ({
          lte: vi.fn(() => ({
            limit: vi.fn()
          }))
        }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn()
      }))
    }))
  }
}));

describe('Data Export System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration Validation', () => {
    it('should have valid export configuration', () => {
      expect(EXPORT_CONFIG.maxRecords).toBeGreaterThan(0);
      expect(EXPORT_CONFIG.allowedFormats).toContain('pdf');
      expect(EXPORT_CONFIG.allowedFormats).toContain('excel');
      expect(EXPORT_CONFIG.allowedFormats).toContain('csv');
      expect(Array.isArray(EXPORT_CONFIG.anonymizableFields)).toBe(true);
      expect(Array.isArray(EXPORT_CONFIG.sensitiveFields)).toBe(true);
    });

    it('should define anonymizable fields', () => {
      expect(EXPORT_CONFIG.anonymizableFields).toContain('email');
      expect(EXPORT_CONFIG.anonymizableFields).toContain('phone');
      expect(EXPORT_CONFIG.anonymizableFields).toContain('nrc');
    });

    it('should define sensitive fields', () => {
      expect(EXPORT_CONFIG.sensitiveFields).toContain('password');
      expect(EXPORT_CONFIG.sensitiveFields).toContain('token');
      expect(EXPORT_CONFIG.sensitiveFields).toContain('secret');
    });
  });

  describe('Sensitive Field Removal', () => {
    /**
     * Property 21: Secure Multi-format Data Export
     * For any data export request, the system should provide secure exports
     * with complete data integrity and sensitive field removal
     * **Feature: mihas-system-analysis, Property 21: Secure Multi-format Data Export**
     */
    it('should remove sensitive fields from data', () => {
      const testData = [
        {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com',
          password: 'secret123',
          token: 'abc123',
          api_key: 'key123'
        },
        {
          id: '2',
          name: 'Jane Smith',
          email: 'jane@example.com',
          password: 'secret456',
          secret: 'hidden'
        }
      ];

      const sanitized = removeSensitiveFields(testData);

      // Check that sensitive fields are removed
      sanitized.forEach(row => {
        expect(row).not.toHaveProperty('password');
        expect(row).not.toHaveProperty('token');
        expect(row).not.toHaveProperty('api_key');
        expect(row).not.toHaveProperty('secret');
      });

      // Check that non-sensitive fields remain
      expect(sanitized[0]).toHaveProperty('id');
      expect(sanitized[0]).toHaveProperty('name');
      expect(sanitized[0]).toHaveProperty('email');
    });

    it('should handle empty data arrays', () => {
      const sanitized = removeSensitiveFields([]);
      expect(sanitized).toEqual([]);
    });

    it('should handle data without sensitive fields', () => {
      const testData = [
        { id: '1', name: 'John Doe' },
        { id: '2', name: 'Jane Smith' }
      ];

      const sanitized = removeSensitiveFields(testData);
      expect(sanitized).toEqual(testData);
    });
  });

  describe('Data Anonymization', () => {
    it('should anonymize email addresses', () => {
      const testData = [
        { id: '1', email: 'john.doe@example.com' },
        { id: '2', email: 'jane@test.org' }
      ];

      const anonymized = anonymizeData(testData);

      anonymized.forEach(row => {
        expect(row.email).toMatch(/^[a-z]\*+@/); // Should start with first letter and asterisks
        expect(row.email).not.toBe(testData.find(d => d.id === row.id).email);
      });
    });

    it('should anonymize phone numbers', () => {
      const testData = [
        { id: '1', phone: '+260971234567' },
        { id: '2', phone: '0971234567' }
      ];

      const anonymized = anonymizeData(testData);

      anonymized.forEach(row => {
        expect(row.phone).toContain('*'); // Should contain asterisks
        expect(row.phone).not.toBe(testData.find(d => d.id === row.id).phone);
      });
    });

    it('should anonymize NRC numbers', () => {
      const testData = [
        { id: '1', nrc: '123456/78/9' },
        { id: '2', nrc: '987654/32/1' }
      ];

      const anonymized = anonymizeData(testData);

      anonymized.forEach(row => {
        expect(row.nrc).toContain('*'); // Should contain asterisks
        expect(row.nrc).not.toBe(testData.find(d => d.id === row.id).nrc);
      });
    });

    it('should anonymize dates of birth', () => {
      const testData = [
        { id: '1', date_of_birth: '1995-06-15' },
        { id: '2', date_of_birth: '2000-12-25' }
      ];

      const anonymized = anonymizeData(testData);

      anonymized.forEach(row => {
        expect(row.date_of_birth).toMatch(/^\d{4}-\*\*-\*\*/); // Should keep year only
        expect(row.date_of_birth).not.toBe(testData.find(d => d.id === row.id).date_of_birth);
      });
    });

    it('should anonymize addresses', () => {
      const testData = [
        { id: '1', address: '123 Main Street, Lusaka, Zambia' },
        { id: '2', address: '456 Park Avenue, Kitwe' }
      ];

      const anonymized = anonymizeData(testData);

      anonymized.forEach(row => {
        expect(row.address).toContain('***'); // Should mask street address
        expect(row.address).not.toBe(testData.find(d => d.id === row.id).address);
      });
    });

    it('should handle null and undefined values', () => {
      const testData = [
        { id: '1', email: null, phone: undefined },
        { id: '2', email: '', phone: null }
      ];

      const anonymized = anonymizeData(testData);

      // Should not crash and should handle gracefully
      expect(anonymized).toHaveLength(2);
      expect(anonymized[0].email).toBeFalsy();
      expect(anonymized[0].phone).toBeFalsy();
    });

    it('should preserve non-anonymizable fields', () => {
      const testData = [
        { 
          id: '1', 
          name: 'John Doe', 
          email: 'john@example.com',
          status: 'active'
        }
      ];

      const anonymized = anonymizeData(testData);

      expect(anonymized[0].id).toBe('1');
      expect(anonymized[0].name).toBe('John Doe');
      expect(anonymized[0].status).toBe('active');
      expect(anonymized[0].email).not.toBe('john@example.com'); // Should be anonymized
    });
  });

  describe('Export Format Validation', () => {
    it('should support PDF format', () => {
      expect(EXPORT_CONFIG.allowedFormats).toContain('pdf');
    });

    it('should support Excel format', () => {
      expect(EXPORT_CONFIG.allowedFormats).toContain('excel');
    });

    it('should support CSV format', () => {
      expect(EXPORT_CONFIG.allowedFormats).toContain('csv');
    });

    it('should have exactly three supported formats', () => {
      expect(EXPORT_CONFIG.allowedFormats).toHaveLength(3);
    });
  });

  describe('Data Size Limits', () => {
    it('should define maximum record limit', () => {
      expect(EXPORT_CONFIG.maxRecords).toBeDefined();
      expect(typeof EXPORT_CONFIG.maxRecords).toBe('number');
      expect(EXPORT_CONFIG.maxRecords).toBeGreaterThan(0);
    });

    it('should have reasonable maximum record limit', () => {
      // Should be between 1000 and 100000 for practical use
      expect(EXPORT_CONFIG.maxRecords).toBeGreaterThanOrEqual(1000);
      expect(EXPORT_CONFIG.maxRecords).toBeLessThanOrEqual(100000);
    });
  });

  describe('Security Features', () => {
    it('should always remove sensitive fields before export', () => {
      const dataWithSecrets = [
        {
          id: '1',
          name: 'Test User',
          password: 'secret',
          token: 'abc123',
          api_key: 'key123'
        }
      ];

      const sanitized = removeSensitiveFields(dataWithSecrets);

      // Verify all sensitive fields are removed
      EXPORT_CONFIG.sensitiveFields.forEach(field => {
        expect(sanitized[0]).not.toHaveProperty(field);
      });
    });

    it('should support optional anonymization', () => {
      const testData = [
        { id: '1', email: 'test@example.com', name: 'Test User' }
      ];

      // Without anonymization
      const notAnonymized = removeSensitiveFields(testData);
      expect(notAnonymized[0].email).toBe('test@example.com');

      // With anonymization
      const anonymized = anonymizeData(testData);
      expect(anonymized[0].email).not.toBe('test@example.com');
      expect(anonymized[0].email).toContain('*');
    });
  });
});
