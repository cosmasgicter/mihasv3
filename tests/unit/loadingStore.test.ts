/**
 * Loading Store Unit Tests
 * 
 * Tests for the global loading state store.
 * Validates: Requirements 3.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useLoadingStore } from '@/stores/loadingStore';

describe('loadingStore', () => {
  // Reset store state before each test
  beforeEach(() => {
    useLoadingStore.getState().clearAll();
  });

  describe('initial state', () => {
    it('should start with isLoading false', () => {
      const state = useLoadingStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('should start with empty loadingKeys', () => {
      const state = useLoadingStore.getState();
      expect(state.loadingKeys.size).toBe(0);
    });
  });

  describe('startLoading', () => {
    it('should add key to loadingKeys', () => {
      const { startLoading, loadingKeys } = useLoadingStore.getState();
      startLoading('test-key');
      
      const newState = useLoadingStore.getState();
      expect(newState.loadingKeys.has('test-key')).toBe(true);
    });

    it('should set isLoading to true', () => {
      const { startLoading } = useLoadingStore.getState();
      startLoading('test-key');
      
      const newState = useLoadingStore.getState();
      expect(newState.isLoading).toBe(true);
    });

    it('should handle multiple keys', () => {
      const { startLoading } = useLoadingStore.getState();
      startLoading('key-1');
      startLoading('key-2');
      startLoading('key-3');
      
      const newState = useLoadingStore.getState();
      expect(newState.loadingKeys.size).toBe(3);
      expect(newState.loadingKeys.has('key-1')).toBe(true);
      expect(newState.loadingKeys.has('key-2')).toBe(true);
      expect(newState.loadingKeys.has('key-3')).toBe(true);
      expect(newState.isLoading).toBe(true);
    });

    it('should be idempotent - adding same key twice', () => {
      const { startLoading } = useLoadingStore.getState();
      startLoading('test-key');
      startLoading('test-key');
      
      const newState = useLoadingStore.getState();
      expect(newState.loadingKeys.size).toBe(1);
    });
  });

  describe('stopLoading', () => {
    it('should remove key from loadingKeys', () => {
      const { startLoading, stopLoading } = useLoadingStore.getState();
      startLoading('test-key');
      stopLoading('test-key');
      
      const newState = useLoadingStore.getState();
      expect(newState.loadingKeys.has('test-key')).toBe(false);
    });

    it('should set isLoading to false when last key removed', () => {
      const { startLoading, stopLoading } = useLoadingStore.getState();
      startLoading('test-key');
      stopLoading('test-key');
      
      const newState = useLoadingStore.getState();
      expect(newState.isLoading).toBe(false);
    });

    it('should keep isLoading true when other keys remain', () => {
      const { startLoading, stopLoading } = useLoadingStore.getState();
      startLoading('key-1');
      startLoading('key-2');
      stopLoading('key-1');
      
      const newState = useLoadingStore.getState();
      expect(newState.isLoading).toBe(true);
      expect(newState.loadingKeys.size).toBe(1);
      expect(newState.loadingKeys.has('key-2')).toBe(true);
    });

    it('should be safe to call with non-existent key', () => {
      const { stopLoading } = useLoadingStore.getState();
      // Should not throw
      expect(() => stopLoading('non-existent')).not.toThrow();
      
      const newState = useLoadingStore.getState();
      expect(newState.isLoading).toBe(false);
    });
  });

  describe('isKeyLoading', () => {
    it('should return true for active key', () => {
      const { startLoading, isKeyLoading } = useLoadingStore.getState();
      startLoading('test-key');
      
      expect(useLoadingStore.getState().isKeyLoading('test-key')).toBe(true);
    });

    it('should return false for inactive key', () => {
      const { isKeyLoading } = useLoadingStore.getState();
      expect(isKeyLoading('non-existent')).toBe(false);
    });

    it('should return false after key is stopped', () => {
      const { startLoading, stopLoading } = useLoadingStore.getState();
      startLoading('test-key');
      stopLoading('test-key');
      
      expect(useLoadingStore.getState().isKeyLoading('test-key')).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('should remove all loading keys', () => {
      const { startLoading, clearAll } = useLoadingStore.getState();
      startLoading('key-1');
      startLoading('key-2');
      startLoading('key-3');
      clearAll();
      
      const newState = useLoadingStore.getState();
      expect(newState.loadingKeys.size).toBe(0);
    });

    it('should set isLoading to false', () => {
      const { startLoading, clearAll } = useLoadingStore.getState();
      startLoading('key-1');
      startLoading('key-2');
      clearAll();
      
      const newState = useLoadingStore.getState();
      expect(newState.isLoading).toBe(false);
    });
  });

  describe('getActiveKeys', () => {
    it('should return empty array when no keys', () => {
      const { getActiveKeys } = useLoadingStore.getState();
      expect(getActiveKeys()).toEqual([]);
    });

    it('should return all active keys', () => {
      const { startLoading, getActiveKeys } = useLoadingStore.getState();
      startLoading('key-1');
      startLoading('key-2');
      
      const keys = useLoadingStore.getState().getActiveKeys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('key-1');
      expect(keys).toContain('key-2');
    });
  });

  describe('concurrent operations', () => {
    it('should handle rapid start/stop cycles', () => {
      const { startLoading, stopLoading } = useLoadingStore.getState();
      
      // Simulate rapid operations
      for (let i = 0; i < 100; i++) {
        startLoading(`key-${i}`);
      }
      
      let state = useLoadingStore.getState();
      expect(state.loadingKeys.size).toBe(100);
      expect(state.isLoading).toBe(true);
      
      // Stop all
      for (let i = 0; i < 100; i++) {
        stopLoading(`key-${i}`);
      }
      
      state = useLoadingStore.getState();
      expect(state.loadingKeys.size).toBe(0);
      expect(state.isLoading).toBe(false);
    });

    it('should handle interleaved start/stop operations', () => {
      const { startLoading, stopLoading } = useLoadingStore.getState();
      
      startLoading('a');
      startLoading('b');
      stopLoading('a');
      startLoading('c');
      stopLoading('b');
      
      const state = useLoadingStore.getState();
      expect(state.loadingKeys.size).toBe(1);
      expect(state.loadingKeys.has('c')).toBe(true);
      expect(state.isLoading).toBe(true);
    });
  });
});
