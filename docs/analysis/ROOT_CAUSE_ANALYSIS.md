# Root Cause Analysis - 405 Errors

## Critical Finding: Mixed Function Formats

### The Problem
**Two different function export formats in the same codebase:**

1. **Cloudflare Pages format** (Working):
   ```javascript
   export async function onRequest(context) { }
   export async function onRequestGet(context) { }
   export async function onRequestPost(context) { }
   ```

2. **Netlify format** (NOT Working on Cloudflare):
   ```javascript
   exports.handler = async (event) => { }
   ```

### Files Using WRONG Format (Netlify)
Located in `functions/api/`:
- ❌ `auth-roles.js` - `exports.handler`
- ❌ `auth-sync-roles.js` - `exports.handler`
- ❌ `admin-settings.js` - `exports.handler`
- ❌ `notifications.js` - `exports.handler`

### Files Using CORRECT Format (Cloudflare)
All other functions:
- ✅ `health.js` - `export async function onRequestGet()`
- ✅ `catalog/programs.js` - `export async function onRequestGet()`
- ✅ `analytics/telemetry.js` - `export async function onRequest()`
- ✅ `sessions/track.js` - `export async function onRequestPost()`

## Why This Causes 405 Errors

### Cloudflare Pages Routing
Cloudflare Pages expects:
- `export async function onRequest()` - Handles ALL methods
- `export async function onRequestGet()` - Handles GET only
- `export async function onRequestPost()` - Handles POST only
- etc.

### What Happens with `exports.handler`
1. Cloudflare Pages doesn't recognize `exports.handler`
2. Function is ignored/not loaded
3. Request falls through to static files
4. Returns HTML (index.html) with 200 status
5. OR returns 405 if route doesn't match static files

## Evidence from Logs

### Browser Console Errors
```
/sessions/track:1  Failed to load resource: 405
/api/auth-roles:1  Failed to load resource: net::ERR_FAILED
/analytics/telemetry:1  Failed to load resource: 405
```

### What's Actually Happening
- `/sessions/track` - Works (uses `onRequestPost`)
- `/api/auth-roles` - Fails (uses `exports.handler`)
- `/analytics/telemetry` - Works (uses `onRequest`)

## _routes.json Issue

### Current Configuration
```json
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": []
}
```

### Problem
Only includes `/api/*` but:
- `/sessions/track` is NOT under `/api/`
- `/analytics/telemetry` is NOT under `/api/`
- These should also be included OR use wildcard

### Should Be
```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/assets/*", "/images/*", "/*.html", "/*.js", "/*.css"]
}
```

## Why It Worked Before

### Previous State
All functions were using Cloudflare Pages format (`export async function onRequest`)

### What Changed
During API migration (commit 9c6511cf8):
- Created 4 new functions in `functions/api/`
- Used Netlify format (`exports.handler`)
- These never worked on Cloudflare Pages
- Other endpoints continued working because they use correct format

## Session Tracking 405

### Root Cause
`sessions/track.js` uses correct format but:
1. Import statement uses ES6 modules
2. May have dependency issues
3. Not included in `_routes.json`

### The Fix Applied
Disabled session tracking in `useSessionListener.ts` (commit 81bf46c46)
- This was a workaround, not a fix
- Session tracking should work if properly configured

## Summary

### Root Causes Found
1. ❌ **4 new API functions use wrong export format** (Netlify instead of Cloudflare)
2. ❌ **_routes.json only includes /api/*** (missing other function routes)
3. ❌ **Mixed module formats** (CommonJS vs ES6)

### Why Functions Return HTML
- Cloudflare Pages doesn't recognize `exports.handler`
- Request falls through to static file serving
- Returns `index.html` (React app)

### Why 405 Errors
- Some functions work (correct format)
- Some functions don't exist (wrong format)
- Browser gets 405 when trying to call non-existent functions

## Fix Required

### Step 1: Convert Function Format
Change all 4 files in `functions/api/` from:
```javascript
exports.handler = async (event) => { }
```

To:
```javascript
export async function onRequest(context) { }
```

### Step 2: Update _routes.json
```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": [
    "/assets/*",
    "/images/*", 
    "/*.html",
    "/*.css",
    "/*.js",
    "/*.json",
    "/*.ico",
    "/*.png",
    "/*.jpg",
    "/*.svg",
    "/*.woff*",
    "/*.ttf"
  ]
}
```

### Step 3: Fix Module Imports
Ensure all functions use ES6 modules consistently.

---

**Status**: Root cause identified
**Next**: Create systematic fix plan
