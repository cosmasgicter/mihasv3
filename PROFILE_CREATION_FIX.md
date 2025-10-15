# Profile Creation Fix

## Issue
Users were getting 401 errors after registration because their profile wasn't being created in the `profiles` table, even though they were successfully registered in Supabase Auth.

## Root Cause
The registration endpoint (`api/auth/register.js`) was creating users in Supabase Auth but not creating corresponding profiles in the `profiles` table.

## Solution

### 1. Updated Registration Endpoint
Modified `api/auth/register.js` to automatically create a profile after user registration:

```javascript
// Create profile for the new user
const nameParts = fullName.split(' ')
const firstName = nameParts[0] || ''
const lastName = nameParts.slice(1).join(' ') || ''

const { error: profileError } = await supabaseAdminClient
  .from('profiles')
  .insert({
    id: data.user.id,
    email: data.user.email,
    first_name: firstName,
    last_name: lastName,
    role: 'student'
  })
```

### 2. Enhanced getUserFromRequest Function
Updated `api/_lib/supabaseClient.js` to automatically create missing profiles:

- Changed `.single()` to `.maybeSingle()` to handle missing profiles gracefully
- Added automatic profile creation when a user exists in Auth but not in profiles table
- Extracts user data from JWT payload to create the profile
- Refactored profile processing into a separate `processProfile` function

## Benefits
1. **Automatic Recovery**: If a profile is missing, it's automatically created on the next API call
2. **Better Error Handling**: Uses `maybeSingle()` instead of `single()` to avoid errors
3. **Backward Compatibility**: Works with existing users who may have missing profiles
4. **Future-Proof**: All new registrations will have profiles created automatically

## Testing
Run the application and try:
1. Register a new user - profile should be created automatically
2. Login with existing user - if profile is missing, it will be created on first API call
3. Access student dashboard - should work without 401 errors

## Files Modified
- `api/auth/register.js` - Added profile creation after user registration
- `api/_lib/supabaseClient.js` - Enhanced getUserFromRequest with auto-profile creation
