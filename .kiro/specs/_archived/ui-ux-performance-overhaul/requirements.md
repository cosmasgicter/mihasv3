# Requirements Document

## Introduction

Comprehensive UI/UX and frontend performance overhaul of the MIHAS Application System (apply.mihas.edu.zm), a live production admissions portal for Mukuba Institute of Health and Allied Sciences in Zambia. The system serves real students on predominantly mobile devices with unreliable network connections. This overhaul transforms the frontend into a highly polished, mobile-first, visually unified, and performant experience while preserving all existing business-critical behavior: auto-save (8-second interval), offline/PWA functionality, role-based access control, draft persistence, and non-blocking validation. No backend rewrites are in scope unless a minimal frontend-facing adjustment is absolutely required.

## Glossary

- **Application_System**: The MIHAS admissions portal (React 18 + TypeScript + Vite + Tailwind CSS) deployed on Vercel at apply.mihas.edu.zm
- **Design_System**: The canonical set of UI primitives, design tokens, spacing scales, typography, and color palette defined in `tailwind.config.js` and `src/components/ui/`
- **Application_Wizard**: The 4-step student application form (Personal Information, Academic History, Program Selection, Document Upload) with auto-save and draft persistence
- **UI_Primitives**: The shared component library in `src/components/ui/` including Button, Input, Card, Modal, Toast, Select, Badge, Tabs, Dialog, Skeleton, and related components
- **Page_Shell**: A standardized page-level layout wrapper providing consistent header, content area, spacing, and responsive behavior across all authenticated pages
- **Loading_State**: Any visual indicator shown while data or components are being fetched, including skeletons, spinners, and shimmer effects
- **Empty_State**: A visual placeholder shown when a data list or view contains zero items, providing context and a call-to-action
- **Error_State**: A visual fallback shown when a data fetch or render fails, providing context and a retry mechanism
- **Touch_Target**: An interactive element (button, link, input) sized for reliable thumb interaction on mobile devices (minimum 44×44px per WCAG 2.5.5)
- **CLS**: Cumulative Layout Shift, a Core Web Vital measuring visual stability during page load
- **FCP**: First Contentful Paint, the time until the first text or image is rendered
- **LCP**: Largest Contentful Paint, the time until the largest visible content element is rendered
- **INP**: Interaction to Next Paint, measuring responsiveness to user input
- **Skeleton_Screen**: A low-fidelity placeholder UI that mirrors the layout of incoming content, shown during data loading
- **Route_Transition**: The visual experience when navigating between pages, including any loading indicators or animations
- **Auto_Save_Indicator**: The UI element that communicates auto-save status (saving, saved, error) to the student during wizard interaction
- **Bottom_Navigation**: The mobile-specific navigation bar fixed to the bottom of the viewport for thumb-reachable primary actions
- **Smooth_UI_Components**: Animation-enhanced components in `src/components/smoothui/` providing page transitions, scroll reveals, and animated inputs

## Requirements

### Requirement 1: Establish Canonical Design Token System

**User Story:** As a developer, I want a single source of truth for all visual design decisions (colors, spacing, typography, radii, shadows, transitions), so that every screen in the application shares a unified visual language without ad-hoc overrides.

#### Acceptance Criteria

1. THE Design_System SHALL define a complete semantic color palette in `tailwind.config.js` covering: primary, secondary, destructive, success, warning, info, muted, accent, background, foreground, card, popover, border, input, ring, skeleton, admin, link, and error — each with DEFAULT and foreground variants where applicable
2. THE Design_System SHALL define a spacing scale that enforces consistent vertical rhythm across all pages, using multiples of 4px (0.25rem) as the base unit
3. THE Design_System SHALL define a typography scale with named sizes (xs through 6xl) and mobile-optimized variants (mobile-xs through mobile-lg) with appropriate line heights for readability on small screens
4. THE Design_System SHALL define a canonical set of border-radius tokens (none, sm, md, lg, xl, 2xl, full) used consistently across all UI_Primitives
5. THE Design_System SHALL define a shadow scale (sm, md, lg, xl) and a transition duration scale (fast: 150ms, normal: 200ms, slow: 300ms) used consistently across all interactive and elevated elements
6. THE Design_System SHALL document all tokens in a single reference location so that developers can look up the correct token for any visual property without inspecting existing components

### Requirement 2: Consolidate and Deduplicate UI Primitives

**User Story:** As a developer, I want a single canonical version of each UI primitive (loading indicator, error display, empty state, select, file upload, form feedback), so that I do not have to choose between competing implementations and the UI is consistent.

#### Acceptance Criteria

1. THE Application_System SHALL consolidate all loading indicator variants (LoadingSpinner, EnhancedLoadingSpinner, LoadingState, LoadingFallback, LoadingOverlay, InlineLoader, UnifiedLoader, Spinner, PageLoadingFallback, AuthLoadingOverlay, FancyPreloader) into a maximum of 3 canonical loading components: a full-page loader, an inline/section loader, and a skeleton screen
2. THE Application_System SHALL consolidate all error display variants (ErrorDisplay, ErrorBoundary, SimpleErrorBoundary, EnhancedErrorHandling, FormError, FormFeedback) into a maximum of 2 canonical error components: an inline error message and a section/page-level error boundary with retry
3. THE Application_System SHALL consolidate all select/dropdown variants (select, standalone-select, form-select, dropdown-menu) into a single canonical Select component built on Radix UI primitives with consistent styling
4. THE Application_System SHALL consolidate all file upload variants (FileUpload, EnhancedFileUpload, SimpleFileUpload, animated-file-upload) into a single canonical FileUpload component with consistent drag-and-drop, progress, and error states
5. WHEN a deprecated or duplicate component is removed, THE Application_System SHALL update all consumer imports to reference the canonical replacement without changing external behavior
6. THE Application_System SHALL export all canonical UI_Primitives from `src/components/ui/index.ts` with no deprecated exports remaining

### Requirement 3: Standardize Page Shell and Layout Structure

**User Story:** As a student navigating the application, I want every page to have a consistent layout with predictable header placement, content spacing, and responsive behavior, so that the interface feels cohesive and professional.

#### Acceptance Criteria

1. THE Application_System SHALL implement a canonical Page_Shell component that provides: a consistent page header area (title, optional subtitle, optional actions), a content area with standardized horizontal padding (16px mobile, 24px tablet, 32px desktop) and vertical spacing, and a responsive max-width container
2. WHEN a page is rendered on a mobile viewport (below 768px), THE Page_Shell SHALL use full-width layout with reduced horizontal padding and stack header actions vertically
3. WHEN a page is rendered on a desktop viewport (768px and above), THE Page_Shell SHALL center content within a max-width container and display header actions inline
4. THE Application_System SHALL apply the Page_Shell consistently to all authenticated pages: student dashboard, application wizard, application detail, payment, interview, settings, notification settings, admin dashboard, admin applications, admin users, admin settings, admin audit trail, and admin monitoring
5. THE Application_System SHALL ensure that the Page_Shell accounts for the fixed Bottom_Navigation height on mobile viewports, adding sufficient bottom padding so that content is not obscured

### Requirement 4: Unify Navigation and Mobile-First Navigation Experience

**User Story:** As a student on a mobile phone, I want navigation that is reachable with my thumb, clearly indicates where I am, and transitions smoothly between sections, so that I can move through the application confidently.

#### Acceptance Criteria

1. THE Bottom_Navigation SHALL be visible on all authenticated pages when the viewport is below 768px, providing direct access to the primary navigation destinations (Dashboard, Applications, Notifications, Settings)
2. THE Bottom_Navigation SHALL highlight the currently active destination with a visually distinct active state (color change and label) that meets WCAG AA contrast requirements
3. WHEN the viewport is 768px or wider, THE Application_System SHALL display a sidebar navigation (DesktopSidebar) instead of the Bottom_Navigation, with consistent destination labels and active state styling
4. THE Application_System SHALL ensure that navigation transitions between pages include a brief, subtle loading indicator (skeleton or progress bar) that appears within 100ms if the route chunk has not yet loaded
5. THE Application_System SHALL ensure that the mobile header (ResponsiveHeader) displays the current page title, a back button where contextually appropriate, and a user menu accessible via a single tap
6. WHEN a student navigates using the Bottom_Navigation, THE Application_System SHALL preserve scroll position on the originating page so that returning to it does not reset the viewport

### Requirement 5: Polish Authentication Pages for Mobile-First Experience

**User Story:** As a prospective student on a mobile phone, I want the sign-in, sign-up, forgot-password, and reset-password pages to be visually polished, easy to use with one hand, and fast to load, so that my first impression of the institution is professional and trustworthy.

#### Acceptance Criteria

1. THE Application_System SHALL render all authentication pages (SignInPage, SignUpPage, ForgotPasswordPage, ResetPasswordPage) using a consistent AuthLayout that centers the form card vertically and horizontally, uses design token colors exclusively, and provides the MIHAS logo and institution name
2. WHEN rendered on a mobile viewport, THE AuthLayout SHALL use full-width form cards with minimum 16px horizontal padding, inputs with minimum 48px height for comfortable touch interaction, and a minimum 48px tall primary submit button
3. THE Application_System SHALL ensure all authentication form inputs use the canonical Input component with consistent border, focus ring, error state, and label styling from the Design_System
4. WHEN a form field has a validation error, THE Application_System SHALL display the error message directly below the field with `aria-describedby` linkage, using the destructive color token, and the field border SHALL change to the destructive color
5. THE Application_System SHALL ensure the password input on sign-in and sign-up pages includes a show/hide toggle (PasswordInput component) with a Touch_Target of at least 44×44px
6. THE Application_System SHALL ensure authentication pages load with FCP below 1.5 seconds on a simulated 3G connection by avoiding heavy above-the-fold dependencies

### Requirement 6: Improve Application Wizard Usability and Visual Polish

**User Story:** As a student filling out my application on a phone, I want the 4-step wizard to be visually clear about my progress, easy to interact with using my thumbs, and reassuring that my data is being saved, so that I can complete my application with confidence.

#### Acceptance Criteria

1. THE Application_Wizard SHALL display a progress indicator (stepper) that clearly shows: the current step number and label, completed steps with a checkmark, and remaining steps — using design token colors and meeting WCAG AA contrast
2. WHEN rendered on a mobile viewport, THE Application_Wizard progress indicator SHALL use a compact horizontal layout that does not consume more than 80px of vertical space
3. THE Application_Wizard SHALL display the Auto_Save_Indicator in a consistent, non-intrusive position (e.g., top-right of the wizard card or below the progress indicator) showing one of three states: idle (no indicator), saving (subtle pulse or text), saved (brief confirmation that fades)
4. THE Application_Wizard SHALL ensure all form inputs within each step have a minimum height of 44px, adequate spacing between fields (minimum 16px), and clear labels positioned above the input
5. WHEN the student navigates between wizard steps, THE Application_Wizard SHALL apply a subtle crossfade or slide transition (duration 200ms or less) that provides directional context without delaying interaction
6. THE Application_Wizard SHALL ensure the "Next" and "Previous" navigation buttons are positioned in a fixed or sticky footer area on mobile viewports, within thumb reach, with the primary action (Next/Submit) visually prominent
7. WHEN a wizard step contains validation errors, THE Application_Wizard SHALL scroll to the first error field and focus it, with the error message visible without additional scrolling

### Requirement 7: Standardize Card, Table, and List Patterns

**User Story:** As an admin reviewing applications, I want tables, cards, and list views to have consistent styling, spacing, and responsive behavior, so that data is easy to scan and interact with across all admin and student views.

#### Acceptance Criteria

1. THE Application_System SHALL use a canonical Card component (from `src/components/ui/card.tsx`) with consistent padding (16px mobile, 24px desktop), border radius (Design_System lg token), border color (Design_System border token), and optional header/footer sections across all pages
2. THE Application_System SHALL use a canonical Table component (from `src/components/ui/Table.tsx`) with consistent header styling, row hover states, cell padding, and responsive behavior (horizontal scroll on mobile with a visual scroll indicator)
3. WHEN a table is rendered on a mobile viewport (below 768px), THE Application_System SHALL either switch to a card-based list layout or provide a horizontally scrollable table with a visible scroll affordance (gradient fade or scroll indicator)
4. THE Application_System SHALL ensure all list views (application lists, user lists, notification lists) use consistent item spacing (minimum 8px gap), divider styling, and touch-friendly item heights (minimum 48px)
5. THE Application_System SHALL ensure all data tables include accessible column headers with `scope="col"` and sortable columns indicated with `aria-sort` attributes where sorting is supported

### Requirement 8: Polish Loading, Empty, and Error States Across All Views

**User Story:** As a student waiting for data to load, I want polished skeleton screens that match the layout of the incoming content, clear empty states when there is no data, and helpful error states with retry options, so that the application feels responsive and trustworthy at all times.

#### Acceptance Criteria

1. THE Application_System SHALL display Skeleton_Screens that mirror the layout structure of the target content (matching card shapes, text line widths, and image placeholders) on all data-dependent views: student dashboard, admin dashboard, application lists, application detail, payment history, and notification lists
2. THE Application_System SHALL use a consistent skeleton animation (subtle shimmer using the Design_System skeleton color tokens) with `prefers-reduced-motion` media query support that disables the animation for users who prefer reduced motion
3. THE Application_System SHALL display a canonical Empty_State component on all list and dashboard views when zero items are present, including: a relevant illustration or icon, a descriptive heading, a brief explanation, and a primary call-to-action button where applicable
4. THE Application_System SHALL display a canonical Error_State component when data fetching fails, including: an error icon, a user-friendly message (not a raw error string), and a "Try Again" button that retriggers the failed query
5. WHEN a lazy-loaded route chunk fails to load (network error), THE Application_System SHALL display the Error_State with a "Reload" button instead of a blank screen or unhandled error
6. THE Application_System SHALL ensure all Loading_States, Empty_States, and Error_States use design token colors and spacing exclusively, with no hardcoded values

### Requirement 9: Improve Form Component Consistency and Touch Ergonomics

**User Story:** As a student filling out forms on a mobile phone, I want all form inputs (text, select, textarea, checkbox, radio, file upload) to look and behave identically across every page, with comfortable touch targets and clear feedback, so that form interaction is predictable and effortless.

#### Acceptance Criteria

1. THE Application_System SHALL ensure all text inputs, selects, textareas, checkboxes, and radio buttons use the canonical UI_Primitives from `src/components/ui/` with consistent border width, border color, border radius, focus ring color, focus ring width, placeholder color, disabled state styling, and error state styling derived from Design_System tokens
2. THE Application_System SHALL ensure all form inputs have a minimum height of 44px on touch devices and all checkboxes and radio buttons have a minimum Touch_Target of 44×44px (including padding/margin around the control)
3. THE Application_System SHALL ensure all form labels are positioned above their associated input (not inline or floating) with consistent font size, font weight, color, and spacing (8px gap between label and input)
4. THE Application_System SHALL ensure all form error messages appear directly below the associated input with consistent styling: destructive color token, sm font size, and 4px top margin
5. THE Application_System SHALL ensure all select/dropdown components open with consistent animation (scale-in, 150ms), have consistent option padding (12px vertical, 16px horizontal), and support keyboard navigation (arrow keys, Enter, Escape)
6. WHEN a form field receives focus on a mobile device, THE Application_System SHALL ensure the viewport scrolls to keep the focused field visible above the virtual keyboard

### Requirement 10: Optimize Route-Level Code Splitting and Lazy Loading

**User Story:** As a student on a slow 3G connection, I want only the code needed for the current page to be downloaded, so that pages load quickly and I do not wait for unused features.

#### Acceptance Criteria

1. THE Application_System SHALL lazy-load all page-level components using `React.lazy()` with dynamic `import()`, including: all auth pages, student dashboard, application wizard, application detail, payment, interview, settings, notification settings, all admin pages, landing page, contact page, and 404 page
2. THE Application_System SHALL display a consistent Skeleton_Screen (matching the target page layout) as the `Suspense` fallback for each lazy-loaded route, not a generic spinner
3. WHEN a lazy-loaded route chunk fails to load, THE Application_System SHALL catch the error via the LazyLoadErrorBoundary and display a retry UI that attempts to re-import the chunk
4. THE Application_System SHALL ensure the main entry bundle (excluding lazy-loaded chunks) remains below 200KB gzipped, containing only: React runtime, router, Zustand, React Query core, Tailwind CSS utilities, and the app shell (navigation, layout)
5. THE Application_System SHALL prefetch the next likely route chunk when the user hovers over or focuses a navigation link (using `<link rel="prefetch">` or router-level prefetching) to reduce perceived navigation latency

### Requirement 11: Reduce Render Waste and Improve Runtime Performance

**User Story:** As a student on a lower-end Android device, I want the application to respond instantly to my taps and scrolling, so that the experience feels native and not sluggish.

#### Acceptance Criteria

1. THE Application_System SHALL wrap expensive list rendering (application lists, user tables, notification lists) in `React.memo()` with appropriate comparison functions to prevent re-renders when parent state changes do not affect the list data
2. THE Application_System SHALL use `useMemo` for computed values derived from large datasets (filtered/sorted application lists, dashboard statistics) and `useCallback` for event handlers passed as props to memoized children
3. THE Application_System SHALL ensure that React Query cache updates from polling or SSE do not trigger re-renders of components that are not consuming the changed data, by using granular query key selectors
4. WHEN the student scrolls through long lists (application history, notification list), THE Application_System SHALL maintain smooth 60fps scrolling by avoiding layout thrashing (no synchronous DOM measurements during scroll handlers)
5. THE Application_System SHALL ensure that the auto-save interval (8 seconds) does not cause visible UI jank by performing the save operation asynchronously without blocking the main thread
6. THE Application_System SHALL debounce search inputs with a minimum 300ms delay and throttle scroll-based data loading to prevent excessive re-renders and network requests


### Requirement 12: Implement Polished Micro-Interactions and Transitions

**User Story:** As a student using the application, I want subtle, consistent animations on interactive elements (buttons, cards, modals, page transitions) that make the interface feel responsive and polished, without being distracting or slow.

#### Acceptance Criteria

1. THE Application_System SHALL apply consistent hover states to all interactive elements: buttons (subtle background shift, 150ms), cards (subtle shadow elevation, 150ms), and links (color shift, 100ms) — using CSS transitions exclusively, not JavaScript animation libraries
2. THE Application_System SHALL apply consistent focus states to all interactive elements: a 2px ring using the Design_System ring color token with 2px offset, visible on keyboard focus (`:focus-visible`) but not on mouse click
3. THE Application_System SHALL apply a subtle press/active state to all buttons and tappable elements (slight scale reduction to 0.98, 100ms) to provide tactile feedback on touch devices
4. WHEN a modal or dialog opens, THE Application_System SHALL animate it with a combined fade-in and scale-up (from 0.95 to 1.0, 200ms ease-out) and animate the backdrop with a fade-in (150ms)
5. WHEN a toast notification appears, THE Application_System SHALL animate it sliding in from the top-right (desktop) or top-center (mobile) with a fade-in (200ms), and auto-dismiss with a fade-out (150ms) after the configured duration
6. THE Application_System SHALL respect the `prefers-reduced-motion` media query by disabling all non-essential animations and transitions, reducing them to instant state changes
7. THE Application_System SHALL ensure no animation or transition exceeds 300ms duration to maintain a perception of speed

### Requirement 13: Optimize Core Web Vitals and Lighthouse Score

**User Story:** As a product owner, I want the application to achieve a Lighthouse performance score above 90 and meet Core Web Vitals thresholds, so that the application ranks well in search engines and provides a fast experience for students on weak devices.

#### Acceptance Criteria

1. THE Application_System SHALL achieve a First Contentful Paint (FCP) below 1.5 seconds on a simulated 3G connection (Lighthouse mobile audit)
2. THE Application_System SHALL achieve a Largest Contentful Paint (LCP) below 2.5 seconds on a simulated 3G connection
3. THE Application_System SHALL achieve a Cumulative Layout Shift (CLS) score below 0.1 by reserving explicit dimensions for all images, skeleton screens, and dynamically loaded content areas
4. THE Application_System SHALL achieve an Interaction to Next Paint (INP) below 200ms by ensuring all click/tap handlers complete synchronous work within 50ms and defer heavy computation
5. THE Application_System SHALL achieve a Lighthouse Performance score above 90 on both mobile and desktop audits of the landing page and sign-in page
6. THE Application_System SHALL defer loading of non-critical CSS (e.g., print styles, animation keyframes for below-fold content) using media query splitting or dynamic injection
7. THE Application_System SHALL ensure all above-the-fold content on the landing page and auth pages renders without waiting for JavaScript by using critical CSS inlining (already configured in Vite, verify enforcement)

### Requirement 14: Improve Document Upload and Payment Flow UX

**User Story:** As a student uploading documents and making payments on a mobile phone, I want clear progress indicators, helpful validation feedback, and a smooth flow that does not lose my work if the network drops, so that I can complete these critical steps without frustration.

#### Acceptance Criteria

1. WHEN a student uploads a document, THE Application_System SHALL display a progress bar showing upload percentage, the file name, file size, and a cancel button — using design token colors and consistent styling with the canonical FileUpload component
2. WHEN a document upload fails due to a network error, THE Application_System SHALL retain the selected file and display a retry button with a clear error message, not require the student to re-select the file
3. WHEN a document upload succeeds, THE Application_System SHALL display a success confirmation with a thumbnail preview (for images) or file type icon (for PDFs), the file name, and a remove/replace option
4. THE Application_System SHALL validate file type and size on the client side before initiating the upload, displaying an inline error if the file does not meet requirements (accepted types, maximum size)
5. THE Payment page SHALL display a clear summary of the payment amount, purpose, and status using the canonical Card component, with consistent typography and spacing from the Design_System
6. WHEN a payment receipt is available, THE Application_System SHALL provide a download button styled consistently with the Design_System Button component, with appropriate loading state during PDF generation

### Requirement 15: Standardize Admin and Reviewer Dashboard Surfaces

**User Story:** As an admin or reviewer, I want dashboard pages that are visually consistent with the student-facing pages, use the same design tokens and component patterns, and present data clearly on both desktop and tablet, so that the admin experience feels like part of the same application.

#### Acceptance Criteria

1. THE Application_System SHALL render all admin pages (Dashboard, Applications, Users, Settings, Audit Trail, Monitoring, Intakes, Programs, Eligibility Management, Batch Operations) using the canonical Page_Shell with consistent header, spacing, and responsive behavior
2. THE Application_System SHALL ensure all admin data tables use the canonical Table component with consistent header styling, row hover states, pagination, and responsive behavior (card layout on mobile)
3. THE Application_System SHALL ensure all admin stat cards (application counts, user counts, revenue) use the canonical Card component with consistent padding, typography, and icon placement — using semantic color tokens for status indicators
4. THE Application_System SHALL ensure the admin sidebar (AdminSidebar/DesktopSidebar) uses design token colors for background, text, active state, and hover state — with no hardcoded color values
5. WHEN an admin views application details in a modal (ApplicationDetailModal), THE Application_System SHALL render the modal using the canonical Dialog component with consistent padding, header styling, close button placement, and responsive sizing (full-screen on mobile, centered card on desktop)
6. THE Application_System SHALL ensure all admin action buttons (approve, reject, request info, export) use the canonical Button component with appropriate variant (primary, destructive, outline) and consistent sizing

### Requirement 16: Ensure Comprehensive Keyboard Accessibility

**User Story:** As a student or admin who navigates using a keyboard, I want all interactive elements to be reachable via Tab, activatable via Enter/Space, and dismissible via Escape, with visible focus indicators throughout, so that I can use the entire application without a mouse.

#### Acceptance Criteria

1. THE Application_System SHALL ensure all interactive elements (buttons, links, inputs, selects, checkboxes, radio buttons, tabs, menu items) are reachable via sequential Tab navigation in a logical order matching the visual layout
2. THE Application_System SHALL provide visible focus indicators on all interactive elements using the Design_System ring color token with a minimum 2px width and 2px offset, visible only on keyboard focus (`:focus-visible`)
3. WHEN a modal, dialog, or dropdown is open, THE Application_System SHALL trap keyboard focus within the overlay and return focus to the triggering element when the overlay closes
4. THE Application_System SHALL support Escape key to close all modals, dialogs, dropdown menus, toast notifications, and overlay panels
5. THE Application_System SHALL ensure the Application_Wizard step navigation is operable via keyboard: Tab to reach step buttons, Enter/Space to activate, and arrow keys to move between steps where a tablist pattern is used
6. THE Application_System SHALL provide skip-link navigation ("Skip to main content") as the first focusable element on every page, visible on focus, linking to the main content area

### Requirement 17: Ensure Semantic HTML and ARIA Compliance

**User Story:** As a student using assistive technology, I want the application to use proper semantic HTML and ARIA attributes, so that screen readers can accurately convey the page structure, form state, and dynamic content changes.

#### Acceptance Criteria

1. THE Application_System SHALL use semantic HTML elements (`<main>`, `<nav>`, `<header>`, `<footer>`, `<section>`, `<article>`, `<aside>`) to define page landmarks on all pages
2. THE Application_System SHALL ensure every page has exactly one `<h1>` element and heading levels (`<h1>` through `<h6>`) follow a logical hierarchy without skipping levels
3. THE Application_System SHALL ensure all form inputs have associated `<label>` elements (via `htmlFor`/`id` pairing or wrapping) or `aria-label` attributes, with `aria-required="true"` on mandatory fields and `aria-invalid="true"` on fields with validation errors
4. WHEN dynamic content changes occur (toast notifications, auto-save status updates, form validation errors appearing), THE Application_System SHALL announce the change to screen readers using `aria-live="polite"` regions
5. THE Application_System SHALL ensure all icon-only buttons have `aria-label` attributes describing their action (e.g., "Close dialog", "Toggle password visibility", "Remove file")
6. THE Application_System SHALL ensure all data tables have `<caption>` or `aria-label` describing the table content, and use `<th scope="col">` for column headers and `<th scope="row">` for row headers where applicable

### Requirement 18: Ensure Responsive Design Across All Breakpoints

**User Story:** As a student who may use a phone, tablet, or desktop computer, I want every page to adapt gracefully to my screen size with no horizontal overflow, no overlapping elements, and no unreachable content, so that the application is usable on any device.

#### Acceptance Criteria

1. THE Application_System SHALL render without horizontal overflow or content clipping at all standard breakpoints: 320px (small phone), 375px (standard phone), 768px (tablet), 1024px (laptop), 1280px (desktop), and 1536px (wide desktop)
2. THE Application_System SHALL use the mobile-first responsive approach: base styles target mobile, with `sm:`, `md:`, `lg:`, `xl:`, and `2xl:` breakpoint modifiers adding desktop enhancements
3. WHEN the viewport is below 768px, THE Application_System SHALL stack form fields vertically, use full-width buttons, display the Bottom_Navigation, and hide the desktop sidebar
4. WHEN the viewport is 768px or wider, THE Application_System SHALL display the desktop sidebar, use multi-column form layouts where appropriate (e.g., first name / last name side by side), and use inline button groups
5. THE Application_System SHALL ensure all modal dialogs are responsive: full-screen with top-aligned content on mobile (below 768px), centered card with max-width on desktop
6. THE Application_System SHALL ensure all images, charts, and embedded content scale proportionally within their containers without overflow, using `max-width: 100%` and appropriate aspect ratios

### Requirement 19: Polish Toast, Alert, and Banner Notification Patterns

**User Story:** As a student or admin, I want notifications (toasts, alerts, banners) to appear consistently, be clearly categorized by severity, and not obstruct my workflow, so that I stay informed without being interrupted.

#### Acceptance Criteria

1. THE Application_System SHALL use a canonical Toast component with four severity variants (success, error, warning, info) using the corresponding Design_System color tokens, consistent padding, border-radius, icon, and dismiss button
2. THE Application_System SHALL position toast notifications in the top-right corner on desktop and top-center on mobile, stacking multiple toasts vertically with 8px gap, and auto-dismissing after 5 seconds (errors after 8 seconds)
3. THE Application_System SHALL use a canonical Alert component for inline, persistent messages within page content (e.g., eligibility warnings, system notices) with the same four severity variants and consistent styling
4. THE Application_System SHALL use a canonical Banner component for full-width, page-level notices (offline indicator, PWA install prompt, insecure storage warning) positioned at the top of the viewport with consistent styling and a dismiss mechanism
5. WHEN a toast, alert, or banner appears, THE Application_System SHALL announce the message to screen readers using `role="alert"` (for errors/warnings) or `role="status"` (for success/info)
6. THE Application_System SHALL ensure toast notifications do not overlap with the Bottom_Navigation on mobile viewports

### Requirement 20: Optimize Asset Loading and Bundle Performance

**User Story:** As a student on a metered mobile data plan, I want the application to download the minimum amount of data needed for each page, so that I do not waste bandwidth on unused resources.

#### Acceptance Criteria

1. THE Application_System SHALL ensure the total transfer size for the initial landing page load (HTML + CSS + JS + fonts + images) is below 500KB on a cache-cold visit
2. THE Application_System SHALL load the Inter font using `font-display: swap` with a system font fallback stack to prevent invisible text during font loading
3. THE Application_System SHALL preload critical resources (main CSS bundle, main JS entry, Inter font) using `<link rel="preload">` tags in `index.html`
4. THE Application_System SHALL ensure all non-critical JavaScript (analytics stubs, service worker registration, PWA install prompt logic) is deferred using `defer` attribute or loaded after the `DOMContentLoaded` event
5. THE Application_System SHALL ensure vendor chunks (excel, pdf, ocr, charts) are loaded only when the consuming feature is activated, not included in any route's critical path
6. THE Application_System SHALL use `rel="modulepreload"` for the main entry module and critical route chunks to enable parallel downloading by the browser

### Requirement 21: Validate Visual Consistency and Regression Prevention

**User Story:** As a developer, I want automated checks that catch visual inconsistencies, accessibility violations, and performance regressions before they reach production, so that the quality of the UI overhaul is maintained over time.

#### Acceptance Criteria

1. THE Application_System SHALL include UI tests (Vitest + Testing Library) for all canonical UI_Primitives (Button, Input, Select, Card, Table, Toast, Alert, Dialog, Skeleton, EmptyState, ErrorDisplay) verifying correct rendering, accessibility attributes, and variant styling
2. THE Application_System SHALL include accessibility tests (axe-core via Vitest or Playwright) that verify zero critical or serious violations on: landing page, sign-in page, sign-up page, student dashboard, application wizard (all 4 steps), and admin dashboard
3. THE Application_System SHALL include responsive rendering tests that verify no horizontal overflow at 320px, 375px, and 768px viewport widths on key pages (landing, auth, dashboard, wizard)
4. WHEN a new UI component is added or an existing component is modified, THE Application_System SHALL require that the component has at least one test verifying its accessible name, role, and keyboard interaction
5. THE Application_System SHALL include a Lighthouse CI check (or equivalent) in the build pipeline that fails if the performance score drops below 85 on the landing page or sign-in page

## Non-Goals

- No backend API rewrites, database schema changes, or server-side logic modifications
- No removal or modification of the 8-second auto-save interval behavior
- No changes to the authentication flow logic (JWT, CSRF, refresh token rotation)
- No changes to role-based access control (RBAC) permissions or role definitions
- No addition of heavy animation libraries (framer-motion is being phased out, not added)
- No changes to the PWA offline caching strategy or service worker logic
- No changes to the Arcjet security perimeter, rate limiting, or input validation schemas
- No redesign of the 4-step application wizard step sequence or field requirements
- No changes to Zambian-specific data formats (NRC, +260 phone, ECZ grades 1-9)
- No migration away from the current tech stack (React 18, Tailwind, Radix UI, Zustand, React Query)
