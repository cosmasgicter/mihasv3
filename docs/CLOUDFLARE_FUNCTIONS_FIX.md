# Cloudflare Pages Functions Fix

## Issue
API endpoints returning HTML instead of JSON - functions not being routed correctly.

## Root Causes Found
1. ❌ Project name mismatch: `mihas` → `mihasv3`
2. ❌ Missing `_routes.json` for explicit function routing

## Fixes Applied

### 1. Updated wrangler.toml
```toml
# Before
name = "mihas"

# After
name = "mihasv3"
```

### 2. Created _routes.json
```json
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": []
}
```

This explicitly tells Cloudflare Pages to route `/api/*` requests to functions instead of static files.

## Deployment
- Commit: `5dd63a93c`
- Status: Pushed to GitHub
- Cloudflare: Rebuilding now

## Testing
Wait 3-4 minutes for deployment, then test:
```bash
curl -H "Authorization: Bearer <token>" \
  ***REMOVED***/api/auth-roles
```

Should return JSON, not HTML.

---
**Status**: ⏳ Deploying
**ETA**: 3-4 minutes
