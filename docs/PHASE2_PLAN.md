# Phase 2: High Priority Optimizations - Implementation Plan

**Timeline:** Week 2  
**Focus:** Virtual scrolling, lazy loading, query optimization  
**Expected Impact:** 40% faster initial load, 200KB bundle reduction

---

## 🎯 Tasks

### 1. Virtual Scrolling for Large Lists
**Priority:** HIGH  
**Effort:** Medium  
**Impact:** 70% faster rendering for 100+ items

**Files to Update:**
- `src/pages/admin/Applications.tsx`
- `src/pages/admin/Users.tsx`
- `src/components/admin/ApplicationsList.tsx`

**Implementation:**
```bash
npm install @tanstack/react-virtual
```

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

const parentRef = useRef<HTMLDivElement>(null)
const virtualizer = useVirtualizer({
  count: applications.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 80,
  overscan: 5
})
```

---

### 2. Lazy Load Heavy Components
**Priority:** HIGH  
**Effort:** Low  
**Impact:** 40% faster initial load

**Components to Lazy Load:**
```typescript
// src/App.tsx
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const EnhancedDashboard = lazy(() => import('@/components/admin/EnhancedDashboard'))
const PredictiveDashboard = lazy(() => import('@/components/admin/PredictiveDashboard'))
const ApplicationWizard = lazy(() => import('@/pages/student/applicationWizard'))
const ApplicationsList = lazy(() => import('@/components/admin/ApplicationsList'))
```

---

### 3. Optimize Supabase Queries
**Priority:** HIGH  
**Effort:** Medium  
**Impact:** 50% faster data fetching

**Pattern to Apply:**
```typescript
// ❌ Before
const { data } = await supabase.from('applications').select('*')

// ✅ After
const { data } = await supabase
  .from('applications')
  .select('id, application_number, status, created_at, user_id')
  .order('created_at', { ascending: false })
  .limit(50)
```

**Files to Update:**
- `src/services/applications.ts`
- `src/services/profiles.ts`
- `src/hooks/useApplications.ts`
- `src/hooks/useNotifications.ts`

---

### 4. Add Request Deduplication
**Priority:** MEDIUM  
**Effort:** Low  
**Impact:** Prevent duplicate API calls

**Implementation:**
```typescript
// src/lib/queryClient.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      // ADD:
      networkMode: 'offlineFirst',
      refetchOnReconnect: true,
    },
  },
})
```

---

## 📋 Implementation Checklist

### Virtual Scrolling
- [ ] Install `@tanstack/react-virtual`
- [ ] Update `Applications.tsx` with virtualizer
- [ ] Update `Users.tsx` with virtualizer
- [ ] Test scrolling performance with 100+ items
- [ ] Verify keyboard navigation works

### Lazy Loading
- [ ] Wrap admin routes with `lazy()`
- [ ] Wrap heavy components with `lazy()`
- [ ] Add `<Suspense>` with loading fallback
- [ ] Test route transitions
- [ ] Verify code splitting in build

### Query Optimization
- [ ] Audit all `.select('*')` calls
- [ ] Add specific column selection
- [ ] Add `.limit()` to list queries
- [ ] Add `.order()` for consistent sorting
- [ ] Test data integrity

### Request Deduplication
- [ ] Update React Query config
- [ ] Test offline behavior
- [ ] Verify no duplicate requests in Network tab

---

## 🧪 Testing

### Performance Testing
```bash
# Build and measure
npm run build:prod
npm run preview

# Run Lighthouse
npx lighthouse http://localhost:4173 --view
```

### Expected Metrics
- **FCP:** < 1.5s (currently ~2.5s)
- **LCP:** < 2.5s (currently ~4.0s)
- **TTI:** < 3.5s (currently ~5.5s)
- **Bundle Size:** -200KB initial chunk

---

## 📊 Success Criteria

- [ ] Initial bundle < 300KB (currently ~500KB)
- [ ] Admin applications list renders in < 100ms
- [ ] No duplicate API requests in Network tab
- [ ] Lighthouse score > 85 (currently ~70)
- [ ] All features work as before

---

## 🚀 Deployment

1. Complete all checklist items
2. Run full test suite: `npm run test`
3. Build production: `npm run build:prod`
4. Test locally: `npm run preview`
5. Deploy to Netlify
6. Monitor performance in production

---

## 📝 Notes

- Virtual scrolling requires fixed-height items
- Lazy loading adds slight delay on first route visit
- Query optimization may require schema changes
- Test thoroughly on mobile devices
