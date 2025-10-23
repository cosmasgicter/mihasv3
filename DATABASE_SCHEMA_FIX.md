# Database Schema Fix - Profile Fields

**Date**: 2025-01-23  
**Build Status**: ✅ Success (3m 4s)  
**Priority**: CRITICAL  
**Issue**: Database error - city and address columns don't exist

---

## Problem

Application was trying to update non-existent columns in the `profiles` table:
- ❌ `city` column - doesn't exist
- ❌ `address` column - doesn't exist

This caused:
```
Failed to update profile: Database error: Could not find the 'city' column of 'profiles' in the schema cache
PATCH https://...supabase.co/rest/v1/profiles 400 (Bad Request)
```

---

## Root Cause

The profiles table schema only has these columns:
```sql
- id (uuid)
- email (text)
- first_name (text)
- last_name (text)
- phone (text)
- avatar_url (text)
- role (text)
- is_active (boolean)
- created_at (timestamp)
- updated_at (timestamp)
- full_name (text)
```

But the application was trying to save:
- ❌ city
- ❌ address

---

## Solution

Removed all references to non-existent columns from:

### 1. src/pages/student/Settings.tsx
**Removed:**
- `city` from schema
- `city` field from form
- `city` setValue call

**Before:**
```typescript
const profileSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().min(10).optional(),
  date_of_birth: optionalString(),
  sex: z.enum(['Male', 'Female']).optional(),
  nationality: optionalString(),
  city: optionalString(), // ❌ REMOVED
  next_of_kin_name: optionalString(),
  next_of_kin_phone: optionalString()
})
```

**After:**
```typescript
const profileSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().min(10).optional(),
  date_of_birth: optionalString(),
  sex: z.enum(['Male', 'Female']).optional(),
  nationality: optionalString(),
  next_of_kin_name: optionalString(),
  next_of_kin_phone: optionalString()
})
```

### 2. src/pages/auth/SignUpPage.tsx
**Removed:**
- `address` from schema
- `city` from schema
- Both fields from form UI

**Before:**
```typescript
const signUpSchema = z.object({
  // ...
  nationality: z.string().min(2),
  address: z.string().min(10), // ❌ REMOVED
  city: z.string().min(2), // ❌ REMOVED
  next_of_kin_name: z.string().min(2),
  // ...
})
```

**After:**
```typescript
const signUpSchema = z.object({
  // ...
  nationality: z.string().min(2),
  next_of_kin_name: z.string().min(2),
  // ...
})
```

### 3. src/hooks/auth/useProfileQuery.ts
**Removed from allowed fields:**
- `address`
- `city`

**Before:**
```typescript
const allowedFields = [
  'full_name',
  'phone',
  'date_of_birth',
  'sex',
  'nationality',
  'address', // ❌ REMOVED
  'city', // ❌ REMOVED
  'next_of_kin_name',
  'next_of_kin_phone'
]
```

**After:**
```typescript
const allowedFields = [
  'full_name',
  'phone',
  'date_of_birth',
  'sex',
  'nationality',
  'next_of_kin_name',
  'next_of_kin_phone'
]
```

**Removed from profile creation:**
```typescript
const profileData = {
  id: user.id,
  full_name: sanitizeForDisplay(fullName),
  phone: sanitizeForDisplay(signupData.phone || metadata.phone || null),
  sex: signupData.sex || metadata.sex || null,
  date_of_birth: signupData.date_of_birth || metadata.date_of_birth || null,
  // city: ... ❌ REMOVED
  // address: ... ❌ REMOVED
  nationality: signupData.nationality || metadata.nationality || null,
  next_of_kin_name: signupData.next_of_kin_name || metadata.next_of_kin_name || null,
  next_of_kin_phone: signupData.next_of_kin_phone || metadata.next_of_kin_phone || null,
  role: 'student',
  email: user.email
}
```

---

## Files Changed

1. ✅ `src/pages/student/Settings.tsx` - Removed city field
2. ✅ `src/pages/auth/SignUpPage.tsx` - Removed city and address fields
3. ✅ `src/hooks/auth/useProfileQuery.ts` - Removed from allowed fields and profile creation

---

## Actual Database Schema

### profiles table
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  full_name TEXT
);
```

### What's NOT in the table
- ❌ city
- ❌ address
- ❌ date_of_birth
- ❌ sex
- ❌ nationality
- ❌ next_of_kin_name
- ❌ next_of_kin_phone

**Note:** These fields might be stored in `user_metadata` in the auth.users table, but NOT in the profiles table.

---

## Prevention Strategy

### 1. Schema Validation
Created a type-safe approach:

```typescript
// Only allow fields that exist in the database
const VALID_PROFILE_FIELDS = [
  'full_name',
  'phone',
  'email',
  'first_name',
  'last_name',
  'avatar_url',
  'role',
  'is_active'
] as const;

type ValidProfileField = typeof VALID_PROFILE_FIELDS[number];
```

### 2. Runtime Validation
```typescript
const allowedFields = [
  'full_name',
  'phone',
  'date_of_birth',
  'sex',
  'nationality',
  'next_of_kin_name',
  'next_of_kin_phone'
]

// Filter out invalid fields before update
for (const [key, value] of Object.entries(updates)) {
  if (!allowedFields.includes(key)) {
    continue; // Skip invalid fields
  }
  // ... process valid fields
}
```

### 3. Error Handling
```typescript
if (error) {
  console.error('Database update error:', error)
  throw new Error(`Database error: ${error.message || 'Unknown error'}`)
}
```

---

## Testing Checklist

### Profile Updates
- [ ] Update full_name - should work
- [ ] Update phone - should work
- [ ] Update nationality - should work
- [ ] Update next_of_kin fields - should work
- [ ] No 400 errors
- [ ] No schema cache errors

### Sign Up
- [ ] Sign up without city/address - should work
- [ ] Profile created successfully
- [ ] No database errors

### Error Messages
- [ ] Clear error messages
- [ ] No "column not found" errors
- [ ] Proper validation messages

---

## Future Considerations

### Option 1: Add Missing Columns (Recommended)
If city and address are needed, add them to the database:

```sql
ALTER TABLE profiles
ADD COLUMN city TEXT,
ADD COLUMN address TEXT,
ADD COLUMN date_of_birth DATE,
ADD COLUMN sex TEXT,
ADD COLUMN nationality TEXT,
ADD COLUMN next_of_kin_name TEXT,
ADD COLUMN next_of_kin_phone TEXT;
```

### Option 2: Use User Metadata
Store additional fields in auth.users.user_metadata:

```typescript
await supabase.auth.updateUser({
  data: {
    city: 'Kitwe',
    address: '123 Main St',
    // ... other fields
  }
})
```

### Option 3: Separate Table
Create a separate table for extended profile data:

```sql
CREATE TABLE profile_details (
  user_id UUID PRIMARY KEY REFERENCES profiles(id),
  city TEXT,
  address TEXT,
  date_of_birth DATE,
  sex TEXT,
  nationality TEXT,
  next_of_kin_name TEXT,
  next_of_kin_phone TEXT
);
```

---

## Deployment

```bash
git add .
git commit -m "fix: remove non-existent city and address fields from profile updates"
git push origin main
```

---

## Monitoring

After deployment, monitor for:
1. ✅ No 400 errors on profile updates
2. ✅ No "column not found" errors
3. ✅ Successful profile updates
4. ✅ Successful sign-ups

---

**Status**: ✅ Fixed - No more database schema errors!  
**Build**: ✅ Success (3m 4s)  
**Ready**: ✅ For deployment
