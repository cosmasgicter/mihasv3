/**
 * Property 6: Sanitization Neutralizes XSS and Protects PII
 * Feature: duplicate-deprecated-consolidation, Property 6: Sanitization Neutralizes XSS and Protects PII
 *
 * For any input string containing HTML tags, script elements, or event handler attributes,
 * sanitizeHtml and sanitizeForDisplay produce no executable HTML.
 * For any input to sanitizeForLog, output is ≤200 chars with no newline/tab characters.
 *
 * Validates: Requirements 3.2, 3.6
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Import from canonical module
import { sanitizeHtml, sanitizeForDisplay, sanitizeForLog } from '@/lib/sanitize';

/** Generate strings with XSS vectors */
const xssStringArb = fc.oneof(
  fc.constant('<script>alert("xss")</script>'),
  fc.constant('<img src=x onerror=alert(1)>'),
  fc.constant('<div onmouseover="steal()">hover</div>'),
  fc.constant('<a href="javascript:alert(1)">click</a>'),
  fc.constant('<svg onload=alert(1)>'),
  fc.constant('<iframe src="evil.com"></iframe>'),
  fc.constant('<body onload=alert(1)>'),
  fc.stringOf(
    fc.oneof(
      fc.constant('<script>'),
      fc.constant('</script>'),
      fc.constant('onerror='),
      fc.constant('onload='),
      fc.constant('onclick='),
      fc.constant('javascript:'),
      fc.ascii(),
    ),
    { minLength: 1, maxLength: 200 }
  ),
);

/** Generate arbitrary strings for log sanitization */
const logInputArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 500 }),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.constant(new Error('test error with\nnewlines\tand\ttabs')),
);

describe('Property 6: Sanitization Neutralizes XSS and Protects PII', () => {
  it('sanitizeForDisplay produces no executable HTML tags', () => {
    fc.assert(
      fc.property(xssStringArb, (input) => {
        const result = sanitizeForDisplay(input);
        // No unescaped < or > should remain
        expect(result).not.toMatch(/<[a-zA-Z]/);
        expect(result).not.toMatch(/javascript:/i);
      }),
      { numRuns: 100 },
    );
  });

  it('sanitizeHtml removes script tags and event handlers', () => {
    fc.assert(
      fc.property(xssStringArb, (input) => {
        const result = sanitizeHtml(input);
        // No script tags
        expect(result.toLowerCase()).not.toMatch(/<script/);
        // No event handler attributes
        expect(result).not.toMatch(/on\w+\s*=/i);
        // No javascript: URLs
        expect(result).not.toMatch(/javascript:/i);
      }),
      { numRuns: 100 },
    );
  });

  it('sanitizeForLog output is ≤200 chars with no newline/tab characters', () => {
    fc.assert(
      fc.property(logInputArb, (input) => {
        const result = sanitizeForLog(input);
        expect(typeof result).toBe('string');
        expect(result.length).toBeLessThanOrEqual(200);
        expect(result).not.toMatch(/[\r\n\t]/);
      }),
      { numRuns: 100 },
    );
  });
});
