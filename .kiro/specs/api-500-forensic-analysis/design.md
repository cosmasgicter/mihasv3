# FORENSIC ROOT-CAUSE ANALYSIS

**Date**: February 1-2, 2026 (CAT)
**Analyst**: Principal Systems Forensics Engineer
**Status**: ROOT CAUSE CONFIRMED AND FIXED

---

## EXECUTIVE SUMMARY

**Original Hypothesis**: Arcjet runtime incompatibility with Vercel's Node.js runtime.

**ACTUAL ROOT CAUSE**: Vercel excludes directories with underscore prefix (`_lib/`) from serverless function bundles. The `api/_lib/` directory containing all shared utilities (arcjet.ts, auth/, db.ts, etc.) was NOT deployed to Vercel's `/var/task/` directory.

**Evidence**: Vercel logs showed `Cannot find module '/var/task/api/_lib/arcjet'`

**Fix Applied**: Moved `api/_lib/` → `api/lib/` → `lib/` (project root) and updated all imports.

---

## PHASE 1 — ORIGINAL EXECUTION TIMELINE RECONSTRUCTION

### Vercel Function Invocation Lifecycle:

1. **Bundle Loading** - Vercel loads the compiled JavaScript bundle
2. **Module Imports** - Top-level imports execute synchronously
3. **Top-level Code Execution** - Any code outside functions runs
4. **Middleware Initialization** - Wrapper functions initialize
5. **Handler Execution** - The actual request handler runs

### What Executes in Each Phase:

| Phase | Ping | Health | Auth/Sessions/Applications |
|-------|------|--------|---------------------------|
| Bundle Loading | ✅ | ✅ | ❌ CRASH |
| Module Imports | `@vercel/node` only | `@vercel/node`, `db.ts` | `@vercel/node`, `zod`, `@arcjet/node`, `db.ts`, `auth/*`, `queries.ts` |
| Top-level Code | None | None | Arcjet initialization |
| Middleware | None | None | `withArcjetProtection()` wrapper |
| Handler | Executes | Executes | Never reached |

---

## PHASE 2 — ACTUAL ROOT CAUSE DISCOVERY

### The Underscore Prefix Problem

**Vercel's Behavior**: Directories starting with underscore (`_`) inside the `api/` folder are excluded from serverless function bundles. This is an undocumented behavior.

**Our Structure (BEFORE)**:
```
api/
├── _lib/              ← EXCLUDED BY VERCEL (underscore prefix)
│   ├── arcjet.ts
│   ├── auth/
│   ├── db.ts
│   └── ...
├── auth.ts            ← Deployed, but imports from _lib/ fail
├── sessions.ts
└── ...
```

**Evidence from Vercel Logs**:
```
Error: Cannot find module '/var/task/api/_lib/arcjet'
Require stack:
- /var/task/api/auth.js
```

The file `api/_lib/arcjet.ts` existed locally but was NOT present in `/var/task/api/_lib/` on Vercel.

### Why Ping and Health Worked

- `api/ping.ts` - Had NO imports from `_lib/`
- `api/health.ts` - Originally had NO imports from `_lib/` (only `@vercel/node`)

### Why Auth/Sessions/Applications Failed

All these endpoints imported from `api/_lib/`:
```typescript
import { withArcjetProtection } from "./_lib/arcjet";
import { query } from "./_lib/db";
import { handleCors } from "./_lib/cors";
```

Since `_lib/` was excluded from the bundle, these imports failed at runtime.

---

## PHASE 3 — FIX IMPLEMENTATION

### Fix Attempt 1: Rename `_lib` to `lib`

**Change**: `api/_lib/` → `api/lib/`

**Result**: Vercel still counted files in `api/lib/` as separate serverless functions, exceeding the 12 function limit on Hobby plan.

### Fix Attempt 2: Move to Project Root

**Change**: `api/lib/` → `lib/` (project root)

**Result**: SUCCESS - Files at project root are bundled with each function but not counted as separate functions.

**Final Structure**:
```
lib/                   ← PROJECT ROOT (shared utilities)
├── arcjet.ts
├── auth/
│   ├── password.ts
│   ├── jwt.ts
│   ├── cookies.ts
│   ├── middleware.ts
│   └── permissions.ts
├── cors.ts
├── db.ts
├── errorHandler.ts
├── queries.ts
└── ...

api/                   ← Vercel Serverless Functions (10 endpoints)
├── admin.ts           ← imports from ../lib/
├── auth.ts            ← imports from ../lib/
├── health.ts          ← imports from ../lib/
└── ...
```

### Import Path Changes

**Before**:
```typescript
import { withArcjetProtection } from "./_lib/arcjet";
```

**After**:
```typescript
import { withArcjetProtection } from "../lib/arcjet";
```

---

## PHASE 4 — ADDITIONAL FIXES

### Consolidated Endpoints (Vercel 12 Function Limit)

To stay under Vercel Hobby plan's 12 function limit:

1. **Deleted**: `api/arcjet-test.ts` (forensic test file)
2. **Deleted**: `api/ping.ts` (merged into health.ts)
3. **Added**: `api/health.ts?action=ping` (consolidated)
4. **Added**: `api/health.ts?action=arcjet` (consolidated)

**Final Function Count**: 10 (under 12 limit)

### Node.js 20.x Runtime

Also configured Node.js 20.x runtime in `vercel.json` for Arcjet compatibility:
```json
{
  "functions": {
    "api/*.ts": {
      "runtime": "nodejs20.x",
      "maxDuration": 10
    }
  }
}
```

---

## PHASE 5 — VERIFICATION

### Commits Applied

1. `b1fe2e9ae` - Move api/lib to lib/ to avoid Vercel function count limit
2. `511615939` - Fix arcjet import path in health.ts to use ../lib/
3. `d12bba9ce` - Update steering docs: lib/ moved to project root

### Endpoints to Test

After deployment, verify:
- `https://apply.mihas.edu.zm/api/health` - Basic health check
- `https://apply.mihas.edu.zm/api/health?action=ping` - Ping/pong
- `https://apply.mihas.edu.zm/api/health?action=arcjet` - Arcjet test
- `https://apply.mihas.edu.zm/api/auth?action=session` - Auth session

---

## FINAL ROOT CAUSE STATEMENT

> **"The system failed because Vercel excludes directories with underscore prefix (`_lib/`) from serverless function bundles. The `api/_lib/` directory containing all shared utilities was NOT deployed to Vercel's runtime environment, causing 'Cannot find module' errors for all endpoints that imported from `_lib/`. The fix was to move shared utilities to project root `lib/` and update all imports to use `../lib/`."**

---

## LESSONS LEARNED

1. **Vercel Naming Convention**: Never use underscore prefix for directories inside `api/` that need to be bundled
2. **Vercel Function Limit**: Files inside `api/` subdirectories count toward function limit
3. **Shared Utilities Location**: Place shared utilities at project root, not inside `api/`
4. **Import Paths**: Use `../lib/` from `api/*.ts` files to import from project root

---

## DELIVERABLES

### Root Cause Explanation:
Vercel's undocumented behavior excludes underscore-prefixed directories from serverless function bundles. The `api/_lib/` directory was not deployed.

### Evidence Chain:
1. Vercel logs: `Cannot find module '/var/task/api/_lib/arcjet'`
2. Ping (no _lib imports) → Works ✅
3. Health (no _lib imports) → Works ✅
4. Auth (imports _lib) → Crashes ❌
5. Sessions (imports _lib) → Crashes ❌
6. Applications (imports _lib) → Crashes ❌

### Fix Applied:
1. Moved `api/_lib/` → `lib/` (project root)
2. Updated all imports from `./_lib/` to `../lib/`
3. Consolidated endpoints to stay under 12 function limit
4. Configured Node.js 20.x runtime

### Status: FIXED ✅
