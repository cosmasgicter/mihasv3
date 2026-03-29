import { describe, it, expect } from 'vitest';
import {
  ERROR_CODE_MESSAGES,
  NETWORK_ERROR_MESSAGE,
  DEFAULT_ERROR_MESSAGE,
  getErrorMessageForCode,
  isNetworkError,
} from '../../src/lib/errorMessages';

describe('errorMessages', () => {
  describe('ERROR_CODE_MESSAGES', () => {
    it('contains all required error codes from the design spec', () => {
      const requiredCodes = [
        'CSRF_VALIDATION_FAILED',
        'RATE_LIMIT_EXCEEDED',
        'INSUFFICIENT_PERMISSIONS',
        'AUTHENTICATION_REQUIRED',
        'INVALID_CREDENTIALS',
        'ACCOUNT_LOCKED',
        'VERSION_CONFLICT',
        'FILE_TYPE_NOT_ALLOWED',
        'FILE_TOO_LARGE',
        'FILE_CONTENT_MISMATCH',
      ];
      for (const code of requiredCodes) {
        expect(ERROR_CODE_MESSAGES[code]).toBeDefined();
        expect(typeof ERROR_CODE_MESSAGES[code]).toBe('string');
        expect(ERROR_CODE_MESSAGES[code].length).toBeGreaterThan(0);
      }
    });
  });

  describe('getErrorMessageForCode', () => {
    it('returns mapped message for known error codes', () => {
      expect(getErrorMessageForCode('RATE_LIMIT_EXCEEDED')).toBe(
        'Too many requests. Please wait a moment.'
      );
      expect(getErrorMessageForCode('INVALID_CREDENTIALS')).toBe(
        'Invalid email or password.'
      );
    });

    it('returns fallback message for unknown codes', () => {
      expect(getErrorMessageForCode('UNKNOWN_CODE', 'Custom fallback')).toBe(
        'Custom fallback'
      );
    });

    it('returns default message when no code and no fallback', () => {
      expect(getErrorMessageForCode(undefined)).toBe(DEFAULT_ERROR_MESSAGE);
    });

    it('returns default message for unknown code with no fallback', () => {
      expect(getErrorMessageForCode('NONEXISTENT')).toBe(DEFAULT_ERROR_MESSAGE);
    });
  });

  describe('isNetworkError', () => {
    it('detects TypeError with fetch message', () => {
      expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    });

    it('detects network keyword in error message', () => {
      expect(isNetworkError(new Error('network error occurred'))).toBe(true);
    });

    it('detects load failed errors', () => {
      expect(isNetworkError(new Error('Load failed'))).toBe(true);
    });

    it('returns false for non-network errors', () => {
      expect(isNetworkError(new Error('Validation failed'))).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isNetworkError('string error')).toBe(false);
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(42)).toBe(false);
    });
  });

  describe('NETWORK_ERROR_MESSAGE', () => {
    it('contains the required network error text from Req 16.3', () => {
      expect(NETWORK_ERROR_MESSAGE).toBe(
        'Connection error. Please check your internet and try again.'
      );
    });
  });
});
