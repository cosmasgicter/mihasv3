# Performance Optimization Plan - MIHAS V3

## Executive Summary
Comprehensive analysis reveals 916MB node_modules, 292 console statements, and optimization opportunities across frontend, backend, and database layers.

---

## 🔴 CRITICAL - Immediate Impact (Week 1)

### 1. Remove Console Statements (292 found)
**Impact:** Reduce bundle size by ~50KB, improve runtime performance
**Effort:** Low

```bash
# Already configured in vite.config.production.ts
# Verify terserOptions.compress.drop_console: true is working
```

### 2. Optimize Images (216KB total)
**Impact:** 60% reduction = ~130KB saved
**Effort:** Low

```bash
# Convert to WebP format
npm install -D @squoosh/lib
# Compress images:
# - katc-logo.png (52KB → 15KB)
# - eczlogo.png (60KB → 18KB)
# - unza.jpg (48KB → 12KB)
```

**Action:**
```typescript
// Use <picture> with WebP fallback
<picture>
  <source srcSet="/images/logos/katc-logo.webp" type="image/webp" />
  <img src="/images/logos/katc-logo.png" alt="KATC" />
</picture>
```

### 3. Implement Virtual Scrolling for Large Lists
**Impact:** 70% faster rendering for 100+ items
**Effort:** Medium

**Files to update:**
- `src/pages/admin/Applications.tsx`
- `src/pages/admin/Users.tsx`

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

// Replace map() with virtual scrolling for lists > 50 items
```

---

## 🟡 HIGH PRIORITY - Quick Wins (Week 2)

### 4. Database Query Optimization

**A. Add Missing Indexes**
```sql
-- Applications table (most queried)
CREATE INDEX IF NOT EXISTS idx_applications_user_status 
  ON applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_submitted_at 
  ON applications(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_program 
  ON applications(program);

-- Profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_email 
  ON profiles(email);

-- Notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
  ON notifications(user_id, read, created_at DESC);
```

**B. Optimize Supabase Queries (199 queries found without select/limit)**
```typescript
// ❌ Bad - Fetches all columns
const { data } = await supabase.from('applications').select('*')

// ✅ Good - Select only needed columns
const { data } = await supabase
  .from('applications')
  .select('id, application_number, status, created_at')
  .limit(50)
```

### 5. Lazy Load Heavy Components
**Impact:** 40% faster initial load
**Effort:** Low

```typescript
// Add lazy loading to:
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const EnhancedDashboard = lazy(() => import('@/components/admin/EnhancedDashboard'))
const PredictiveDashboard = lazy(() => import('@/components/admin/PredictiveDashboard'))
const ApplicationWizard = lazy(() => import('@/pages/student/applicationWizard'))
```

### 6. Optimize React Query Configuration
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 10 * 60 * 1000, // ✅ Good
      gcTime: 15 * 60 * 1000, // ✅ Good
      // ADD:
      networkMode: 'offlineFirst', // Better offline support
      refetchOnReconnect: true,
    },
  },
})
```

---

## 🟢 MEDIUM PRIORITY - Significant Improvements (Week 3-4)

### 7. Implement Code Splitting by Route
```typescript
// vite.config.production.ts - Add route-based chunks
manualChunks: {
  'admin-pages': [
    './src/pages/admin/Dashboard',
    './src/pages/admin/Applications',
    './src/pages/admin/Users'
  ],
  'student-pages': [
    './src/pages/student/Dashboard',
    './src/pages/student/applicationWizard'
  ],
  'shared-components': [
    './src/components/ui',
    './src/components/navigation'
  ]
}
```

### 8. Optimize useEffect Dependencies (221 found)
**Common Issues:**
- Object/array dependencies causing infinite loops
- Missing memoization

```typescript
// ❌ Bad
useEffect(() => {
  fetchData(filters)
}, [filters]) // Object recreated every render

// ✅ Good
const memoizedFilters = useMemo(() => filters, [filters.status, filters.date])
useEffect(() => {
  fetchData(memoizedFilters)
}, [memoizedFilters])
```

### 9. Implement Request Deduplication
```typescript
// Create singleton service instances
// src/services/applications.ts
class ApplicationService {
  private static instance: ApplicationService
  private cache = new Map()
  
  static getInstance() {
    if (!ApplicationService.instance) {
      ApplicationService.instance = new ApplicationService()
    }
    return ApplicationService.instance
  }
  
  async list(params: any) {
    const key = JSON.stringify(params)
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    const result = await this.fetchFromAPI(params)
    this.cache.set(key, result)
    return result
  }
}
```

### 10. Add Service Worker Caching Strategy
```typescript
// src/service-worker.ts - Enhance caching
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

// API calls - Network first
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 3
  })
)

// Static assets - Cache first
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 })
    ]
  })
)
```

---

## 🔵 LOW PRIORITY - Long-term Optimizations (Month 2+)

### 11. Implement Pagination Everywhere
```typescript
// Replace infinite scroll with cursor-based pagination
const { data, fetchNextPage } = useInfiniteQuery({
  queryKey: ['applications'],
  queryFn: ({ pageParam = 0 }) => 
    applicationService.list({ cursor: pageParam, limit: 20 }),
  getNextPageParam: (lastPage) => lastPage.nextCursor
})
```

### 12. Add Database Connection Pooling
```typescript
// Supabase already handles this, but verify settings:
// - Max connections: 100
// - Idle timeout: 10s
// - Connection timeout: 5s
```

### 13. Implement CDN for Static Assets
```bash
# Use Netlify CDN (already configured)
# Verify cache headers in netlify.toml:
[[headers]]
  for = "/images/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### 14. Add Performance Monitoring
```typescript
// src/lib/performance.ts
export const measurePerformance = (metricName: string) => {
  if ('performance' in window) {
    performance.mark(`${metricName}-start`)
    return () => {
      performance.mark(`${metricName}-end`)
      performance.measure(metricName, `${metricName}-start`, `${metricName}-end`)
      const measure = performance.getEntriesByName(metricName)[0]
      console.log(`${metricName}: ${measure.duration}ms`)
    }
  }
  return () => {}
}

// Usage:
const endMeasure = measurePerformance('dashboard-load')
// ... load dashboard
endMeasure()
```

### 15. Optimize Framer Motion Animations
```typescript
// Use layout animations sparingly
// Prefer CSS transforms over layout changes
<motion.div
  animate={{ x: 100 }} // ✅ Good - uses transform
  // vs
  animate={{ marginLeft: 100 }} // ❌ Bad - triggers layout
/>

// Add will-change for animated elements
<motion.div
  style={{ willChange: 'transform' }}
  animate={{ x: 100 }}
/>
```

---

## 📊 Expected Performance Gains

| Optimization | Load Time Improvement | Bundle Size Reduction |
|--------------|----------------------|----------------------|
| Remove console logs | +2% | -50KB |
| Image optimization | +5% | -130KB |
| Virtual scrolling | +15% (large lists) | - |
| Database indexes | +30% (queries) | - |
| Lazy loading | +40% | -200KB initial |
| Code splitting | +25% | -300KB initial |
| **TOTAL** | **~60% faster** | **~680KB smaller** |

---

## 🎯 Implementation Priority

### Week 1 (Critical)
1. ✅ Remove console statements
2. ✅ Optimize images to WebP
3. ✅ Add database indexes

### Week 2 (High)
4. ✅ Implement virtual scrolling
5. ✅ Optimize Supabase queries
6. ✅ Add lazy loading

### Week 3-4 (Medium)
7. ✅ Code splitting by route
8. ✅ Fix useEffect dependencies
9. ✅ Request deduplication

### Month 2+ (Low)
10. ✅ Pagination everywhere
11. ✅ Performance monitoring
12. ✅ Animation optimization

---

## 🔧 Quick Implementation Scripts

### Remove Console Logs (Production)
```bash
# Already configured in vite.config.production.ts
npm run build:prod
```

### Convert Images to WebP
```bash
npm install -D sharp
node scripts/optimize-images.js
```

### Add Database Indexes
```bash
# Run via Supabase dashboard SQL editor
# Or via migration:
npm run supabase migration new add_performance_indexes
```

---

## 📈 Monitoring & Metrics

### Key Metrics to Track
1. **Lighthouse Score:** Target 90+
2. **First Contentful Paint (FCP):** < 1.5s
3. **Time to Interactive (TTI):** < 3.5s
4. **Largest Contentful Paint (LCP):** < 2.5s
5. **Cumulative Layout Shift (CLS):** < 0.1
6. **Bundle Size:** < 500KB initial

### Tools
- Lighthouse CI
- Web Vitals
- React DevTools Profiler
- Supabase Dashboard (Query Performance)

---

**Last Updated:** 2025-01-23  
**Status:** Ready for Implementation  
**Priority:** Critical → High → Medium → Low
