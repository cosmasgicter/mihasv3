# Signup Error Fix - Database Error 500

## Issue
**Error**: `Database error saving new user` - POST to `/auth/v1/signup` returns 500 Internal Server Error

## Root Cause
The `handle_new_user()` trigger function that creates a profile when a new user signs up is either:
1. Missing from the database
2. Has incorrect column mappings
3. Failing due to constraint violations

## Solution

### Migration Created
File: `supabase/migrations/20250123_fix_signup_trigger.sql`

This migration:
1. Drops and recreates the `handle_new_user()` function
2. Maps all signup fields from `raw_user_meta_data` to profile columns:
   - full_name
   - first_name
   - last_name
   - phone
   - date_of_birth
   - sex
   - residence_town
   - nationality
   - next_of_kin_name
   - next_of_kin_phone
3. Uses `ON CONFLICT (id) DO NOTHING` to prevent duplicate errors
4. Sets proper security with `SECURITY DEFINER`
5. Grants execute permissions to authenticated and anon users

### Manual Application Required

Since Supabase MCP is not connected, apply this migration manually:

**Option 1: Supabase Dashboard**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to SQL Editor
4. Copy contents of `supabase/migrations/20250123_fix_signup_trigger.sql`
5. Execute the SQL

**Option 2: Direct Database Connection**
```bash
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  -f supabase/migrations/20250123_fix_signup_trigger.sql
```

**Option 3: Supabase CLI (if configured)**
```bash
npx supabase db push
```

## Verification

After applying the migration, test signup:

1. Go to signup page
2. Fill in all required fields:
   - Email
   - Password
   - Full Name
   - Phone
   - Date of Birth
   - Sex
   - City/Town (residence_town)
   - Nationality
   - Next of Kin Name
   - Next of Kin Phone
3. Submit form
4. Should succeed without 500 error

## Expected Behavior

When a user signs up:
1. Auth user is created in `auth.users`
2. Trigger `on_auth_user_created` fires
3. Function `handle_new_user()` executes
4. Profile is created in `public.profiles` with all metadata
5. User receives confirmation email
6. Signup completes successfully

## Troubleshooting

If error persists after migration:

1. **Check trigger exists**:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

2. **Check function exists**:
```sql
SELECT proname FROM pg_proc WHERE proname = 'handle_new_user';
```

3. **Test function manually**:
```sql
-- Simulate a signup
SELECT handle_new_user();
```

4. **Check profiles table structure**:
```sql
\d public.profiles
```

5. **Check for constraint violations**:
```sql
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'profiles';
```

## Related Files
- `supabase/migrations/20250123_fix_signup_trigger.sql` - New migration
- `supabase/migrations/20250123_fix_auth_signup.sql` - Previous attempt (has issues)
- `src/pages/auth/SignUpPage.tsx` - Signup form
- `src/contexts/AuthContext.tsx` - Auth logic

## Status
⚠️ **MIGRATION CREATED - MANUAL APPLICATION REQUIRED**

The migration file has been created but needs to be applied manually to the production database via Supabase Dashboard or CLI.
