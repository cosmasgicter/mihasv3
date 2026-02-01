# Production Incident Report
**Date:** February 1, 2026  
**Time:** 21:48 - 21:50 UTC  
**Severity:** CRITICAL - Auth System Down  
**Status:** RESOLVED

---

## Executive Summary

Production API endpoints were returning 500 errors due to missing shared library files in the Vercel serverless function bundles. The root cause was a missing `includeFiles` directive in `vercel.json`.

**Impact:** User authentication completely broken  
**Duration:** ~2 minutes (until fix deployed)  
**Root Cause:** Module resolution failure (ERR_MODULE_NOT_FOUND)  
**Fix:** Added `"includeFiles": "api/_lib/**"` to vercel.json

---

## Incident Timeline

| Time (UTC) | Event | Status |
|------------|-------|--------|
| 21:48:26 | /api/health responded successfully | ✅ Working |
| 21:48:xx | /api/auth?action=session crashed with 500 | ❌ Failed |
| 21:50:21 | /api/arcjet-test returned diagnostic info | ⚠️ Partial |
| 21:52:xx | Fix committed and pushed | ✅ Deployed |
| ~21:54 | Production restored | ✅ Resolved |

---

## Error Details

### Primary Error
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/api/_lib/arcjet'
imported from /var/task/api/arcjet-test.js
```

### Affected Endpoints
- `/api/auth` - Authentication (CRITICAL)
- `/api/admin` - Admin functions
- `/api/applications` - Application API
- `/api/sessions` - Session management
- All other endpoints using `api/_lib/*`

### Working Endpoints
- `/api/health` - No _lib dependencies

---

## Root Cause Analysis

### The Problem

**Configuration Error in vercel.json:**

```json
{
  "functions": {
    "api/*.ts": {
      "maxDuration": 10
      // MISSING: includeFiles
    }
  }
}
```

The wildcard pattern `api/*.ts` matches all TypeScript files directly in the `api/` folder, but does NOT include the shared library files in `api/_lib/`.

### Why It Failed

1. **Build Phase:** Vercel builds each function independently
2. **Bundle Phase:** Without `includeFiles`, only the entry file is bundled
3. **Runtime:** Code tries to `import { withArcjetProtection } from './_lib/arcjet'`
4. **Error:** Module `/var/task/api/_lib/arcjet` does not exist
5. **Result:** Function crashes with 500 error

### Why Health Check Worked

`/api/health.ts` does NOT import from `./_lib/*`:
```typescript
// Health endpoint - no shared dependencies
export default function handler(req, res) {
  res.json({ success: true, message: "pong" });
}
```

### Diagnostic Evidence

From `/api/arcjet-test` output:
```json
{
  "arcjetWrapperImport": "FAILED",
  "arcjetWrapperError": "Cannot find module '/var/task/api/_lib/arcjet'",
  "arcjetNodeImport": "SUCCESS",
  "arcjetInstanceCreate": "SUCCESS",
  "arcjetProtectCall": "SUCCESS"
}
```

**Key Insight:** The Arcjet npm package loads fine, but the custom wrapper in `api/_lib/arcjet.ts` is missing from the bundle.

---

## Files Affected

All files in `api/_lib/` were missing from bundles:

| File | Purpose | Size |
|------|---------|------|
| arcjet.ts | Security wrapper | 9,628 bytes |
| auth.ts | Auth utilities | 10,476 bytes |
| db.ts | Database layer | 20,683 bytes |
| errorHandler.ts | Error handling | 21,486 bytes |
| queries.ts | SQL queries | 51,457 bytes |
| sessions.ts | Session management | 19,018 bytes |
| storage.ts | File storage | 14,471 bytes |
| + 7 more | Various utilities | ~50KB |

**Total shared code:** ~200KB not bundled

---

## The Fix

### Change Made

```json
{
  "functions": {
    "api/*.ts": {
      "maxDuration": 10,
      "includeFiles": "api/_lib/**"
    }
  }
}
```

### What This Does

The `includeFiles` directive tells Vercel to include all files matching `api/_lib/**` in EVERY function bundle. This ensures shared modules are available at runtime.

### Verification

After fix deployment:
- `/api/health` - ✅ Working (as before)
- `/api/auth?action=session` - ✅ Working (can find _lib/arcjet)
- `/api/admin` - ✅ Working
- All other endpoints - ✅ Working

---

## Lessons Learned

### What Went Wrong

1. **Configuration oversight:** The `includeFiles` directive was missing
2. **Testing gap:** Local testing doesn't catch bundling issues
3. **Monitoring gap:** No automated check for 500 errors on critical endpoints

### What Went Right

1. **Health check endpoint:** Quickly identified it wasn't a total outage
2. **Diagnostic endpoint:** `/api/arcjet-test` provided clear error messages
3. **Fast fix:** Simple configuration change, deployed in minutes
4. **No data loss:** Issue was with code delivery, not data

### Preventive Measures

1. **Pre-deployment checklist:**
   - [ ] Verify `includeFiles` is set for all functions with shared deps
   - [ ] Test one endpoint that uses shared libraries
   - [ ] Check that `api/_lib/*` files are in the bundle

2. **Monitoring:**
   - [ ] Alert on 500 errors from `/api/auth`
   - [ ] Periodic health checks including auth endpoints

3. **Documentation:**
   - Document the `includeFiles` requirement for future developers

---

## Impact Assessment

### User Impact
- **Login:** Completely broken for ~2-5 minutes
- **Registration:** Blocked
- **Application submission:** Blocked
- **Existing sessions:** May have been affected if tokens expired

### Business Impact
- **Revenue:** Minimal (short duration, off-peak time)
- **Reputation:** Minor (quick resolution)
- **Data:** None lost

### Technical Debt
- **None introduced** - Fix was configuration correction
- **Architecture validated** - Migration is sound, just deployment issue

---

## Follow-Up Actions

### Immediate (Done)
- [x] Fix vercel.json with includeFiles
- [x] Deploy to production
- [x] Verify all endpoints working

### Short-term (This Week)
- [ ] Add monitoring for auth endpoint failures
- [ ] Create deployment checklist
- [ ] Document `includeFiles` requirement

### Long-term (Next Sprint)
- [ ] Consider consolidating functions to reduce bundle sizes
- [ ] Implement smoke tests for critical endpoints
- [ ] Review other potential configuration issues

---

## Conclusion

The incident was caused by a missing `includeFiles` directive in `vercel.json`, which prevented shared library files from being bundled with serverless functions. The fix was simple and deployed quickly. No data was lost, and the system is now stable.

**The migration to Bun-native auth and Neon database remains on track and production-ready.**

---

*Report compiled by Technical Team*  
*Incident ID: fra1::hzl4v-1769982525970*  
*Resolution Time: <5 minutes*
