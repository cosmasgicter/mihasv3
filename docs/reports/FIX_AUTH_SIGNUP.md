# Fix Auth Signup Error (500)

## Problem
```
mylgegkqoddcrxtwcclb.supabase.co/auth/v1/signup:1 Failed to load resource: the server responded with a status of 500 ()
Database error saving new user
```

## Root Cause
Missing trigger to automatically create profile when user signs up. Auth creates user in `auth.users` but profile is not created in `public.profiles`.

## Solution
Apply migration: `supabase/migrations/20250123_fix_auth_signup.sql`

---

## Quick Fix (Apply Now)

### Step 1: Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project: `mylgegkqoddcrxtwcclb`
3. Navigate to **SQL Editor**

### Step 2: Run Migration
Copy and paste the entire contents of:
```
supabase/migrations/20250123_fix_auth_signup.sql
```

Click **Run** or press `Ctrl+Enter`

### Step 3: Verify
You should see output like:
```
NOTICE: All users have profiles
NOTICE: ========================================
NOTICE: Auth Signup Fix Applied Successfully
NOTICE: ========================================
NOTICE: Total users: X
NOTICE: Total profiles: X
NOTICE: SUCCESS: All users have profiles
```

---

## What This Migration Does

1. **Creates `handle_new_user()` function**
   - Automatically creates profile when user signs up
   - Sets default role to 'student'
   - Handles errors gracefully

2. **Creates trigger on `auth.users`**
   - Fires after INSERT
   - Calls `handle_new_user()` function

3. **Ensures profiles table structure**
   - Adds missing columns if needed
   - Creates unique index on email

4. **Adds RLS policies**
   - Users can view/update own profile
   - Admins can view all profiles
   - Service role has full access

5. **Backfills missing profiles**
   - Creates profiles for existing users without one

---

## Test After Applying

1. Try signing up a new user
2. Should succeed without 500 error
3. Check that profile is created automatically

### Test Signup
```bash
# In browser console or Postman
POST https://mylgegkqoddcrxtwcclb.supabase.co/auth/v1/signup
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "TestPassword123!",
  "data": {
    "full_name": "Test User"
  }
}
```

Should return 200 OK with user data.

---

## Verify Profile Created

```sql
-- In Supabase SQL Editor
SELECT 
  u.id,
  u.email as auth_email,
  p.email as profile_email,
  p.full_name,
  p.role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
ORDER BY u.created_at DESC
LIMIT 10;
```

All users should have matching profiles.

---

## If Still Getting Errors

### Check trigger exists:
```sql
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
```

Should return 1 row.

### Check function exists:
```sql
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'handle_new_user';
```

Should return 1 row.

### Manual profile creation:
```sql
-- If trigger fails, manually create profile
INSERT INTO public.profiles (id, email, full_name, role)
VALUES (
  '[user-id-from-auth-users]',
  'user@example.com',
  'User Name',
  'student'
);
```

---

## Prevention

This migration ensures:
- ✅ All new signups automatically get profiles
- ✅ Existing users without profiles get them backfilled
- ✅ RLS policies protect profile data
- ✅ Errors are logged but don't break signup

---

**Status:** Ready to apply  
**Priority:** CRITICAL  
**Estimated Time:** 2 minutes  
**Downtime:** None (non-blocking)
