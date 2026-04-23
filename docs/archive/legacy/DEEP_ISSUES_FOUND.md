# Deep Issues Found - Database & Code Analysis

**Date**: 2025-01-23  
**Analysis**: Supabase Database + Code Review  
**Status**: 🚨 CRITICAL ISSUES FOUND

---

## 🚨 CRITICAL ISSUE #1: Duplicate Role Entries

### Problem:
Multiple users have **DUPLICATE ROLES** in `user_roles` table:

| User | Email | Role Count | Roles |
|------|-------|------------|-------|
| cosmas@beanola.com | fc6a1536... | **5** | 4x super_admin, 1x admin |
| ***REMOVED*** | 03b946d8... | **2** | admin, student |
| Unknown | f9b1eede... | **2** | admin, student |
| Unknown | c267debc... | **2** | admin, student |

### Impact:
- `.maybeSingle()` returns **random role** from duplicates
- Unpredictable admin access
- Role checks inconsistent across sessions

### Root Cause:
No unique constraint on `user_roles(user_id)` - allows multiple role entries per user.

---

## 🚨 CRITICAL ISSUE #2: Role Mismatch Between Tables

### Problem:
`profiles.role` and `user_roles.role` **DON'T MATCH**:

| User | profiles.role | user_roles.role | Status |
|------|---------------|-----------------|--------|
| ***REMOVED*** | **student** | **admin** | ❌ MISMATCH |

### Impact:
- `AuthContext` checks `profiles.role` → returns "student"
- `useRoleQuery` checks `user_roles.role` → returns "admin"
- Different parts of app see different roles!

### Root Cause:
No sync mechanism between `profiles.role` and `user_roles.role`.

---

## 🚨 CRITICAL ISSUE #3: Unpredictable Role Query

### Problem:
`useRoleQuery` uses `.maybeSingle()`:

```typescript
const { data: roleData } = await supabase
  .from('user_roles')
  .select('*')
  .eq('user_id', user.id)
  .eq('is_active', true)
  .maybeSingle()  // ❌ Returns random row when duplicates exist!
```

When user has 5 role entries, `.maybeSingle()` returns **any one** of them unpredictably.

### Impact:
- User might be admin in one session, not admin in another
- Navigation switches randomly
- Permissions inconsistent

---

## ⚠️ ISSUE #4: No Unique Constraints

### Problem:
`user_roles` table allows multiple rows per user:

```sql
-- Current: No constraint
INSERT INTO user_roles (user_id, role) VALUES ('user-id', 'admin');
INSERT INTO user_roles (user_id, role) VALUES ('user-id', 'student'); -- ✅ Allowed!
INSERT INTO user_roles (user_id, role) VALUES ('user-id', 'admin'); -- ✅ Allowed!
```

### Impact:
- Duplicate roles accumulate over time
- Database integrity compromised
- Query performance degraded

---

## ✅ SOLUTIONS

### Solution #1: Clean Up Duplicate Roles

```sql
-- Step 1: Find the "best" role for each user (keep highest privilege)
WITH ranked_roles AS (
  SELECT 
    id,
    user_id,
    role,
    ROW_NUMBER() OVER (
      PARTITION BY user_id 
      ORDER BY 
        CASE role
          WHEN 'super_admin' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'student' THEN 3
          ELSE 4
        END,
        created_at DESC
    ) as rn
  FROM user_roles
)
-- Step 2: Delete all except the best role
DELETE FROM user_roles
WHERE id IN (
  SELECT id FROM ranked_roles WHERE rn > 1
);

-- Step 3: Add unique constraint
ALTER TABLE user_roles
ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);
```

### Solution #2: Sync profiles.role with user_roles.role

```sql
-- Update profiles to match user_roles
UPDATE profiles p
SET role = ur.role
FROM user_roles ur
WHERE p.id = ur.user_id
  AND p.role != ur.role;
```

### Solution #3: Fix useRoleQuery to Handle Duplicates

```typescript
// Change from .maybeSingle() to .order().limit(1)
const { data: roleData } = await supabase
  .from('user_roles')
  .select('*')
  .eq('user_id', user.id)
  .eq('is_active', true)
  .order('created_at', { ascending: false })  // Get most recent
  .limit(1)
  .single()  // Expect exactly one
```

### Solution #4: Add Database Trigger for Role Sync

```sql
-- Create function to sync role changes
CREATE OR REPLACE FUNCTION sync_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  -- When user_roles changes, update profiles
  UPDATE profiles
  SET role = NEW.role, updated_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER sync_role_on_user_roles_change
AFTER INSERT OR UPDATE OF role ON user_roles
FOR EACH ROW
EXECUTE FUNCTION sync_profile_role();
```

### Solution #5: Use Single Source of Truth

**Option A: Use profiles.role only**
```typescript
// Remove user_roles queries, use profiles everywhere
const { data } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single()
```

**Option B: Use user_roles only**
```typescript
// Remove profiles.role column, use user_roles everywhere
// Add unique constraint on user_roles(user_id)
```

---

## 📊 Impact Analysis

### Current State:
- ❌ 4 users with duplicate roles
- ❌ 1 user with role mismatch
- ❌ Unpredictable role queries
- ❌ No data integrity constraints

### After Fix:
- ✅ One role per user
- ✅ Consistent role across tables
- ✅ Predictable role queries
- ✅ Database constraints enforced

---

## 🎯 Recommended Action Plan

### Immediate (Do Now):
1. **Clean duplicate roles** - Run Solution #1
2. **Sync role mismatches** - Run Solution #2
3. **Fix useRoleQuery** - Implement Solution #3

### Short Term (This Week):
4. **Add database trigger** - Implement Solution #4
5. **Add monitoring** - Alert on duplicate roles

### Long Term (Next Sprint):
6. **Consolidate to single source** - Choose Option A or B from Solution #5
7. **Add role audit log** - Track all role changes
8. **Add role validation** - Prevent invalid roles

---

## 🔍 How to Verify Fix

### Test 1: Check for Duplicates
```sql
SELECT user_id, COUNT(*) 
FROM user_roles 
GROUP BY user_id 
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

### Test 2: Check Role Consistency
```sql
SELECT p.email, p.role as profile_role, ur.role as user_role
FROM profiles p
JOIN user_roles ur ON p.id = ur.user_id
WHERE p.role != ur.role;
-- Should return 0 rows
```

### Test 3: Test Role Query
```typescript
const { isAdmin } = useAuth()
console.log('isAdmin:', isAdmin)
// Should be consistent across page refreshes
```

---

## 🚨 Why This Was Missed

1. **No database constraints** - Duplicates allowed
2. **No validation** - Bad data inserted without errors
3. **Silent failures** - `.maybeSingle()` doesn't error on duplicates
4. **Multiple sources** - Two tables storing same data
5. **No monitoring** - No alerts on data inconsistency

---

**Status**: 🚨 CRITICAL - Fix Immediately  
**Priority**: P0 - Blocks production deployment  
**Estimated Fix Time**: 30 minutes

---

**Prepared by**: Amazon Q Developer  
**Last Updated**: 2025-01-23  
**Version**: 3.0 (Deep Database Analysis)
