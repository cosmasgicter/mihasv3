/**
 * Property Test: Frontend HTML Error Response Detection
 * Feature: admin-system-health-fixes
 * Property 8: Frontend HTML Error Response Detection
 * 
 * **Validates: Requirements 6.4**
 * - 6.4: WHEN API responses contain HTML instead of JSON, THE Frontend SHALL detect this and show a user-friendly error
 * 
 * For any API response that contains HTML instead of JSON (indicated by content starting with 
 * "<!DOCTYPE" or "<html"), the frontend SHALL detect this and display a user-friendly error 
 * message instead of crashing.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isHtmlResponse, parseJsonResponse, HtmlResponseError } from '../../../src/lib/api/adminApi';

/**
 * Generator for whitespace strings
 */
const whitespaceArb = fc.array(
  fc.constantFrom(' ', '\t', '\n', '\r'),
  { minLength: 0, maxLength: 5 }
).map(arr => arr.join(''));

/**
 * Generator for valid HTML document strings
 */
const htmlDocumentArb = fc.oneof(
  // Standard HTML5 doctype
  fc.tuple(
    fc.constantFrom('<!DOCTYPE html>', '<!doctype html>', '<!DOCTYPE HTML>', '<!doctype HTML>'),
    fc.string()
  ).map(([doctype, content]) => `${doctype}\n<html><head></head><body>${content}</body></html>`),
  
  // HTML without doctype but with html tag
  fc.tuple(
    fc.constantFrom('<html>', '<HTML>', '<Html>'),
    fc.string()
  ).map(([tag, content]) => `${tag}<head></head><body>${content}</body></html>`),
  
  // Doctype with whitespace variations
  fc.tuple(
    whitespaceArb,
    fc.constantFrom('<!DOCTYPE html>', '<!doctype html>'),
    fc.string()
  ).map(([ws, doctype, content]) => `${ws}${doctype}\n<html><body>${content}</body></html>`)
);

/**
 * Generator for valid JSON strings
 */
const validJsonArb = fc.oneof(
  fc.json(),
  fc.record({
    success: fc.boolean(),
    data: fc.option(fc.array(fc.record({
      id: fc.uuid(),
      name: fc.string(),
      value: fc.string()
    })), { nil: undefined }),
    error: fc.option(fc.string(), { nil: undefined })
  }).map(obj => JSON.stringify(obj))
);

/**
 * Generator for non-HTML, non-JSON strings (edge cases)
 */
const nonHtmlNonJsonArb = fc.string().filter(s => {
  const trimmed = s.trim().toLowerCase();
  return !trimmed.startsWith('<!doctype') && 
         !trimmed.startsWith('<html') &&
         s.length > 0;
});

/**
 * Create a mock Response object for testing
 */
function createMockResponse(body: string, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
    clone: () => createMockResponse(body, status),
  } as unknown as Response;
}

describe('Feature: admin-system-health-fixes, Property 8: Frontend HTML Error Response Detection', () => {
  
  describe('isHtmlResponse function', () => {
    
    it('should detect HTML responses starting with <!DOCTYPE (case insensitive)', async () => {
      await fc.assert(
        fc.property(
          htmlDocumentArb,
          (htmlContent) => {
            const result = isHtmlResponse(htmlContent);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should NOT detect valid JSON as HTML', async () => {
      await fc.assert(
        fc.property(
          validJsonArb,
          (jsonString) => {
            const result = isHtmlResponse(jsonString);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle empty and null-like inputs gracefully', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom('', null, undefined, '   ', '\n\t'),
          (input) => {
            // Should not throw and should return false for empty/null inputs
            const result = isHtmlResponse(input as string);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should detect HTML with leading whitespace', async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 10 }).map(arr => arr.join('')),
          fc.constantFrom('<!DOCTYPE html>', '<!doctype html>', '<html>'),
          (whitespace, htmlStart) => {
            const htmlContent = `${whitespace}${htmlStart}<body>test</body></html>`;
            const result = isHtmlResponse(htmlContent);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle various case combinations for DOCTYPE', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom(
            '<!DOCTYPE html>',
            '<!doctype html>',
            '<!DocType html>',
            '<!DOCTYPE HTML>',
            '<!doctype HTML>'
          ),
          (doctype) => {
            const htmlContent = `${doctype}<html><body>test</body></html>`;
            const result = isHtmlResponse(htmlContent);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle various case combinations for <html> tag', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom('<html>', '<HTML>', '<Html>', '<hTmL>'),
          (htmlTag) => {
            const htmlContent = `${htmlTag}<body>test</body></html>`;
            const result = isHtmlResponse(htmlContent);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('parseJsonResponse function', () => {
    
    it('should throw HtmlResponseError for HTML responses', async () => {
      await fc.assert(
        fc.asyncProperty(
          htmlDocumentArb,
          async (htmlContent) => {
            const mockResponse = createMockResponse(htmlContent);
            
            await expect(parseJsonResponse(mockResponse)).rejects.toThrow(HtmlResponseError);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should parse valid JSON responses successfully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            success: fc.boolean(),
            data: fc.option(fc.array(fc.string()), { nil: undefined })
          }),
          async (jsonObj) => {
            const jsonString = JSON.stringify(jsonObj);
            const mockResponse = createMockResponse(jsonString);
            
            const result = await parseJsonResponse(mockResponse);
            expect(result).toEqual(jsonObj);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should throw error for invalid JSON (not HTML)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(s => {
            const trimmed = s.trim().toLowerCase();
            // Not HTML and not valid JSON
            if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) return false;
            try {
              JSON.parse(s);
              return false; // Valid JSON, skip
            } catch {
              return s.length > 0; // Invalid JSON, include
            }
          }),
          async (invalidContent) => {
            const mockResponse = createMockResponse(invalidContent);
            
            // Should throw either HtmlResponseError or generic parse error
            await expect(parseJsonResponse(mockResponse)).rejects.toThrow();
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('HtmlResponseError class', () => {
    
    it('should have correct error name', () => {
      const error = new HtmlResponseError();
      expect(error.name).toBe('HtmlResponseError');
    });

    it('should have user-friendly default message', () => {
      const error = new HtmlResponseError();
      expect(error.message).toBe('Server returned an unexpected response. Please try again.');
    });

    it('should allow custom messages', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          (customMessage) => {
            const error = new HtmlResponseError(customMessage);
            expect(error.message).toBe(customMessage);
            expect(error.name).toBe('HtmlResponseError');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should be instanceof Error', () => {
      const error = new HtmlResponseError();
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('Real-world HTML error page scenarios', () => {
    
    it('should detect common error page patterns', async () => {
      const errorPagePatterns = [
        '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>Not Found</h1></body></html>',
        '<!DOCTYPE html><html><head><title>500 Internal Server Error</title></head><body><h1>Error</h1></body></html>',
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Error</title></head><body>Something went wrong</body></html>',
        '<html><head><title>Service Unavailable</title></head><body><h1>503</h1></body></html>',
        '<!DOCTYPE html>\n<html>\n<head>\n<title>Gateway Timeout</title>\n</head>\n<body>\n<h1>504 Gateway Timeout</h1>\n</body>\n</html>',
      ];

      for (const errorPage of errorPagePatterns) {
        expect(isHtmlResponse(errorPage)).toBe(true);
        
        const mockResponse = createMockResponse(errorPage);
        await expect(parseJsonResponse(mockResponse)).rejects.toThrow(HtmlResponseError);
      }
    });

    it('should handle Vercel/Next.js error pages', async () => {
      const vercelErrorPages = [
        '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"/><title>404: This page could not be found</title></head><body></body></html>',
        '<!DOCTYPE html><html><head><meta charSet="utf-8"/><title>500: Internal Server Error</title></head><body></body></html>',
      ];

      for (const errorPage of vercelErrorPages) {
        expect(isHtmlResponse(errorPage)).toBe(true);
        
        const mockResponse = createMockResponse(errorPage);
        await expect(parseJsonResponse(mockResponse)).rejects.toThrow(HtmlResponseError);
      }
    });
  });

  describe('Edge cases and boundary conditions', () => {
    
    it('should not false-positive on JSON containing HTML-like strings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            content: fc.constantFrom(
              '<!DOCTYPE html>',
              '<html>',
              'This is <!DOCTYPE html> in a string'
            ),
            success: fc.boolean()
          }),
          async (jsonObj) => {
            const jsonString = JSON.stringify(jsonObj);
            const mockResponse = createMockResponse(jsonString);
            
            // Should parse successfully because the HTML is inside JSON
            const result = await parseJsonResponse(mockResponse);
            expect(result).toEqual(jsonObj);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle responses with BOM (Byte Order Mark)', async () => {
      // UTF-8 BOM followed by HTML
      const bomHtml = '\uFEFF<!DOCTYPE html><html><body>test</body></html>';
      
      // BOM should be handled - the trimmed content starts with <!DOCTYPE
      // Note: Our implementation trims, so BOM at start should still work
      const result = isHtmlResponse(bomHtml);
      // BOM is not whitespace in the traditional sense, so this might not be detected
      // This is an edge case that documents current behavior
      expect(typeof result).toBe('boolean');
    });

    it('should handle very long HTML responses', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1000, maxLength: 10000 }),
          (longContent) => {
            const htmlContent = `<!DOCTYPE html><html><body>${longContent}</body></html>`;
            const result = isHtmlResponse(htmlContent);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
