# Design Document: Bun/Vercel Migration

## Overview

This design document outlines the technical approach for migrating the MIHAS Application System from Cloudflare Pages to Vercel Free Plan with a complete Bun runtime migration. The migration follows a phased approach: infrastructure setup, function conversion, feature removal, and validation.

The key architectural changes are:
1. **Hosting**: Cloudflare Pages → Vercel (static + serverless)
2. **Runtime**: Node.js → Bun (development and production)
3. **API Layer**: Cloudflare Functions → Vercel Serverless Functions
4. **Real-time**: Supabase Realtime → React Query polling
5. **Simplification**: Remove AI (except OCR), analytics, complex workflows

## Architecture

### Current Architecture (Cloudflare)

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                          │
├─────────────────────────────────────────────────────────────┤
│  React Frontend (Vite)    │    Cloudflare Functions         │
│  - Static assets          │    - 47 API endpoints           │
│  - PWA/Service Worker     │    - AI bindings                │
│  - Supabase client        │    - Analytics                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase                                │
│  - Auth  │  - Database (86 tables)  │  - Storage  │ Realtime│
└─────────────────────────────────────────────────────────────┘
```

### Target Architecture (Vercel + Bun)

```
┌─────────────────────────────────────────────────────────────┐
│                       Vercel                                 │
├─────────────────────────────────────────────────────────────┤
│  React Frontend (Vite+Bun) │  Vercel Serverless Functions   │
│  - Static assets           │  - ~30 API endpoints (reduced) │
│  - PWA/Service Worker      │  - Bun runtime                 │
│  - Supabase client         │  - No AI bindings              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase                                │
│  - Auth  │  - Database (86 tables)  │  - Storage  │ (no RT) │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure Changes

```
Current (Cloudflare):              Target (Vercel):
├── functions/                     ├── api/
│   ├── _lib/                      │   ├── _lib/
│   ├── _middleware.js             │   ├── middleware.ts
│   ├── admin/                     │   ├── admin/
│   ├── ai/          ← REMOVE      │   ├── applications/
│   ├── analytics/   ← REMOVE      │   ├── auth/
│   ├── applications/              │   ├── documents/
│   └── ...                        │   ├── notifications/
├── wrangler.toml    ← REMOVE      │   └── payments/
├── package.json                   ├── vercel.json      ← NEW
└── vite.config.*.ts               ├── package.json     ← UPDATED
                                   ├── bunfig.toml      ← NEW
                                   └── vite.config.ts   ← SIMPLIFIED
```

## Components and Interfaces

### 1. Vercel Configuration

**vercel.json** - Deployment configuration:

```json
{
  "buildCommand": "bun run build",
  "installCommand": "bun install",
  "framework": "vite",
  "functions": {
    "api/**/*.ts": {
      "runtime": "nodejs20.x",
      "maxDuration": 10
    }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

### 2. Bun Configuration

**bunfig.toml** - Bun runtime configuration:

```toml
[install]
# Use exact versions for reproducibility
exact = true

[install.lockfile]
# Generate lockfile
save = true

[run]
# Silent mode for cleaner output
silent = false
```

### 3. Vercel Function Interface

**Current Cloudflare Pattern:**
```typescript
// functions/applications/[id].js
export async function onRequest(context) {
  const { request, env, params } = context;
  const id = params.id;
  // ... handler logic
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**Target Vercel Pattern:**
```typescript
// api/applications/[id].ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const { id } = req.query;
  // ... handler logic
  return res.status(200).json(data);
}
```

### 4. Middleware Conversion

**Current Cloudflare Middleware:**
```javascript
// functions/_middleware.js
export async function onRequest(context) {
  const { request, next } = context;
  // Rate limiting, security headers
  const response = await next();
  return addSecurityHeaders(response);
}
```

**Target Vercel Middleware:**
```typescript
// middleware.ts (root level)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
```

### 5. CORS Handler

**api/_lib/cors.ts:**
```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = [
  'https://mihas.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

export function getCorsHeaders(origin: string | undefined) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) 
    ? origin 
    : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  };
}

export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  const headers = getCorsHeaders(origin);
  
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
```

### 6. Supabase Client (Unchanged)

**api/_lib/supabaseClient.ts:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
```

### 7. Polling-Based Real-time Updates

**Replacing Supabase Realtime with React Query polling:**

```typescript
// src/hooks/useAdminDashboardPolling.ts
import { useQuery } from '@tanstack/react-query';

export function useAdminDashboardPolling() {
  return useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: async () => {
      const response = await fetch('/api/admin/dashboard');
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    },
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: false,
    staleTime: 25000,
  });
}
```

### 8. Package.json Updates

```json
{
  "name": "mihas-application-system-v2",
  "type": "module",
  "scripts": {
    "dev": "bunx --bun vite",
    "build": "bun run type-check && bunx --bun vite build",
    "build:prod": "bun run build",
    "preview": "bunx --bun vite preview",
    "type-check": "tsc --noEmit",
    "lint": "bunx eslint . --ext ts,tsx",
    "test": "bunx vitest run",
    "test:watch": "bunx vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.48.1",
    "@tanstack/react-query": "^5.62.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.54.0",
    "react-router-dom": "^6.29.0",
    "tesseract.js": "^5.1.1",
    "zod": "^3.24.1",
    "zustand": "^5.0.2"
  }
}
```

## Data Models

### API Response Format (Preserved)

All API endpoints maintain the existing response format for backward compatibility:

```typescript
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

### Environment Variables Migration

| Cloudflare (wrangler.toml) | Vercel (Environment Variables) |
|---------------------------|-------------------------------|
| `VITE_SUPABASE_URL` | `VITE_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` |
| `SUPABASE_URL` | `SUPABASE_URL` |
| `RESEND_API_KEY` | `RESEND_API_KEY` |
| `EMAIL_FROM` | `EMAIL_FROM` |
| `VITE_TURNSTILE_SITE_KEY` | ← REMOVE (Cloudflare-specific) |
| `VITE_ANALYTICS_*` | ← REMOVE |
| `VITE_SENTRY_DSN` | ← REMOVE |

### Files to Remove

```
REMOVE:
├── functions/ai/                    # All AI endpoints
├── functions/analytics/             # All analytics endpoints
├── functions/mcp/                   # MCP integration
├── functions/_lib/cloudflareAI.js   # AI client
├── functions/_lib/analytics/        # Analytics utilities
├── src/lib/cloudflareAI.ts          # Frontend AI client
├── src/components/application/AIAssistant.tsx
├── src/components/supabase-ui/realtime-*.tsx
├── src/hooks/useAdminDashboardRealtime.ts
├── src/hooks/useStudentDashboardRealtime.ts
├── src/hooks/admin/useAdminRealtimeMetrics.ts
├── wrangler.toml
├── .cfignore
```

### Files to Preserve (Critical)

```
PRESERVE (DO NOT MODIFY):
├── src/hooks/useAutoSave.ts         # 8-second auto-save
├── src/pages/student/ApplicationWizard.tsx
├── src/service-worker.ts            # PWA offline support
├── public/manifest.json             # PWA manifest
├── supabase/migrations/             # Database migrations
```

## Database Schema (Verified via Supabase MCP)

The existing Supabase database contains 86+ tables that MUST remain unchanged. Key tables include:

### Core Application Tables
- `applications` - Main application records (28 rows, 49 columns)
- `application_grades` - ECZ grades (1-9 scale) linked to applications
- `application_documents` - Uploaded documents with verification status
- `application_status_history` - Audit trail for status changes
- `application_drafts` - Auto-saved draft data (critical for 8-second auto-save)

### User Management
- `profiles` - User profiles linked to auth.users
- `user_roles` - Role assignments (student, admin, super_admin)
- `user_profiles` - Extended user information
- `user_notification_preferences` - Channel preferences

### Academic Data
- `programs` - Available programs (4 programs)
- `intakes` - Intake periods (3 intakes)
- `subjects` - ECZ subjects (17 subjects)
- `institutions` - MIHAS and KATC

### Notifications & Communications
- `notifications` - General notifications
- `in_app_notifications` - In-app notification display
- `email_queue` - Email delivery queue with retry logic
- `email_notifications` - Application-specific emails

### Audit & Compliance
- `audit_logs` - Immutable audit trail (656 entries)
- `system_audit_log` - System-wide audit (274 entries)
- `activity_logs` - User activity tracking

### Analytics (TO BE REMOVED from API, tables preserved)
- `application_analytics` - Application event tracking
- `user_engagement_metrics` - User behavior data
- `api_telemetry` - API call metrics

**Migration Constraint**: No database schema changes. All 86+ tables remain intact. Only API endpoints and frontend code change.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*



### Property 1: Function Conversion Equivalence

*For any* Cloudflare Function with `onRequest(context)` pattern and any valid HTTP request, converting it to Vercel's `handler(req, res)` pattern SHALL produce an equivalent HTTP response (same status code, same JSON body structure, same headers).

**Validates: Requirements 1.2, 3.1, 3.5**

### Property 2: API Behavior Preservation

*For any* API endpoint and any valid request, the migrated Vercel function SHALL return:
- Identical CORS headers as the original Cloudflare function
- Same rate limiting behavior (same limits, same 429 responses)
- Same JSON response format (`{ success: boolean, data?: T, error?: string }`)

**Validates: Requirements 3.3, 3.4, 3.6**

### Property 3: Auto-Save Round-Trip

*For any* form data object in the Application Wizard, if the auto-save system saves it to localStorage, then reloading the page SHALL restore the exact same form data. The save operation SHALL occur every 8 seconds and SHALL NOT block UI interactions.

**Validates: Requirements 8.2, 8.3, 8.4**

### Property 4: Offline Queue and Sync

*For any* form submission attempted while offline (`navigator.onLine === false`), the system SHALL:
1. Queue the submission in localStorage
2. Continue functioning for core features
3. Automatically sync the queued submission when connectivity is restored

**Validates: Requirements 9.1, 9.3, 9.5**

### Property 5: Zambian Data Format Validation

*For any* phone number input, the validation system SHALL accept numbers matching the pattern `+260[0-9]{9}` and reject numbers not matching Zambian format. *For any* ECZ grade input, the system SHALL accept integers 1-9 and correctly classify 1-6 as pass and 7-9 as fail.

**Validates: Requirements 8.7**

### Property 6: Non-Blocking Validation

*For any* validation error in the Application Wizard (except required fields on final submission), the system SHALL allow the user to proceed to the next step. Validation errors SHALL be advisory, not blocking.

**Validates: Requirements 8.8**

### Property 7: No PII in Logs

*For any* log statement in the codebase, the output SHALL NOT contain patterns matching:
- Email addresses (`*@*.*`)
- Phone numbers (`+260*` or `260*`)
- Full names (from user profile data)
- National ID numbers

**Validates: Requirements 11.1**

### Property 8: Polling Interval Configuration

*For any* React Query hook that replaces Supabase Realtime subscriptions, the hook SHALL have `refetchInterval` configured to a value between 10000ms and 60000ms (10-60 seconds) to balance freshness with server load.

**Validates: Requirements 7.3**

## Error Handling

### API Error Responses

All API endpoints follow a consistent error handling pattern:

```typescript
// api/_lib/errorHandler.ts
export function handleError(res: VercelResponse, error: unknown, context?: string) {
  // Never expose stack traces or internal details
  const message = error instanceof Error ? error.message : 'An error occurred';
  
  // Log error without PII
  console.error(`[${context}] Error:`, {
    type: error instanceof Error ? error.name : 'Unknown',
    // Never log: email, phone, name, userId with PII
  });
  
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    // Never include: stack trace, env vars, internal paths
  });
}
```

### Offline Error Handling

```typescript
// Graceful degradation when offline
if (!navigator.onLine) {
  // Queue operation for later
  queueOperation(operation);
  // Show user-friendly message
  showToast('You are offline. Changes will sync when connected.');
  // Don't throw - allow continued operation
  return;
}
```

### External API Failures

```typescript
// Never block on external API failures (HPCZ, GNC/NMCZ, ECZ)
try {
  const eligibility = await checkEligibility(data);
  return { eligible: eligibility.result, advisory: true };
} catch (error) {
  // Log without PII, return advisory result
  console.error('[Eligibility] External API failed');
  return { eligible: null, advisory: true, message: 'Could not verify eligibility' };
}
```

## Testing Strategy

### Dual Testing Approach

The migration requires both unit tests and property-based tests:

1. **Unit Tests (Vitest)**: Verify specific examples, edge cases, and error conditions
2. **Property Tests (fast-check)**: Verify universal properties across all inputs

### Property-Based Testing Configuration

- **Library**: fast-check (Bun-compatible)
- **Minimum iterations**: 100 per property test
- **Tag format**: `Feature: bun-vercel-migration, Property {number}: {property_text}`

### Test Structure

```
tests/
├── unit/
│   ├── api/
│   │   ├── cors.test.ts
│   │   ├── auth.test.ts
│   │   └── applications.test.ts
│   ├── hooks/
│   │   ├── useAutoSave.test.ts
│   │   └── usePolling.test.ts
│   └── utils/
│       └── validation.test.ts
├── property/
│   ├── function-conversion.property.ts
│   ├── api-behavior.property.ts
│   ├── auto-save.property.ts
│   ├── offline-sync.property.ts
│   ├── zambian-formats.property.ts
│   └── no-pii-logs.property.ts
└── integration/
    ├── wizard-flow.test.ts
    └── offline-mode.test.ts
```

### Example Property Test

```typescript
// tests/property/auto-save.property.ts
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

describe('Feature: bun-vercel-migration, Property 3: Auto-Save Round-Trip', () => {
  it('should restore saved form data exactly', () => {
    fc.assert(
      fc.property(
        fc.record({
          firstName: fc.string({ minLength: 1, maxLength: 100 }),
          lastName: fc.string({ minLength: 1, maxLength: 100 }),
          phone: fc.string({ minLength: 10, maxLength: 15 }),
          step: fc.integer({ min: 0, max: 3 }),
        }),
        (formData) => {
          // Save to localStorage
          const key = 'autosave_/apply_';
          localStorage.setItem(key, JSON.stringify({
            data: formData,
            timestamp: new Date().toISOString()
          }));
          
          // Restore from localStorage
          const restored = JSON.parse(localStorage.getItem(key)!);
          
          // Verify round-trip
          expect(restored.data).toEqual(formData);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Unit Test Examples

```typescript
// tests/unit/utils/validation.test.ts
import { describe, it, expect } from 'vitest';
import { validateZambianPhone, validateECZGrade } from '@/lib/validation';

describe('Zambian Phone Validation', () => {
  it('accepts valid +260 format', () => {
    expect(validateZambianPhone('+260971234567')).toBe(true);
  });
  
  it('rejects non-Zambian numbers', () => {
    expect(validateZambianPhone('+1234567890')).toBe(false);
  });
});

describe('ECZ Grade Validation', () => {
  it('classifies 1-6 as pass', () => {
    for (let grade = 1; grade <= 6; grade++) {
      expect(validateECZGrade(grade).isPass).toBe(true);
    }
  });
  
  it('classifies 7-9 as fail', () => {
    for (let grade = 7; grade <= 9; grade++) {
      expect(validateECZGrade(grade).isPass).toBe(false);
    }
  });
});
```

### Migration Validation Tests

```typescript
// tests/integration/migration-validation.test.ts
import { describe, it, expect } from 'vitest';

describe('Migration Validation', () => {
  it('verifies all required API endpoints exist', async () => {
    const requiredEndpoints = [
      '/api/applications',
      '/api/auth/login',
      '/api/documents/upload',
      '/api/notifications/send',
      '/api/payments/generate-receipt'
    ];
    
    for (const endpoint of requiredEndpoints) {
      const response = await fetch(`http://localhost:3000${endpoint}`, {
        method: 'OPTIONS'
      });
      expect(response.status).not.toBe(404);
    }
  });
  
  it('verifies AI endpoints are removed', async () => {
    const removedEndpoints = [
      '/api/ai/chat',
      '/api/ai/predict',
      '/api/analytics/dashboard'
    ];
    
    for (const endpoint of removedEndpoints) {
      const response = await fetch(`http://localhost:3000${endpoint}`);
      expect(response.status).toBe(404);
    }
  });
});
```
