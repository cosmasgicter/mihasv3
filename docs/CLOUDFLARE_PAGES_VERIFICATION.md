# Cloudflare Pages API Verification Report

## Critical Issue Found ⚠️

### Problem
**New API endpoints created in wrong directory**

The migration created API endpoints in:
- ❌ `api-functions/` directory (WRONG - not used by Cloudflare Pages)

But Cloudflare Pages uses:
- ✅ `functions/` directory (CORRECT - this is what's deployed)

### Impact
**All 4 new API endpoints will NOT work in production:**
1. `api-functions/auth-roles.js` ❌
2. `api-functions/auth-sync-roles.js` ❌
3. `api-functions/admin-settings.js` ❌
4. `api-functions/notifications.js` ❌

### Root Cause
The project has TWO API directories:
1. `functions/` - Cloudflare Pages serverless functions (ACTIVE)
2. `api-functions/` - Legacy Netlify functions (UNUSED)

### Evidence
```toml
# wrangler.toml
pages_build_output_dir = "dist"
```

Cloudflare Pages automatically serves functions from `functions/` directory at `/api/*` routes.

### Current Working APIs
All existing APIs in `functions/` directory work correctly:
- `/api/admin/dashboard`
- `/api/admin/users`
- `/api/catalog/programs`
- `/api/catalog/intakes`
- etc.

## Required Fix

### Move New APIs to Correct Directory

**From**: `api-functions/`
**To**: `functions/api/`

### File Mapping
```
api-functions/auth-roles.js          → functions/api/auth-roles.js
api-functions/auth-sync-roles.js     → functions/api/auth-sync-roles.js
api-functions/admin-settings.js      → functions/api/admin-settings.js
api-functions/notifications.js       → functions/api/notifications.js
```

### URL Mapping
Cloudflare Pages will serve:
- `functions/api/auth-roles.js` → `/api/auth-roles`
- `functions/api/auth-sync-roles.js` → `/api/auth-sync-roles`
- `functions/api/admin-settings.js` → `/api/admin-settings`
- `functions/api/notifications.js` → `/api/notifications`

## Cloudflare Pages Function Structure

### Correct Structure
```
functions/
├── api/
│   ├── auth-roles.js          ← NEW
│   ├── auth-sync-roles.js     ← NEW
│   ├── admin-settings.js      ← NEW
│   └── notifications.js       ← NEW
├── admin/
│   ├── dashboard.js           ← EXISTING
│   └── users.js               ← EXISTING
├── catalog/
│   ├── programs.js            ← EXISTING
│   └── intakes.js             ← EXISTING
└── _middleware.js
```

### URL Routes
```
/api/auth-roles          → functions/api/auth-roles.js
/api/auth-sync-roles     → functions/api/auth-sync-roles.js
/api/admin-settings      → functions/api/admin-settings.js
/api/notifications       → functions/api/notifications.js
/api/admin/dashboard     → functions/admin/dashboard.js
/api/admin/users         → functions/admin/users.js
/api/catalog/programs    → functions/catalog/programs.js
/api/catalog/intakes     → functions/catalog/intakes.js
```

## Source Code Verification

### API Client Calls (Correct)
```typescript
// src/lib/api/authApi.ts
fetch(`${getApiBaseUrl()}/api/auth-roles`)        ✅ Correct URL
fetch(`${getApiBaseUrl()}/api/auth-sync-roles`)   ✅ Correct URL

// src/lib/api/adminApi.ts
fetch(`${getApiBaseUrl()}/api/admin-settings`)    ✅ Correct URL
fetch(`${getApiBaseUrl()}/api/notifications`)     ✅ Correct URL
```

### API Config (Correct)
```typescript
// src/lib/apiConfig.ts
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin  // Same-origin calls ✅
  }
  return 'https://apply.mihas.edu.zm'
}
```

### Environment Variables (Correct)
```toml
# wrangler.toml
VITE_SUPABASE_URL = "https://mylgegkqoddcrxtwcclb.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJ..."  ✅ Available to functions
```

## Function Handler Format

### Current Format (Correct for Cloudflare)
```javascript
// Cloudflare Pages format
exports.handler = async (event) => {
  // event.httpMethod
  // event.headers
  // event.body
  return {
    statusCode: 200,
    headers: { ... },
    body: JSON.stringify({ ... })
  }
}
```

This is compatible with both Netlify and Cloudflare Pages ✅

## Deployment Process

### Cloudflare Pages Deployment
1. Push to GitHub main branch
2. Cloudflare auto-builds: `npm run build:prod`
3. Cloudflare deploys: `dist/` (static) + `functions/` (serverless)
4. Functions available at: `https://apply.mihas.edu.zm/api/*`

### What Gets Deployed
- ✅ `dist/` → Static React app
- ✅ `functions/` → Serverless functions
- ❌ `api-functions/` → NOT deployed (ignored)

## Testing After Fix

### Local Testing
```bash
# Build and test locally
npm run build:prod
wrangler pages dev dist

# Test endpoints
curl http://localhost:8788/api/auth-roles
curl http://localhost:8788/api/admin-settings
curl http://localhost:8788/api/notifications
```

### Production Testing
```bash
# After deployment
curl -H "Authorization: Bearer <token>" \
  https://apply.mihas.edu.zm/api/auth-roles

curl -H "Authorization: Bearer <token>" \
  https://apply.mihas.edu.zm/api/admin-settings

curl -H "Authorization: Bearer <token>" \
  https://apply.mihas.edu.zm/api/notifications
```

## Action Required

### Immediate Steps
1. ✅ Move 4 new API files from `api-functions/` to `functions/api/`
2. ✅ Verify file structure matches Cloudflare Pages convention
3. ✅ Test locally with `wrangler pages dev`
4. ✅ Deploy to production
5. ✅ Test all endpoints in production

### Cleanup (Optional)
- Consider removing `api-functions/` directory entirely
- It's legacy from Netlify migration and causes confusion

## Conclusion

### Current Status
- ❌ New APIs in wrong directory
- ❌ Will not work in production
- ✅ Source code calls correct URLs
- ✅ Function format is correct
- ✅ Environment variables configured

### After Fix
- ✅ All APIs in correct directory
- ✅ Will work in production
- ✅ Cloudflare Pages will serve them correctly
- ✅ Migration will be complete

---

**Priority**: 🔴 CRITICAL
**Action**: Move files immediately before deployment
**Risk**: High - APIs will not work without this fix
