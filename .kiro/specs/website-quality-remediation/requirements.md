# Requirements Document

## Introduction

Comprehensive quality remediation for the MIHAS Application System (apply.mihas.edu.zm), a live production admissions portal for Mukuba Institute of Health and Allied Sciences in Zambia. Forensic reviews identified 33 issues across security, performance, accessibility, SEO, PWA, and code quality. This document captures requirements to systematically remediate all findings, organized by priority. All changes must preserve backward compatibility with 86 existing database tables, maintain the 8-second auto-save interval, preserve PWA offline functionality, and never log PII.

## Glossary

- **Application_System**: The MIHAS admissions portal (React 18 + TypeScript + Vite) deployed on Vercel
- **API_Layer**: Vercel serverless functions in `api-src/` using query-parameter routing with Arcjet protection
- **Auth_Module**: Custom JWT authentication system using jose for tokens and bcrypt for password hashing, stored in `api-src/auth.ts` and `lib/auth/`
- **Secure_Storage_Module**: Client-side storage utility in `src/lib/secureStorage.ts` that currently uses XOR cipher with a hardcoded key
- **Auto_Save_Hook**: The `useAutoSave` hook in `src/hooks/useAutoSave.ts` providing 8-second interval form persistence
- **Security_Headers_Config**: HTTP response headers configured in `vercel.json`
- **Arcjet_Layer**: Security perimeter in `lib/arcjet.ts` providing shield rules, bot detection, and rate limiting
- **Audit_Logger**: Logging utility in `lib/auditLogger.ts` for recording state changes without PII
- **Application_Wizard**: 4-step student application form (Personal Info, Academic History, Program Selection, Document Upload)
- **CSRF_Token**: A per-session token used to prevent cross-site request forgery attacks on state-changing endpoints
- **CSP**: Content Security Policy header that restricts which resources the browser may load
- **PWA_Service_Worker**: Service worker providing offline functionality, currently both `public/sw.js` (legacy) and vite-plugin-pwa coexist
- **ECZ_Grading**: Zambian Examinations Council grading scale (1-9, where 1-6 is pass, 7-9 is fail)
- **PII**: Personally Identifiable Information including NRC numbers, passport numbers, medical conditions, phone numbers, and email addresses
- **SSRF**: Server-Side Request Forgery, where an attacker tricks the server into making HTTP requests to arbitrary URLs
- **Magic_Bytes**: The first few bytes of a file that identify its true format, independent of the file extension or client-provided MIME type
- **N_Plus_1_Query**: A database anti-pattern where a loop executes N individual queries instead of a single batched query

## Requirements

### Requirement 1: Eliminate Insecure PII Storage in localStorage

**User Story:** As a student, I want my sensitive personal data (NRC numbers, passport numbers, medical conditions) protected from client-side theft, so that my identity and health information remain confidential.

#### Acceptance Criteria

1. THE Secure_Storage_Module SHALL store application draft data using the browser Web Crypto API (AES-GCM) with a per-session key derived from the authenticated user's session, replacing the current XOR cipher with hardcoded key
2. WHEN the Auto_Save_Hook persists form data locally, THE Application_System SHALL exclude PII fields (NRC number, passport number, medical conditions, phone number, email) from localStorage, retaining only non-sensitive form progress
3. WHEN a user session ends or the user logs out, THE Secure_Storage_Module SHALL delete all locally cached draft data associated with that session
4. IF the Web Crypto API is unavailable (older browser), THEN THE Secure_Storage_Module SHALL fall back to storing only non-PII fields in localStorage and display a notice that full draft recovery requires a modern browser
5. THE Secure_Storage_Module SHALL remove the hardcoded encryption key `mihas_plugin_storage_key` from the source code
6. WHEN the Auto_Save_Hook saves draft data to the server via the `onSave` callback, THE Application_System SHALL transmit PII fields only over the authenticated server-side save path, not store them client-side

### Requirement 2: Implement CSRF Protection on State-Changing Endpoints

**User Story:** As a system administrator, I want all POST, PATCH, and DELETE API requests validated against CSRF attacks, so that authenticated sessions cannot be exploited by malicious third-party sites.

#### Acceptance Criteria

1. WHEN a user authenticates successfully, THE Auth_Module SHALL generate a cryptographically random CSRF token and return it to the client via a response header or dedicated endpoint
2. WHEN the client sends a POST, PATCH, or DELETE request, THE API_Layer SHALL require a valid CSRF token in the `X-CSRF-Token` request header
3. IF a state-changing request arrives without a valid CSRF token, THEN THE API_Layer SHALL reject the request with HTTP 403 and error code `CSRF_VALIDATION_FAILED`
4. THE API_Layer SHALL validate the CSRF token against the server-side session record, not rely solely on cookie-based double-submit
5. WHEN a user session is refreshed via `/api/auth?action=refresh`, THE Auth_Module SHALL rotate the CSRF token alongside the access and refresh tokens

### Requirement 3: Harden Password Reset Flow

**User Story:** As a student, I want the password reset process to be resistant to brute-force and replay attacks, so that my account remains secure.

#### Acceptance Criteria

1. THE Auth_Module SHALL enforce a rate limit of 3 password reset token requests per email address per 15-minute window
2. WHEN a password is successfully changed, THE Auth_Module SHALL invalidate all outstanding password reset tokens for that user
3. WHEN a password reset token is used, THE Auth_Module SHALL invalidate that specific token immediately after use, preventing replay
4. IF a password reset request exceeds the rate limit, THEN THE Auth_Module SHALL return HTTP 429 with a `Retry-After` header indicating the remaining cooldown period
5. THE Auth_Module SHALL generate password reset tokens using a cryptographically secure random generator with a minimum of 32 bytes of entropy

### Requirement 4: Remove Legacy Authentication Code

**User Story:** As a developer, I want all legacy Supabase authentication code (plaintext and SHA-256 password handling) removed from the codebase, so that only the current bcrypt-based auth path exists and the attack surface is minimized.

#### Acceptance Criteria

1. THE Auth_Module SHALL remove all code paths that handle plaintext password comparison
2. THE Auth_Module SHALL remove all code paths that handle SHA-256 password hash comparison
3. THE Auth_Module SHALL use bcrypt with a minimum of 12 rounds as the sole password hashing mechanism
4. WHEN the legacy code is removed, THE Auth_Module SHALL maintain backward compatibility by providing a one-time migration path for any remaining SHA-256 hashed passwords (re-hash to bcrypt on next successful login)
5. THE Auth_Module SHALL remove all imports and references to the Supabase Auth SDK from `api-src/auth.ts` and `lib/auth/legacy.ts`

### Requirement 5: Add Missing Security Headers

**User Story:** As a security engineer, I want the application to serve comprehensive security headers on all responses, so that common browser-based attacks (XSS, clickjacking, data sniffing, feature abuse) are mitigated.

#### Acceptance Criteria

1. THE Security_Headers_Config SHALL include a Content-Security-Policy header that restricts script sources to `'self'` and any required CDN origins, disallows `unsafe-inline` for scripts (with nonce or hash exceptions for necessary inline scripts), and restricts frame-ancestors to `'none'`
2. THE Security_Headers_Config SHALL include a `Permissions-Policy` header that disables camera, microphone, geolocation, and payment APIs unless explicitly required by a feature
3. THE Security_Headers_Config SHALL include a `Referrer-Policy` header set to `strict-origin-when-cross-origin`
4. THE Security_Headers_Config SHALL include a `Strict-Transport-Security` header with `max-age=31536000; includeSubDomains` on all responses, not only API responses
5. THE Security_Headers_Config SHALL include `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` on all responses (currently present but should be verified as complete)

### Requirement 6: Validate All API Input with Zod Schemas

**User Story:** As a developer, I want all API endpoints to validate incoming request bodies and query parameters against Zod schemas, so that malformed or malicious input is rejected before reaching business logic.

#### Acceptance Criteria

1. THE API_Layer SHALL define a Zod schema for every action in each consolidated endpoint (`auth`, `applications`, `admin`, `documents`, `payments`, `sessions`, `notifications`)
2. WHEN a request body or query parameter fails Zod validation, THE API_Layer SHALL return HTTP 400 with a structured error response containing field-level validation messages
3. THE Auth_Module SHALL validate email format (RFC 5322 compliant), password minimum length (8 characters), and password complexity (at least one uppercase, one lowercase, one digit) on registration and password change actions
4. THE API_Layer SHALL sanitize all string inputs by trimming whitespace and rejecting strings containing null bytes
5. WHEN validating Zambian-specific data, THE API_Layer SHALL validate NRC number format, phone numbers (+260 prefix, 9 digits), and ECZ grade values (integers 1-9)

### Requirement 7: Strengthen Rate Limiting and Account Protection

**User Story:** As a system administrator, I want rate limits on authentication endpoints to prevent brute-force attacks and credential stuffing, so that student accounts remain protected.

#### Acceptance Criteria

1. THE Arcjet_Layer SHALL enforce a rate limit of 5 login attempts per IP address per 5-minute window on `/api/auth?action=login`
2. WHEN a login rate limit is exceeded, THE Auth_Module SHALL return HTTP 429 with a `Retry-After` header and error code `RATE_LIMIT_EXCEEDED`
3. THE Arcjet_Layer SHALL implement progressive backoff: after 5 failed login attempts for a specific email, THE Auth_Module SHALL require a 15-minute cooldown before accepting further attempts for that email
4. WHEN 10 consecutive failed login attempts occur for a single account, THE Auth_Module SHALL temporarily lock the account for 30 minutes and send a notification email to the account holder via Resend
5. THE Arcjet_Layer SHALL enforce rate limits on registration (`/api/auth?action=register`) of 3 requests per IP per 10-minute window

### Requirement 8: Complete Audit Logging Coverage

**User Story:** As a compliance officer, I want all state-changing operations logged with sufficient context for forensic analysis, so that security incidents and data changes can be traced without exposing PII.

#### Acceptance Criteria

1. THE Audit_Logger SHALL record an audit entry for every application status change (draft, submitted, under_review, approved, rejected, waitlisted)
2. THE Audit_Logger SHALL record an audit entry for every authentication event (login success, login failure, logout, token refresh, password change, password reset request)
3. THE Audit_Logger SHALL record an audit entry for every admin action (user role change, application review decision, settings modification)
4. THE Audit_Logger SHALL include in each entry: timestamp (ISO 8601), actor ID (hashed if student), action type, resource type, resource ID, IP address (hashed), and result (success/failure)
5. THE Audit_Logger SHALL exclude all PII (names, emails, NRC numbers, phone numbers, medical data) from log entries, using only opaque identifiers
6. THE Audit_Logger SHALL enforce a retention policy of 90 days for standard audit entries and 365 days for security-related entries (login failures, role changes, password resets)


### Requirement 9: Reduce Excessive localStorage Reads

**User Story:** As a student on a low-powered mobile device, I want the application to minimize synchronous localStorage reads, so that the UI remains responsive during form entry.

#### Acceptance Criteria

1. THE Auto_Save_Hook SHALL read from localStorage at most once per component mount (on initialization), caching the result in memory for subsequent access
2. THE Application_System SHALL batch localStorage writes using `requestIdleCallback` or `setTimeout(fn, 0)` to avoid blocking the main thread during user interaction
3. WHEN the Application_Wizard is active, THE Application_System SHALL perform zero synchronous localStorage reads during render cycles after initial mount
4. THE Application_System SHALL use a single in-memory cache (via Zustand or module-level variable) for all auto-save state, writing to localStorage only during the 8-second save interval

### Requirement 10: Implement Image Optimization

**User Story:** As a student on a slow Zambian mobile connection, I want images to load efficiently, so that pages render quickly even on 3G networks.

#### Acceptance Criteria

1. THE Application_System SHALL serve images in WebP format with JPEG/PNG fallbacks using the `<picture>` element or equivalent
2. THE Application_System SHALL apply `loading="lazy"` to all images positioned below the initial viewport fold
3. THE Application_System SHALL provide explicit `width` and `height` attributes on all `<img>` elements to prevent cumulative layout shift
4. THE Application_System SHALL use responsive image srcsets with breakpoints at 320px, 640px, 1024px, and 1440px for hero and content images
5. THE Application_System SHALL inline images smaller than 4KB as base64 data URIs (already configured in Vite, verify enforcement)

### Requirement 11: Simplify API Response Unwrapping

**User Story:** As a developer, I want a single, consistent API client that handles response envelope unwrapping, so that frontend code does not contain redundant unwrapping logic.

#### Acceptance Criteria

1. THE Application_System SHALL consolidate API response handling into a single client module (`src/services/client.ts`), removing the duplicate unwrapping in `src/lib/apiClient.ts`
2. WHEN migrating callers from `src/lib/apiClient.ts` to `src/services/client.ts`, THE Application_System SHALL update all import references without changing external behavior
3. THE Application_System SHALL remove the `data.data ?? data` fallback pattern from `src/lib/apiClient.ts` after migration is complete
4. IF any hook or component directly calls `authFetch()` from the old client, THEN THE Application_System SHALL migrate that call to use the `ApiClient` class from `src/services/client.ts`

### Requirement 12: Complete Code Splitting for Heavy Libraries

**User Story:** As a student, I want the initial page load to be fast, so that I can start my application without waiting for unused libraries to download.

#### Acceptance Criteria

1. THE Application_System SHALL lazy-load the Recharts library using `React.lazy()` and dynamic `import()`, loading chart components only when the admin dashboard or analytics views are rendered
2. THE Application_System SHALL lazy-load the Tesseract.js library using dynamic `import()`, loading OCR functionality only when the document upload step of the Application_Wizard is active
3. THE Application_System SHALL display a loading skeleton or spinner while lazy-loaded components are being fetched
4. WHEN lazy-loaded chunks fail to load (network error), THE Application_System SHALL display a retry button and a user-friendly error message instead of a blank screen
5. THE Application_System SHALL keep the main bundle size below 500KB (gzipped) after code splitting is applied

### Requirement 13: Add Comprehensive ARIA Labels to Forms

**User Story:** As a student using a screen reader, I want all form inputs to have descriptive labels and state announcements, so that I can complete my application independently.

#### Acceptance Criteria

1. THE Application_Wizard SHALL provide an `aria-label` or associated `<label>` element for every form input, select, textarea, and file upload control
2. WHEN a form field has a validation error, THE Application_Wizard SHALL set `aria-invalid="true"` on the field and associate the error message via `aria-describedby`
3. THE Application_Wizard SHALL set `aria-required="true"` on all mandatory form fields
4. WHEN the Application_Wizard transitions between steps, THE Application_System SHALL announce the new step title to screen readers using an `aria-live="polite"` region
5. THE Application_System SHALL provide `aria-label` attributes on all icon-only buttons (close, menu, navigation arrows)

### Requirement 14: Fix Keyboard Navigation and Focus Management

**User Story:** As a student who navigates using a keyboard, I want consistent focus management and visible focus indicators, so that I can use the application without a mouse.

#### Acceptance Criteria

1. WHEN a modal dialog opens, THE Application_System SHALL trap keyboard focus within the modal until the modal is closed
2. WHEN a modal dialog closes, THE Application_System SHALL return focus to the element that triggered the modal
3. THE Application_System SHALL provide visible focus indicators (minimum 2px outline with sufficient contrast) on all interactive elements (buttons, links, inputs, selects)
4. THE Application_System SHALL support `Escape` key to close all modal dialogs, dropdown menus, and overlay panels
5. THE Application_Wizard SHALL allow navigation between wizard steps using keyboard-only interaction (Tab, Enter, arrow keys where appropriate)

### Requirement 15: Remediate Color Contrast Issues

**User Story:** As a student with low vision, I want all text and interactive elements to meet minimum contrast ratios, so that I can read content and identify controls.

#### Acceptance Criteria

1. THE Application_System SHALL ensure all normal-sized text (below 18pt / 14pt bold) meets a minimum contrast ratio of 4.5:1 against its background, per WCAG 2.1 AA
2. THE Application_System SHALL ensure all large text (18pt+ or 14pt+ bold) meets a minimum contrast ratio of 3:1 against its background
3. THE Application_System SHALL ensure all non-text UI components (form borders, icons, focus indicators) meet a minimum contrast ratio of 3:1 against adjacent colors
4. WHEN the Application_System uses status colors (success green, error red, warning amber), THE Application_System SHALL pair the color with a text label or icon so that color is not the sole means of conveying information
5. THE Application_System SHALL define accessible color tokens in `tailwind.config.js` that meet the specified contrast ratios against both white and the application's background colors

### Requirement 16: Add Descriptive Alt Text to All Images

**User Story:** As a student using a screen reader, I want all images to have meaningful alternative text, so that I understand the content and purpose of visual elements.

#### Acceptance Criteria

1. THE Application_System SHALL provide descriptive `alt` attributes on all informational images (logos, illustrations, document previews)
2. THE Application_System SHALL set `alt=""` (empty string) and `role="presentation"` on all decorative images that convey no information
3. WHEN an image fails to load, THE Application_System SHALL display the alt text as a visible fallback alongside a placeholder icon
4. THE Application_System SHALL provide `alt` text on the MIHAS logo that reads "Mukuba Institute of Health and Allied Sciences logo"

### Requirement 17: Add Social Media Meta Tags

**User Story:** As a marketing coordinator, I want shared links to the application portal to display rich previews on social media platforms, so that prospective students see professional, informative link cards.

#### Acceptance Criteria

1. THE Application_System SHALL include Open Graph meta tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`) in the HTML `<head>` of `index.html`
2. THE Application_System SHALL include Twitter Card meta tags (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`) in the HTML `<head>` of `index.html`
3. THE Application_System SHALL set `og:title` to "MIHAS Application System" and `og:description` to a summary of the admissions portal purpose
4. THE Application_System SHALL reference an Open Graph image of at least 1200x630 pixels hosted at a stable URL under the application domain

### Requirement 18: Add Structured Data and Complete Sitemap

**User Story:** As a search engine crawler, I want structured data and a complete sitemap, so that the application portal is properly indexed and displays rich results.

#### Acceptance Criteria

1. THE Application_System SHALL include a JSON-LD script in `index.html` with `@type: EducationalOrganization` containing the institution name, URL, logo, and contact information
2. THE Application_System SHALL include a JSON-LD script with `@type: WebApplication` describing the admissions portal
3. THE Application_System SHALL maintain a `public/sitemap.xml` that lists all publicly accessible routes with `<lastmod>` dates and `<changefreq>` values
4. THE Application_System SHALL reference the sitemap in `public/robots.txt` via a `Sitemap:` directive pointing to the full URL

### Requirement 19: Resolve Service Worker Conflicts

**User Story:** As a student using the PWA offline, I want a single, reliable service worker managing caching and offline access, so that the application works consistently on unreliable Zambian connections.

#### Acceptance Criteria

1. THE Application_System SHALL use a single service worker strategy, either the legacy `public/sw.js` or the vite-plugin-pwa generated worker, not both
2. WHEN the chosen service worker is activated, THE Application_System SHALL unregister any competing service worker registrations from the other strategy
3. THE PWA_Service_Worker SHALL cache the Application_Wizard pages, critical CSS, and JavaScript bundles for offline access
4. WHEN the application is offline, THE PWA_Service_Worker SHALL serve cached pages and display an offline indicator banner
5. WHEN a new service worker version is available, THE Application_System SHALL prompt the user to refresh rather than silently activating the new worker mid-session

### Requirement 20: Implement Reliable PWA Install Prompts

**User Story:** As a student on a mobile device, I want a clear prompt to install the application as a PWA, so that I can access it from my home screen with offline support.

#### Acceptance Criteria

1. WHEN the browser fires the `beforeinstallprompt` event, THE Application_System SHALL capture the event and display a custom install banner with a clear call-to-action
2. THE Application_System SHALL display the install prompt only once per session and remember dismissal for 7 days using localStorage
3. WHEN the user dismisses the install prompt, THE Application_System SHALL hide the banner and not show it again during the current session
4. THE Application_System SHALL verify that `public/manifest.json` contains all required fields: `name`, `short_name`, `start_url`, `display`, `background_color`, `theme_color`, `icons` (192px and 512px), and `scope`
5. IF the browser does not support PWA installation (e.g., Firefox desktop), THEN THE Application_System SHALL not display the install prompt

### Requirement 21: Standardize Error Handling

**User Story:** As a developer, I want a consistent error handling pattern across all API endpoints and frontend services, so that errors are predictable, loggable, and user-friendly.

#### Acceptance Criteria

1. THE API_Layer SHALL use the `sendError(res, statusCode, message, code)` function from `lib/errorHandler.ts` as the sole error response mechanism in all catch blocks
2. THE API_Layer SHALL wrap every action handler in a try/catch block that catches all exceptions and routes them through `sendError`
3. THE Application_System SHALL implement a global React error boundary at the application root that catches unhandled rendering errors and displays a recovery UI with a "Reload" button
4. WHEN an API call fails on the frontend, THE Application_System SHALL display a user-friendly toast notification with the error message and a retry option where applicable
5. THE API_Layer SHALL log all caught errors via the Audit_Logger with error type, endpoint, action, and sanitized context (no PII, no stack traces in responses)

### Requirement 22: Remove Dead Code and Unused Imports

**User Story:** As a developer, I want the codebase free of dead code from removed features (Supabase, Cloudflare, Sentry, analytics), so that the codebase is maintainable and the bundle size is minimized.

#### Acceptance Criteria

1. THE Application_System SHALL remove all import statements referencing Supabase, Sentry, Umami, Cloudflare, or Twilio packages
2. THE Application_System SHALL remove all functions, components, hooks, and type definitions that are not reachable from any active code path
3. THE Application_System SHALL remove all environment variable references for removed services (`SUPABASE_*`, `VITE_SUPABASE_*`, `VITE_SENTRY_DSN`, `VITE_ANALYTICS_*`, `CLOUDFLARE_AI_*`, `VITE_TURNSTILE_SITE_KEY`)
4. WHEN dead code is removed, THE Application_System SHALL verify that no runtime errors are introduced by running the full test suite and a production build

### Requirement 23: Improve TypeScript Type Safety

**User Story:** As a developer, I want stronger TypeScript type checking to catch null reference errors and implicit any usage at compile time, so that runtime errors in production are reduced.

#### Acceptance Criteria

1. THE Application_System SHALL enable `strictNullChecks` in `tsconfig.json` and resolve all resulting type errors
2. THE Application_System SHALL enable `noImplicitAny` in `tsconfig.json` and add explicit type annotations to all currently implicit `any` parameters and variables
3. THE Application_System SHALL replace all type assertions (`as any`, `as unknown as T`) with proper type guards or runtime validation
4. WHEN enabling stricter TypeScript settings, THE Application_System SHALL proceed incrementally (one strict flag at a time) to avoid destabilizing the production build
5. THE Application_System SHALL add explicit return types to all exported functions in `lib/` and `api-src/` directories

### Requirement 24: Increase Test Coverage for Critical Paths

**User Story:** As a developer, I want comprehensive test coverage for authentication, the application wizard, and accessibility, so that regressions in critical user flows are caught before deployment.

#### Acceptance Criteria

1. THE Application_System SHALL have unit tests (Vitest) covering all Auth_Module actions: login, logout, register, refresh, password reset request, and password change
2. THE Application_System SHALL have unit tests covering the Application_Wizard form validation for each of the 4 steps, including Zambian-specific validation (NRC format, +260 phone, ECZ grades 1-9)
3. THE Application_System SHALL have property-based tests (fast-check) for the Secure_Storage_Module verifying round-trip correctness: `decrypt(encrypt(data)) === data` for arbitrary input
4. THE Application_System SHALL have end-to-end tests (Playwright) covering the complete application flow: registration, login, wizard completion (all 4 steps), and submission
5. THE Application_System SHALL have accessibility tests (axe-core via Vitest or Playwright) that verify zero critical or serious accessibility violations on the login page, registration page, and each Application_Wizard step
6. THE Application_System SHALL achieve a minimum of 80% line coverage on `lib/auth/` and `api-src/auth.ts`

### Requirement 25: Validate Environment Variables at Startup

**User Story:** As a DevOps engineer, I want the application to validate all required environment variables at startup, so that misconfigured deployments fail fast with clear error messages instead of producing cryptic runtime errors.

#### Acceptance Criteria

1. WHEN a Vercel serverless function cold-starts, THE API_Layer SHALL validate the presence and non-empty value of all required environment variables (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ARCJET_KEY`)
2. IF a required environment variable is missing or empty, THEN THE API_Layer SHALL throw a descriptive error naming the missing variable and halt the function, returning HTTP 503
3. THE API_Layer SHALL validate `DATABASE_URL` format as a valid PostgreSQL connection string (starts with `postgres://` or `postgresql://`)
4. THE API_Layer SHALL validate that `JWT_SECRET` and `JWT_REFRESH_SECRET` are at least 32 characters long
5. WHEN the frontend Vite build runs, THE Application_System SHALL validate that all required `VITE_*` environment variables are defined, failing the build with a clear error if any are missing

### Requirement 26: Prevent Server-Side Request Forgery in Document Extract

**User Story:** As a security engineer, I want the document extract endpoint to validate URLs before fetching them server-side, so that attackers cannot use the server as a proxy to access internal services or arbitrary external resources.

#### Acceptance Criteria

1. WHEN the `handleExtract` action in `api-src/documents.ts` receives a `documentUrl`, THE API_Layer SHALL validate that the URL scheme is `https` and the hostname belongs to an allowlist of trusted domains (the application domain and the R2 storage domain)
2. IF the `documentUrl` points to a private IP range (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7), THEN THE API_Layer SHALL reject the request with HTTP 400 and error code `INVALID_DOCUMENT_URL`
3. THE API_Layer SHALL enforce a maximum response size of 20MB when fetching the document URL to prevent denial-of-service via large payloads
4. THE API_Layer SHALL set a fetch timeout of 10 seconds when retrieving the document to prevent hanging connections

### Requirement 27: Prevent Open Redirect via Notification Action URLs

**User Story:** As a student, I want notification links to only navigate to trusted pages within the application, so that I am not redirected to phishing or malicious sites.

#### Acceptance Criteria

1. WHEN the `NotificationBell` component navigates to a `notification.action_url`, THE Application_System SHALL validate that the URL is a relative path or belongs to the application's origin (`apply.mihas.edu.zm`) before navigating
2. IF a `notification.action_url` points to an external domain, THEN THE Application_System SHALL ignore the URL and not navigate, logging a warning to the console in development mode
3. THE API_Layer SHALL validate `action_url` values when creating notifications in `api-src/notifications.ts`, rejecting absolute URLs that do not match the application domain

### Requirement 28: Remove Hardcoded Credentials from Source Code

**User Story:** As a security engineer, I want all hardcoded passwords and credentials removed from the repository, so that sensitive access information is not exposed in version control history.

#### Acceptance Criteria

1. THE Application_System SHALL remove the hardcoded password `Beanola2025` from `scripts/test-user-flow.ts` and `scripts/set-passwords-and-notify.ts`, replacing them with environment variable references
2. THE Application_System SHALL add `scripts/test-user-flow.ts` and `scripts/set-passwords-and-notify.ts` to `.gitignore` or refactor them to read credentials from environment variables or a `.env.local` file that is gitignored
3. THE Application_System SHALL audit all files in `scripts/` for hardcoded credentials, API keys, or secrets and replace them with environment variable references
4. THE Application_System SHALL add a pre-commit check or documentation warning against committing credentials to the repository

### Requirement 29: Eliminate N+1 Query Patterns in Application Endpoints

**User Story:** As a system administrator, I want database queries to be efficient, so that the application remains responsive as the number of students and applications grows.

#### Acceptance Criteria

1. THE API_Layer SHALL replace the per-grade INSERT loop in `api-src/applications.ts` (handleById grade sync) with a single multi-row INSERT statement using parameterized values
2. THE API_Layer SHALL replace the per-setting INSERT loop in `api-src/admin.ts` (handleResetSettings) with a single multi-row INSERT statement
3. THE API_Layer SHALL replace the per-setting INSERT loop in `api-src/admin.ts` (handleImportSettings) with a batched upsert query
4. WHEN performing bulk database operations, THE API_Layer SHALL use a single query with multiple value sets rather than iterating with individual queries

### Requirement 30: Wrap Multi-Step Database Operations in Transactions

**User Story:** As a developer, I want multi-step database operations to be atomic, so that partial failures do not leave the database in an inconsistent state.

#### Acceptance Criteria

1. THE API_Layer SHALL wrap the grade sync operation in `api-src/applications.ts` (delete existing grades + insert new grades) in a database transaction using the `transaction()` function from `lib/db.ts`
2. THE API_Layer SHALL wrap the application status update + status history insert in `api-src/applications.ts` (handleReview) in a database transaction
3. THE API_Layer SHALL wrap the settings reset operation in `api-src/admin.ts` (delete all + insert defaults) in a database transaction
4. IF any step within a transaction fails, THE API_Layer SHALL roll back all changes and return an appropriate error response without partial data corruption

### Requirement 31: Remove @ts-nocheck Directives and Restore Type Checking

**User Story:** As a developer, I want all source files to have TypeScript checking enabled, so that type errors are caught at compile time rather than causing runtime failures in production.

#### Acceptance Criteria

1. THE Application_System SHALL remove `@ts-nocheck` directives from all files in `src/` (currently present in 40+ files including hooks, services, components, and utility modules)
2. WHEN removing `@ts-nocheck` from a file, THE Application_System SHALL fix all resulting TypeScript errors with proper type annotations, type guards, or interface definitions rather than replacing with `@ts-ignore` on individual lines
3. THE Application_System SHALL prioritize removing `@ts-nocheck` from critical-path files first: `src/hooks/queries/useQueryConfig.ts`, `src/hooks/usePWA.ts`, `src/forms/applicationSchema.ts`, `src/data/applications.ts`, `src/routes/config.tsx`
4. THE Application_System SHALL remove `@ts-nocheck` from all files before enabling `strictNullChecks` or `noImplicitAny` (Requirement 23), as the directives would silently bypass those checks

### Requirement 32: Fix SSE Keepalive Interval for Vercel Serverless Compatibility

**User Story:** As a student receiving real-time updates, I want the SSE connection to work reliably on Vercel's serverless infrastructure, so that I receive application status updates without connection drops.

#### Acceptance Criteria

1. THE Application_System SHALL reduce the SSE keepalive interval in `lib/realtime.ts` from 15 seconds to 8 seconds, which is within Vercel's 10-second serverless function timeout
2. THE Application_System SHALL document the Vercel timeout constraint in a code comment alongside the keepalive interval constant
3. THE Application_System SHALL ensure the SSE client-side reconnection logic in frontend hooks handles the Vercel timeout gracefully by automatically reconnecting with exponential backoff (starting at 1 second, max 30 seconds)
4. THE Application_System SHALL clean up the in-memory `connections` Map in `lib/realtime.ts` when connections are closed to prevent memory leaks across serverless invocations

### Requirement 33: Validate Uploaded File Content Against MIME Type

**User Story:** As a security engineer, I want uploaded files to be validated by their actual content (magic bytes), not just the client-provided MIME type, so that malicious files disguised with fake extensions are rejected.

#### Acceptance Criteria

1. WHEN a file is uploaded via `api-src/documents.ts` (handleUpload), THE API_Layer SHALL verify the file's magic bytes match the declared MIME type before storing the file
2. THE API_Layer SHALL recognize magic bytes for PDF (`%PDF`), JPEG (`FF D8 FF`), and PNG (`89 50 4E 47`) file formats
3. IF the magic bytes do not match any allowed file type, THEN THE API_Layer SHALL reject the upload with HTTP 400 and error code `INVALID_FILE_CONTENT`
4. THE API_Layer SHALL perform magic byte validation before writing the file to R2 storage, not after
