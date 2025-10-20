# Sign In Abort Error - Fixed

## Problem
Users experiencing "sign in aborted" errors during authentication.

## Root Cause
Custom fetch wrapper in `src/lib/supabase.ts` was adding AbortController with timeout:
- Auth requests: 30 second timeout
- Other requests: 8 second timeout

When network was slow or Supabase took longer to respond, the timeout would abort the request before completion, causing sign in to fail.

## Fix
Removed custom AbortController timeout logic from Supabase client configuration.

**Changed in**: `src/lib/supabase.ts`
- Removed timeout-based abort logic
- Let browser's native fetch handle timeouts
- Supabase client already has built-in retry and timeout handling

## Result
✅ Sign in requests no longer artificially aborted
✅ Supabase handles timeouts internally
✅ Better reliability for slow connections
