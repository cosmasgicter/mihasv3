# Requirements Document

## Introduction

This specification addresses two critical user experience issues in the MIHAS Application System:

1. **Realtime updates not working** - Changes to applications, statuses, and notifications only appear after a hard refresh (Ctrl+Shift+R), despite the system claiming to have realtime functionality
2. **Poor mobile performance** - Lighthouse mobile score is 64 vs desktop 94, causing the app to feel slow, clunky, and unpolished on mobile devices

Both issues significantly impact user retention and satisfaction.

## Glossary

- **Realtime_Subscription**: A Supabase WebSocket connection that pushes database changes to the client without polling
- **React_Query_Cache**: Client-side cache managed by TanStack Query that stores server data
- **Cache_Invalidation**: The process of marking cached data as stale to trigger a refetch
- **Framer_Motion**: A React animation library that is performance-heavy on mobile devices
- **Code_Splitting**: Technique to split JavaScript bundles into smaller chunks loaded on demand
- **LCP**: Largest Contentful Paint - Core Web Vital measuring when main content is visible
- **FCP**: First Contentful Paint - Time until first content renders
- **TBT**: Total Blocking Time - Time the main thread is blocked during page load

## Requirements

### Requirement 1: Realtime Subscription Connection

**User Story:** As a user, I want to see changes to my application status in real-time, so that I don't have to manually refresh the page to see updates.

#### Acceptance Criteria

1. WHEN the application loads in production, THE Realtime_Subscription SHALL establish a WebSocket connection to Supabase
2. WHEN a database change occurs on a subscribed table, THE Realtime_Subscription SHALL receive the change event within 2 seconds
3. IF the WebSocket connection fails, THEN THE System SHALL fall back to polling every 30 seconds
4. WHEN the connection is restored after a failure, THE System SHALL automatically re-establish the Realtime_Subscription
5. THE System SHALL NOT block realtime connections based on environment detection that may be incorrect in production

### Requirement 2: React Query Cache Synchronization

**User Story:** As a user, I want the UI to update automatically when realtime events are received, so that I always see the current state without refreshing.

#### Acceptance Criteria

1. WHEN a realtime event is received for applications, THE React_Query_Cache SHALL invalidate relevant application queries
2. WHEN a realtime event is received for payments, THE React_Query_Cache SHALL invalidate relevant payment queries
3. WHEN a realtime event is received for notifications, THE React_Query_Cache SHALL invalidate notification queries and update the unread count
4. WHEN cache invalidation occurs, THE System SHALL trigger a background refetch without blocking the UI
5. THE System SHALL debounce rapid successive events to prevent excessive refetching (minimum 500ms between invalidations per table)

### Requirement 3: Admin Dashboard Realtime Updates

**User Story:** As an admin, I want to see new applications and status changes in real-time, so that I can respond to students promptly.

#### Acceptance Criteria

1. WHEN an application is submitted, THE Admin_Dashboard SHALL display the new application without manual refresh
2. WHEN an application status is changed by another admin, THE Admin_Dashboard SHALL reflect the change within 3 seconds
3. WHEN a payment is received, THE Admin_Dashboard SHALL update payment status indicators automatically
4. THE Admin_Dashboard SHALL display a connection status indicator showing realtime connection health

### Requirement 4: Student Dashboard Realtime Updates

**User Story:** As a student, I want to see updates to my application status immediately, so that I know when action is required.

#### Acceptance Criteria

1. WHEN an admin changes my application status, THE Student_Dashboard SHALL display the new status without manual refresh
2. WHEN a new notification is created for me, THE Student_Dashboard SHALL update the notification badge immediately
3. WHEN my interview is scheduled, THE Student_Dashboard SHALL display the interview details automatically
4. THE Student_Dashboard SHALL show a subtle indicator when realtime is connected vs disconnected

### Requirement 5: Mobile Performance - Bundle Optimization

**User Story:** As a mobile user, I want the application to load quickly on my device, so that I can complete my application without frustration.

#### Acceptance Criteria

1. THE System SHALL achieve a Lighthouse mobile performance score of at least 80
2. THE System SHALL load the initial page content (FCP) within 2 seconds on 3G connections
3. THE System SHALL split route-level components into separate chunks loaded on demand
4. THE System SHALL lazy-load heavy libraries (charts, PDF, Excel, OCR) only when needed
5. THE System SHALL keep the main JavaScript bundle under 300KB gzipped
6. THE System SHALL tree-shake lucide-react to only include used icons (current: 853KB unused)
7. THE System SHALL defer non-critical Supabase queries until after initial render
8. THE System SHALL eliminate duplicate API calls during initial page load

### Requirement 6: Mobile Performance - Animation Optimization

**User Story:** As a mobile user, I want smooth interactions without lag, so that the app feels responsive and polished.

#### Acceptance Criteria

1. THE System SHALL replace Framer Motion animations with CSS transitions for core UI components
2. THE System SHALL respect the user's reduced motion preference via `prefers-reduced-motion`
3. THE System SHALL disable decorative animations (like FloatingOrbs) on mobile devices
4. THE System SHALL ensure animations do not block the main thread for more than 50ms
5. WHEN the device has limited resources, THE System SHALL reduce or disable non-essential animations
6. THE System SHALL eliminate forced reflows in ResponsiveHeader component (current: 77ms reflow)
7. THE System SHALL batch DOM reads and writes to prevent layout thrashing

### Requirement 7: Mobile Performance - Image and Asset Optimization

**User Story:** As a mobile user on a slow connection, I want images and assets to load efficiently, so that I don't waste data or wait unnecessarily.

#### Acceptance Criteria

1. THE System SHALL lazy-load images that are below the fold
2. THE System SHALL serve appropriately sized images based on device viewport
3. THE System SHALL inline critical CSS required for above-the-fold content
4. THE System SHALL preload critical fonts to prevent layout shift
5. THE System SHALL compress and optimize all image assets

### Requirement 8: Connection Resilience

**User Story:** As a user on an unreliable Zambian connection, I want the app to handle connection issues gracefully, so that I don't lose my work or miss updates.

#### Acceptance Criteria

1. WHEN the network connection is lost, THE System SHALL queue any pending operations
2. WHEN the connection is restored, THE System SHALL automatically sync queued operations
3. THE System SHALL display a clear offline indicator when disconnected
4. WHEN reconnecting, THE System SHALL fetch any missed updates since disconnection
5. THE System SHALL NOT show error messages for transient connection issues (under 5 seconds)

### Requirement 9: Critical Path Optimization

**User Story:** As a user, I want the landing page to load quickly, so that I can start using the application without waiting.

#### Acceptance Criteria

1. THE System SHALL reduce critical path latency to under 1 second (current: 3,259ms)
2. THE System SHALL defer user_engagement_metrics queries until after LCP
3. THE System SHALL NOT make duplicate API calls during initial page load (current: 5 duplicate calls)
4. THE System SHALL preconnect only to origins that are actually used during initial load
5. THE System SHALL remove unused preconnect hints (fonts.gstatic.com if not used)
6. WHEN loading the landing page, THE System SHALL prioritize above-the-fold content rendering
