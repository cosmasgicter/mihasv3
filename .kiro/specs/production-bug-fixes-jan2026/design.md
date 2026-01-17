# Design Document

## Overview

This design document provides the technical architecture and implementation details for fixing 14 production bugs in the MIHAS Application System. The fixes span database functions, frontend API calls, UI components, authentication performance, and component implementation correctness.

The system uses:
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS, Radix UI (shadcn)
- **Backend**: Supabase (PostgreSQL, Auth, Storage), Cloudflare Functions
- **State**: Zustand (client), React Query (server)

## Architecture

### Current State Analysis

```
┌─────────────────────────────────────────────────────────────────┐
│                     IDENTIFIED ISSUES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DATABASE LAYER                                                  │
│  ├── get_admin_dashboard_stats → references 'applications_new'  │
│  ├── get_admin_dashboard_overview → references 'applications_new'│
│  └── Actual table name: 'applications'                          │
│                                                                  │
│  API LAYER                                                       │
│  ├── dashboardPreloader.ts → calls 'get_dashboard_stats' (404)  │
│  ├── notifications query → uses 'read' column (should be is_read)│
│  └── functions/api/notifications.js → uses 'read' column        │
│                                                                  │
│  FRONTEND LAYER                                                  │
│  ├── Skip links → visible when should be hidden                 │
│  ├── Auth pages → informative text hidden on mobile             │
│  ├── Track application → old design                             │
│  ├── Applications list → missing draft status filter            │
│  ├── Approve/reject → React Error #321                          │
│  ├── Users page → "user not found" error                        │
│  └── Logout → slow performance                                  │
│                                                                  │
│  AUTH LAYER                                                      │
│  └── Supabase client → debug: true in production                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Target State Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FIXED ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DATABASE LAYER                                                  │
│  ├── get_admin_dashboard_stats → references 'applications'      │
│  ├── get_admin_dashboard_overview → references 'applications'   │
│  └── Correct counts: 25 total, 13 approved, 52% rate           │
│                                                                  │
│  API LAYER                                                       │
│  ├── dashboardPreloader.ts → calls 'get_admin_dashboard_stats'  │
│  ├── notifications query → uses 'is_read' column                │
│  └── functions/api/notifications.js → uses 'is_read' column     │
│                                                                  │
│  FRONTEND LAYER                                                  │
│  ├── Skip links → sr-only until focused                         │
│  ├── Auth pages → mobile-responsive informative text            │
│  ├── Track application → current design system                  │
│  ├── Applications list → includes draft status                  │
│  ├── Approve/reject → proper state management                   │
│  ├── Users page → queries profiles table correctly              │
│  └── Logout → non-blocking, <2s completion                      │
│                                                                  │
│  AUTH LAYER                                                      │
│  └── Supabase client → debug: false in production               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Database Function Fixes

**File**: Supabase Migration

```sql
-- Fix get_admin_dashboard_stats function
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS TABLE(
  total_applications bigint,
  draft_applications bigint,
  submitted_applications bigint,
  under_review_applications bigint,
  approved_applications bigint,
  rejected_applications bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'draft'),
    COUNT(*) FILTER (WHERE status = 'submitted'),
    COUNT(*) FILTER (WHERE status = 'under_review'),
    COUNT(*) FILTER (WHERE status = 'approved'),
    COUNT(*) FILTER (WHERE status = 'rejected')
  FROM applications;  -- Changed from applications_new
END;
$function$;
```

### 2. Notifications Column Fix

**Files to modify**:
- `src/services/dashboardPreloader.ts`
- `functions/api/notifications.js`

```typescript
// Before (incorrect)
.eq('read', false)

// After (correct)
.eq('is_read', false)
```

### 3. Supabase Client Debug Configuration

**File**: `src/lib/supabase.ts`

```typescript
// Current (always debug)
auth: {
  debug: true
}

// Fixed (environment-aware)
auth: {
  debug: import.meta.env.DEV
}
```

### 4. Skip Link Visibility Fix

**File**: `src/lib/accessibility-utils.ts`

The current implementation uses `transform -translate-y-full` which should work, but the issue is that multiple skip links are stacking incorrectly. The fix involves:

1. Ensuring only one skip link is rendered at a time
2. Using proper `sr-only` class until focused
3. Fixing the `focus:top-16` stacking issue

```typescript
export const skipLinkClasses = cn(
  'sr-only',  // Hidden by default
  'focus:not-sr-only',  // Visible on focus
  'fixed left-4 top-4 z-[9999]',
  'px-4 py-2',
  'bg-primary text-primary-foreground',
  'font-medium rounded-lg shadow-lg',
  'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
)
```

### 5. Mobile Auth Page Text Visibility

**File**: `src/components/auth/AuthLayout.tsx`

The branding panel is hidden on mobile (`hidden lg:flex`). Need to add a condensed mobile version:

```typescript
// Add mobile branding section in FormPanel
<div className="lg:hidden mb-6 p-4 rounded-xl bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-blue-800/10 border border-primary/20">
  <p className="text-sm text-muted-foreground">
    Access your personalized portal to monitor applications and stay connected with our admissions team.
  </p>
</div>
```

### 6. Dashboard Stats API Call Fix

**File**: `src/services/dashboardPreloader.ts`

```typescript
// Before (incorrect function name)
supabase.rpc('get_dashboard_stats')

// After (correct function name)
supabase.rpc('get_admin_dashboard_stats')
```

### 7. Applications List Draft Filter

**File**: `src/pages/admin/Applications.tsx` or `src/pages/admin/ApplicationsAdmin.tsx`

Ensure the status filter includes 'draft' and the query doesn't exclude drafts:

```typescript
// Query should include all statuses
const { data } = await supabase
  .from('applications')
  .select('*')
  .order('created_at', { ascending: false })
// No .neq('status', 'draft') filter
```

### 8. Approve/Reject React Error #321 Fix

React Error #321 occurs when updating state during render. The fix involves:

1. Moving state updates to useEffect or event handlers
2. Using proper async/await patterns
3. Avoiding setState calls in render phase

```typescript
// Pattern to avoid
const handleApprove = (id: string) => {
  setApplications(prev => prev.map(...)) // May cause #321 if called during render
}

// Fixed pattern
const handleApprove = useCallback(async (id: string) => {
  try {
    await supabase.from('applications').update({ status: 'approved' }).eq('id', id)
    // Invalidate query instead of direct state update
    queryClient.invalidateQueries(['applications'])
  } catch (error) {
    toast.error('Failed to approve application')
  }
}, [queryClient])
```

### 9. Users Page Fix

**File**: `src/pages/admin/Users.tsx`

Ensure querying the correct table (`profiles`) and handling empty states:

```typescript
const { data: users, isLoading, error } = useQuery({
  queryKey: ['users'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('profiles')  // Use profiles table
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data
  }
})
```

### 10. Logout Performance Fix

**File**: `src/contexts/AuthContext.tsx` and `src/hooks/auth/useSessionListener.ts`

```typescript
const signOut = useCallback(async () => {
  // Clear local state immediately (non-blocking)
  queryClient.clear()
  
  // Clear local storage
  localStorage.removeItem('mihas-auth-token')
  
  // Navigate immediately
  navigate('/auth/signin', { replace: true })
  
  // Fire and forget the API call
  supabase.auth.signOut().catch(() => {})
}, [queryClient, navigate])
```

## Data Models

### Applications Table (Existing)

```sql
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number VARCHAR UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  full_name VARCHAR,
  status VARCHAR DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'deleted')),
  -- ... other fields
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Notifications Table (Existing)

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  title VARCHAR,
  message TEXT,
  type VARCHAR DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,  -- Note: is_read, not read
  -- ... other fields
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Profiles Table (Existing)

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'admin', 'super_admin')),
  is_active BOOLEAN DEFAULT true,
  -- ... other fields
  created_at TIMESTAMPTZ DEFAULT now()
);
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties have been identified as testable across all valid inputs:

### Property 1: Approval Rate Calculation Correctness

*For any* set of applications with known approved count and total count, the approval rate SHALL equal (approved_count / total_count) * 100, rounded appropriately.

**Validates: Requirements 1.4**

This is a mathematical invariant property. Given any collection of applications:
- Let `approved` = count of applications where status = 'approved'
- Let `total` = count of all applications
- Then `approval_rate` = (approved / total) * 100

### Property 2: Application List Draft Inclusion

*For any* application with status='draft' in the database, that application SHALL appear in the unfiltered Application_List query results.

**Validates: Requirements 9.1**

This is a query completeness property. The application list query must not exclude any status, including drafts. For all applications A where A.status = 'draft':
- A ∈ ApplicationList.results

### Property 3: Activity and List Data Consistency

*For any* application that appears in the Recent Activity feed, that same application SHALL also appear in the Application_List when queried without status filters.

**Validates: Requirements 12.1**

This is a data consistency property. Both views must use the same underlying data source:
- ∀ app ∈ RecentActivity: app ∈ ApplicationList

## Error Handling

### Database Errors

| Error Type | Handling Strategy |
|------------|-------------------|
| Function not found (404) | Fix function name in code, add fallback query |
| Column not found (400) | Fix column name (is_read vs read) |
| Permission denied | Check user role, show appropriate message |
| Connection timeout | Retry with exponential backoff, show offline indicator |

### Frontend Errors

| Error Type | Handling Strategy |
|------------|-------------------|
| React Error #321 | Move state updates to useEffect/callbacks |
| Component unmount during async | Use cleanup functions, check mounted state |
| Query failure | Show error toast, provide retry option |
| Auth failure | Clear local state, redirect to login |

### Graceful Degradation

1. **Logout failure**: Clear local state immediately, fire-and-forget API call
2. **Dashboard stats failure**: Show cached data or placeholder values
3. **Notification fetch failure**: Show empty state, don't block UI

## Testing Strategy

### Dual Testing Approach

This implementation uses both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** (Vitest):
- Specific examples and edge cases
- Component rendering tests
- API response handling
- Error state handling

**Property-Based Tests** (fast-check):
- Universal properties across generated inputs
- Minimum 100 iterations per property
- Tag format: **Feature: production-bug-fixes-jan2026, Property {number}: {property_text}**

### Test Categories

#### 1. Database Function Tests
- Verify `get_admin_dashboard_stats` returns correct structure
- Verify `get_admin_dashboard_overview` returns correct structure
- Verify no 404 errors on RPC calls

#### 2. API Integration Tests
- Notifications query with `is_read` column
- Applications query includes all statuses
- Dashboard preloader uses correct function names

#### 3. Component Tests
- Skip link visibility states (hidden → focused → hidden)
- Auth layout mobile responsiveness
- Application list draft status display
- Users page data loading

#### 4. E2E Tests
- Approve/reject workflow without errors
- Logout completes within 2 seconds
- Dashboard displays correct statistics

### Property Test Configuration

```typescript
import * as fc from 'fast-check'

// Property 1: Approval Rate Calculation
// Feature: production-bug-fixes-jan2026, Property 1: Approval rate calculation correctness
test.prop([
  fc.integer({ min: 0, max: 1000 }), // approved count
  fc.integer({ min: 1, max: 1000 })  // total count (min 1 to avoid division by zero)
])('approval rate equals approved/total * 100', (approved, total) => {
  // Ensure approved <= total
  const actualApproved = Math.min(approved, total)
  const expectedRate = (actualApproved / total) * 100
  const calculatedRate = calculateApprovalRate(actualApproved, total)
  
  expect(calculatedRate).toBeCloseTo(expectedRate, 2)
})

// Property 2: Draft Inclusion
// Feature: production-bug-fixes-jan2026, Property 2: Application list draft inclusion
test.prop([
  fc.array(fc.record({
    id: fc.uuid(),
    status: fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected')
  }), { minLength: 1, maxLength: 100 })
])('all drafts appear in unfiltered list', (applications) => {
  const drafts = applications.filter(a => a.status === 'draft')
  const listResults = getApplicationList(applications) // No status filter
  
  drafts.forEach(draft => {
    expect(listResults.some(r => r.id === draft.id)).toBe(true)
  })
})

// Property 3: Activity/List Consistency
// Feature: production-bug-fixes-jan2026, Property 3: Activity and list data consistency
test.prop([
  fc.array(fc.record({
    id: fc.uuid(),
    status: fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected'),
    created_at: fc.date()
  }), { minLength: 1, maxLength: 100 })
])('activity items appear in application list', (applications) => {
  const recentActivity = getRecentActivity(applications)
  const applicationList = getApplicationList(applications)
  
  recentActivity.forEach(activityItem => {
    expect(applicationList.some(app => app.id === activityItem.id)).toBe(true)
  })
})
```

### Test File Structure

```
tests/
├── unit/
│   ├── approval-rate.test.ts
│   ├── skip-link.test.ts
│   └── logout-performance.test.ts
├── integration/
│   ├── dashboard-stats.test.ts
│   ├── notifications.test.ts
│   └── applications-list.test.ts
├── e2e/
│   ├── admin-approve-reject.spec.ts
│   ├── users-page.spec.ts
│   └── logout-flow.spec.ts
└── properties/
    ├── approval-rate.property.test.ts
    ├── draft-inclusion.property.test.ts
    └── activity-consistency.property.test.ts
```
