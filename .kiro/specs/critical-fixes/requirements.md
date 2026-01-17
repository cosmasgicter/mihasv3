# Requirements Document

## Introduction

This document specifies requirements for fixing critical production issues in the MIHAS Application System. The issues include: Sentry removal (causing 429 errors), service worker chrome-extension caching errors, real-time UI updates not reflecting changes, shadcn migration UI regressions (oversized buttons), and PWA manifest/meta tag issues.

## Glossary

- **Service_Worker**: A script that runs in the background to handle caching and offline functionality
- **Sentry**: Error monitoring service that is being removed due to rate limiting issues
- **Real_Time_Subscription**: Supabase Postgres Changes subscription for live data updates
- **Query_Cache**: React Query cache that stores server data for the dashboard
- **PWA**: Progressive Web App with offline capabilities
- **shadcn_UI**: Component library pattern used for UI components

## Requirements

### Requirement 1: Remove Sentry Error Monitoring

**User Story:** As a system administrator, I want Sentry removed from the application, so that users don't experience 429 rate limiting errors and the application loads faster.

#### Acceptance Criteria

1. WHEN the application loads, THE System SHALL NOT initialize any Sentry SDK
2. WHEN the application is built, THE Build_System SHALL NOT include Sentry packages in the bundle
3. WHEN errors occur, THE System SHALL log them to the console without sending to external services
4. THE index.html SHALL NOT contain dns-prefetch hints for Sentry domains

### Requirement 2: Fix Service Worker Chrome Extension Caching Error

**User Story:** As a user with browser extensions, I want the service worker to handle caching gracefully, so that I don't see console errors about unsupported URL schemes.

#### Acceptance Criteria

1. WHEN the Service_Worker attempts to cache a request, THE Service_Worker SHALL validate the URL scheme is http or https
2. IF the request URL scheme is chrome-extension or other unsupported scheme, THEN THE Service_Worker SHALL skip caching without throwing an error
3. WHEN caching fails for any reason, THE Service_Worker SHALL catch the error and continue operation
4. THE Service_Worker SHALL only cache requests with supported URL schemes (http, https)

### Requirement 3: Fix Real-Time UI Updates

**User Story:** As a student, I want my dashboard to update immediately when I submit an application or when my application status changes, so that I don't need to clear cache or re-login to see changes.

#### Acceptance Criteria

1. WHEN an application is submitted, THE Dashboard SHALL display the new application within 2 seconds without page refresh
2. WHEN an application status changes (approval, rejection), THE Dashboard SHALL reflect the change within 2 seconds
3. WHEN a real-time change is received, THE Query_Cache SHALL be invalidated and refetched immediately
4. WHEN the Real_Time_Subscription receives a change event, THE System SHALL dispatch a window event for non-React-Query components
5. IF the Real_Time_Subscription fails to connect, THEN THE System SHALL fall back to polling every 30 seconds

### Requirement 4: Fix shadcn Migration UI Regressions

**User Story:** As a user, I want buttons and UI elements to be appropriately sized, so that the application wizard and other forms are usable and visually consistent.

#### Acceptance Criteria

1. THE Button component SHALL have default size of h-10 (40px) for standard buttons
2. THE Button component SHALL have size sm of h-9 (36px) for compact buttons
3. THE Button component SHALL have size lg of h-11 (44px) for prominent buttons
4. WHEN buttons are rendered in the Application_Wizard, THE buttons SHALL maintain consistent sizing with the design system
5. THE Button component SHALL maintain 44px minimum touch target for accessibility while allowing visual height to be smaller
6. WHEN the icon size is specified, THE Button SHALL use size-4 (16px) for icons by default

### Requirement 5: Fix PWA Manifest and Meta Tags

**User Story:** As a mobile user, I want the PWA to install correctly without console warnings, so that I can use the application offline.

#### Acceptance Criteria

1. THE index.html SHALL use the non-deprecated meta tag `mobile-web-app-capable` instead of `apple-mobile-web-app-capable`
2. THE manifest.json SHALL reference icons that exist in the public/images directory
3. WHEN the PWA manifest is loaded, THE System SHALL NOT produce console errors about missing icons
4. THE System SHALL provide fallback icons using existing logo files if dedicated PWA icons don't exist

### Requirement 6: Fix Email Slip API Error

**User Story:** As a student, I want the email slip functionality to work without 500 errors, so that I can receive my application confirmation.

#### Acceptance Criteria

1. WHEN the /applications/email/slip endpoint is called, THE System SHALL return a valid response or meaningful error
2. IF the email slip generation fails, THEN THE System SHALL return a 400 status with descriptive error message
3. THE email slip endpoint SHALL validate required parameters before processing
