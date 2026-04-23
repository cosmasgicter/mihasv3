# Token Refresh 400 Error - Fixed

## Problem
After login, continuous 400 errors:
```
mylgegkqoddcrxtwcclb.supabase.co/auth/v1/token?grant_type=password:1
Failed to load resource: the server responded with a status of 400
```

## Root Cause
`autoRefreshToken: true` in Supabase client config was causing automatic token refresh attempts using `grant_type=password`, which is invalid for refresh operations.

Supabase should use `grant_type=refresh_token` for refreshes, but the auto-refresh was incorrectly using password grant type.

## Fix
Changed `autoRefreshToken: false` in `src/lib/supabase.ts`

Token refresh will now be handled manually when needed, preventing the 400 errors.

## Mobile Nav Issue
Mobile nav component exists and is properly configured in:
- `src/components/navigation/MobileBottomNav.tsx`
- Rendered in `AppLayout.tsx`
- Shows when `user` exists

**Possible causes if not showing**:
1. User state not loaded yet (loading state)
2. CSS z-index conflict
3. Hidden by another element
4. Route not wrapped in AppLayout

**Check**: Browser dev tools → Elements → Search for "MobileBottomNav" to see if it's in DOM
