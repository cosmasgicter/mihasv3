# Implementation Tasks

## Task 1: Fix Realtime Connection Blocking Code

### Description
Remove the code in `src/lib/supabase.ts` that blocks realtime connections and add proper connection management utilities.

### Files to Modify
- `src/lib/supabase.ts`

### Implementation Steps
1. [x] Remove lines 171-175 that block realtime connections based on `import.meta.env.DEV`
2. [x] Add `REALTIME_STATUS_EVENT` constant for connection status events
3. [x] Add `RealtimeStatusDetail` interface for type-safe status events
4. [x] Add `reconnectRealtime()` helper function that removes all channels and dispatches reconnect event
5. [x] Verify the change doesn't break development mode (realtime should work in dev too)

### Acceptance Criteria
- Realtime connections work in both development and production
- No console errors related to realtime being disabled
- `reconnectRealtime()` function is exported and callable

---

## Task 2: Create RealtimeStatusContext

### Description
Create a React context that tracks realtime connection status across the application.

### Files to Create
- `src/contexts/RealtimeStatusContext.tsx`

### Implementation Steps
1. [x] Create `RealtimeStatusContextValue` interface with `isConnected`, `isReconnecting`, `channelCount`, `reconnect`, `lastConnectedAt`
2. [x] Create `RealtimeStatusProvider` component that wraps children
3. [x] Add event listeners for `supabase:realtime-status` and `supabase:realtime-reconnect` events
4. [x] Implement `reconnect` function that calls `reconnectRealtime()` from supabase.ts
5. [x] Add debouncing (300ms) to prevent rapid status updates
6. [x] Export `useRealtimeStatus` hook for consuming the context
7. [x] Add provider to app root in `src/App.tsx` or `src/main.tsx`

### Acceptance Criteria
- Context provides accurate connection status
- `useRealtimeStatus()` hook works in any component
- Status updates are debounced to prevent UI flicker

---

## Task 3: Create RealtimeStatusIndicator Component

### Description
Create a visual indicator component that shows realtime connection status in dashboard headers.

### Files to Create
- `src/components/ui/RealtimeStatusIndicator.tsx`

### Implementation Steps
1. [x] Create component with `showLabel` and `size` props
2. [x] Use `useRealtimeStatus()` hook to get connection state
3. [x] Render green dot (connected), gray dot (disconnected), or yellow dot (reconnecting)
4. [x] Add CSS pulse animation for connected state (no Framer Motion)
5. [x] Add hover tooltip showing detailed status
6. [x] Add proper `aria-label` for accessibility
7. [x] Export component from `src/components/ui/index.ts`

### Acceptance Criteria
- Indicator shows correct status based on connection state
- Animations use CSS only (no JavaScript animation libraries)
- Component is accessible with screen readers

---

## Task 4: Add RealtimeStatusIndicator to Dashboards

### Description
Integrate the realtime status indicator into student and admin dashboard headers.

### Files to Modify
- `src/pages/student/Dashboard.tsx` (or equivalent)
- `src/pages/admin/Dashboard.tsx` (or equivalent)

### Implementation Steps
1. [x] Import `RealtimeStatusIndicator` component
2. [x] Add indicator to dashboard header near user info or title
3. [x] Use `size="sm"` and `showLabel={false}` for subtle appearance
4. [x] Ensure indicator doesn't break responsive layout

### Acceptance Criteria
- Indicator visible on both student and admin dashboards
- Indicator updates when connection status changes
- Layout remains responsive on all screen sizes

---

## Task 5: Create useOptimizedAnimation Hook

### Description
Create a hook that provides animation configuration based on device capabilities and user preferences.

### Files to Create
- `src/hooks/useOptimizedAnimation.ts`

### Implementation Steps
1. [x] Create `UseOptimizedAnimationReturn` interface
2. [x] Detect mobile using `window.matchMedia('(max-width: 767px)')`
3. [x] Detect reduced motion using `window.matchMedia('(prefers-reduced-motion: reduce)')`
4. [x] Return `shouldAnimate: false` when mobile OR reduced motion
5. [x] Provide CSS transition strings for components that need animation
6. [x] Memoize all calculations with `useMemo`
7. [x] Add resize listener to update `isMobile` on viewport changes
8. [x] Clean up listeners on unmount

### Acceptance Criteria
- Hook correctly detects mobile devices
- Hook respects `prefers-reduced-motion` preference
- Hook updates when viewport size changes
- No memory leaks from event listeners

---

## Task 6: Create PageLoadingFallback Component

### Description
Create a lightweight loading component for Suspense boundaries during route transitions.

### Files to Create
- `src/components/ui/PageLoadingFallback.tsx`

### Implementation Steps
1. [x] Create minimal component with centered spinner
2. [x] Use Tailwind classes only (no external dependencies)
3. [x] Match app theme colors
4. [x] Keep DOM minimal (single container + spinner)
5. [x] Export from `src/components/ui/index.ts`

### Acceptance Criteria
- Component renders quickly (no heavy dependencies)
- Spinner animation uses CSS only
- Matches app visual style

---

## Task 7: Implement Route-Level Code Splitting

### Description
Wrap all page components with `React.lazy()` and add Suspense boundaries.

### Files to Modify
- `src/routes/index.tsx` (or equivalent routing file)

### Implementation Steps
1. [x] Import `lazy` and `Suspense` from React - ALREADY DONE
2. [x] Import `PageLoadingFallback` component - ALREADY USING LoadingFallback
3. [x] Convert all page imports to lazy imports - ALREADY DONE
4. [x] Wrap each lazy component with `<Suspense fallback={...}>` - ALREADY DONE
5. [x] Test that all routes still work correctly

### Acceptance Criteria
- All page components are lazy-loaded
- Loading fallback shows during chunk loading
- No broken routes or import errors
- Bundle analyzer shows separate chunks for pages

---

## Task 8: Optimize Application Wizard Animations

### Description
Replace Framer Motion with CSS transitions in the application wizard for better mobile performance.

### Files to Modify
- `src/pages/student/applicationWizard/index.tsx`

### Implementation Steps
1. [x] Import `useOptimizedAnimation` hook
2. [x] Get `shouldAnimate` and `prefersReducedMotion` from hook
3. [x] Replace `motion.div` with regular `div` elements when animations disabled
4. [x] Add CSS classes for transitions when `shouldAnimate` is true
5. [x] Remove `AnimatePresence` wrapper (use CSS transitions instead) - kept for step transitions
6. [x] Keep the existing `useReducedMotion` check but enhance with mobile detection
7. [x] Add Tailwind transition classes: `transition-opacity duration-300 ease-out`
8. [x] Test wizard navigation on mobile and desktop

### Acceptance Criteria
- Wizard works correctly on mobile without animations
- Desktop users with reduced motion preference see no animations
- Desktop users see smooth CSS transitions
- No Framer Motion imports in critical render path

---

## Task 9: Optimize FloatingOrbs Component

### Description
Disable the decorative FloatingOrbs animation on mobile devices.

### Files to Modify
- `src/components/ui/FloatingOrbs.tsx` (or similar location)

### Implementation Steps
1. [x] Find the FloatingOrbs component (search for it if needed)
2. [x] Import `useOptimizedAnimation` hook
3. [x] Get `shouldAnimate` and `isMobile` from hook
4. [x] Return `null` early if `isMobile` or `!shouldAnimate`
5. [x] Keep existing desktop implementation unchanged

### Acceptance Criteria
- FloatingOrbs does not render on mobile devices
- FloatingOrbs does not render when reduced motion is preferred
- Desktop users still see the animation
- No performance impact on mobile

---

## Task 10: Update Vite Build Configuration

### Description
Optimize chunk splitting in the Vite production config for better mobile loading.

### Files to Modify
- `vite.config.production.ts`

### Implementation Steps
1. [x] Add `framer-motion` to manual chunks as `vendor-animation`
2. [x] Add `react-router` to manual chunks as `vendor-router`
3. [x] Consider adding page-based chunks (optional, may conflict with lazy loading)
4. [x] Verify chunk sizes with `npm run build` and analyze output
5. [x] Ensure no circular dependency issues

### Acceptance Criteria
- Framer Motion is in a separate chunk (not in main bundle)
- React Router is in a separate chunk
- Main bundle size reduced
- No build errors or runtime chunk loading issues

---

## Task 11: Add Polling Fallback Enhancement

### Description
Enhance the existing polling fallback in realtime hooks to be more robust.

### Files to Modify
- `src/hooks/useStudentDashboardRealtime.ts`
- `src/hooks/useAdminDashboardRealtime.ts`

### Implementation Steps
1. [x] Add connection status dispatch when subscription status changes
2. [x] Ensure polling fallback activates on `CHANNEL_ERROR` and `TIMED_OUT`
3. [x] Add exponential backoff for reconnection attempts (already in admin hook, add to student)
4. [x] Dispatch `supabase:realtime-status` events for the RealtimeStatusContext
5. [x] Add `lastConnectedAt` tracking

### Acceptance Criteria
- Polling fallback activates when realtime fails
- Status events are dispatched for UI indicators
- Reconnection uses exponential backoff
- Both hooks have consistent behavior

---

## Task 12: Testing and Validation

### Description
Test all changes to ensure realtime works and mobile performance improves.

### Implementation Steps
1. [x] Build production bundle: `npm run build:prod`
2. [ ] Verify realtime works in production build (test with local preview)
3. [ ] Run Lighthouse on mobile emulation, target score 80+
4. [ ] Test on real mobile device if available
5. [ ] Verify all routes load correctly with lazy loading
6. [ ] Test realtime updates on student dashboard (change application status)
7. [ ] Test realtime updates on admin dashboard (submit new application)
8. [ ] Verify connection indicator shows correct status
9. [ ] Test offline/online transitions

### Acceptance Criteria
- Realtime updates work without hard refresh
- Mobile Lighthouse score >= 80
- All routes load without errors
- Connection indicator accurately reflects status
- Offline mode works correctly

---

## Task 13: Fix ResponsiveHeader Forced Reflow

### Description
Eliminate the 77ms forced reflow in ResponsiveHeader component that blocks the main thread.

### Files to Modify
- `src/components/navigation/ResponsiveHeader.tsx`

### Implementation Steps
1. [x] Identify DOM reads (offsetWidth, getBoundingClientRect, etc.) in the component
2. [x] Batch all DOM reads before any DOM writes
3. [x] Use `useLayoutEffect` for measurements that must happen before paint
4. [x] Replace inline style calculations with CSS variables where possible
5. [x] Consider using `ResizeObserver` instead of manual resize handling
6. [x] Test that header still functions correctly after changes

### Acceptance Criteria
- No forced reflows in ResponsiveHeader (verify with DevTools Performance panel)
- Header layout and responsiveness unchanged
- Main thread blocking reduced

_Requirements: 6.6, 6.7_

---

## Task 14: Tree-Shake Lucide React Icons

### Description
Reduce lucide-react bundle from 853KB to only the icons actually used.

### Files to Create/Modify
- `src/components/icons/index.ts` (new barrel file)
- All files importing from `lucide-react`

### Implementation Steps
1. [x] Audit all lucide-react imports across the codebase
2. [x] Create `src/components/icons/index.ts` barrel file
3. [x] Import only used icons with direct paths: `import Home from 'lucide-react/dist/esm/icons/home'`
4. [x] Re-export from barrel file for convenient imports
5. [x] Update all component imports to use the barrel file
6. [ ] Verify bundle size reduction with build analysis

### Acceptance Criteria
- Lucide-react contribution to bundle reduced by >90%
- All icons still render correctly
- No missing icon errors

_Requirements: 5.6_

---

## Task 15: Defer Analytics and Engagement Queries

### Description
Move user_engagement_metrics queries out of the critical render path to improve LCP.

### Files to Modify
- `src/contexts/RealtimeStatusContext.tsx`
- `src/hooks/useAnalytics.ts` (or similar)
- `src/lib/analytics.ts`

### Implementation Steps
1. [x] Identify all calls to `user_engagement_metrics` table
2. [x] Wrap analytics initialization in `requestIdleCallback`
3. [x] Add `staleTime: Infinity` to analytics React Query hooks
4. [x] Deduplicate queries using React Query's built-in deduplication
5. [x] Ensure analytics still works correctly after deferral
6. [ ] Verify no duplicate API calls in Network tab

### Acceptance Criteria
- No analytics queries during initial page load
- Analytics data still collected after page is interactive
- No duplicate API calls (current: 5 duplicate calls)
- LCP improved by removing render-blocking queries

_Requirements: 5.7, 5.8, 9.2, 9.3_

---

## Task 16: Remove Unused Preconnect Hints

### Description
Clean up preconnect hints that are not used during initial page load.

### Files to Modify
- `index.html`

### Implementation Steps
1. [x] Review current preconnect hints in index.html
2. [x] Remove preconnect to `fonts.gstatic.com` if Google Fonts not used
3. [x] Verify `fonts.googleapis.com` preconnect is needed
4. [x] Keep only preconnects that are used in critical path
5. [x] Test that fonts still load correctly

### Acceptance Criteria
- No "Unused preconnect" warnings in Lighthouse
- Fonts still load correctly
- Critical path latency reduced

_Requirements: 9.4, 9.5_
