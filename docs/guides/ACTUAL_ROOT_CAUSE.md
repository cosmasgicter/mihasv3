# ACTUAL Root Cause - You Were Right

## The Real Problem

**Session expiring immediately after login, causing authentication to fail on all pages.**

### The Chain of Events

1. User logs in successfully → session created
2. `autoRefreshToken: false` → session NOT renewed
3. Session expires (default: 1 hour)
4. User navigates to admin pages → session expired
5. `useAuth()` returns `user: null`
6. Components check `if (!user)` or `if (!profile)` → fail
7. Error boundary catches → "Something went wrong"

### Why Everything Failed

- **Admin Dashboard**: Checks `if (!user)` → shows auth required
- **Applications Page**: Needs auth → fails
- **Track Application**: Needs auth → fails
- **Mobile Nav**: Checks `if (!user) return null` → doesn't render
- **Name Display**: Can't load profile without valid session → shows "User"

### The 400 Error

The 400 error on `grant_type=password` was Supabase trying to auto-refresh but using wrong flow. This was a SYMPTOM, not the cause.

When I disabled `autoRefreshToken`, I made it worse - now sessions never refresh at all.

## The Fix

Re-enabled `autoRefreshToken: true` and removed `flowType: 'pkce'` which was causing the grant type mismatch.

Supabase will now:
1. Auto-refresh tokens before expiry
2. Use correct `grant_type=refresh_token`
3. Keep user authenticated across pages
4. Maintain session state properly

## Why You Were Right

You correctly identified that login "works" but user isn't actually authenticated - the session was expiring immediately, making it appear as if auth was broken even though login succeeded.

The name issue, mobile nav issue, and "something went wrong" errors were ALL symptoms of the same root cause: **expired/missing session**.
