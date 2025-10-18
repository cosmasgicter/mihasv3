# Troubleshooting Guide

## Current Issues and Solutions

### 1. Analytics Telemetry Validation Error ✅ FIXED

**Error:**
```
Invalid telemetry payload ZodError: [
  {
    "code": "invalid_type",
    "expected": "array",
    "received": "undefined",
    "path": ["events"],
    "message": "Required"
  }
]
```

**Cause:** The telemetry payload wasn't properly wrapping events in the request body.

**Solution:** Updated `/src/lib/monitoring.ts` to ensure the payload is properly structured with the `events` array wrapper.

**Status:** ✅ Fixed

---

### 2. 401 Unauthorized Errors

**Error:**
```
Response with status 401 in 715 ms.
```

**Endpoints Affected:**
- `/.netlify/functions/admin-dashboard`
- `/.netlify/functions/applications`

**Cause:** These endpoints require authentication. The 401 errors indicate:
1. User is not signed in
2. Session has expired
3. Auth token is missing or invalid

**Solutions:**

#### Option A: Sign In (Recommended)
1. Navigate to `/auth/signin` in your browser
2. Sign in with valid credentials
3. The endpoints will work once authenticated

#### Option B: Check Auth Configuration
Verify your Supabase configuration in `.env`:
```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

#### Option C: Disable Auth for Development (Not Recommended)
Only for local testing - modify the endpoint handlers to skip auth checks.

**Status:** ⚠️ Expected behavior - authentication required

---

### 3. Deprecation Warning

**Warning:**
```
(node:6241) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated. 
Please use Object.assign() instead.
```

**Cause:** One of the dependencies is using deprecated Node.js API.

**Solution:** This is a warning from a dependency. It doesn't affect functionality but should be addressed by:
1. Updating dependencies: `npm update`
2. Checking which package uses `util._extend`: `npm ls util`

**Status:** ⚠️ Low priority - doesn't affect functionality

---

## Quick Fixes Applied

### File: `/src/lib/monitoring.ts`

**Change:** Ensured telemetry payload properly wraps events array

```typescript
// Before
body: JSON.stringify({ events })

// After  
const payload = { events }
body: JSON.stringify(payload)
```

---

## Testing the Fixes

### 1. Test Telemetry (After Restart)
```bash
# Restart the dev server
npm run dev
```

The telemetry errors should no longer appear.

### 2. Test Authentication
```bash
# Open browser
http://localhost:5173/auth/signin

# Sign in with credentials
# Then navigate to admin dashboard
http://localhost:5173/admin/dashboard
```

The 401 errors should resolve once authenticated.

---

## Next Steps

1. ✅ Restart your development server to apply the telemetry fix
2. ⚠️ Sign in to test authenticated endpoints
3. 📝 Update dependencies to resolve deprecation warnings (optional)

---

## Additional Notes

- The telemetry system will silently fail in development if the API is unavailable
- All admin endpoints require authentication with admin role
- Session tokens expire after a configured period (check Supabase settings)
- The auth refresh mechanism automatically handles token renewal
