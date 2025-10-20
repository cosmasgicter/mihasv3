# Admin Pages Root Cause Analysis

## Issues Found

### 1. Users Page - prediction_results Error (400)
**Error**: `mylgegkqoddcrxtwcclb.supabase.co/rest/v1/prediction_results?select=accuracy:1 Failed to load resource: 400`

**Root Cause**: 
- `UserStats` component calls `useUserManagement` hook
- Hook queries `user_profiles` table which doesn't exist
- Should query `profiles` table instead
- Also, AIInsights page queries `prediction_results` table which doesn't exist

**Files Affected**:
- `/src/hooks/useUserManagement.ts` - queries `user_profiles` instead of `profiles`
- `/src/pages/admin/AIInsights.tsx` - queries `prediction_results` table

### 2. Users Page - 401 Error
**Error**: `users:1 Failed to load resource: 401`

**Root Cause**:
- Browser cache issue
- API endpoint works correctly (tested with curl - returns 200)
- Cache headers added but browser still has old cached responses

**Solution**: Hard refresh browser (Ctrl+Shift+R)

### 3. Programs Page - Shows "No Programs Yet"
**Error**: Programs page shows empty state despite API returning 4 programs

**Root Cause**:
- API endpoint works correctly (tested - returns 4 programs)
- Frontend uses Supabase direct queries
- Likely RLS policy issue or frontend query error

**Files Affected**:
- `/src/pages/admin/Programs.tsx` - uses Supabase direct queries

## Detailed Analysis

### useUserManagement Hook Issues

**Current Code** (WRONG):
```typescript
const getUserStats = useCallback(async (): Promise<UserStatsSummary | null> => {
  const { data, error } = await supabase
    .from('user_profiles')  // ❌ WRONG TABLE
    .select('role')
  // ...
}, [])

const bulkUpdateRoles = useCallback(async (userIds: string[], newRole: string) => {
  const { error } = await supabase
    .from('user_profiles')  // ❌ WRONG TABLE
    .update({ role: newRole })
  // ...
}, [])

const bulkDeleteUsers = useCallback(async (userIds: string[]) => {
  const { error } = await supabase
    .from('user_profiles')  // ❌ WRONG TABLE
    .delete()
  // ...
}, [])

const searchUsers = useCallback(async (query: string, role?: string) => {
  let queryBuilder = supabase
    .from('user_profiles')  // ❌ WRONG TABLE
    .select('*')
  // ...
}, [])
```

**Should Be**:
```typescript
.from('profiles')  // ✅ CORRECT TABLE
```

### AIInsights Page Issues

**Current Code** (WRONG):
```typescript
supabase.from('prediction_results').select('*', { count: 'exact', head: true })
supabase.from('prediction_results').select('accuracy')
```

**Issue**: `prediction_results` table doesn't exist in database

## Fix Priority

### HIGH PRIORITY (Breaks functionality)
1. ✅ Fix `useUserManagement.ts` - Change `user_profiles` to `profiles`
2. ⏳ Fix Programs page - Investigate why data not displaying
3. ⏳ Fix AIInsights - Remove or fix `prediction_results` queries

### MEDIUM PRIORITY (User experience)
1. ⏳ Add better error handling for missing tables
2. ⏳ Add loading states
3. ⏳ Improve cache busting

### LOW PRIORITY (Nice to have)
1. ⏳ Add retry logic for failed queries
2. ⏳ Add offline fallbacks

## Testing Checklist

After fixes:
- [ ] Users page loads without errors
- [ ] UserStats component displays correctly
- [ ] Programs page shows 4 programs
- [ ] No 400/401 errors in console
- [ ] AIInsights page doesn't break other pages
- [ ] Bulk operations work on Users page
- [ ] Search works on Users page

## Next Steps

1. Fix `useUserManagement.ts` table names
2. Test Users page
3. Investigate Programs page data loading
4. Fix or disable AIInsights queries
5. Deploy and test in browser
