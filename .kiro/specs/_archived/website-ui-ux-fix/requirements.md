# Requirements Document

## Introduction

This specification addresses UI/UX quality issues in the MIHAS admissions portal (***REMOVED***), a live production website serving students and administrators in Zambia. The portal recently completed a major code consolidation. This spec focuses on fixing visual inconsistencies, accessibility gaps, loading state fragmentation, form UX issues, and mobile responsiveness problems to deliver a polished, Swiss Modernism-inspired design system that is consistent, accessible, and performant across all pages.

## Glossary

- **Portal**: The MIHAS admissions web application at ***REMOVED***
- **Design_Token_System**: The centralized set of color, spacing, typography, shadow, and border-radius values defined in `tailwind.config.js` and consumed by all components
- **Component_Library**: The set of reusable React components in `src/components/ui/`
- **Skeleton_Screen**: A placeholder UI that mimics the layout of content while data is loading
- **Touch_Target**: An interactive element's minimum tappable area, required to be at least 44×44px for accessibility
- **Auto_Save_Indicator**: The UI element that communicates draft save status to users during form completion
- **Application_Wizard**: The multi-step form flow for student application submission (4 steps: Personal Info, Academic History, Program Selection, Document Upload)
- **Toast_Notification**: A transient message displayed to communicate success, error, warning, or info states
- **Design_Token**: A named value (color, spacing, shadow, radius) from the Tailwind config that enforces visual consistency
- **Focus_Ring**: The visible outline shown on interactive elements when navigated via keyboard

## Requirements

### Requirement 1: Design Token Enforcement

**User Story:** As a developer, I want all UI components to use centralized design tokens for colors, spacing, shadows, and border radii, so that the portal has a visually consistent appearance.

#### Acceptance Criteria

1. THE Component_Library SHALL use only Design_Token values for border-radius (sm, md, lg, xl, 2xl, full) and not arbitrary Tailwind radius classes
2. THE Component_Library SHALL use only Design_Token values for box-shadow (sm, md, lg, xl) and not arbitrary Tailwind shadow classes
3. THE Component_Library SHALL use only semantic color tokens (primary, secondary, destructive, muted, accent, success, warning, info, error) and not hardcoded hex or Tailwind color palette classes (e.g., green-300, red-50, blue-600)
4. WHEN a component requires spacing, THE Component_Library SHALL use the spacing scale defined in the Design_Token_System (Tailwind default scale plus custom values) consistently across similar component types
5. THE Toast_Notification component SHALL use semantic color tokens (success, error, warning, info) instead of hardcoded Tailwind palette colors for background, border, and icon styling

### Requirement 2: Loading State Consistency

**User Story:** As a user, I want consistent loading indicators across all pages, so that I always understand when content is being fetched.

#### Acceptance Criteria

1. THE Portal SHALL use the UnifiedLoader component as the sole loading indicator across all page-level, inline, and overlay loading states
2. THE Skeleton_Screen components SHALL use the skeleton color tokens (skeleton-DEFAULT, skeleton-highlight) from the Design_Token_System for background colors
3. WHEN a page is loading data, THE Portal SHALL display a Skeleton_Screen that matches the layout of the expected content
4. WHEN an inline operation is loading, THE Portal SHALL display the UnifiedLoader inline variant with a descriptive accessible label
5. IF a loading state persists for more than 10 seconds, THEN THE Portal SHALL display a timeout message with a retry action

### Requirement 3: Accessibility Compliance

**User Story:** As a user with assistive technology, I want the portal to be fully navigable and understandable, so that I can complete my application independently.

#### Acceptance Criteria

1. THE Component_Library SHALL ensure all interactive elements meet the 44×44px minimum Touch_Target size
2. THE Component_Library SHALL apply consistent Focus_Ring styling (2px ring, primary color, 2px offset) on all interactive elements when focused via keyboard
3. THE Component_Library SHALL provide aria-label attributes on all icon-only buttons
4. WHEN form validation errors occur, THE Portal SHALL move focus to the first invalid field and announce the error via an aria-live region
5. THE Portal SHALL maintain a correct heading hierarchy (h1 → h2 → h3) on every page without skipping levels
6. THE Component_Library SHALL ensure all color combinations meet WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text)
7. WHEN a modal or dialog opens, THE Portal SHALL trap keyboard focus within the dialog until it is dismissed

### Requirement 4: Mobile Responsiveness

**User Story:** As a student using a mobile phone on an unreliable connection in Zambia, I want the portal to be fully usable on small screens, so that I can complete my application from my phone.

#### Acceptance Criteria

1. THE Portal SHALL use a mobile-first responsive layout where base styles target mobile and breakpoints progressively enhance for larger screens
2. THE Application_Wizard Stepper component SHALL display step labels on screens wider than 640px and display only step numbers on smaller screens
3. WHEN displayed on screens narrower than 768px, THE Portal SHALL use a bottom navigation bar with no more than 5 items
4. THE Portal SHALL ensure no horizontal scrolling occurs on any viewport width from 320px to 1536px
5. WHEN form fields are grouped, THE Portal SHALL stack them vertically on screens narrower than 640px and arrange them in a grid on wider screens

### Requirement 5: Form UX Improvements

**User Story:** As a student filling out an application, I want clear feedback on form state and validation, so that I can complete the form correctly and confidently.

#### Acceptance Criteria

1. THE Auto_Save_Indicator SHALL be persistently visible in the Application_Wizard header area during form completion
2. WHEN a save operation fails, THE Auto_Save_Indicator SHALL display a "Save failed" message with a manual retry button
3. WHEN form validation errors are displayed, THE Portal SHALL show the error message directly below the associated field with a destructive color and an error icon
4. THE Portal SHALL debounce real-time field validation by 300ms to avoid displaying errors while the user is still typing
5. WHEN a multi-step form transitions between steps, THE Application_Wizard SHALL animate the transition using a horizontal slide with a duration between 150ms and 300ms

### Requirement 6: Toast Notification Consistency

**User Story:** As a user, I want notification messages to be visually consistent and accessible, so that I can quickly understand the status of my actions.

#### Acceptance Criteria

1. THE Toast_Notification component SHALL use semantic color tokens from the Design_Token_System for all visual styling
2. THE Toast_Notification component SHALL position toasts in a fixed container at the top-right on desktop (screens wider than 768px) and full-width at the top on mobile
3. WHEN a toast contains an error, THE Toast_Notification component SHALL use role="alert" and aria-live="assertive"
4. WHEN a toast contains a success or info message, THE Toast_Notification component SHALL use role="status" and aria-live="polite"
5. THE Toast_Notification component SHALL support a retry action button for error toasts that meets the 44×44px Touch_Target minimum

### Requirement 7: Card Component Variants

**User Story:** As a developer, I want card components with clear visual variants, so that I can consistently represent different content hierarchies across the portal.

#### Acceptance Criteria

1. THE Card component SHALL support an "elevated" variant with shadow-md and no visible border
2. THE Card component SHALL support an "outlined" variant with a border and no shadow
3. THE Card component SHALL support a "flat" variant with a muted background, no border, and no shadow
4. THE Card component SHALL default to the "outlined" variant when no variant is specified
5. WHEN a Card is interactive (clickable), THE Card component SHALL display a hover shadow transition and a Focus_Ring on keyboard focus

### Requirement 8: Typography Consistency

**User Story:** As a user, I want consistent text styling across all pages, so that the portal feels professional and easy to read.

#### Acceptance Criteria

1. THE Portal SHALL use the Inter font family as defined in the Design_Token_System for all text content
2. THE Portal SHALL apply a consistent heading scale: h1 at text-3xl (mobile) / text-4xl (desktop), h2 at text-2xl / text-3xl, h3 at text-xl / text-2xl
3. THE Portal SHALL use text-base with line-height 1.5 for all body text
4. THE Portal SHALL use text-sm with text-muted-foreground color for all helper and caption text
5. THE Portal SHALL use font-semibold for headings and font-medium for labels, with font-normal for body text

### Requirement 9: Animation and Motion Consistency

**User Story:** As a user, I want smooth, consistent animations that enhance usability without causing discomfort, so that the portal feels polished and responsive.

#### Acceptance Criteria

1. THE Portal SHALL use only the animation durations defined in the Design_Token_System (fast: 150ms, normal: 200ms, slow: 300ms)
2. THE Portal SHALL use only transform and opacity properties for animations to ensure GPU-accelerated rendering
3. WHEN the user has enabled prefers-reduced-motion, THE Portal SHALL disable all non-essential animations and transitions
4. THE Portal SHALL use the animation keyframes defined in tailwind.config.js and not define custom CSS keyframe animations outside the config

### Requirement 10: Error Handling UI

**User Story:** As a user encountering an error, I want clear, actionable error messages with recovery options, so that I can resolve issues and continue using the portal.

#### Acceptance Criteria

1. WHEN a network error occurs, THE Portal SHALL display an error message with a "Retry" button and a description of what failed
2. WHEN a form submission fails, THE Portal SHALL preserve the user's input and display the error without clearing the form
3. WHEN an unexpected error is caught by the ErrorBoundary, THE Portal SHALL display a friendly error page with a "Reload" button
4. THE Portal SHALL use the destructive color token for all error-related UI elements consistently
