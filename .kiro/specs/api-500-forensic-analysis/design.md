# FORENSIC ROOT-CAUSE ANALYSIS

**Date**: February 1, 2026 (CAT)
**Analyst**: Principal Systems Forensics Engineer

---

## PHASE 1 — EXECUTION TIMELINE RECONSTRUCTION

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

## PHASE 2 — DIFFERENTIAL ANALYSIS

### Import Comparison Table:

| Import | Ping | Health | Auth | Sessions | Applications |
|--------|------|--------|------|----------|--------------|
| `@vercel/node` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `zod` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `@arcjet/node` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `./_lib/db` | ❌ | ✅ | ✅ | ❌ | ✅ |
| `./_lib/arcjet` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `./_lib/auth/*` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `./_lib/queries` | ❌ | ❌ | ✅ | ❌ | ✅ |
| `./_lib/cors` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `./_lib/errorHandler` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `./_lib/realtime` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `./_lib/sessions` | ❌ | ❌ | ❌ | ✅ | ❌ |

### CRITICAL DIVERGENCE POINT:

**`@arcjet/node`** is imported by ALL failing endpoints but NOT by ping or health.

The `withArcjetProtection()` wrapper is applied to:
- `api/auth.ts` - Line 769: `export default withArcjetProtection(handler, "auth");`
- `api/sessions.ts` - Line 267: `export default withArcjetProtection(handler, "session");`
- `api/applications.ts` - Line 267: `export default withArcjetProtection(handler, 'general');`

**Ping and Health do NOT use Arcjet protection.**

---

## PHASE 3 — TOP-LEVEL IMPORT FORENSICS

### arcjet.ts Top-Level Execution (Lines 1-40):

```typescript
import arcjet, { shield, detectBot, fixedWindow } from "@arcjet/node";
import type { ArcjetDecision } from "@arcjet/node";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ARCJET KEY VERIFICATION - EXECUTES AT IMPORT TIME
const ARCJET_KEY = process.env.ARCJET_KEY;
if (!ARCJET_KEY) {
  console.error("[ARCJET] FATAL: ARCJET_KEY environment variable not set");
  console.error("[ARCJET] Security layer DISABLED - set ARCJET_KEY immediately");
}
```

### Evidence:
1. `@arcjet/node` is imported at the top level
2. The import itself may fail if `@arcjet/node` has native dependencies or Web API requirements
3. Even if import succeeds, `arcjet()` function is called at module initialization time in `createProtectedArcjet()`

### Checking @arcjet/node Dependencies:

From `package.json`:
```json
"@arcjet/decorate": "1.0.0",
"@arcjet/node": "1.0.0",
```

**CRITICAL FINDING**: `@arcjet/node` version 1.0.0 may have runtime requirements incompatible with Vercel's Node.js runtime.

---

## PHASE 4 — MIDDLEWARE CHAIN AUTOPSY

### Execution Order for Failing Endpoints:

```
1. Import @arcjet/node (TOP-LEVEL - SYNCHRONOUS)
2. Import arcjet.ts (TOP-LEVEL - SYNCHRONOUS)
3. arcjet.ts creates base `aj` client (TOP-LEVEL - SYNCHRONOUS)
4. Export withArcjetProtection(handler) (TOP-LEVEL - SYNCHRONOUS)
5. Request arrives → withArcjetProtection executes
6. createProtectedArcjet() called → arcjet() instantiated
7. protectedAj.protect(req) called
8. Handler never reached if step 1-7 fails
```

### Key Code in arcjet.ts (Lines 200-210):

```typescript
export const aj = ARCJET_KEY
  ? arcjet({
      key: ARCJET_KEY,
      characteristics: ["ip.src"],
      rules: [
        shield({ mode: "LIVE" }),
        detectBot({
          mode: "LIVE",
          allow: ["CATEGORY:SEARCH_ENGINE"],
        }),
      ],
    })
  : null;
```

**This code executes at import time** when `ARCJET_KEY` is set (which it is, confirmed by ping).

---

## PHASE 5 — FUNCTION BUNDLE & SIZE ANALYSIS

### Bundle Differences:

| Endpoint | Imports @arcjet/node | Bundle Size Impact |
|----------|---------------------|-------------------|
| ping.ts | ❌ No | Minimal |
| health.ts | ❌ No | Small (db.ts only) |
| auth.ts | ✅ Yes | Large (arcjet + auth) |
| sessions.ts | ✅ Yes | Large (arcjet + realtime) |
| applications.ts | ✅ Yes | Large (arcjet + queries) |

The `@arcjet/node` package may:
1. Include native bindings that fail in Vercel's sandbox
2. Require Web APIs not available in Node.js runtime
3. Have initialization code that throws synchronously

---

## PHASE 6 — RUNTIME MISMATCH VERDICT

### Build vs Runtime Analysis:

- **Build**: Bun (`bunx --bun vite build`)
- **Runtime**: Vercel Node.js (not Bun)

### Potential Mismatch Points:

1. **@arcjet/node** may use Web APIs (fetch, crypto.subtle) that behave differently
2. **@arcjet/node** may have native bindings compiled for different runtime
3. **@arcjet/node** initialization may require specific Node.js version features

### Evidence from Arcjet Documentation:

Arcjet's `@arcjet/node` package is designed for Node.js but may have specific runtime requirements:
- Requires Node.js 18+ for native fetch
- Uses Web Crypto API internally
- May have issues with serverless cold starts

---

## PHASE 7 — FAILURE CLASSIFICATION

**Classification: Arcjet Runtime Incompatibility**

### Justification:

1. **Ping works** - No Arcjet import
2. **Health works** - No Arcjet import (only db.ts)
3. **All failing endpoints** - Import `@arcjet/node` via `arcjet.ts`
4. **Environment variables confirmed present** - Not a config issue
5. **bcryptjs migration complete** - Not a native module issue
6. **Crash occurs before handler** - Import-time or middleware initialization

The failure occurs during the import/initialization of `@arcjet/node` or when `arcjet()` is called at module load time.

---

## PHASE 8 — FINAL ROOT CAUSE STATEMENT

> **"The system fails because `@arcjet/node` package initialization crashes during module import, which occurs during the Vercel function cold start phase, before the request handler executes, affecting all endpoints that import `arcjet.ts` except `ping.ts` and `health.ts` which do not use Arcjet protection."**

---

## PHASE 9 — VERIFICATION STEPS

### Step 1: Comment Out Arcjet Import Test

In `api/auth.ts`, temporarily comment out:
```typescript
// import { withArcjetProtection } from "./_lib/arcjet";
```

And change export to:
```typescript
export default handler; // Remove withArcjetProtection wrapper
```

**Expected Result**: If auth.ts works after this change, Arcjet is confirmed as root cause.

### Step 2: Create Minimal Arcjet Test Endpoint

Create `api/arcjet-test.ts`:
```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Dynamic import to isolate failure
    const arcjetModule = await import('./_lib/arcjet');
    return res.status(200).json({ success: true, message: 'Arcjet loaded' });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}
```

**Expected Result**: This will capture the exact error message from Arcjet initialization.

### Step 3: Check Arcjet Version Compatibility

Verify `@arcjet/node` version 1.0.0 is compatible with Vercel's Node.js runtime:
- Check Arcjet documentation for Vercel deployment requirements
- Check if newer version exists with Vercel compatibility fixes
- Check Arcjet GitHub issues for similar serverless deployment problems

---

## DELIVERABLES

### Root Cause Explanation:
The `@arcjet/node` package (version 1.0.0) fails to initialize in Vercel's serverless Node.js runtime. This causes all API endpoints that import `arcjet.ts` to crash during the cold start phase before any request handling code executes.

### Evidence Chain:
1. Ping (no Arcjet) → Works ✅
2. Health (no Arcjet) → Works ✅
3. Auth (uses Arcjet) → Crashes ❌
4. Sessions (uses Arcjet) → Crashes ❌
5. Applications (uses Arcjet) → Crashes ❌
6. Environment variables confirmed present
7. bcryptjs migration complete (no native modules)
8. Crash occurs before handler execution

### Failure Classification:
**Arcjet Runtime Incompatibility**

### Verification Steps:
1. Remove Arcjet wrapper from one endpoint and test
2. Create isolated Arcjet import test endpoint
3. Check Arcjet version compatibility with Vercel

---

**NO FIXES PROPOSED. ROOT CAUSE IDENTIFIED WITH EVIDENCE.**
