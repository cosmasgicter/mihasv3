# React Query Cache Configuration Optimization

## Overview

This document describes the optimizations made to the React Query cache configuration in task 8.1 of the MIHAS Production Fixes spec. The optimizations are based on data volatility analysis and aim to reduce unnecessary network requests by 60% while maintaining data freshness.

## Changes Summary

### Cache Configuration Updates

| Data Type | Old staleTime | New staleTime | Old gcTime | New gcTime | Rationale |
|-----------|---------------|---------------|------------|------------|-----------|
| **Auth** | 5 min | **10 min** ↑ | 10 min | **30 min** ↑ | Sessions rarely change except on login/logout |
| **Applications** | 2 min | **1 min** ↓ | 5 min | 5 min | Applications change frequently during submission/review |
| **Users** | 5 min | **15 min** ↑ | 10 min | **30 min** ↑ | User profiles change infrequently |
| **Analytics** | 10 min | **30 min** ↑ | 15 min | **60 min** ↑ | Reports are computed periodically |
| **Static** | 1 hr | **2 hr** ↑ | 24 hr | 24 hr | Programs, institutions, intakes change rarely |
| **Realtime** | 30 sec | **15 sec** ↓ | 60 sec | 60 sec | Notifications need fresher data |

### Data Volatility Categories

#### High Volatility (Realtime)
- **Examples**: Application status changes, notifications, live updates
- **Strategy**: Short staleTime (15s) for maximum freshness
- **Impact**: Users see updates quickly without manual refresh

#### Medium-High Volatility (Applications)
- **Examples**: User applications, drafts, submission data
- **Strategy**: Reduced staleTime (1min) for fresher data during active workflows
- **Impact**: Better UX during application submission and review

#### Low Volatility (Auth, Users)
- **Examples**: User sessions, profiles, authentication state
- **Strategy**: Increased staleTime (10-15min) to reduce redundant checks
- **Impact**: Fewer auth checks, better performance

#### Very Low Volatility (Analytics, Static)
- **Examples**: Reports, catalog data, programs, institutions
- **Strategy**: Extended staleTime (30min-2hr) for maximum caching
- **Impact**: Significant reduction in API calls for rarely-changing data

## Optimistic Updates Implementation

### New Features

1. **useTableMutation Enhancement**
   - Added `onMutate` hook for optimistic updates
   - Implements snapshot/rollback pattern for error handling
   - Automatically updates cache before server response
   - Provides instant UI feedback

2. **useOptimisticMutation Helper**
   - Type-safe helper for creating custom optimistic mutations
   - Flexible updater function for complex state transformations
   - Automatic error rollback
   - Reusable across different data types

### Example Usage

```typescript
// Using the enhanced useTableMutation
const updateApplication = useTableMutation(
  'applications',
  'update',
  [['applications', 'list']]
)

// Using the new useOptimisticMutation helper
const updateStatus = useOptimisticMutation(
  ['applications', applicationId],
  async (status) => applicationService.updateStatus(applicationId, status),
  (oldData, status) => ({ ...oldData, status })
)
```

## Performance Impact

### Expected Improvements

1. **Reduced Network Requests**
   - Auth checks: ~60% reduction (5min → 10min)
   - User profile fetches: ~67% reduction (5min → 15min)
   - Analytics queries: ~67% reduction (10min → 30min)
   - Static data: ~50% reduction (1hr → 2hr)

2. **Improved Perceived Performance**
   - Optimistic updates provide instant UI feedback
   - Users see changes immediately before server confirmation
   - Automatic rollback on errors maintains data integrity

3. **Better User Experience**
   - Realtime data is fresher (30s → 15s)
   - Application data updates more frequently (2min → 1min)
   - Reduced loading states for cached data

### Trade-offs

1. **Slightly Stale Data**
   - Low-volatility data may be up to 15-30 minutes old
   - Acceptable for user profiles and auth state
   - Critical data (applications, realtime) remains fresh

2. **Memory Usage**
   - Longer gcTime means data stays in memory longer
   - Increased from 10min to 30min for auth/users
   - Minimal impact on modern devices

## Testing

### Validation Tests

Updated `tests/unit/queries/useSupabaseQuery.test.ts` to verify:
- ✅ All cache timings match new configuration
- ✅ Freshness priority (realtime < applications < auth)
- ✅ Caching priority (static > analytics > users)
- ✅ GC time > stale time for all configs

### Manual Testing Checklist

- [ ] Login flow uses cached auth state (no redundant checks)
- [ ] Application list updates within 1 minute of changes
- [ ] User profile changes reflect within 15 minutes
- [ ] Analytics dashboard uses cached data for 30 minutes
- [ ] Realtime notifications appear within 15 seconds
- [ ] Optimistic updates show immediate UI feedback
- [ ] Error rollback works correctly on failed mutations

## Migration Guide

### For Developers

No breaking changes. The cache configuration is backward compatible. However:

1. **Be aware of longer cache times**
   - Auth state may be cached for 10 minutes
   - User profiles may be cached for 15 minutes
   - Force refresh if immediate updates are needed

2. **Use optimistic updates**
   - Consider using `useOptimisticMutation` for better UX
   - Implement proper error handling and rollback
   - Test with network failures

3. **Monitor cache behavior**
   - Use React Query DevTools to inspect cache
   - Check stale/fresh status of queries
   - Verify invalidation works correctly

### Code Examples

```typescript
// Force refresh cached data
queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })

// Prefetch data before navigation
await queryClient.prefetchQuery({
  queryKey: ['applications', 'list'],
  queryFn: () => applicationService.list(),
  staleTime: CACHE_CONFIG.applications.staleTime
})

// Use optimistic updates for instant feedback
const updateMutation = useOptimisticMutation(
  ['application', id],
  async (updates) => api.update(id, updates),
  (old, updates) => ({ ...old, ...updates })
)
```

## Monitoring

### Key Metrics to Track

1. **Cache Hit Rate**
   - Target: >70% for auth queries
   - Target: >60% for user queries
   - Target: >80% for static data

2. **Network Request Reduction**
   - Baseline: Current request count
   - Target: 60% reduction in redundant requests
   - Measure: API call logs, network tab

3. **User Experience**
   - Perceived performance improvement
   - Reduced loading states
   - Faster navigation

### React Query DevTools

Enable DevTools in development to monitor:
- Query status (fresh, stale, fetching)
- Cache size and memory usage
- Refetch behavior
- Mutation status

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

// Add to App.tsx
<ReactQueryDevtools initialIsOpen={false} />
```

## Related Requirements

- **Requirement 3.5**: Cache strategy implementation
- **Property 8**: Cache hit optimization
- **Performance Target**: Reduce unnecessary network requests by 60%

## Files Modified

1. `src/hooks/queries/useSupabaseQuery.ts`
   - Updated CACHE_CONFIG with optimized timings
   - Added optimistic updates to useTableMutation
   - Added useOptimisticMutation helper

2. `tests/unit/queries/useSupabaseQuery.test.ts`
   - Updated tests to match new configuration
   - Added validation for freshness/caching priorities
   - Added GC time validation

## Next Steps

1. **Task 8.2**: Enhance service worker caching strategies
2. **Task 8.3**: Add cache monitoring and metrics
3. **Phase 2 Checkpoint**: Verify performance improvements

## References

- [React Query Caching Documentation](https://tanstack.com/query/latest/docs/react/guides/caching)
- [Optimistic Updates Guide](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- MIHAS Production Fixes Design Document (Property 8)
