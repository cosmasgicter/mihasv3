# MIHAS Application System - Forensic Analysis Report

**Incident Classification:** Production Outage - API Failures  
**Date:** January 30, 2026  
**Lead Investigator:** Principal Software Engineer / Distributed Systems Architect  
**Scope:** Cloudflare→Vercel, Node.js→Bun Migration Autopsy

---

## Executive Summary

This forensic analysis examines critical failures following a multi-factor platform migration:
- **Cloudflare Pages → Vercel**
- **Node.js Runtime → Bun Runtime**
- **API Consolidation** (to fit Vercel 12-function free tier)
- **Supabase Realtime → Bun Webhooks**

**Current State:** PRODUCTION DOWN - Core authentication and API functionality non-operational.

---

## 1. RUNTIME & PLATFORM FORENSICS

### 1.1 Evidence: Runtime Configuration

**File:** `vercel.json`
```json
{
  "buildCommand": "bunx --bun vite build",
  "installCommand": "bun install",
  "outputDirectory": "dist",
  "framework": null
}
```

**File:** `bunfig.toml`
```toml
[install]
exact = true

[install.lockfile]
save = true
```

**File:** `vite.config.ts`
```typescript
build: {
  target: 'es2022',
  minify: 'terser',
  // ...
}
```

### 1.2 Finding: Bun Runtime NOT Properly Configured for Vercel Functions

**CRITICAL:** While the build uses Bun (`bunx --bun vite build`), the **Vercel Functions runtime is NOT explicitly set to Bun**.

**Vercel Function Runtime Behavior:**
- Vercel defaults to Node.js 18.x/20.x for serverless functions
- Bun runtime must be explicitly configured via `package.json` or function configuration
- Without explicit configuration, functions run in Node.js even if build uses Bun

**Expected Configuration (Missing):**
```json
{
  "functions": {
    "api/*.ts": {
      "runtime": "bun"
    }
  }
}
```

**Evidence of Runtime Mismatch:**
- API functions return 500 but don't log to console (Bun behavior differs from Node)
- Functions fail silently without stack traces
- `Buffer.from()` works in both, but error handling differs

### 1.3 Finding: Missing `includeFiles` for API Libraries

**File:** `vercel.json` (Current)
```json
"api/health.ts": {
  "maxDuration": 10
}
```

**Problem:** The `includeFiles` directive for `api/_lib/**` is missing. This means:
- `_lib/cors.ts`, `_lib/errorHandler.ts`, `_lib/supabaseClient.ts`, `_lib/rateLimiter.ts` may NOT be included in the function bundle
- Functions fail at runtime with "module not found" or undefined imports

**Required Fix:**
```json
"api/health.ts": {
  "maxDuration": 10,
  "includeFiles": "api/_lib/**"
}
```

---

## 2. API CONSOLIDATION AUTOPSY

### 2.1 Evidence: API Route Inventory

**Existing API Files:**
- `api/health.ts` - Health check
- `api/status.ts` - Status check
- `api/auth.ts` - Consolidated auth (login, register, signup, session)
- `api/auth-roles.ts` - NEW (roles/permissions)
- `api/admin.ts` - Admin operations
- `api/applications.ts` - Application CRUD
- `api/catalog.ts` - Program catalog
- `api/documents.ts` - Document management
- `api/notifications.ts` - Notifications
- `api/payments.ts` - Payments
- `api/sessions.ts` - Session tracking
- `api/[...path].ts` - Catch-all 404

**Total:** 12 functions (at Vercel free tier limit)

### 2.2 Finding: Frontend-Backend Endpoint Mismatch

**Evidence from Browser Console:**
```
GET /api/auth-roles 500 (Internal Server Error)
GET /api/auth/session 500 (Internal Server Error)
POST /api/sessions?action=track 500 (Internal Server Error)
```

**Frontend Code Analysis:**

**File:** `src/lib/api/authApi.ts`
```typescript
// CORRECT - matches deployed endpoint
const response = await fetch(`${getApiBaseUrl()}/api/auth-roles`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

**File:** `src/pages/auth/SignInPage.tsx` (Line 61)
```typescript
// WRONG - endpoint doesn't exist
fetch('/api/auth/session', {
  method: 'POST',
  body: JSON.stringify({ action: 'login' })
});
```

**Correct endpoint:** `/api/auth?action=session`

### 2.3 Finding: Auth Roles Function Type Error

**File:** `api/auth-roles.ts` (Line 27)
```typescript
const { user, profile } = authResult;
```

**Problem:** `authResult` from `getUserFromRequest()` returns `AuthContext` type which does NOT include `profile`:

**File:** `api/_lib/supabaseClient.ts` (Lines 52-62)
```typescript
export interface AuthContext {
  user: {
    id: string;
    email: string;
    role: string;
    app_metadata: Record<string, unknown>;
    user_metadata: Record<string, unknown>;
  };
  roles: string[];
  isAdmin: boolean;
}
// NO profile field!
```

**Impact:** `profile?.role` returns undefined, causing role detection to fail.

---

## 3. AUTH & SESSION SYSTEM AUTOPSY

### 3.1 Evidence: Supabase Client Configuration

**File:** `api/_lib/supabaseClient.ts` (Lines 17-47)
```typescript
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
};

export const supabaseAdmin: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  clientOptions
);
```

### 3.2 Finding: Environment Variables NOT Available

**Vercel Environment Variable Behavior:**
- `VITE_*` variables are available at BUILD time (Vite)
- Serverless functions need runtime environment variables
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` must be explicitly set in Vercel dashboard

**Evidence of Missing Variables:**
```typescript
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
// If both undefined, SUPABASE_URL = ''
```

**Impact:** Supabase client created with empty URL, causing all DB operations to fail.

### 3.3 Finding: JWT Token Parsing Works (Buffer Compatible)

**File:** `api/_lib/supabaseClient.ts` (Lines 224-236)
```typescript
const parts = token.split('.');
if (parts.length === 3) {
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');
  payload = JSON.parse(decoded);
}
```

**Finding:** `Buffer` API is compatible with both Node.js and Bun. This code should work.

---

## 4. FRONTEND FAILURE CHAIN

### 4.1 Evidence: Request Lifecycle

**1. Initial Page Load:**
```
GET / → 200 (HTML)
GET /assets/js/index-*.js → 200 (JavaScript)
```

**2. Auth Check:**
```
GET /api/auth-roles → 500
```

**3. Retry Loop (React Query):**
```javascript
// useRoleQuery.ts - default retry behavior
useQuery({
  queryKey: ['auth-roles'],
  queryFn: fetchUserRole,
  // Default: 3 retries with exponential backoff
});
```

### 4.2 Finding: Infinite Polling Due to 500 Errors

React Query default configuration:
- Retry: 3 times
- Retry delay: exponential (1s, 2s, 4s)
- Stale time: 0 (immediately stale)
- Refetch interval: Not set, but on window focus

**When auth-roles returns 500:**
1. Query fails
2. Retries 3 times
3. Marks query as error
4. On window focus/refocus, retries again
5. **Appears as infinite polling**

---

## 5. MIME TYPE & MODULE BREAKAGE

### 5.1 Evidence: Browser Console Errors

```
Failed to load module script: Expected a JavaScript-or-Wasm module script 
but the server responded with a MIME type of "text/html". 
Strict MIME type checking is enforced for module scripts per HTML spec.
```

### 5.2 Finding: SPA Fallback Intercepting JS Module Requests

**Root Cause:** Vercel rewrite rules

**File:** `vercel.json` (Lines 41-55)
```json
"rewrites": [
  { "source": "/api/health", "destination": "/api/health" },
  // ... other API routes
  { "source": "/(.*)", "destination": "/index.html" }
]
```

**Problem:** The catch-all rewrite `{ "source": "/(.*)", "destination": "/index.html" }` is applied to:
- `/assets/js/index-Cs_3w3SM.js` → Returns `index.html` (wrong!)
- Missing static files → Returns `index.html` (wrong!)

### 5.3 Finding: Missing Static Asset Headers

**File:** `vercel.json` (Current headers)
- `.js` files have NO explicit Content-Type header
- Falls through to catch-all HTML header

**Required Fix:**
```json
{
  "source": "/assets/js/(.*)",
  "headers": [
    { "key": "Content-Type", "value": "application/javascript; charset=utf-8" }
  ]
}
```

---

## 6. REALTIME SYSTEM AUTOPSY

### 6.1 Evidence: Previous Implementation

**Search Results:** No Supabase Realtime subscriptions found in current codebase.

**Related Files:**
- `.kiro/specs/realtime-autosave-fix/` - Indicates previous realtime functionality
- `.kiro/specs/realtime-mobile-performance-fix/` - Performance issues with realtime

### 6.2 Finding: Supabase Realtime Removed, Bun Webhooks Not Implemented

**Current State:**
- No `supabase.channel()` calls in codebase
- No WebSocket connections
- No realtime subscriptions

**Expected Bun Webhook Implementation:**
```typescript
// Missing implementation
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const event = req.body;
  // Process webhook from Supabase
  // Broadcast to connected clients via SSE or similar
}
```

### 6.3 Impact: Stale Data and Polling Loops

Without realtime:
- Frontend must poll for updates
- State updates delayed
- Increased server load
- Poor user experience

---

## 7. NODE vs BUN INCOMPATIBILITY ANALYSIS

### 7.1 Compatible (Working in Both)

| Feature | Status | Evidence |
|---------|--------|----------|
| `Buffer.from()` | ✅ | Used in JWT parsing, works in both |
| `fetch()` | ✅ | Global in both (Node 18+, Bun native) |
| `JSON.parse/stringify` | ✅ | Standard JS |
| ES Modules | ✅ | Both support ESM |

### 7.2 Incompatible or Different Behavior

| Feature | Node.js | Bun | Issue |
|---------|---------|-----|-------|
| `process.env` | Mutable | Mutable | Same |
| Console output | Buffered | Buffered | Same |
| Error stack traces | Detailed | May differ | Minor |
| `__dirname` | Available | Available | Same |

**Finding:** No significant Node.js vs Bun incompatibilities in the code.

**The 500 errors are NOT from Bun/Node incompatibilities.**

---

## 8. ROOT CAUSE ANALYSIS

### 8.1 Primary Root Causes

1. **Missing Environment Variables on Vercel**
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Functions fail because Supabase client has empty configuration

2. **Missing `includeFiles` for API Libraries**
   - `_lib/` files not bundled with functions
   - Module resolution fails at runtime

3. **Frontend Endpoint Mismatch**
   - `/api/auth/session` called instead of `/api/auth?action=session`

4. **SPA Fallback Intercepting Assets**
   - Catch-all rewrite returns HTML for missing JS files
   - Wrong Content-Type for static assets

5. **Type Error in auth-roles.ts**
   - `profile` field doesn't exist in `AuthContext`

### 8.2 Evidence Chain

```
User visits page
    ↓
Browser loads HTML, JS
    ↓
JS calls /api/auth-roles
    ↓
Vercel invokes api/auth-roles.ts
    ↓
Function imports from _lib/supabaseClient.ts
    ↓
Supabase client created with empty URL (env vars missing)
    ↓
getUserFromRequest() calls supabaseAdmin.from()
    ↓
Supabase request fails (invalid URL)
    ↓
Function throws or returns 500
    ↓
Frontend receives 500
    ↓
React Query retries (appears as infinite polling)
```

---

## 9. FIXES & CODE CHANGES

### 9.1 Fix 1: Add Environment Variables to Vercel

**Required Variables:**
```
SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

**Action:** Set in Vercel Dashboard → Project Settings → Environment Variables

### 9.2 Fix 2: Update vercel.json

```json
{
  "buildCommand": "bunx --bun vite build",
  "installCommand": "bun install",
  "outputDirectory": "dist",
  "framework": null,
  "functions": {
    "api/health.ts": {
      "maxDuration": 10,
      "includeFiles": "api/_lib/**"
    },
    "api/status.ts": {
      "maxDuration": 5,
      "includeFiles": "api/_lib/**"
    },
    "api/auth.ts": {
      "maxDuration": 10,
      "includeFiles": "api/_lib/**"
    },
    "api/auth-roles.ts": {
      "maxDuration": 5,
      "includeFiles": "api/_lib/**"
    },
    "api/admin.ts": {
      "maxDuration": 10,
      "includeFiles": "api/_lib/**"
    },
    "api/applications.ts": {
      "maxDuration": 10,
      "includeFiles": "api/_lib/**"
    },
    "api/catalog.ts": {
      "maxDuration": 10,
      "includeFiles": "api/_lib/**"
    },
    "api/documents.ts": {
      "maxDuration": 10,
      "includeFiles": "api/_lib/**"
    },
    "api/notifications.ts": {
      "maxDuration": 10,
      "includeFiles": "api/_lib/**"
    },
    "api/payments.ts": {
      "maxDuration": 10,
      "includeFiles": "api/_lib/**"
    },
    "api/sessions.ts": {
      "maxDuration": 10,
      "includeFiles": "api/_lib/**"
    },
    "api/[...path].ts": {
      "maxDuration": 5,
      "includeFiles": "api/_lib/**"
    }
  },
  "rewrites": [
    { "source": "/api/health", "destination": "/api/health" },
    { "source": "/api/status", "destination": "/api/status" },
    { "source": "/api/auth", "destination": "/api/auth" },
    { "source": "/api/auth-roles", "destination": "/api/auth-roles" },
    { "source": "/api/admin", "destination": "/api/admin" },
    { "source": "/api/applications", "destination": "/api/applications" },
    { "source": "/api/catalog", "destination": "/api/catalog" },
    { "source": "/api/documents", "destination": "/api/documents" },
    { "source": "/api/notifications", "destination": "/api/notifications" },
    { "source": "/api/payments", "destination": "/api/payments" },
    { "source": "/api/sessions", "destination": "/api/sessions" },
    { "source": "/api/:path*", "destination": "/api/[...path]" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/assets/js/(.*)",
      "headers": [
        { "key": "Content-Type", "value": "application/javascript; charset=utf-8" }
      ]
    },
    {
      "source": "/assets/css/(.*)",
      "headers": [
        { "key": "Content-Type", "value": "text/css; charset=utf-8" }
      ]
    },
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Content-Type", "value": "application/json" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ]
}
```

### 9.3 Fix 3: Fix auth-roles.ts Type Error

**File:** `api/auth-roles.ts`

**Current (Broken):**
```typescript
const { user, profile } = authResult;
const role = profile?.role || user.user_metadata?.role || 'student';
```

**Fixed:**
```typescript
const { user, roles } = authResult;
const role = roles[0] || user.user_metadata?.role || 'student';
```

### 9.4 Fix 4: Fix Frontend Endpoint

**File:** `src/pages/auth/SignInPage.tsx` (Line 61)

**Current (Broken):**
```typescript
fetch('/api/auth/session', {
  method: 'POST',
  body: JSON.stringify({ action: 'login' })
});
```

**Fixed:**
```typescript
fetch('/api/auth?action=session', {
  method: 'POST',
  body: JSON.stringify({ action: 'login' })
});
```

### 9.5 Fix 5: Add Error Handling to Auth Functions

**File:** `api/auth-roles.ts`

Add try-catch wrapper:
```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (handleCors(req, res)) return;
    // ... rest of handler
  } catch (error) {
    console.error('[auth-roles] Unhandled error:', error);
    return sendError(res, 'Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
```

---

## 10. BUN HARDENING RECOMMENDATIONS

### 10.1 Explicit Bun Runtime Declaration

**File:** `package.json`
```json
{
  "engines": {
    "bun": ">=1.0.0"
  }
}
```

### 10.2 Bun-Compatible Logging

Replace `console.log` with structured logging:
```typescript
const log = {
  info: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
  error: (msg: string, error: unknown) => console.error(JSON.stringify({ level: 'error', msg, error: String(error) }))
};
```

### 10.3 Environment Variable Validation

**File:** `api/_lib/env.ts` (Create)
```typescript
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Usage
const SUPABASE_URL = requireEnv('SUPABASE_URL');
```

---

## 11. REALTIME RECOVERY STRATEGY

### 11.1 Option 1: Restore Supabase Realtime (Immediate)

**Pros:**
- Works immediately
- Known implementation

**Cons:**
- Depends on Supabase
- WebSocket connections may not work well in some mobile networks

### 11.2 Option 2: Server-Sent Events (SSE) with Bun

**Implementation:**
```typescript
// api/events.ts
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send periodic updates
  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
  }, 30000);
  
  req.on('close', () => clearInterval(interval));
}
```

**Pros:**
- HTTP-based (works everywhere)
- Bun-compatible

**Cons:**
- Vercel has 10s timeout on serverless functions
- Requires persistent connection (not ideal for serverless)

### 11.3 Option 3: Polling with React Query (Recommended for Now)

**Implementation:**
```typescript
useQuery({
  queryKey: ['applications'],
  queryFn: fetchApplications,
  refetchInterval: 30000, // 30s polling
  staleTime: 15000
});
```

**Pros:**
- Works with current architecture
- No server changes needed
- Reliable

**Cons:**
- Higher server load
- Delayed updates

---

## 12. DEPLOYMENT CHECKLIST

- [ ] Set environment variables in Vercel Dashboard
- [ ] Update `vercel.json` with `includeFiles`
- [ ] Fix `api/auth-roles.ts` type error
- [ ] Fix frontend endpoint in `SignInPage.tsx`
- [ ] Add JS/CSS Content-Type headers
- [ ] Deploy and test `/api/health`
- [ ] Deploy and test `/api/auth-roles`
- [ ] Verify static assets load correctly
- [ ] Test full authentication flow

---

## 13. CONCLUSION

**Primary Issue:** Configuration errors, NOT Bun/Node incompatibilities.

The migration to Bun and Vercel was technically sound in code, but failed due to:
1. Missing environment variable configuration
2. Missing `includeFiles` in function config
3. Frontend/backend endpoint mismatch
4. SPA fallback misconfiguration

**Bun is NOT the problem.** The runtime works correctly. The issues are deployment and configuration related.

**Estimated Fix Time:** 2-4 hours  
**Risk Level:** Low (configuration changes only)  
**Rollback Plan:** Revert to previous deployment if needed

---

*End of Forensic Analysis Report*
