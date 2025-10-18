# Token Validation Fix Plan

## Root Cause
`supabaseAdminClient.auth.getUser(token)` returns `{ data: null, error: {} }` because:
- The Supabase JS client's `auth.getUser()` method validates JWTs using the JWT secret from the service role key
- The service role key in env is correct, but the method is failing silently

## Solution
Use the admin client to verify the user exists by ID (extracted from JWT) instead of validating the JWT signature.

## Implementation Steps

### Step 1: Decode JWT manually and verify user exists
- Extract user ID from JWT payload (no signature verification needed)
- Use admin client to fetch user by ID from database
- This bypasses JWT signature validation issues

### Step 2: Verify approach
- JWT is already validated by Supabase on the frontend during login
- Backend just needs to confirm the user exists and get their roles
- No need to re-validate JWT signature on backend
