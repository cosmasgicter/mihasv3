# Design Document: Bun/Vercel Runtime Forensics

## Overview

This design document outlines the forensic investigation findings and fixes for the MIHAS Application System's post-migration failures. The system underwent multiple simultaneous migrations (Cloudflare → Vercel, Node.js → Bun, API consolidation, Supabase Realtime → Polling) and is now experiencing critical production failures.

### Root Cause Summary

| Failure | Root Cause | Impact |
|---------|------------|--------|
| 500 on `/api/auth-roles` | JWT decoding with `Buffer.from()` may fail in Bun | Auth completely broken |
| 500 on `/api/sessions?action=track` | Same JWT decoding issue | Session tracking fails |
| Frontend infinite loops | No retry limits on failed auth requests | Browser freezes |
| MIME type errors | SPA fallback catches failed API routes | JS modules fail to load |
| Signup failures | Frontend calls `/auth/signup` instead of `/api/auth?action=signup` | Registration broken |
| Module conflicts | `api/tsconfig.json` uses CommonJS, `package.json` uses ESM | Potential runtime errors |

## Architecture

### Current Architecture (Broken)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  useSessionListener.ts                                           │
│  ├── signUp() → fetch(`${apiBaseUrl}/auth/signup`)  ❌ WRONG URL │
│  └── signOut() → fetch('/api/auth?action=session')  ✓ Correct   │
│                                                                  │
│  authApi.ts                                                      │
│  ├── fetchUserRole() → fetch('/api/auth-roles')     ✓ Correct   │
│  └── syncUserRole() → fetch('/api/auth-sync-roles') ❌ NO ENDPOINT│
│                                                                  │
│  useOptimizedAuthState.ts                                        │
│  └── useSessionQuery() → No retry limits            ❌ LOOPS     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel Serverless Functions                   │
├─────────────────────────────────────────────────────────────────┤
│  api/auth.ts                                                     │
│  └── ?action=signup|login|signin|register|session               │
│                                                                  │
│  api/auth-roles.ts                                               │
│  └── getUserFromRequest() → Buffer.from(base64)    ❌ BUN ISSUE  │
│                                                                  │
│  api/sessions.ts                                                 │
│  └── getUserFromRequest() → Buffer.from(base64)    ❌ BUN ISSUE  │
│                                                                  │
│  api/_lib/supabaseClient.ts                                      │
│  └── JWT decode: Buffer.from(parts[1], 'base64')   ❌ BUN ISSUE  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    api/tsconfig.json                             │
├─────────────────────────────────────────────────────────────────┤
│  "module": "CommonJS"  ❌ CONFLICTS WITH package.json ESM        │
│  "moduleResolution": "Node"                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Target Architecture (Fixed)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  useSessionListener.ts                                           │
│  └── signUp() → fetch('/api/auth?action=signup')    ✓ FIXED     │
│                                                                  │
│  authApi.ts                                                      │
│  └── syncUserRole() → REMOVED (unused)              ✓ FIXED     │
│                                                                  │
│  useOptimizedAuthState.ts                                        │
│  └── useSessionQuery() → retry: 1, with error handling ✓ FIXED  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel Serverless Functions                   │
├─────────────────────────────────────────────────────────────────┤
│  api/_lib/supabaseClient.ts                                      │
│  └── JWT decode: atob() or TextDecoder            ✓ BUN-SAFE    │
│                                                                  │
│  All endpoints return JSON with Content-Type header ✓ FIXED     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    api/tsconfig.json                             │
├─────────────────────────────────────────────────────────────────┤
│  "module": "ESNext"  ✓ MATCHES package.json                      │
│  "moduleResolution": "Bundler"                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Component 1: Bun-Safe JWT Decoder

**Location:** `api/_lib/supabaseClient.ts`

**Problem:** The current implementation uses `Buffer.from(base64, 'base64')` which may behave differently in Bun vs Node.js, particularly with URL-safe Base64 encoding.

**Current Implementation (Problematic):**
```typescript
// Current - may fail in Bun
const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
const decoded = Buffer.from(base64, 'base64').toString('utf-8');
payload = JSON.parse(decoded);
```

**Fixed Implementation (Bun-Safe):**
```typescript
// Fixed - works in both Node.js and Bun
function decodeBase64Url(base64Url: string): string {
  // Convert URL-safe Base64 to standard Base64
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  
  // Use atob() which is available in both Bun and browsers
  // Then decode UTF-8 using TextDecoder
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// Usage in getUserFromRequest
const payload = JSON.parse(decodeBase64Url(parts[1]));
```

**Interface:**
```typescript
interface JWTPayload {
  sub: string;           // User ID
  email?: string;        // User email
  exp?: number;          // Expiration timestamp
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

function decodeBase64Url(base64Url: string): string;
function decodeJWTPayload(token: string): JWTPayload | null;
```

### Component 2: Frontend API URL Alignment

**Location:** `src/hooks/auth/useSessionListener.ts`

**Problem:** The `signUp` function calls `${apiBaseUrl}/auth/signup` but the API expects `/api/auth?action=signup`.

**Current Implementation (Broken):**
```typescript
const response = await fetch(`${apiBaseUrl}/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
```

**Fixed Implementation:**
```typescript
const response = await fetch(`${apiBaseUrl}/api/auth?action=signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
```

### Component 3: Auth API Sync Roles Removal

**Location:** `src/lib/api/authApi.ts`

**Problem:** The `syncUserRole` function calls `/api/auth-sync-roles` which doesn't exist.

**Fix:** Remove the unused function or implement the endpoint if needed.

**Analysis:** The function is only imported in `src/utils/roleSync.ts` which wraps it. Need to check if this is actually used anywhere.

### Component 4: React Query Retry Configuration

**Location:** `src/hooks/auth/useOptimizedAuthState.ts`

**Problem:** The session query has `retry: 1` but no error boundary to stop infinite loops when auth fails.

**Current Implementation:**
```typescript
return useQuery({
  queryKey: ['auth', 'session'],
  queryFn: async () => { /* ... */ },
  staleTime: CACHE_CONFIG.auth.staleTime,
  gcTime: CACHE_CONFIG.auth.gcTime,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  retry: 1
})
```

**Fixed Implementation:**
```typescript
return useQuery({
  queryKey: ['auth', 'session'],
  queryFn: async () => { /* ... */ },
  staleTime: CACHE_CONFIG.auth.staleTime,
  gcTime: CACHE_CONFIG.auth.gcTime,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  retry: (failureCount, error) => {
    // Don't retry on auth errors (401, 403)
    if (error instanceof Error && 
        (error.message.includes('401') || 
         error.message.includes('403') ||
         error.message.includes('unauthorized'))) {
      return false;
    }
    return failureCount < 1;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000)
})
```

### Component 5: API tsconfig.json Module Fix

**Location:** `api/tsconfig.json`

**Problem:** Uses `"module": "CommonJS"` but `package.json` has `"type": "module"`.

**Current Configuration (Problematic):**
```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node"
  }
}
```

**Fixed Configuration:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": false,
    "noImplicitAny": false,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  }
}
```

### Component 6: Error Response JSON Guarantee

**Location:** `api/_lib/errorHandler.ts`

**Problem:** Need to ensure all error responses are JSON, never HTML.

**Enhancement:**
```typescript
export function sendError(
  res: VercelResponse,
  message: string,
  status: number = HttpStatus.BAD_REQUEST,
  code: string = ErrorCode.VALIDATION_ERROR
): VercelResponse {
  // Ensure Content-Type is always JSON
  res.setHeader('Content-Type', 'application/json');
  
  const response: ErrorResponse = {
    success: false,
    error: sanitizeErrorMessage(message),
    code,
  };

  return res.status(status).json(response);
}
```

## Data Models

### JWT Token Structure

```typescript
interface JWTToken {
  header: {
    alg: string;  // Algorithm (e.g., "HS256")
    typ: string;  // Type (e.g., "JWT")
  };
  payload: {
    sub: string;           // Subject (user ID)
    email?: string;        // User email
    exp: number;           // Expiration time (Unix timestamp)
    iat: number;           // Issued at time
    aud?: string;          // Audience
    role?: string;         // User role
    user_metadata?: {
      full_name?: string;
      phone?: string;
      [key: string]: unknown;
    };
    app_metadata?: {
      role?: string;
      roles?: string[];
      [key: string]: unknown;
    };
  };
  signature: string;
}
```

### API Response Format

```typescript
// Success response
interface SuccessResponse<T> {
  success: true;
  data: T;
}

// Error response
interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// Union type for all API responses
type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
```

### Auth Roles Response

```typescript
interface AuthRolesResponse {
  user_id: string;
  email: string;
  role: string;
  permissions: string[];
  is_active: boolean;
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: JWT Base64 URL-Safe Decoding Round-Trip

*For any* valid JWT payload object, encoding it to Base64 URL-safe format and then decoding it using the Bun-safe decoder SHALL produce an equivalent object.

**Validates: Requirements 3.1, 3.4**

**Test Strategy:**
- Generate random JWT payload objects with various field types
- Encode using standard JWT Base64 URL-safe encoding
- Decode using the new `decodeBase64Url()` function
- Verify the decoded payload matches the original

### Property 2: API Responses Are Always JSON

*For any* API endpoint request (success or error), the response SHALL have `Content-Type: application/json` header and the body SHALL be valid JSON.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

**Test Strategy:**
- Generate random API requests to all endpoints
- Include both valid and invalid requests
- Verify all responses have JSON Content-Type
- Verify all response bodies parse as valid JSON

### Property 3: Error Responses Are Sanitized

*For any* error message containing PII patterns (emails, phone numbers, UUIDs, JWT tokens), the sanitized error response SHALL NOT contain those patterns.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 1.5**

**Test Strategy:**
- Generate random error messages with embedded PII patterns
- Pass through the error sanitization function
- Verify output contains placeholder text instead of PII
- Verify no stack traces in production responses

### Property 4: Polling Configuration Prevents Infinite Loops

*For any* React Query configuration with polling enabled, the staleTime SHALL be less than the refetchInterval, and retry count SHALL be bounded.

**Validates: Requirements 5.2, 5.3, 5.4**

**Test Strategy:**
- Generate random polling configurations
- Verify staleTime < refetchInterval invariant
- Verify retry count has a maximum bound
- Verify 401/403 errors stop retries immediately

### Property 5: Authentication Endpoints Return Correct Status Codes

*For any* authentication request, the response status code SHALL be 200 for success, 401 for invalid credentials, 403 for forbidden access, or 400 for validation errors.

**Validates: Requirements 9.2, 9.4, 9.5**

**Test Strategy:**
- Generate random authentication scenarios
- Verify success returns 200 with session data
- Verify invalid credentials return 401
- Verify forbidden access returns 403
- Verify validation errors return 400

### Property 6: No Sensitive Data in Error Responses

*For any* database or system error, the error response SHALL NOT contain connection strings, credentials, internal paths, or user PII.

**Validates: Requirements 10.4, 7.2, 11.1**

**Test Strategy:**
- Generate random error scenarios with sensitive data
- Verify error responses are sanitized
- Verify no connection strings in output
- Verify no file paths in output

## Error Handling

### JWT Decoding Errors

| Error Condition | Response | Status Code |
|-----------------|----------|-------------|
| Missing Authorization header | `{ success: false, error: "No authorization header provided" }` | 401 |
| Invalid token format (not 3 parts) | `{ success: false, error: "Invalid token format" }` | 401 |
| Malformed Base64 | `{ success: false, error: "Invalid token format" }` | 401 |
| Expired token | `{ success: false, error: "Token expired" }` | 401 |
| User not found | `{ success: false, error: "User not found" }` | 401 |

### API Routing Errors

| Error Condition | Response | Status Code |
|-----------------|----------|-------------|
| Unknown endpoint | `{ success: false, error: "API endpoint not found", code: "NOT_FOUND" }` | 404 |
| Invalid action parameter | `{ success: false, error: "Invalid action" }` | 400 |
| Method not allowed | `{ success: false, error: "Method not allowed" }` | 405 |

### Database Errors

| Error Condition | Response | Status Code |
|-----------------|----------|-------------|
| Connection failure | `{ success: false, error: "Service temporarily unavailable" }` | 503 |
| Query timeout | `{ success: false, error: "Service temporarily unavailable" }` | 503 |
| Constraint violation | `{ success: false, error: "Validation error" }` | 400 |

## Testing Strategy

### Unit Tests

Unit tests will cover specific examples and edge cases:

1. **JWT Decoding Edge Cases**
   - Empty string input
   - Single-part token (no dots)
   - Two-part token (missing signature)
   - Invalid Base64 characters
   - Unicode in payload

2. **URL Alignment Tests**
   - Verify `/api/auth?action=signup` is called correctly
   - Verify removed endpoints return 404

3. **Error Sanitization Tests**
   - Email patterns removed
   - Phone number patterns removed
   - UUID patterns replaced
   - JWT tokens redacted

### Property-Based Tests

Property tests will use fast-check to verify universal properties:

1. **JWT Round-Trip Property** (100+ iterations)
   - Generate random payloads
   - Encode → Decode → Compare

2. **JSON Response Property** (100+ iterations)
   - Generate random requests
   - Verify JSON Content-Type and valid body

3. **Error Sanitization Property** (100+ iterations)
   - Generate random PII-containing messages
   - Verify sanitization removes all patterns

4. **Polling Configuration Property** (100+ iterations)
   - Generate random configs
   - Verify invariants hold

### Integration Tests

Integration tests will verify end-to-end flows:

1. **Signup Flow**
   - Call `/api/auth?action=signup`
   - Verify account creation
   - Verify profile creation

2. **Login Flow**
   - Call `/api/auth?action=login`
   - Verify session returned
   - Verify profile returned

3. **Auth Roles Flow**
   - Authenticate user
   - Call `/api/auth-roles`
   - Verify roles returned

4. **Session Tracking Flow**
   - Authenticate user
   - Call `/api/sessions?action=track`
   - Verify session tracked

