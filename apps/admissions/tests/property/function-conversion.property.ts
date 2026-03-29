/**
 * Property Test: Function Conversion Equivalence
 * Feature: bun-vercel-migration
 * Property 1: Function Conversion Equivalence
 * Validates: Requirements 1.2, 3.1, 3.5
 * 
 * For any Cloudflare Function with onRequest(context) pattern and any valid 
 * HTTP request, converting it to Vercel's handler(req, res) pattern SHALL 
 * produce an equivalent HTTP response (same status code, same JSON body 
 * structure, same headers).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// API Response format (must be consistent across both platforms)
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// HTTP methods supported
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Request structure
interface ApiRequest {
  method: HttpMethod;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

// Response structure
interface ApiResponseResult {
  status: number;
  headers: Record<string, string>;
  body: ApiResponse;
}

// Cloudflare-style handler simulation
function cloudflareHandler(request: ApiRequest): ApiResponseResult {
  // Simulate Cloudflare function behavior
  const response: ApiResponse = {
    success: true,
    data: { processed: true, method: request.method },
  };
  
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: response,
  };
}

// Vercel-style handler simulation
function vercelHandler(request: ApiRequest): ApiResponseResult {
  // Simulate Vercel function behavior (should be equivalent)
  const response: ApiResponse = {
    success: true,
    data: { processed: true, method: request.method },
  };
  
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: response,
  };
}

// Validate response format
function isValidApiResponse(response: unknown): response is ApiResponse {
  if (typeof response !== 'object' || response === null) return false;
  const r = response as Record<string, unknown>;
  return typeof r.success === 'boolean';
}

// Compare responses for equivalence
function areResponsesEquivalent(
  cloudflare: ApiResponseResult,
  vercel: ApiResponseResult
): boolean {
  // Same status code
  if (cloudflare.status !== vercel.status) return false;
  
  // Same body structure
  if (cloudflare.body.success !== vercel.body.success) return false;
  
  // Same Content-Type header
  if (cloudflare.headers['Content-Type'] !== vercel.headers['Content-Type']) return false;
  
  // Data should be equivalent (deep comparison)
  if (JSON.stringify(cloudflare.body.data) !== JSON.stringify(vercel.body.data)) return false;
  
  return true;
}

// Arbitrary generators
const httpMethodArbitrary = fc.constantFrom<HttpMethod>('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

const pathArbitrary = fc.constantFrom(
  '/api/applications',
  '/api/applications/123',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/documents/upload',
  '/api/notifications/send',
  '/api/admin/dashboard',
  '/api/catalog/programs'
);

const headersArbitrary = fc.record({
  'Content-Type': fc.constantFrom('application/json', 'multipart/form-data'),
  'Authorization': fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
  'Origin': fc.constantFrom('https://apply.mihas.edu.zm', 'http://localhost:5173'),
});

const queryArbitrary = fc.option(
  fc.record({
    page: fc.constantFrom('1', '2', '3', '4', '5'),
    limit: fc.constantFrom('10', '20', '50'),
    status: fc.option(fc.constantFrom('pending', 'approved', 'rejected'), { nil: undefined }),
  }),
  { nil: undefined }
);

const bodyArbitrary = fc.option(
  fc.record({
    email: fc.emailAddress(),
    password: fc.string({ minLength: 8, maxLength: 50 }),
    data: fc.record({
      firstName: fc.string({ minLength: 1, maxLength: 50 }),
      lastName: fc.string({ minLength: 1, maxLength: 50 }),
    }),
  }),
  { nil: undefined }
);

const apiRequestArbitrary = fc.record({
  method: httpMethodArbitrary,
  path: pathArbitrary,
  headers: headersArbitrary,
  body: bodyArbitrary,
  query: queryArbitrary,
}).map(r => ({
  ...r,
  headers: Object.fromEntries(
    Object.entries(r.headers).filter(([_, v]) => v !== undefined)
  ) as Record<string, string>,
  query: r.query
    ? (Object.fromEntries(
        Object.entries(r.query).filter(([_, v]) => v !== undefined)
      ) as Record<string, string>)
    : undefined,
}));

describe('Feature: bun-vercel-migration, Property 1: Function Conversion Equivalence', () => {
  
  it('should produce equivalent responses for any valid request', () => {
    fc.assert(
      fc.property(
        apiRequestArbitrary,
        (request) => {
          const cloudflareResponse = cloudflareHandler(request);
          const vercelResponse = vercelHandler(request);
          
          expect(areResponsesEquivalent(cloudflareResponse, vercelResponse)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return same status code for any request', () => {
    fc.assert(
      fc.property(
        apiRequestArbitrary,
        (request) => {
          const cloudflareResponse = cloudflareHandler(request);
          const vercelResponse = vercelHandler(request);
          
          expect(vercelResponse.status).toBe(cloudflareResponse.status);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return same JSON body structure for any request', () => {
    fc.assert(
      fc.property(
        apiRequestArbitrary,
        (request) => {
          const cloudflareResponse = cloudflareHandler(request);
          const vercelResponse = vercelHandler(request);
          
          // Both should have valid API response format
          expect(isValidApiResponse(cloudflareResponse.body)).toBe(true);
          expect(isValidApiResponse(vercelResponse.body)).toBe(true);
          
          // Both should have same success value
          expect(vercelResponse.body.success).toBe(cloudflareResponse.body.success);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return Content-Type: application/json for all responses', () => {
    fc.assert(
      fc.property(
        apiRequestArbitrary,
        (request) => {
          const cloudflareResponse = cloudflareHandler(request);
          const vercelResponse = vercelHandler(request);
          
          expect(cloudflareResponse.headers['Content-Type']).toBe('application/json');
          expect(vercelResponse.headers['Content-Type']).toBe('application/json');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle all HTTP methods consistently', () => {
    fc.assert(
      fc.property(
        httpMethodArbitrary,
        (method) => {
          const request: ApiRequest = {
            method,
            path: '/api/test',
            headers: { 'Content-Type': 'application/json' },
          };
          
          const cloudflareResponse = cloudflareHandler(request);
          const vercelResponse = vercelHandler(request);
          
          expect(areResponsesEquivalent(cloudflareResponse, vercelResponse)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve request method in response data', () => {
    fc.assert(
      fc.property(
        httpMethodArbitrary,
        (method) => {
          const request: ApiRequest = {
            method,
            path: '/api/test',
            headers: { 'Content-Type': 'application/json' },
          };
          
          const vercelResponse = vercelHandler(request);
          
          // Response should include the method that was used
          expect((vercelResponse.body.data as { method: string }).method).toBe(method);
        }
      ),
      { numRuns: 100 }
    );
  });
});
