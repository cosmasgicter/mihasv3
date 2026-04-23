# Cache Optimization Quick Reference

## Cache Configuration at a Glance

```typescript
import { CACHE_CONFIG } from '@/hooks/queries/useSupabaseQuery'

// Current optimized settings:
CACHE_CONFIG.auth         // 10min stale, 30min gc
CACHE_CONFIG.applications // 1min stale, 5min gc
CACHE_CONFIG.users        // 15min stale, 30min gc
CACHE_CONFIG.analytics    // 30min stale, 60min gc
CACHE_CONFIG.static       // 2hr stale, 24hr gc
CACHE_CONFIG.realtime     // 15s stale, 60s gc
```

## When to Use Each Config

### Auth (10min)
Use for: Sessions, authentication state, tokens
```typescript
useQuery({
  queryKey: ['auth', 'session'],
  queryFn: getSession,
  ...CACHE_CONFIG.auth
})
```

### Applications (1min)
Use for: User applications, drafts, submissions
```typescript
useQuery({
  queryKey: ['applications', userId],
  queryFn: () => getApplications(userId),
  ...CACHE_CONFIG.applications
})
```

### Users (15min)
Use for: User profiles, preferences, settings
```typescript
useQuery({
  queryKey: ['users', userId],
  queryFn: () => getUserProfile(userId),
  ...CACHE_CONFIG.users
})
```

### Analytics (30min)
Use for: Reports, statistics, dashboards
```typescript
useQuery({
  queryKey: ['analytics', 'dashboard'],
  queryFn: getDashboardStats,
  ...CACHE_CONFIG.analytics
})
```

### Static (2hr)
Use for: Programs, institutions, intakes, catalog
```typescript
useQuery({
  queryKey: ['programs'],
  queryFn: getPrograms,
  ...CACHE_CONFIG.static
})
```

### Realtime (15s)
Use for: Notifications, live updates, status changes
```typescript
useQuery({
  queryKey: ['notifications', userId],
  queryFn: () => getNotifications(userId),
  ...CACHE_CONFIG.realtime
})
```

## Optimistic Updates

### Using Enhanced useTableMutation

```typescript
import { useTableMutation } from '@/hooks/queries/useSupabaseQuery'

// Automatically includes optimistic updates
const updateApplication = useTableMutation(
  'applications',
  'update',
  [['applications', 'list']]  // Keys to invalidate
)

// Use it
updateApplication.mutate({
  id: applicationId,
  data: { status: 'approved' }
})
```

### Using useOptimisticMutation Helper

```typescript
import { useOptimisticMutation } from '@/hooks/queries/useSupabaseQuery'

const updateStatus = useOptimisticMutation(
  ['application', applicationId],
  // Mutation function
  async (newStatus) => {
    return await applicationService.updateStatus(applicationId, newStatus)
  },
  // Optimistic updater
  (oldData, newStatus) => ({
    ...oldData,
    status: newStatus,
    updated_at: new Date().toISOString()
  })
)

// Use it
updateStatus.mutate('approved')
```

## Common Patterns

### Force Refresh Cached Data

```typescript
import { useQueryClient } from '@tanstack/react-query'

const queryClient = useQueryClient()

// Invalidate specific query
queryClient.invalidateQueries({ queryKey: ['applications', userId] })

// Invalidate all applications queries
queryClient.invalidateQueries({ queryKey: ['applications'] })

// Refetch immediately
queryClient.refetchQueries({ queryKey: ['applications', userId] })
```

### Prefetch Data

```typescript
import { useQueryClient } from '@tanstack/react-query'
import { CACHE_CONFIG } from '@/hooks/queries/useSupabaseQuery'

const queryClient = useQueryClient()

// Prefetch before navigation
await queryClient.prefetchQuery({
  queryKey: ['applications', 'list'],
  queryFn: () => applicationService.list(),
  staleTime: CACHE_CONFIG.applications.staleTime
})
```

### Manual Cache Update

```typescript
import { useQueryClient } from '@tanstack/react-query'

const queryClient = useQueryClient()

// Update cache manually
queryClient.setQueryData(['application', id], (old) => ({
  ...old,
  status: 'approved'
}))
```

### Get Cached Data

```typescript
import { useQueryClient } from '@tanstack/react-query'

const queryClient = useQueryClient()

// Get data from cache
const cachedData = queryClient.getQueryData(['application', id])

if (cachedData) {
  // Use cached data
}
```

## Debugging Cache Issues

### Enable React Query DevTools

```typescript
// In App.tsx (development only)
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

function App() {
  return (
    <>
      {/* Your app */}
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  )
}
```

### Check Query Status

```typescript
const { data, isLoading, isFetching, isStale } = useQuery({
  queryKey: ['application', id],
  queryFn: () => getApplication(id),
  ...CACHE_CONFIG.applications
})

console.log({
  isLoading,   // First load
  isFetching,  // Any fetch (including background)
  isStale      // Data is stale (past staleTime)
})
```

### Monitor Cache Hits

```typescript
import { useQueryClient } from '@tanstack/react-query'

const queryClient = useQueryClient()

// Get query state
const queryState = queryClient.getQueryState(['application', id])

console.log({
  dataUpdatedAt: queryState?.dataUpdatedAt,
  isStale: queryState?.isStale,
  fetchStatus: queryState?.fetchStatus
})
```

## Performance Tips

### 1. Use Appropriate Cache Config
- Don't use `realtime` config for static data
- Don't use `static` config for frequently changing data

### 2. Leverage Optimistic Updates
- Use for better perceived performance
- Implement proper error handling

### 3. Prefetch Predictable Navigation
```typescript
// On hover, prefetch next page
<Link 
  to="/applications"
  onMouseEnter={() => {
    queryClient.prefetchQuery({
      queryKey: ['applications'],
      queryFn: getApplications
    })
  }}
>
  Applications
</Link>
```

### 4. Avoid Over-Invalidation
```typescript
// ❌ Bad: Invalidates too much
queryClient.invalidateQueries()

// ✅ Good: Specific invalidation
queryClient.invalidateQueries({ queryKey: ['applications', userId] })
```

### 5. Use Stale-While-Revalidate Pattern
```typescript
// Data is served from cache while refetching in background
useQuery({
  queryKey: ['applications'],
  queryFn: getApplications,
  staleTime: 1 * 60 * 1000,  // 1 minute
  gcTime: 5 * 60 * 1000       // 5 minutes
})
```

## Common Mistakes to Avoid

### ❌ Don't Override Cache Config Without Reason
```typescript
// Bad: Overrides optimized config
useQuery({
  queryKey: ['applications'],
  queryFn: getApplications,
  staleTime: 0  // ❌ Always refetches
})

// Good: Use optimized config
useQuery({
  queryKey: ['applications'],
  queryFn: getApplications,
  ...CACHE_CONFIG.applications  // ✅ Uses 1min staleTime
})
```

### ❌ Don't Forget Error Handling in Optimistic Updates
```typescript
// Bad: No error handling
const mutation = useOptimisticMutation(
  ['data'],
  updateData,
  (old, updates) => ({ ...old, ...updates })
)

// Good: Handle errors
const mutation = useOptimisticMutation(
  ['data'],
  updateData,
  (old, updates) => ({ ...old, ...updates }),
  {
    onError: (error) => {
      toast.error('Update failed: ' + error.message)
    }
  }
)
```

### ❌ Don't Invalidate on Every Mutation
```typescript
// Bad: Invalidates entire cache
onSuccess: () => {
  queryClient.invalidateQueries()
}

// Good: Invalidate specific queries
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['applications'] })
}
```

## Migration Checklist

When updating existing queries:

- [ ] Choose appropriate CACHE_CONFIG based on data volatility
- [ ] Add optimistic updates for mutations if beneficial
- [ ] Implement proper error handling
- [ ] Test with React Query DevTools
- [ ] Verify cache invalidation works correctly
- [ ] Check for over-fetching or under-fetching
- [ ] Monitor performance impact

## Need Help?

- Check `docs/CACHE_OPTIMIZATION_SUMMARY.md` for detailed documentation
- Use React Query DevTools to debug cache issues
- Review existing implementations in:
  - `src/hooks/queries/useApplicationQueries.ts`
  - `src/hooks/auth/useOptimizedAuthState.ts`
  - `src/services/dashboardPreloader.ts`
