# Performance Optimization Plan

## Quick Wins (1-2 hours)

### 1. Database Indexes
```sql
-- Add missing indexes on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_payment_status ON applications(payment_status);
CREATE INDEX IF NOT EXISTS idx_applications_submitted_at ON applications(submitted_at);
CREATE INDEX IF NOT EXISTS idx_application_grades_application_id ON application_grades(application_id);
CREATE INDEX IF NOT EXISTS idx_application_documents_application_id ON application_documents(application_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON notifications(user_id, read);
```

### 2. React Query Caching
```typescript
// src/lib/queryClient.ts - Increase cache times
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes (currently too short)
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false, // Reduce unnecessary refetches
    },
  },
})
```

### 3. Image Optimization
```typescript
// Add to vite.config.ts
import imagemin from 'vite-plugin-imagemin'

export default defineConfig({
  plugins: [
    imagemin({
      gifsicle: { optimizationLevel: 7 },
      optipng: { optimizationLevel: 7 },
      mozjpeg: { quality: 80 },
      svgo: { plugins: [{ removeViewBox: false }] }
    })
  ]
})
```

### 4. Code Splitting
```typescript
// src/App.tsx - Lazy load routes
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'))
const ApplicationForm = lazy(() => import('./pages/ApplicationForm'))
```

## Medium Effort (3-5 hours)

### 5. Reduce Bundle Size
```bash
# Analyze bundle
npm run build -- --mode analyze

# Replace heavy libraries
# - Replace moment.js with date-fns (if used)
# - Use lodash-es instead of lodash
# - Tree-shake unused Radix UI components
```

### 6. API Response Optimization
```typescript
// functions/applications/index.js
// Only return needed fields
const { data } = await supabase
  .from('applications')
  .select('id, application_number, full_name, status, payment_status, submitted_at')
  .limit(50) // Add pagination
```

### 7. Debounce Search/Filter
```typescript
// src/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay = 500): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  
  return debouncedValue
}
```

### 8. Virtualize Long Lists
```typescript
// Install react-window
npm install react-window

// Use for applications list
import { FixedSizeList } from 'react-window'
```

## Advanced (1-2 days)

### 9. Service Worker Caching
```typescript
// vite.config.ts - Add PWA caching
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-cache',
          expiration: { maxEntries: 50, maxAgeSeconds: 300 }
        }
      }
    ]
  }
})
```

### 10. Database Query Optimization
```sql
-- Optimize slow queries
EXPLAIN ANALYZE 
SELECT * FROM applications WHERE status = 'submitted';

-- Add composite indexes
CREATE INDEX idx_applications_status_submitted 
ON applications(status, submitted_at DESC) 
WHERE status = 'submitted';
```

## Expected Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial Load | 3-4s | 1-2s | 50-60% |
| Bundle Size | ~800KB | ~400KB | 50% |
| API Response | 500-1000ms | 100-300ms | 70% |
| List Rendering | Laggy | Smooth | 90% |
| Lighthouse Score | 70 | 90+ | +20 |

## Priority Order
1. Database indexes (biggest impact, 30 min)
2. React Query caching (easy, 15 min)
3. Code splitting (medium, 1 hour)
4. API optimization (medium, 2 hours)
5. Bundle analysis (ongoing)
