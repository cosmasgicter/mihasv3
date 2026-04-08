# Requirements Document

## Introduction

This specification defines a comprehensive UI/UX quality audit and polish pass for the MIHAS admissions application (`apps/admissions/`). The audit covers loading state consistency, color contrast compliance, focus indicator unification, heading hierarchy enforcement, form accessibility, empty state polish, error recovery UX, responsive polish, animation performance, keyboard navigation, screen reader experience, toast accessibility, skeleton loading patterns, dark mode prevention, and print styles. The goal is to bring every user-facing surface to WCAG 2.1 AA compliance and modern UX best practices.

## Glossary

- **App**: The MIHAS admissions single-page application at `apps/admissions/`
- **Skeleton**: A placeholder UI that mimics the layout of content while data loads, using pulsing gray shapes instead of spinners
- **UnifiedLoader**: The existing spinner-based loading component at `src/components/ui/UnifiedLoader.tsx`
- **Focus_Indicator**: The visible outline or ring shown around an interactive element when it receives keyboard focus
- **Heading_Hierarchy**: The sequential ordering of HTML heading elements (h1 through h6) without skipping levels
- **WCAG_AA**: Web Content Accessibility Guidelines 2.1 Level AA conformance, requiring 4.5:1 contrast for normal text and 3:1 for large text
- **EARS**: Easy Approach to Requirements Syntax, a structured pattern for writing requirements
- **SmoothUI_Components**: The animated components in `src/components/smoothui/` (TextEffect, TextRotate, ShinyText, InfiniteGrid, ShapeLandingHero, ScrollReveal)
- **Toast_System**: The notification system implemented in `src/components/ui/Toast.tsx` using Zustand
- **Wizard**: The multi-step application form at `src/pages/student/applicationWizard/`
- **Auth_Pages**: The SignIn (`src/pages/auth/SignInPage.tsx`) and SignUp (`src/pages/auth/SignUpPage.tsx`) pages
- **Dashboard**: The student dashboard at `src/pages/student/Dashboard.tsx`
- **Landing_Page**: The public landing page at `src/pages/LandingPage.tsx`
- **Design_Tokens**: The centralized design values in `src/design-system/tokens.ts`
- **ErrorDisplay**: The error presentation component at `src/components/ui/ErrorDisplay.tsx`
- **EmptyState**: The empty content placeholder component at `src/components/ui/EmptyState.tsx`
- **PageShell**: The page layout wrapper at `src/components/ui/PageShell.tsx`
- **FocusTrap**: The keyboard focus containment component at `src/components/ui/FocusTrap.tsx`
- **Print_Stylesheet**: A CSS stylesheet using `@media print` rules to optimize page output for printing

## Requirements

### Requirement 1: Loading State Consistency — Skeletons Only

**User Story:** As a student, I want all loading states to use skeleton placeholders instead of spinners, so that the interface feels fast and predictable while content loads.

#### Acceptance Criteria

1. THE App SHALL use exactly two loading patterns: (a) the inline HTML preloader (3-dots animation in `index.html`) for the initial page load before React mounts, and (b) skeleton placeholders for all in-app loading states after React has mounted.
2. WHEN the Auth_Pages (SignInPage, SignUpPage) are loading their lazy-loaded chunks or performing authentication, THE App SHALL display a layout-matched skeleton placeholder — never a spinner.
3. WHEN the Wizard displays `authLoading` or `restoringDraft` states, THE Wizard SHALL render a skeleton that matches the wizard layout (progress bar, step header, form area, sidebar) — never a spinner.
4. WHEN the Dashboard is in `isInitialLoading` state, THE Dashboard SHALL continue to use its existing inline skeleton (already implemented) without regression.
5. WHEN any page transitions between skeleton and loaded content, THE App SHALL avoid layout shift by matching skeleton dimensions to the final rendered content dimensions within 8px tolerance.
6. THE App SHALL NOT use the `UnifiedLoader` spinner component (`src/components/ui/UnifiedLoader.tsx`) anywhere in the codebase for page-level or section-level loading states. The only acceptable loading indicators are the preloader (initial page load) and skeletons (in-app loading).

---

### Requirement 1b: Remove UnifiedLoader Spinner Component

**User Story:** As a developer, I want a single loading pattern (skeletons) so that the codebase is consistent and there is no confusion about which loader to use.

#### Acceptance Criteria

1. THE App SHALL delete the `UnifiedLoader` component file at `src/components/ui/UnifiedLoader.tsx` and remove its export from any barrel files.
2. THE App SHALL remove all imports of `UnifiedLoader` from every file in the codebase and replace each usage with the appropriate skeleton component or remove the loading state entirely.
3. THE `UnifiedSpinner` sub-component (used inside the `Button` component for loading state) SHALL be extracted into a standalone `ButtonSpinner` component co-located with `Button.tsx` before `UnifiedLoader.tsx` is deleted, so that button loading indicators continue to work.
4. WHEN a `Button` has `loading={true}`, THE Button SHALL continue to show an inline spinner inside the button — this is the only acceptable use of a spinner in the entire app (inline within a button, not as a page/section loader).
5. THE App SHALL have zero references to `UnifiedLoader` in any `.tsx`, `.ts`, or test file after this requirement is complete.

---

### Requirement 2: Color Contrast Compliance

**User Story:** As a user with low vision, I want all text to meet WCAG AA contrast ratios against its background, so that I can read content without strain.

#### Acceptance Criteria

1. THE Landing_Page hero section SHALL use text colors that achieve a minimum 4.5:1 contrast ratio against the gradient background for normal-sized text and 3:1 for large text (18pt+ or 14pt+ bold).
2. WHEN the ShinyText shimmer animation is active, THE ShinyText component SHALL maintain a minimum 3:1 contrast ratio for the text at all animation keyframes (the `rgba(255,255,255,0.8)` highlight on gradient backgrounds).
3. THE App SHALL replace all instances of `text-white/80` and `text-white/90` in the hero section with opacity values that achieve at least 4.5:1 contrast against the darkest point of the underlying gradient.
4. THE App SHALL include a documented color contrast audit table in a code comment or design token file listing each foreground/background pair used in the Landing_Page hero and CTA sections with their computed contrast ratios.
5. IF a color combination fails WCAG AA contrast requirements, THEN THE App SHALL use the `suggestAccessibleColor` utility from `src/lib/accessibility-utils.ts` to determine a compliant replacement.

---

### Requirement 3: Focus Indicator Unification

**User Story:** As a keyboard user, I want consistent and visible focus indicators on all interactive elements, so that I always know which element is currently focused.

#### Acceptance Criteria

1. THE App SHALL use a single focus indicator pattern across all interactive elements: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
2. THE App SHALL remove all instances of the legacy `focus:ring-2 focus:ring-blue-600` pattern and replace them with the unified `focus-visible:ring-2 focus-visible:ring-ring` pattern.
3. WHEN an interactive element receives keyboard focus, THE App SHALL display a 2px ring with 2px offset using the `ring` design token color.
4. THE App SHALL NOT show focus rings on mouse click (only on keyboard navigation via `:focus-visible`).
5. WHEN a focus indicator is displayed on a dark background (hero section, CTA section, gradient buttons), THE App SHALL use the `focus-ring-light` variant that provides sufficient contrast against the dark background.
6. THE `interactive-feedback.css` global `*:focus-visible` rule SHALL use `ring` token color instead of hardcoded `outline-blue-600` and `ring-blue-600` values.

---

### Requirement 4: Heading Hierarchy Enforcement

**User Story:** As a screen reader user, I want heading levels to follow a logical hierarchy on every page, so that I can navigate the document structure efficiently.

#### Acceptance Criteria

1. THE App SHALL have exactly one `<h1>` element per page view (route).
2. THE App SHALL NOT skip heading levels (e.g., jumping from h1 to h3 without an h2).
3. WHEN the Landing_Page renders, THE Landing_Page SHALL use h1 for the hero headline, h2 for section titles (Features, Accreditation, Programs, CTA), and h3 for individual card titles.
4. WHEN the Dashboard renders, THE PageShell SHALL render the page title as h1, and section cards SHALL use h2 for their titles.
5. WHEN the Wizard renders, THE PageShell SHALL render "Student Application" as h1, the current step title as h2, and subsection titles within steps as h3.
6. THE App SHALL integrate the existing `validateHeadingHierarchy` utility from `src/lib/accessibility-utils.ts` as a development-only runtime check that logs warnings to the console when heading hierarchy violations are detected.

---

### Requirement 5: Form Accessibility and Validation UX

**User Story:** As a student filling out the application form, I want clear error feedback and proper form grouping, so that I can correct mistakes efficiently and understand the form structure.

#### Acceptance Criteria

1. THE Wizard steps SHALL wrap related form fields in `<fieldset>` elements with descriptive `<legend>` elements (e.g., "Personal Information", "Education Details", "Payment", "Review and Submit").
2. WHEN form validation fails on a Wizard step, THE Wizard SHALL display an error summary at the top of the form listing all validation errors with links that focus the corresponding field when clicked.
3. WHEN form validation fails, THE Wizard SHALL move keyboard focus to the first field with an error.
4. THE Auth_Pages (SignInPage, SignUpPage) SHALL continue to use their existing `<fieldset>`/`<legend>` grouping (already implemented) without regression.
5. WHEN a required field is left empty and the user attempts to proceed, THE App SHALL announce the error to screen readers using `aria-live="assertive"` within 100ms of the validation event.
6. THE Input component SHALL continue to use `aria-invalid`, `aria-describedby`, and `role="alert"` on error messages (already implemented) without regression.

---

### Requirement 6: Empty State Polish

**User Story:** As a student, I want clear and helpful empty states on all pages, so that I understand what to do when no content is available.

#### Acceptance Criteria

1. THE EmptyState component SHALL be used consistently across all pages where content may be absent (Dashboard applications list, Dashboard intakes list, application status pages).
2. WHEN the Dashboard shows no submitted applications and no drafts, THE Dashboard SHALL display an EmptyState with an icon, heading, description, and a primary action button to start a new application.
3. WHEN the Dashboard shows no upcoming intakes, THE Dashboard SHALL display an EmptyState with a calendar icon and a message indicating no upcoming deadlines.
4. THE EmptyState component SHALL accept an optional `secondaryAction` prop for cases where a secondary recovery path is appropriate (e.g., "Contact Support").
5. WHEN an EmptyState is displayed, THE EmptyState heading SHALL use the correct heading level for its position in the page hierarchy (h3 inside a section card, h2 at page level).

---

### Requirement 7: Error Recovery UX

**User Story:** As a student on an unreliable network, I want clear recovery options when errors occur, so that I can retry or find an alternative path forward.

#### Acceptance Criteria

1. WHEN a network error occurs during data fetching, THE ErrorDisplay component SHALL show a "Retry" button, a description of what failed, and a "Contact Support" link.
2. WHEN a non-retryable error occurs (e.g., 403 Forbidden, 404 Not Found), THE ErrorDisplay component SHALL show a "Go Back" button and a "Contact Support" link instead of a "Retry" button.
3. THE ErrorDisplay component SHALL accept a `supportUrl` prop (defaulting to `/contact`) for the contact support link.
4. WHEN the Wizard encounters a submission error, THE Wizard SHALL preserve all form data and allow the student to retry without re-entering information.
5. IF an error toast is displayed for a retryable error, THEN THE Toast_System SHALL include a "Retry" action button using the existing `errorWithRetry` method.

---

### Requirement 8: Responsive Polish at 320px Viewport

**User Story:** As a student using a small-screen phone, I want the application to be fully usable at 320px viewport width, so that no content is cut off or inaccessible.

#### Acceptance Criteria

1. WHEN the viewport width is 320px, THE Landing_Page hero section SHALL NOT produce horizontal overflow or content clipping.
2. WHEN the viewport width is 320px, THE Landing_Page CTA buttons SHALL stack vertically with full width and maintain 48px minimum touch target height.
3. WHEN the viewport width is 320px, THE Dashboard skeleton and loaded content SHALL NOT produce horizontal scrollbars.
4. WHEN the viewport width is 320px, THE Wizard navigation buttons (Previous, Next Step, Submit) SHALL stack vertically with full width.
5. WHEN the viewport width is 320px, THE Auth_Pages form fields SHALL maintain 16px minimum font size to prevent iOS zoom on focus.
6. THE App SHALL use `overflow-x-hidden` on the root layout container to prevent accidental horizontal scroll caused by animations or absolute-positioned elements.

---

### Requirement 9: Animation Performance Optimization

**User Story:** As a developer, I want animations to be performant and not cause unnecessary DOM overhead, so that the app maintains 60fps and minimal memory usage.

#### Acceptance Criteria

1. THE SmoothUI_Components (TextEffect, TextRotate, ShinyText, InfiniteGrid) SHALL NOT inject inline `<style>` tags on every render; instead, styles SHALL be injected once using a shared style registry or moved to a static CSS file.
2. WHEN multiple instances of the same SmoothUI component render on a page, THE App SHALL deduplicate their `<style>` injections so that only one copy of each keyframe definition exists in the DOM.
3. THE App SHALL use only `transform` and `opacity` properties for animations to maintain GPU acceleration (already partially implemented in `animations.css`).
4. WHEN `prefers-reduced-motion: reduce` is active, THE App SHALL disable all animations and transitions (already partially implemented) without visual regression.
5. THE SmoothUI_Components SHALL NOT use `will-change` as a permanent CSS property; `will-change` SHALL only be applied dynamically during active animations and removed afterward.

---

### Requirement 10: Keyboard Navigation Completeness

**User Story:** As a keyboard-only user, I want to reach and operate all interactive elements using only the keyboard, so that I can complete the entire application process without a mouse.

#### Acceptance Criteria

1. THE App SHALL ensure all interactive elements (buttons, links, form fields, tabs, menu items) are reachable via the Tab key in a logical order matching the visual layout.
2. WHEN a modal or dialog opens, THE FocusTrap component SHALL trap focus within the modal and return focus to the triggering element when the modal closes.
3. WHEN a modal or overlay is open, THE App SHALL close the modal when the Escape key is pressed.
4. THE Wizard stepper (EnhancedProgressIndicator) SHALL support arrow key navigation between steps using the existing `handleHorizontalArrowNavigation` utility from `src/lib/accessibility-utils.ts`.
5. THE SkipLink component SHALL remain as the first focusable element in the DOM and correctly target `#app-main-content` (already implemented) without regression.
6. WHEN the mobile navigation menu opens, THE App SHALL trap focus within the menu panel and close the menu on Escape key press.

---

### Requirement 11: Screen Reader Experience

**User Story:** As a screen reader user, I want dynamic content changes to be announced and all visual information to have text alternatives, so that I can use the application independently.

#### Acceptance Criteria

1. WHEN the Wizard transitions between steps, THE Wizard SHALL announce the new step title and number via an `aria-live="polite"` region (already implemented in the Wizard) without regression.
2. THE App SHALL ensure all decorative images use `aria-hidden="true"` or empty `alt=""` and all meaningful images have descriptive `alt` text.
3. WHEN the Dashboard data finishes loading, THE Dashboard SHALL announce "Dashboard loaded" via an `aria-live="polite"` region.
4. THE Landing_Page animated counters (AnimatedCounter) SHALL have a final static value accessible to screen readers via `aria-label` or visually hidden text, not relying on the animation to convey the number.
5. WHEN the TextRotate component cycles phrases, THE TextRotate SHALL announce the current phrase via `aria-live="polite"` (already implemented) without regression.
6. THE InfiniteGrid, ShinyText shimmer, and decorative gradient backgrounds SHALL use `aria-hidden="true"` to prevent screen readers from attempting to describe them.

---

### Requirement 12: Toast Accessibility Differentiation

**User Story:** As a screen reader user, I want error toasts to be announced immediately and success toasts to be announced politely, so that I am alerted to critical issues without being overwhelmed by routine notifications.

#### Acceptance Criteria

1. WHEN an error or warning toast is displayed, THE Toast_System SHALL render the toast inside an `aria-live="assertive"` region (already implemented in ToastContainer) without regression.
2. WHEN a success or info toast is displayed, THE Toast_System SHALL render the toast inside an `aria-live="polite"` region (already implemented in ToastContainer) without regression.
3. WHEN a toast has an action button (e.g., "Retry"), THE action button SHALL have a minimum touch target of 44x44px and be keyboard-focusable.
4. WHEN the Escape key is pressed while toasts are visible, THE Toast_System SHALL dismiss all visible toasts (already implemented) without regression.
5. THE Toast dismiss button SHALL have an accessible label "Dismiss notification" (already implemented) without regression.

---

### Requirement 13: Skeleton Loading Component Extraction

**User Story:** As a developer, I want reusable skeleton components for each page layout, so that loading states are consistent and maintainable after the UnifiedLoader spinner is removed.

#### Acceptance Criteria

1. THE App SHALL provide a `DashboardSkeleton` component extracted from the inline skeleton JSX currently in `Dashboard.tsx`, placed in `src/components/ui/skeleton.tsx` or a co-located file.
2. THE App SHALL provide an `AuthSkeleton` component that matches the AuthLayout structure (centered card with form field placeholders, logo area, heading area).
3. THE App SHALL provide a `WizardSkeleton` component that matches the wizard layout (progress indicator, step content area, navigation buttons).
4. WHEN a lazy-loaded route with `skeletonType: 'dashboard'` is loading, THE route Suspense fallback SHALL render the `DashboardSkeleton` component.
5. WHEN a lazy-loaded route with `skeletonType: 'auth'` is loading, THE route Suspense fallback SHALL render the `AuthSkeleton` component.
6. WHEN a lazy-loaded route with `skeletonType: 'wizard'` is loading, THE route Suspense fallback SHALL render the `WizardSkeleton` component.
7. THE skeleton components SHALL be the sole replacement for all former `UnifiedLoader` usages — no page or section in the app shall fall back to a spinner after this requirement is complete.

---

### Requirement 14: Dark Mode Prevention

**User Story:** As a student, I want the application to always display in light mode without any flash of dark content, so that the visual experience is consistent.

#### Acceptance Criteria

1. THE `index.html` SHALL set `class="light"` and `style="color-scheme: light;"` on the `<html>` element (already implemented) without regression.
2. THE `main.tsx` SHALL enforce light mode by removing `dark` class and adding `light` class on both `documentElement` and `body` (already implemented) without regression.
3. THE `tailwind.config.js` SHALL use `darkMode: 'class'` (not `'media'`) to prevent automatic dark mode activation based on system preferences.
4. THE App SHALL audit and remove any `dark:` Tailwind variant classes that could cause visual inconsistency, or ensure they are unreachable when `darkMode: 'class'` is set and the `dark` class is never applied.
5. IF the `tailwind.config.js` currently uses `darkMode: 'media'`, THEN THE App SHALL change it to `darkMode: 'class'` to prevent system-preference-based dark mode activation.

---

### Requirement 15: Print Stylesheet

**User Story:** As a student, I want to print my application status or admission slip cleanly, so that I have a physical record of my application.

#### Acceptance Criteria

1. THE App SHALL include a print stylesheet (`src/styles/print.css`) imported in the main CSS entry point.
2. WHEN the user triggers browser print, THE print stylesheet SHALL hide navigation headers, footers, sidebars, floating action buttons, toast notifications, and decorative animations.
3. WHEN the user prints the Dashboard, THE print stylesheet SHALL display the application status cards in a single-column layout with clear borders and readable text at 12pt minimum.
4. WHEN the user prints the application submission success page, THE print stylesheet SHALL display the admission slip content (application number, program, student name, payment status) in a clean, bordered layout suitable for official use.
5. THE print stylesheet SHALL set `background: white` and `color: black` on the body to ensure readability regardless of the screen theme.
6. THE print stylesheet SHALL use `@page` rules to set appropriate margins (e.g., 2cm) and remove browser-default headers/footers where supported.
