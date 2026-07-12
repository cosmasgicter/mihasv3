# Requirements Document

## Introduction

This specification covers a comprehensive redesign and codebase unification of the MIHAS admissions platform (apply.mihas.edu.zm). The work spans three pillars: (1) complete visual redesign of the homepage, public pages, auth pages, and mobile navigation with mobile-first UX; (2) elimination of duplicate code, competing hooks, parallel systems, and dead code that cause race conditions, bundle bloat, and maintenance confusion; and (3) integration of SmoothUI animation components across the platform. Additionally, this spec addresses all issues identified in the codex.md, jules.md, and codexaudit.md forensic analysis reports — including 54 frontend-backend API contract mismatches, accessibility violations, broken HTML sanitization, and API client conflicts. The goal is a faster, more consistent, and more maintainable application without breaking any existing functionality for live users.

## Glossary

- **Platform**: The MIHAS-KATC admissions web application at apply.mihas.edu.zm
- **Public_Pages**: Unauthenticated pages — LandingPage, ContactPage, NotFoundPage, PublicApplicationTracker
- **Auth_Pages**: Authentication flow pages — SignInPage, SignUpPage, ForgotPasswordPage, ResetPasswordPage, AuthCallbackPage
- **Auth_Hook_System**: The consolidated authentication state management (currently split across useSessionListener and useOptimizedAuthState)
- **Offline_System**: The consolidated offline data persistence layer (currently split across offlineSync.ts, offlineManager.ts, and offlineStorage.ts)
- **Navigation_System**: The header, mobile menu, and routing components for unauthenticated users
- **SmoothUI**: The project's custom animation component library (PageTransition, ScrollReveal, AnimatedCounter, AnimatedInput, AnimatedSelect, AnimatedFileUpload)
- **UI_Primitives**: Base UI components in src/components/ui/ (Card, Button, Input, etc.)
- **Eligibility_Engine**: The consolidated eligibility checking logic (currently split across eligibilityEngine.ts, eligibility.ts, useEligibilityChecker.ts, useEligibilityCheckerFixed.ts)
- **Application_Data_Hooks**: The consolidated application data fetching hooks (currently split across useApplicationsWithCounts.ts and useApplicationsData.ts)
- **Dead_Code**: Modules that are stubbed, unused, or reference removed services (analytics.ts, analyticsService.ts, Turnstile/TurnstileBypass, ParticleBackground, FloatingOrbs)
- **Frontend_Services**: API client modules in src/services/ that make HTTP calls to backend endpoints
- **API_Contract**: The agreement between frontend service calls (URL, method, auth) and backend endpoint handlers (route, action, auth requirement)
- **SharedFooter**: A single footer component used across all public pages, extracted from the current inline LandingPage footer
- **PublicLayout**: A shared layout wrapper providing ResponsiveHeader and SharedFooter to all public pages

---

## Requirements

### Requirement 1: Homepage Redesign

**User Story:** As a prospective student visiting the MIHAS website on a mobile phone, I want a visually compelling and fast-loading homepage, so that I can quickly understand the programs offered and begin my application.

#### Acceptance Criteria

1. WHEN a user visits the homepage, THE Platform SHALL render a full-width hero section with a gradient background, headline text, subtitle, and two call-to-action buttons ("Start Your Application" and "Learn More") within 2.5 seconds on a 3G connection
2. WHEN the homepage loads, THE Platform SHALL display animated statistics (graduate count, job placement rate, training years, employer partners) using SmoothUI AnimatedCounter components that count up when scrolled into view
3. WHEN a user scrolls the homepage, THE Platform SHALL reveal content sections (features, accreditations, programs, CTA) using SmoothUI ScrollReveal and StaggerReveal animations that trigger on viewport intersection
4. WHEN the homepage renders on a mobile viewport (below 768px), THE Platform SHALL display all sections in a single-column layout with touch-friendly tap targets of at least 44x44 pixels
5. THE Platform SHALL not use blur-heavy CSS effects (blur-3xl) or GPU-intensive particle animations on the homepage that degrade performance on low-power devices
6. THE Platform SHALL include structured data (JSON-LD) for Organization and EducationalOrganization schemas on the homepage
7. WHEN an authenticated user visits the homepage, THE Platform SHALL redirect the user to their role-appropriate dashboard (admin/dashboard for admin/super_admin, student/dashboard for students)
8. WHEN all hero CTA buttons are rendered, THE Platform SHALL use a consistent composition pattern (Button asChild with a single Link child) with analytics handlers attached to the clickable element, visible focus rings, and min touch target of 48px

### Requirement 2: Mobile Navigation Redesign

**User Story:** As a mobile user, I want intuitive and accessible navigation, so that I can easily find pages and start my application without confusion.

#### Acceptance Criteria

1. THE Navigation_System SHALL render a sticky header with the institution logo, navigation links (Home, Track, Contact, Sign In), and a primary "Apply Now" call-to-action button on all public pages
2. WHEN the mobile menu is toggled on viewports below 768px, THE Navigation_System SHALL animate the menu open and closed using CSS transitions (max-height and opacity) without JavaScript animation libraries
3. WHEN the mobile menu is open, THE Navigation_System SHALL trap keyboard focus within the menu and close the menu on Escape key press
4. WHEN a navigation link is activated in the mobile menu, THE Navigation_System SHALL close the menu and navigate to the target page
5. THE Navigation_System SHALL highlight the currently active page link using a visually distinct style and set aria-current="page" on the active link
6. WHEN the viewport is below 768px, THE Navigation_System SHALL display a hamburger menu icon that expands to show navigation links with accompanying icons and minimum 44px touch targets
7. THE Navigation_System SHALL render a skip-to-content link as the first focusable element before the navigation

### Requirement 3: Public Pages Redesign (Contact, Tracker, 404)

**User Story:** As a visitor, I want all public pages (Contact, Application Tracker, 404) to have a consistent, professional design matching the homepage, so that the institution appears trustworthy and modern.

#### Acceptance Criteria

1. WHEN a user visits the Contact page, THE Platform SHALL display contact information (two phone numbers, email, physical address) with clickable tel: and mailto: links, and a contact form with name, email, and message fields validated by Zod
2. WHEN a user visits the Application Tracker page, THE Platform SHALL display a search interface where the user can enter an application number or tracking code to check status
3. WHEN a user visits a non-existent URL, THE Platform SHALL display a styled 404 page with a "Go Home" button, a "Go Back" button, and contextual page suggestions based on the attempted URL path
4. THE Platform SHALL wrap all public page route changes using SmoothUI PageTransition components for consistent enter/exit animations
5. THE Platform SHALL use a shared PublicLayout component (containing ResponsiveHeader and SharedFooter) across all public pages instead of each page importing header and footer independently
6. THE Platform SHALL render the footer from a single SharedFooter component, and WHEN the footer content is updated, the change SHALL reflect on all public pages without modifying individual page files

### Requirement 4: Auth Pages Polish

**User Story:** As a prospective student, I want clean and accessible authentication pages, so that I can sign up, sign in, and recover my password without friction on any device.

#### Acceptance Criteria

1. WHEN a user visits the Sign Up page, THE Auth_Pages SHALL display a registration form with Zod-validated fields (full name, email, password, confirm password, phone, date of birth, sex, city, nationality, next of kin) and inline validation errors adjacent to the relevant fields
2. WHEN a user visits the Sign In page, THE Auth_Pages SHALL display a login form with email and password fields, a "Forgot password?" link, and a link to the Sign Up page
3. WHEN a user submits an auth form with invalid data, THE Auth_Pages SHALL display inline validation errors adjacent to the relevant fields without a full page reload
4. WHEN an auth form is submitting, THE Auth_Pages SHALL display a loading state on the submit button and disable the button to prevent duplicate submissions
5. THE Auth_Pages SHALL use a shared AuthLayout component that provides consistent branding, responsive two-column layout (hero panel + form panel), and SmoothUI page transitions
6. WHEN a user visits the Forgot Password page, THE Auth_Pages SHALL accept an email address and display a confirmation message after submission regardless of whether the email exists in the system
7. THE Auth_Pages SHALL remove the Turnstile component import and all references to VITE_TURNSTILE_SITE_KEY since Cloudflare integration has been removed
8. THE Auth_Pages SHALL remove the @ts-nocheck directive from SignInPage.tsx and SignUpPage.tsx and resolve any underlying type errors

### Requirement 5: Auth Hook Consolidation

**User Story:** As a developer, I want a single source of truth for authentication state, so that there are no race conditions between competing auth hooks.

#### Acceptance Criteria

1. THE Auth_Hook_System SHALL provide authentication state (user, profile, loading, isAuthenticated, isAdmin) through a single React context backed by one session-checking mechanism using React Query
2. WHEN a user logs in, THE Auth_Hook_System SHALL update the React Query session cache and set the user state in a single atomic operation without triggering separate state updates from competing hooks
3. WHEN a user logs out, THE Auth_Hook_System SHALL clear all auth-related React Query caches and reset user state in a single atomic operation
4. THE Auth_Hook_System SHALL not make duplicate concurrent API calls to /api/auth?action=session from separate hooks (useSessionListener and useOptimizedAuthState shall be merged into one)
5. WHEN the access token expires, THE Auth_Hook_System SHALL attempt a single token refresh via /api/auth?action=refresh before redirecting to the sign-in page

### Requirement 6: Duplicate UI Primitive Consolidation

**User Story:** As a developer, I want each UI primitive (Card, Skeleton, Tooltip, etc.) to exist as a single canonical component, so that styling is consistent and bundle size is minimized.

#### Acceptance Criteria

1. THE UI_Primitives SHALL export each component type (Card, Skeleton, Tooltip, Badge, etc.) from exactly one file with no duplicate implementations in src/components/ui/
2. WHEN a component is imported, THE Platform SHALL resolve it through the src/components/ui/index.ts barrel export using consistent casing (lowercase for shadcn-style primitives: card.tsx, skeleton.tsx, tooltip.tsx, input.tsx)
3. THE Platform SHALL not contain both PascalCase and lowercase versions of the same UI component (e.g., SkeletonLoader.tsx shall be removed if skeleton.tsx provides equivalent functionality)
4. THE Platform SHALL remove deprecated button wrapper components (TouchButton, TouchOptimizedButton, LightweightButton, MobileOptimizedButton) and update all imports to use the canonical Button component
5. THE Platform SHALL remove duplicate loading components (LoadingSpinner, LoadingButton, LoadingOverlay, SkeletonLoader) that are superseded by UnifiedLoader variants, after verifying all consumers are migrated

### Requirement 7: Dead Code and Legacy Removal

**User Story:** As a developer, I want all unused, stubbed, and legacy code removed, so that the codebase is smaller, faster to build, and free of confusion.

#### Acceptance Criteria

1. THE Platform SHALL not contain analytics modules (src/lib/analytics.ts, src/services/analyticsService.ts, src/services/analytics.ts, src/components/analytics/AnalyticsTracker.tsx) that reference removed Umami/Sentry services
2. THE Platform SHALL not contain the useAnalytics hook (src/hooks/useAnalytics.ts) or any analytics tracking calls (trackAction, trackPageView) in page components; all call sites in LandingPage, ContactPage, admin Dashboard, and application wizard SHALL have analytics references removed
3. THE Platform SHALL not contain Turnstile or TurnstileBypass components (src/components/ui/Turnstile.tsx, src/components/TurnstileBypass.tsx) that reference removed Cloudflare integration
4. THE Platform SHALL not contain duplicate particle/animation systems (src/components/ui/ParticlesBackground.tsx, src/components/effects/ParticleBackground.tsx, src/components/ui/FloatingOrbs.tsx, src/components/ui/FloatingElements.tsx); all SHALL be removed and replaced by CSS gradient backgrounds
5. IF a module is removed, THEN THE Platform SHALL update all import references and barrel exports to prevent build errors
6. THE Platform SHALL not contain the src/components/ui/PageTransition.tsx file (duplicate of src/components/smoothui/page-transition.tsx); all imports SHALL use the SmoothUI version
7. THE Platform SHALL not contain src/components/ui/AnimatedCard.tsx, AnimatedPage.tsx, or AnimatedSection.tsx if their functionality is covered by SmoothUI equivalents

### Requirement 8: Eligibility Logic Consolidation

**User Story:** As a developer, I want eligibility checking to exist in a single engine with one hook interface, so that eligibility results are consistent and maintainable.

#### Acceptance Criteria

1. THE Eligibility_Engine SHALL provide eligibility checking through a single module (eligibilityEngine.ts) with one corresponding hook (useEligibilityChecker.ts)
2. WHEN eligibility is checked, THE Eligibility_Engine SHALL return a result object containing a pass/fail status, a score breakdown, and advisory messages
3. THE Platform SHALL not contain duplicate eligibility modules (src/lib/eligibility.ts, src/hooks/useEligibilityCheckerFixed.ts, and any detailedEligibilityScoring.ts or eligibilityScoringEngine.ts files) after consolidation
4. WHEN an external eligibility API (HPCZ, NMCZ, ECZ) fails, THE Eligibility_Engine SHALL return an advisory result with a fallback message instead of blocking the application flow

### Requirement 9: Application Data Hook Consolidation

**User Story:** As a developer, I want application data fetching to go through a single hook, so that there are no duplicate API calls or stale cache conflicts.

#### Acceptance Criteria

1. THE Application_Data_Hooks SHALL provide application listing and count data through a single hook using React Query with consistent cache keys
2. THE Platform SHALL not contain both useApplicationsWithCounts.ts and useApplicationsData.ts after consolidation; one canonical hook SHALL remain
3. WHEN application data is fetched, THE Application_Data_Hooks SHALL use React Query caching with a consistent stale time to prevent redundant API calls
4. WHEN the application list is updated (new submission, status change), THE Application_Data_Hooks SHALL invalidate the relevant React Query cache keys

### Requirement 10: Offline System Consolidation

**User Story:** As a developer, I want a single offline persistence layer, so that offline data is stored consistently without conflicts between competing storage mechanisms.

#### Acceptance Criteria

1. THE Offline_System SHALL use a single storage mechanism (IndexedDB via offlineStorage.ts) for all offline data persistence, not localStorage for request queues
2. THE Platform SHALL not contain both offlineSync.ts (service with its own queue) and offlineManager.ts (generic request queue using localStorage) as separate competing offline systems after consolidation
3. WHEN the network connection is restored, THE Offline_System SHALL sync queued operations to the server in the order they were created
4. WHEN an offline sync operation fails, THE Offline_System SHALL retain the operation in the queue and retry on the next connectivity event

### Requirement 11: SmoothUI Integration Across Pages

**User Story:** As a user, I want subtle, consistent animations across all pages, so that the application feels polished and responsive without sacrificing performance.

#### Acceptance Criteria

1. THE Platform SHALL use SmoothUI PageTransition on all page route changes for consistent enter/exit animations
2. THE Platform SHALL use SmoothUI ScrollReveal for content sections that benefit from scroll-triggered reveal animations on public pages
3. THE Platform SHALL use SmoothUI AnimatedInput and AnimatedSelect in form fields on auth pages where appropriate
4. THE Platform SHALL not use framer-motion for new animations; existing framer-motion usage SHALL be replaced with CSS transitions or SmoothUI equivalents
5. WHEN a device has prefers-reduced-motion enabled, THE Platform SHALL disable all SmoothUI animations and show content immediately

### Requirement 12: Application Submission Hook Consolidation

**User Story:** As a developer, I want a single application submission hook, so that submission logic is consistent and there are no competing implementations.

#### Acceptance Criteria

1. THE Platform SHALL provide application submission through a single hook (useApplicationSubmit.ts)
2. THE Platform SHALL not contain both useApplicationSubmit.ts and useApplicationSubmitFixed.ts after consolidation; the "Fixed" variant's improvements SHALL be merged into the canonical hook
3. WHEN a submission is in progress, THE Platform SHALL disable the submit button and display a loading indicator to prevent duplicate submissions

### Requirement 13: API Client Unification

**User Story:** As a developer, I want a single API client module, so that request handling, error unwrapping, and caching are consistent across the frontend.

#### Acceptance Criteria

1. THE Platform SHALL use src/services/client.ts (ApiClient) as the single API client for all new and migrated API calls
2. THE Platform SHALL not contain duplicate API client logic in both src/lib/apiClient.ts and src/services/client.ts after migration is complete
3. WHEN an API response is received, THE Platform SHALL unwrap the { success, data } envelope exactly once through the ApiClient
4. THE Platform SHALL rename the custom cache control property in the ApiClient from `cache` (boolean) to a distinct name (e.g., `enableClientCache`) to avoid collision with the standard RequestInit.cache string property

### Requirement 14: Frontend-Backend API Contract Alignment

**User Story:** As a developer, I want frontend service calls to match the backend's query-parameter routing convention, so that API calls succeed and there are no 404 errors in production.

#### Acceptance Criteria

1. THE Frontend_Services SHALL use query-parameter routing (e.g., /api/admin?action=users) instead of path-based routing (e.g., /api/admin/users) for all calls to consolidated Vercel endpoints
2. WHEN a frontend service module contains calls using path-based routing that does not match any backend endpoint, THE Platform SHALL rewrite those calls to use the correct query-parameter format matching the backend handler's switch statement
3. THE Platform SHALL not contain frontend service calls to endpoints that do not exist in the backend (the 54 MISSING_ENDPOINT issues from codexaudit.md SHALL be resolved by rewriting to correct routes or removing dead service methods)
4. WHEN the pushNotificationManager calls /api/notifications?action=push-subscribe, THE Platform SHALL include authentication credentials (cookies) in the request to match the backend's auth requirement

### Requirement 15: Accessibility Compliance

**User Story:** As a user with assistive technology, I want all pages to follow accessibility best practices, so that I can navigate and use the application effectively.

#### Acceptance Criteria

1. THE Platform SHALL associate all form input elements with visible labels using matching htmlFor and id attributes (fixing the input.tsx label association issue identified in jules.md)
2. THE Platform SHALL provide alt text for all img elements, including user avatars in UserMenu and file upload previews in EnhancedFileUpload
3. WHEN HTML content from user input is displayed via dangerouslySetInnerHTML, THE Platform SHALL sanitize it using DOMPurify (or equivalent library) instead of the current string-replacement sanitizer in src/lib/sanitizer.ts
4. THE Platform SHALL provide skip-to-content links on all pages for keyboard navigation
5. THE Platform SHALL maintain a logical heading hierarchy (h1 → h2 → h3) on every page without skipping levels

### Requirement 16: Shared Layout and Footer Unification

**User Story:** As a developer, I want shared layout components (footer, page wrapper) defined once, so that changes propagate consistently and there is no markup duplication.

#### Acceptance Criteria

1. THE Platform SHALL render the footer from a single SharedFooter component used across all public pages
2. THE Platform SHALL render public pages within a shared PublicLayout component that includes the ResponsiveHeader and SharedFooter
3. WHEN the footer content is updated, THE Platform SHALL reflect the change on all public pages without modifying individual page files
4. THE Platform SHALL extract shared data (contact info, quick links, social links) from LandingPage.tsx into a shared constants file that both SharedFooter and other components can import

### Requirement 17: Notification Dedup Key Standardization

**User Story:** As a developer, I want notification deduplication to use a single consistent key format, so that duplicate notifications are reliably prevented regardless of the creation path.

#### Acceptance Criteria

1. THE Platform SHALL use a single idempotency key format across all notification creation paths (both createNotificationWithDedup and handleCreate in the notifications endpoint)
2. WHEN a notification is created, THE Platform SHALL generate the idempotency key using the format `user_id:type:entity_type:entity_id` consistently
3. THE Platform SHALL not have two different dedup key formats (currently `event_type:entity_type:entity_id` vs `user_id:type:title:message`) that cause inconsistent dedup behavior
