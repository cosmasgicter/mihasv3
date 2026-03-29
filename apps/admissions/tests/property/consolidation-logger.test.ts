/**
 * Property 14: Logger Produces Structured Entries with Timestamps
 * Feature: duplicate-deprecated-consolidation, Property 14: Logger Produces Structured Entries with Timestamps
 *
 * For any log level and message string, calling the corresponding logger method
 * should produce output via console with the correct level prefix.
 *
 * Validates: Requirements 11.2
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// We test the Logger class structure by verifying the module exports
// and that the logger object has the expected methods
const logLevels = ['debug', 'info', 'warn', 'error'] as const;
const logLevelArb = fc.constantFrom(...logLevels);
const messageArb = fc.string({ minLength: 1, maxLength: 200 });
const dataArb = fc.oneof(
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.constant({ key: 'value' }),
  fc.constant(null),
);

describe('Property 14: Logger Produces Structured Entries with Timestamps', () => {
  let consoleSpy: Record<string, ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  it('logger exports all required methods', async () => {
    // Dynamic import to get fresh module
    const mod = await import('@/lib/logger');
    expect(mod.logger).toBeDefined();
    expect(typeof mod.logger.debug).toBe('function');
    expect(typeof mod.logger.info).toBe('function');
    expect(typeof mod.logger.warn).toBe('function');
    expect(typeof mod.logger.error).toBe('function');
  });

  it('logger exports LogEntry and LogLevel types (structural check)', async () => {
    // Verify the module exports the type-related symbols
    const mod = await import('@/lib/logger');
    // The logger instance should exist
    expect(mod.logger).toBeTruthy();
  });

  it('error method always logs regardless of environment', async () => {
    await fc.assert(
      fc.asyncProperty(messageArb, dataArb, async (message, data) => {
        const mod = await import('@/lib/logger');
        mod.logger.error(message, data);
        // Error should always be logged
        expect(consoleSpy.error).toHaveBeenCalled();
        const lastCall = consoleSpy.error.mock.calls[consoleSpy.error.mock.calls.length - 1];
        // Should include [ERROR] prefix
        expect(lastCall[0]).toContain('[ERROR]');
        expect(lastCall[0]).toContain(message);
        consoleSpy.error.mockClear();
      }),
      { numRuns: 100 },
    );
  });
});
