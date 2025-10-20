# Admin Pages "Something Went Wrong" - Root Cause Analysis

## Symptoms
- "Something went wrong, please refresh" error on admin pages
- Affects: Dashboard, Applications, Track Application
- Error caught by ErrorBoundary component

## Root Cause Investigation

### 1. Error Boundary Trigger
Error is caught by one of these components:
- `src/components/ui/SimpleErrorBoundary.tsx`
- `src/components/ui/ErrorBoundary.tsx`
- `src/components/ErrorBoundary.tsx`

### 2. Admin Dashboard Flow
```
AdminDashboard.tsx
  → adminDashboardService.getMetrics()
    → apiClient.request('/admin/dashboard')
      → functions/admin/dashboard.js
        → getUserFromRequest(headers, { requireAdmin: true })
          → processProfile()
            → resolveRoles()
```

### 3. Potential Failure Points

#### A. Profile Missing/Incomplete
- User authenticated but no profile in database
- Profile exists but missing `role` field
- Profile `role` is null or invalid

#### B. Role Resolution Failure
- `resolveRoles()` function throwing unhandled error
- Database query failing
- Role cache issues

#### C. Admin Check Failure
- `isAdmin` check failing
- `ADMIN_ROLES` set not including user's role
- Role mismatch between JWT and database

#### D. API Response Issues
- Function returning error but frontend not handling it
- Network timeout
- CORS issues
- Response parsing failure

### 4. Most Likely Cause

**Profile Role Issues**:
- Admin user (cosmas@beanola.com) may not have `role='admin'` in profiles table
- Or role is set but not in `ADMIN_ROLES` set
- Function returns `{ error: 'Access denied' }` but frontend throws instead of showing error

## Verification Steps

1. Check admin user profile:
```sql
SELECT id, email, role FROM profiles WHERE email = 'cosmas@beanola.com';
```

2. Check ADMIN_ROLES set in supabaseClient.js

3. Test admin dashboard endpoint directly with token

4. Check browser console for actual error message

5. Check Cloudflare Functions logs for server-side errors

## Fix Strategy

1. **Immediate**: Add better error handling in admin pages
2. **Short-term**: Verify admin role is set correctly
3. **Long-term**: Add fallback UI instead of error boundary
