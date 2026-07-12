# Design Document

## Introduction

This design addresses two critical issues in the MIHAS Application System:

1. **Realtime updates not working** - Root cause identified: code in `src/lib/supabase.ts` blocks realtime connections using `import.meta.env.DEV` which may incorrectly evaluate in production builds
2. **Poor mobile performance** - Lighthouse mobile score 64 vs desktop 94, caused by heavy Framer Motion usage, lack of route-level code splitting, and decorative animations

## Design Overview

### Architecture Changes

```
┌─────────────────────────────────────────────────────────────────────┐
│                        REALTIME FIX                                  │
├─────────────────────────────────────────────────────────────────────┤
│  supabase.ts                                                         │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ REMOVE: if (url.includes('/realtime/') && DEV) { reject }   │    │
│  │ ADD: Connection status tracking + reconnection logic        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ RealtimeStatusProvider (new context)                        │    │
│  │ - Tracks connection state                                   │    │
│  │ - Provides reconnect function                               │    │
│  │ - Exposes isConnected, isReconnecting                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ RealtimeStatusIndicator (new component)                     │    │
│  │ - Shows connection status in dashboard headers              │    │
│  │ - Subtle indicator (green dot = connected)                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    MOBILE PERFORMANCE FIX                            │
├─────────────────────────────────────────────────────────────────────┤
│  Route-Level Code Splitting                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ routes/index.tsx                                            │    │
│  │ - Wrap all page imports with React.lazy()                   │    │
│  │ - Add Suspense boundaries with loading fallbacks            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Animation Optimization                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ useOptimizedAnimation hook (new)                            │    │
│  │ - Detects mobile via viewport width                         │    │
│  │ - Respects prefers-reduced-motion                           │    │
│  │ - Returns CSS transition props or disabled state            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Replace Framer Motion in critical paths:                    │    │
│  │ - applicationWizard/index.tsx → CSS transitions             │    │
│  │ - FloatingOrbs.tsx → disable on mobile                      │    │
│  │ - Dashboard components → CSS transitions                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Build Optimization                                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ vite.config.production.ts                                   │    │
│  │ - Add route-based chunk splitting                           │    │
│  │ - Separate framer-motion to optional chunk                  │    │
│  │ - Optimize chunk loading order                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Designs

### Component 1: Realtime Connection Fix in supabase.ts

**Purpose:** Remove the code that blocks realtime connections and add proper connection management

**Location:** `src/lib/supabase.ts`

**Changes:**
1. Remove lines 171-175 that block realtime in development
2. Add connection status event dispatching
3. Add reconnection helper function

```typescript
// REMOVE THIS CODE (lines 171-175):
// if (sanitizedUrl.includes('/realtime/') && import.meta.env.DEV) {
//   return Promise.reject(new Error('Realtime disabled in development'))
// }

// ADD: Export reconnection helper
export function reconnectRealtime(): void {
  if (supabaseClient) {
    // Remove all channels and let hooks re-subscribe
    supabaseClient.removeAllChannels()
    window.dispatchEvent(new CustomEvent('supabase:realtime-reconnect'))
  }
}

// ADD: Connection status tracking
export const REALTIME_STATUS_EVENT = 'supabase:realtime-status'

export interface RealtimeStatusDetail {
  connected: boolean
  channelCount: number
}
```

**Behavior:**
- Realtime connections will work in both development and production
- Components can listen for reconnect events to re-establish subscriptions
- Status events allow UI to show connection state

---

### Component 2: RealtimeStatusContext

**Purpose:** Provide centralized realtime connection status to the application

**Location:** `src/contexts/RealtimeStatusContext.tsx`

**Interface:**
```typescript
interface RealtimeStatusContextValue {
  isConnected: boolean
  isReconnecting: boolean
  channelCount: number
  reconnect: () => void
  lastConnectedAt: Date | null
}
```

**Behavior:**
- Tracks overall realtime connection status
- Provides reconnect function for manual recovery
- Updates on channel subscribe/unsubscribe events
- Debounces status updates to prevent UI flicker

---

### Component 3: RealtimeStatusIndicator

**Purpose:** Visual indicator showing realtime connection status in dashboard headers

**Location:** `src/components/ui/RealtimeStatusIndicator.tsx`

**Props:**
```typescript
interface RealtimeStatusIndicatorProps {
  showLabel?: boolean  // Show "Live" text next to indicator
  size?: 'sm' | 'md'   // Indicator size
}
```

**Visual Design:**
- Connected: Small green dot with subtle pulse animation (CSS only)
- Disconnected: Gray dot
- Reconnecting: Yellow dot with spin animation
- Hover tooltip shows detailed status

**Accessibility:**
- `aria-label` describes connection status
- Color is not the only indicator (shape/animation differs)

---

### Component 4: useOptimizedAnimation Hook

**Purpose:** Provide animation configuration that adapts to device capabilities and user preferences

**Location:** `src/hooks/useOptimizedAnimation.ts`

**Interface:**
```typescript
interface UseOptimizedAnimationReturn {
  shouldAnimate: boolean           // Whether to animate at all
  prefersReducedMotion: boolean    // User preference
  isMobile: boolean                // Device detection
  transitionProps: {               // CSS transition properties
    transition: string
    willChange: string
  }
  fadeIn: string                   // CSS class for fade-in
  slideIn: string                  // CSS class for slide-in
}

function useOptimizedAnimation(): UseOptimizedAnimationReturn
```

**Behavior:**
- Returns `shouldAnimate: false` on mobile devices (viewport < 768px)
- Returns `shouldAnimate: false` when `prefers-reduced-motion: reduce`
- Provides CSS transition strings for components that need animation
- Memoizes calculations to prevent re-renders

---

### Component 5: Route-Level Code Splitting

**Purpose:** Split page components into separate chunks loaded on demand

**Location:** `src/routes/index.tsx`

**Pattern:**
```typescript
// Before
import StudentDashboard from '@/pages/student/Dashboard'

// After
const StudentDashboard = lazy(() => import('@/pages/student/Dashboard'))

// With loading fallback
<Suspense fallback={<PageLoadingFallback />}>
  <StudentDashboard />
</Suspense>
```

**Pages to Split:**
- All pages in `src/pages/student/`
- All pages in `src/pages/admin/`
- All pages in `src/pages/auth/`
- Heavy feature pages (application wizard, reports, etc.)

---

### Component 6: PageLoadingFallback

**Purpose:** Lightweight loading indicator shown while page chunks load

**Location:** `src/components/ui/PageLoadingFallback.tsx`

**Design:**
- Minimal DOM (single div with spinner)
- No external dependencies
- Inline critical styles
- Matches app theme

```typescript
export function PageLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  )
}
```

---

### Component 7: Application Wizard Animation Optimization

**Purpose:** Replace Framer Motion with CSS transitions in the application wizard

**Location:** `src/pages/student/applicationWizard/index.tsx`

**Changes:**
1. Remove `framer-motion` imports
2. Use `useOptimizedAnimation` hook
3. Replace `motion.div` with regular `div` + CSS classes
4. Replace `AnimatePresence` with CSS transition groups

**CSS Classes to Add:**
```css
/* In tailwind or component styles */
.wizard-fade-enter {
  opacity: 0;
  transform: translateY(8px);
}
.wizard-fade-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 300ms ease-out, transform 300ms ease-out;
}
```

**Behavior:**
- On mobile: No animations, instant transitions
- On desktop with reduced motion: No animations
- On desktop: CSS transitions (lighter than Framer Motion)

---

### Component 8: FloatingOrbs Mobile Optimization

**Purpose:** Disable decorative floating orbs animation on mobile devices

**Location:** `src/components/ui/FloatingOrbs.tsx` (or similar)

**Changes:**
```typescript
export function FloatingOrbs() {
  const { shouldAnimate, isMobile } = useOptimizedAnimation()
  
  // Don't render on mobile at all
  if (isMobile || !shouldAnimate) {
    return null
  }
  
  // Existing implementation for desktop
  return (/* ... */)
}
```

---

### Component 9: Vite Build Configuration Updates

**Purpose:** Optimize chunk splitting for better mobile loading

**Location:** `vite.config.production.ts`

**Changes:**
```typescript
manualChunks: (id) => {
  if (id.includes('node_modules')) {
    // Existing splits...
    
    // ADD: Separate framer-motion (only loaded when needed)
    if (id.includes('framer-motion')) {
      return 'vendor-animation'
    }
    
    // ADD: React Router in its own chunk
    if (id.includes('react-router')) {
      return 'vendor-router'
    }
  }
  
  // ADD: Route-based splitting
  if (id.includes('src/pages/admin/')) {
    return 'pages-admin'
  }
  if (id.includes('src/pages/student/')) {
    return 'pages-student'
  }
  if (id.includes('src/pages/auth/')) {
    return 'pages-auth'
  }
}
```

## Data Flow

### Realtime Update Flow

```
Database Change
      │
      ▼
Supabase Realtime (WebSocket)
      │
      ▼
useStudentDashboardRealtime / useAdminDashboardRealtime
      │
      ├──► React Query Cache Invalidation
      │         │
      │         ▼
      │    Background Refetch
      │         │
      │         ▼
      │    UI Updates Automatically
      │
      └──► Custom Event Dispatch
                │
                ▼
           Non-React-Query Components Update
```

### Mobile Performance Flow

```
User Visits Page
      │
      ▼
Route Matched (React Router)
      │
      ▼
Lazy Component Import Triggered
      │
      ▼
Chunk Downloaded (if not cached)
      │
      ▼
Suspense Shows PageLoadingFallback
      │
      ▼
Component Renders
      │
      ├──► useOptimizedAnimation() called
      │         │
      │         ▼
      │    Returns shouldAnimate: false (mobile)
      │         │
      │         ▼
      │    Animations Skipped
      │
      └──► FloatingOrbs returns null (mobile)
```

## Error Handling

### Realtime Connection Errors

| Error | Handling |
|-------|----------|
| WebSocket connection failed | Fall back to polling (30s interval) |
| Channel subscription timeout | Retry with exponential backoff (max 3 attempts) |
| Authentication expired | Trigger session refresh, then reconnect |
| Network offline | Queue operations, sync on reconnect |

### Chunk Loading Errors

| Error | Handling |
|-------|----------|
| Chunk failed to load | Show retry button in error boundary |
| Network timeout | Show offline indicator, retry on reconnect |
| Module not found | Log error, show generic error page |

## Performance Targets

| Metric | Current | Target | Strategy |
|--------|---------|--------|----------|
| Mobile Lighthouse | 64 | 80+ | Code splitting, animation removal |
| FCP (3G) | 16.2s | <2s | Route splitting, critical CSS, defer queries |
| LCP | 34.3s | <2.5s | Eliminate render blocking, defer analytics |
| TBT | 560ms | <200ms | Remove Framer Motion on mobile, fix reflows |
| Main bundle | 910KB | <300KB | Tree-shake lucide-react, lazy loading |
| Critical path | 3,259ms | <1s | Defer non-critical queries, remove duplicate calls |

## Additional Design Components

### Component 10: Lucide React Tree Shaking

**Purpose:** Reduce lucide-react bundle from 853KB to only used icons

**Location:** All files importing from `lucide-react`

**Pattern:**
```typescript
// BEFORE (imports entire library)
import { Home, User, Settings } from 'lucide-react'

// AFTER (tree-shakeable imports)
import Home from 'lucide-react/dist/esm/icons/home'
import User from 'lucide-react/dist/esm/icons/user'
import Settings from 'lucide-react/dist/esm/icons/settings'
```

**Alternative:** Create a barrel file `src/components/icons/index.ts` that re-exports only used icons.

---

### Component 11: ResponsiveHeader Reflow Fix

**Purpose:** Eliminate 77ms forced reflow in ResponsiveHeader component

**Location:** `src/components/navigation/ResponsiveHeader.tsx`

**Root Cause:** Reading layout properties (offsetWidth, getBoundingClientRect) after DOM mutations

**Fix Pattern:**
```typescript
// BEFORE (causes reflow)
element.style.width = '100px'
const width = element.offsetWidth // FORCED REFLOW

// AFTER (batch reads before writes)
const width = element.offsetWidth // Read first
element.style.width = '100px'     // Then write
```

**Implementation:**
1. Use `useLayoutEffect` for DOM measurements
2. Batch all reads before writes
3. Use CSS variables instead of inline style calculations
4. Consider using `ResizeObserver` instead of manual measurements

---

### Component 12: Deferred Analytics Queries

**Purpose:** Defer user_engagement_metrics queries until after LCP

**Location:** `src/contexts/RealtimeStatusContext.tsx` and analytics hooks

**Current Problem:** 5 duplicate calls to `user_engagement_metrics` blocking render

**Fix:**
```typescript
// Defer analytics until after page is interactive
useEffect(() => {
  // Wait for LCP (approximate with requestIdleCallback)
  const id = requestIdleCallback(() => {
    // Now safe to make analytics queries
    fetchEngagementMetrics()
  }, { timeout: 3000 })
  
  return () => cancelIdleCallback(id)
}, [])
```

**Additional Changes:**
1. Deduplicate queries using React Query's built-in deduplication
2. Add `staleTime: Infinity` for analytics data (doesn't need real-time updates)
3. Move analytics initialization out of critical render path

## Testing Strategy

### Realtime Testing
1. Unit test: Verify realtime blocking code is removed
2. Integration test: Verify subscription establishes in production build
3. E2E test: Verify UI updates when database changes

### Mobile Performance Testing
1. Lighthouse CI: Run on every PR, fail if score < 75
2. Bundle analysis: Track chunk sizes
3. Manual testing: Test on real mobile devices (Android, iOS)

## Migration Notes

### Breaking Changes
- None expected - all changes are additive or internal

### Backward Compatibility
- Existing realtime hooks continue to work
- Components using Framer Motion still work (just heavier)
- Gradual migration path for animation replacement

### Rollback Plan
1. Realtime fix: Revert single line change in supabase.ts
2. Animation changes: Revert individual component files
3. Build config: Revert vite.config.production.ts
