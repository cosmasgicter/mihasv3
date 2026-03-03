# Tasks

## Task 1: Eliminate Insecure PII Storage (Req 1)

- [x] 1.1 Rewrite `src/lib/secureStorage.ts` to use Web Crypto API (AES-GCM) with PBKDF2-derived per-session key, removing the XOR cipher and hardcoded `mihas_plugin_storage_key`
- [x] 1.2 Create a `PII_FIELDS` constant (`nrc_number`, `passport_number`, `medical_conditions`, `phone`, `email`) and add a `stripPiiFields()` utility function
- [x] 1.3 Update `src/hooks/useAutoSave.ts` to call `stripPiiFields()` before writing to localStorage, ensuring PII is only sent via the server-side `onSave` callback
- [x] 1.4 Add `clearSession()` method to SecureStorage that removes all keys with the secure prefix, and call it on logout
- [x] 1.5 Add fallback path: if `crypto.subtle` is unavailable, store only non-PII fields in plain localStorage and display a notice banner
- [x] 1.6 Write property tests (fast-check) for SecureStorage: round-trip correctness (P1), PII exclusion (P2), session cleanup (P3)

## Task 2: Implement CSRF Protection (Req 2)

- [x] 2.1 Create `lib/csrf.ts` with `generateToken()`, `validateToken()`, and `rotateToken()` functions using crypto.randomBytes(32) and SHA-256 hashing
- [x] 2.2 Create database migration for `csrf_tokens` table (user_id, token_hash, expires_at, created_at)
- [x] 2.3 Update `api-src/auth.ts` login action to generate CSRF token and return it in `X-CSRF-Token` response header
- [x] 2.4 Add CSRF validation middleware to all POST/PATCH/DELETE handlers in `api-src/*.ts`, returning 403 `CSRF_VALIDATION_FAILED` on failure
- [x] 2.5 Update `api-src/auth.ts` refresh action to rotate CSRF token alongside access/refresh tokens
- [x] 2.6 Update frontend auth store (Zustand) to store CSRF token in memory and attach to all state-changing requests via `X-CSRF-Token` header
- [x] 2.7 Write property tests for CSRF: token uniqueness/entropy (P4), rejection on invalid token (P5), rotation on refresh (P6)

## Task 3: Harden Password Reset Flow (Req 3)

- [x] 3.1 Create database migration for `password_reset_tokens` table (user_id, token_hash, expires_at, used_at, created_at)
- [x] 3.2 Add `password-reset-request` action to `api-src/auth.ts` with rate limiting (3 per email per 15 min), generating 32-byte random tokens
- [x] 3.3 Add `password-reset` action to `api-src/auth.ts` that validates token, changes password, and invalidates all outstanding tokens for the user
- [x] 3.4 Add `Retry-After` header to 429 responses when rate limit is exceeded
- [x] 3.5 Write property tests: rate limiting (P7), token invalidation on password change (P8), single-use tokens (P9)

## Task 4: Remove Legacy Authentication Code (Req 4)

- [x] 4.1 Remove all plaintext and SHA-256 password comparison code paths from `lib/auth/legacy.ts` and `api-src/auth.ts`
- [x] 4.2 Add one-time SHA-256→bcrypt migration in the login handler: detect SHA-256 hash format, verify, re-hash with bcrypt, update DB
- [x] 4.3 Remove all Supabase Auth SDK imports and references from `api-src/auth.ts` and `lib/auth/legacy.ts`
- [x] 4.4 Write property tests: bcrypt-only hashing format (P10), SHA-256→bcrypt migration round-trip (P11)

## Task 5: Add Missing Security Headers (Req 5)

- [x] 5.1 Update `vercel.json` global headers to add: Content-Security-Policy, Permissions-Policy, Referrer-Policy, and move Strict-Transport-Security from API-only to all routes
- [x] 5.2 Write integration tests verifying all security headers are present in `vercel.json` configuration

## Task 6: Validate All API Input with Zod (Req 6)

- [x] 6.1 Create `lib/validation/zambian.ts` with NRC format, +260 phone, and ECZ grade (1-9) Zod schemas
- [x] 6.2 Create `lib/validation/auth.ts` with schemas for login, register, password-change, password-reset actions (email RFC 5322, password 8+ chars with complexity)
- [x] 6.3 Create Zod schemas for remaining endpoints: `lib/validation/applications.ts`, `admin.ts`, `documents.ts`, `payments.ts`, `sessions.ts`, `notifications.ts`, `email.ts`
- [x] 6.4 Add string sanitization (trim whitespace, reject null bytes) to all Zod schemas via `.transform()` and `.refine()`
- [x] 6.5 Add validation middleware to each `api-src/*.ts` endpoint (including `email.ts`) that parses req.body/req.query before the switch statement, returning 400 with field-level errors
- [x] 6.6 Create `lib/validation/index.ts` re-exporting all schemas
- [x] 6.7 Write property tests: Zod rejection with field errors (P12), Zambian format validation (P13), string sanitization (P14)

## Task 7: Strengthen Rate Limiting and Account Protection (Req 7)

- [x] 7.1 Create database migration for `login_attempts` table (email_hash, ip_hash, attempted_at, success)
- [x] 7.2 Add per-email failed login tracking in `api-src/auth.ts` login action: record attempts, check cooldown (15 min after 5 failures)
- [x] 7.3 Add account lockout logic: after 10 consecutive failures, lock account for 30 minutes and queue notification email via Resend
- [x] 7.4 Add `Retry-After` header to all 429 rate limit responses
- [x] 7.5 Add registration rate limiting in `api-src/auth.ts` register action: 3 requests per IP per 10-minute window via Arcjet
- [x] 7.6 Write property tests: progressive backoff (P15), account lockout (P16)

## Task 8: Complete Audit Logging Coverage (Req 8)

- [x] 8.1 Add `logApplicationStatusChange()` convenience function to `lib/auditLogger.ts`
- [x] 8.2 Add `logAdminAction()` convenience function to `lib/auditLogger.ts`
- [x] 8.3 Add `retention_category` column to audit_logs table via migration (default 'standard', security events get 'security')
- [x] 8.4 Integrate audit logging calls into all `api-src/*.ts` endpoints (including `email.ts`) for status changes, auth events, and admin actions
- [x] 8.5 Write property tests: audit log completeness and PII exclusion (P17)

## Task 9: Reduce Excessive localStorage Reads (Req 9)

- [x] 9.1 Refactor `src/hooks/useAutoSave.ts` to read localStorage once on mount into an in-memory cache (module-level Map)
- [x] 9.2 Replace all subsequent localStorage reads with in-memory cache lookups
- [x] 9.3 Batch localStorage writes using `requestIdleCallback` (with `setTimeout(fn, 0)` fallback) during the 8-second save interval
- [x] 9.4 Write property tests: localStorage read minimization (P18)

## Task 10: Implement Image Optimization (Req 10)

- [x] 10.1 Create `src/components/ui/OptimizedImage.tsx` component wrapping `<picture>` with WebP source, JPEG/PNG fallback, `loading="lazy"`, explicit width/height, and responsive srcsets
- [x] 10.2 Replace existing `<img>` tags across the application with `OptimizedImage` component
- [x] 10.3 Verify Vite `assetsInlineLimit: 4096` is enforced for base64 inlining of small images

## Task 11: Simplify API Response Unwrapping (Req 11)

- [x] 11.1 Search codebase for any remaining imports of `src/lib/apiClient.ts` or `authFetch()` calls
- [x] 11.2 Migrate any remaining callers to use `apiClient.request()` from `src/services/client.ts`
- [x] 11.3 Remove `src/lib/apiClient.ts` if it still exists, or remove any dead `data.data ?? data` patterns

## Task 12: Complete Code Splitting (Req 12)

- [x] 12.1 Wrap Recharts components with `React.lazy()` and `Suspense` with skeleton fallback in admin dashboard views
- [x] 12.2 Wrap Tesseract.js OCR with dynamic `import()` in the document upload wizard step
- [x] 12.3 Create a `LazyLoadErrorBoundary` component that catches chunk load failures and shows a retry button with user-friendly message
- [x] 12.4 Verify main bundle stays under 500KB gzipped after code splitting (run `bun run build` and check output)

## Task 13: Add Comprehensive ARIA Labels (Req 13)

- [x] 13.1 Audit all form inputs in the Application Wizard and add `aria-label` or associated `<label>` elements
- [x] 13.2 Add `aria-invalid="true"` and `aria-describedby` error message association to all form fields with validation errors
- [x] 13.3 Add `aria-required="true"` to all mandatory form fields
- [x] 13.4 Add `aria-live="polite"` region that announces wizard step titles on transition
- [x] 13.5 Add `aria-label` to all icon-only buttons (close, menu, navigation arrows)
- [x] 13.6 Write property tests: ARIA attributes on form controls (P20)

## Task 14: Fix Keyboard Navigation and Focus Management (Req 14)

- [x] 14.1 Ensure all modal dialogs trap focus using Radix UI Dialog (or add focus trap to custom modals)
- [x] 14.2 Ensure focus returns to trigger element when modals close
- [x] 14.3 Add visible focus indicators (minimum 2px outline with sufficient contrast) via Tailwind `focus-visible:` utilities
- [x] 14.4 Ensure `Escape` key closes all modals, dropdowns, and overlay panels
- [x] 14.5 Verify wizard step navigation works with keyboard-only interaction (Tab, Enter, arrow keys)
- [x] 14.6 Write property tests: Escape key closes overlays (P19)

## Task 15: Remediate Color Contrast Issues (Req 15)

- [x] 15.1 Audit all color tokens in `tailwind.config.js` and compute contrast ratios against white and application backgrounds
- [x] 15.2 Update color tokens that fail WCAG 2.1 AA contrast requirements (4.5:1 normal text, 3:1 large text/UI)
- [x] 15.3 Ensure status colors (success, error, warning) are paired with text labels or icons, not color-only
- [x] 15.4 Write property tests: color contrast meets WCAG AA (P21)

## Task 16: Add Descriptive Alt Text (Req 16)

- [x] 16.1 Audit all `<img>` elements and add descriptive `alt` for informational images
- [x] 16.2 Set `alt=""` and `role="presentation"` on all decorative images
- [x] 16.3 Add fallback rendering (alt text + placeholder icon) for image load failures in `OptimizedImage` component
- [x] 16.4 Set MIHAS logo alt text to "Mukuba Institute of Health and Allied Sciences logo"
- [x] 16.5 Write property tests: alt text correctness by image type (P22)

## Task 17: Add Social Media Meta Tags (Req 17)

- [x] 17.1 Add Open Graph meta tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`) to `index.html`
- [x] 17.2 Add Twitter Card meta tags (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`) to `index.html`
- [x] 17.3 Create or verify OG image (1200x630px minimum) hosted at stable URL under application domain

## Task 18: Add Structured Data and Complete Sitemap (Req 18)

- [x] 18.1 Add JSON-LD `EducationalOrganization` script to `index.html` with institution name, URL, logo, contact
- [x] 18.2 Add JSON-LD `WebApplication` script to `index.html` describing the admissions portal
- [x] 18.3 Update `public/sitemap.xml`: change URLs from `mihasv3.pages.dev` to `apply.mihas.edu.zm`, add `<lastmod>` dates and `<changefreq>` values
- [x] 18.4 Verify `public/robots.txt` Sitemap directive points to `***REMOVED***/sitemap.xml` (already correct)

## Task 19: Resolve Service Worker Conflicts (Req 19)

- [x] 19.1 Verify `public/sw.js` is a no-op that unregisters itself (already done — confirm no regressions)
- [x] 19.2 Ensure vite-plugin-pwa `injectManifest` strategy with `src/service-worker.ts` is the sole active worker
- [x] 19.3 Verify service worker caches wizard pages, critical CSS, and JS bundles for offline access
- [x] 19.4 Add offline indicator banner component that displays when the app detects no network connectivity
- [x] 19.5 Ensure `registerType: 'prompt'` in vite config prompts user to refresh on new SW version (already configured — verify behavior)

## Task 20: Implement Reliable PWA Install Prompts (Req 20)

- [x] 20.1 Create `src/hooks/useInstallPrompt.ts` hook that captures `beforeinstallprompt` event and exposes `showPrompt()` / `dismissPrompt()` methods
- [x] 20.2 Create `src/components/ui/InstallBanner.tsx` component with clear call-to-action, shown once per session, dismissal remembered for 7 days via localStorage
- [x] 20.3 Ensure banner is not shown if browser doesn't support PWA (no `beforeinstallprompt` event)
- [x] 20.4 Verify `public/manifest.json` contains all required fields (name, short_name, start_url, display, background_color, theme_color, icons 192px+512px, scope)
- [x] 20.5 Write property tests: install prompt frequency control (P23)

## Task 21: Standardize Error Handling (Req 21)

- [x] 21.1 Audit all `api-src/*.ts` catch blocks and ensure they use `sendError()` from `lib/errorHandler.ts`
- [x] 21.2 Ensure every action handler in each endpoint is wrapped in try/catch routing to `sendError`
- [x] 21.3 Create `src/components/ErrorBoundary.tsx` global React error boundary at app root with "Reload" button
- [x] 21.4 Add toast notification system for frontend API errors with retry option (integrate with existing UI patterns)
- [x] 21.5 Ensure all caught errors in API endpoints are logged via `logAuditEvent` with sanitized context

## Task 22: Remove Dead Code and Unused Imports (Req 22)

- [x] 22.1 Search and remove all import statements referencing Supabase, Sentry, Umami, Cloudflare, Twilio, or Turnstile
- [x] 22.2 Remove all unreachable functions, components, hooks, and type definitions from removed features
- [x] 22.3 Remove all environment variable references for removed services (`SUPABASE_*`, `VITE_SUPABASE_*`, `VITE_SENTRY_DSN`, `VITE_ANALYTICS_*`, `CLOUDFLARE_AI_*`, `VITE_TURNSTILE_SITE_KEY`)
- [x] 22.4 Run full test suite and production build to verify no runtime errors after removal

## Task 23: Improve TypeScript Type Safety (Req 23)

- [x] 23.1 Enable `strictNullChecks` in `tsconfig.json` and fix all resulting type errors
- [x] 23.2 Enable `noImplicitAny` in `tsconfig.json` and add explicit type annotations to all implicit `any` parameters
- [x] 23.3 Replace `as any` and `as unknown as T` type assertions with proper type guards or runtime validation
- [x] 23.4 Add explicit return types to all exported functions in `lib/` and `api-src/` directories
- [x] 23.5 Run production build after each flag to verify no regressions

## Task 24: Increase Test Coverage (Req 24)

- [x] 24.1 Write unit tests (Vitest) for all Auth_Module actions: login, logout, register, refresh, password reset request, password change
- [x] 24.2 Write unit tests for Application Wizard form validation for each of the 4 steps, including Zambian-specific validation
- [x] 24.3 Write E2E tests (Playwright) for complete application flow: registration → login → wizard (4 steps) → submission
- [x] 24.4 Write accessibility tests (axe-core) verifying zero critical/serious violations on login, registration, and each wizard step
- [x] 24.5 Verify minimum 80% line coverage on `lib/auth/` and `api-src/auth.ts`

## Task 25: Validate Environment Variables at Startup (Req 25)

- [x] 25.1 Create `lib/envValidator.ts` with `validateServerEnv()` that checks presence and format of `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ARCJET_KEY`
- [x] 25.2 Add `DATABASE_URL` format validation (must start with `postgres://` or `postgresql://`) and JWT secret length validation (>= 32 chars)
- [x] 25.3 Call `validateServerEnv()` at the top of each `api-src/*.ts` handler, returning HTTP 503 with descriptive error if validation fails
- [x] 25.4 Add Vite build-time validation for required `VITE_*` environment variables in `vite.config.ts`
- [x] 25.5 Write property tests: environment variable validation correctness (P24)

## Task 26: Prevent Server-Side Request Forgery in Document Extract (Req 26)

- [x] 26.1 Create `lib/urlValidator.ts` with `isAllowedUrl(url: string): boolean` that validates URL scheme is `https` and hostname is in the `ALLOWED_DOMAINS` allowlist (application domain + R2 storage domain from env)
- [x] 26.2 Add `isPrivateIP(hostname: string): boolean` to `lib/urlValidator.ts` that rejects private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7)
- [x] 26.3 Integrate URL validation into `api-src/documents.ts` `handleExtract`: parse `documentUrl` with `new URL()`, reject non-HTTPS, reject private IPs, reject non-allowlisted hostnames — return HTTP 400 `INVALID_DOCUMENT_URL`
- [x] 26.4 Add `AbortController` with 10-second timeout to the fetch call in `handleExtract`
- [x] 26.5 Add streaming response size check (20MB max) to the fetch call in `handleExtract`, aborting if exceeded
- [x] 26.6 Write unit tests (`tests/unit/urlValidator.test.ts`) and property tests (`tests/property/urlValidator.property.test.ts`) for P25: SSRF URL validation

## Task 27: Prevent Open Redirect via Notification Action URLs (Req 27)

- [x] 27.1 Create `src/lib/urlSafety.ts` with `isSafeNavigationUrl(url: string): boolean` that allows relative paths (starting with `/` but not `//`) and same-origin absolute URLs
- [x] 27.2 Update `src/components/student/NotificationBell.tsx` to wrap `window.location.href = notification.action_url` with `isSafeNavigationUrl()` check, ignoring unsafe URLs and logging a warning in development mode
- [x] 27.3 Update `api-src/notifications.ts` to validate `action_url` on notification creation, rejecting absolute URLs that do not match the application domain
- [x] 27.4 Write unit tests (`tests/unit/urlSafety.test.ts`) and property tests (`tests/property/urlSafety.property.test.ts`) for P26: open redirect prevention

## Task 28: Remove Hardcoded Credentials from Source Code (Req 28)

- [ ] 28.1 Replace the hardcoded password `Beanola2025` in `scripts/test-user-flow.ts` with `process.env.TEST_PASSWORD`, and replace hardcoded test emails (`test@mihas.edu.zm`, `cosmas@beanola.com`) with `process.env.TEST_STUDENT_EMAIL` and `process.env.TEST_ADMIN_EMAIL`, adding guards that throw if env vars are missing
- [x] 28.2 Replace the hardcoded password `Beanola2025` in `scripts/set-passwords-and-notify.ts` with `process.env.TEST_PASSWORD`, adding a guard that throws if the env var is missing
- [x] 28.3 Audit all files in `scripts/` for any other hardcoded credentials, API keys, or secrets and replace with environment variable references
- [x] 28.4 Add `.env.scripts` to `.gitignore` and create `.env.scripts.example` with placeholder values documenting required script env vars
- [x] 28.5 Add a pre-commit documentation warning in `.env.scripts.example` against committing credentials to the repository
- [-] 28.6 Write property tests (`tests/property/credentialScan.property.test.ts`) for P27: no hardcoded credentials in source

## Task 29: Eliminate N+1 Query Patterns in Application Endpoints (Req 29)

- [ ] 29.1 Refactor the per-grade INSERT loop in `api-src/applications.ts` (handleById grade sync) into a single multi-row INSERT with `ON CONFLICT ... DO UPDATE` using parameterized placeholders
- [ ] 29.2 Refactor the per-setting INSERT loop in `api-src/admin.ts` (handleResetSettings) into a single multi-row INSERT
- [ ] 29.3 Refactor the per-setting INSERT loop in `api-src/admin.ts` (handleImportSettings) into a single multi-row upsert query
- [ ] 29.4 Write property tests (`tests/property/batchQuery.property.test.ts`) for P28: batch query efficiency (at most 2 queries for N grades)

## Task 30: Wrap Multi-Step Database Operations in Transactions (Req 30)

- [ ] 30.1 Wrap the grade sync operation in `api-src/applications.ts` (delete existing grades + insert new grades) in a `transaction()` call from `lib/db.ts`
- [ ] 30.2 Wrap the application review operation in `api-src/applications.ts` (status update + status history insert) in a `transaction()` call
- [ ] 30.3 Wrap the settings reset operation in `api-src/admin.ts` (delete all + insert defaults) in a `transaction()` call
- [ ] 30.4 Write unit tests (`tests/unit/transactionWrapping.test.ts`) and property tests (`tests/property/transaction.property.test.ts`) for P29: transaction atomicity — verify rollback on partial failure

## Task 31: Remove @ts-nocheck Directives and Restore Type Checking (Req 31)

- [ ] 31.1 Phase 1 — Remove `@ts-nocheck` from critical-path files and fix type errors: `src/routes/config.tsx`, `src/hooks/usePWA.ts`, `src/forms/applicationSchema.ts`, `src/data/applications.ts`, `src/hooks/queries/useQueryConfig.ts`
- [ ] 31.2 Phase 2 — Remove `@ts-nocheck` from admin hooks and services and fix type errors: `src/hooks/admin/useApplicationsData.ts`, `src/hooks/admin/useApplicationActions.ts`, `src/hooks/admin/useApplicationDocuments.ts`, `src/hooks/admin/useApplicationBulkActions.ts`, `src/hooks/admin/useApplicationStatusHistory.ts`, `src/services/alternativePathwayService.ts`, `src/services/autoScaling.ts`, `src/services/pushNotificationManager.ts`, `src/services/detailedEligibilityService.ts`, `src/services/eligibilityAppealsService.ts`
- [ ] 31.3 Phase 3 — Remove `@ts-nocheck` from remaining hooks: `src/hooks/useBulkOperations.ts`, `src/hooks/useUserManagement.ts`, `src/hooks/useApiServices.ts`, `src/hooks/useErrorHandler.ts`, `src/hooks/useProfileAutoPopulation.ts`, `src/hooks/useEnhancedResponsive.ts`, `src/hooks/useNotificationPreferences.ts`
- [ ] 31.4 Phase 4 — Remove `@ts-nocheck` from lib/utility files: `src/lib/applicationFlowAnalyzer.ts`, `src/lib/securityEnhancements.ts`, `src/lib/multiChannelNotifications.ts`, `src/lib/exportUtils.ts`, `src/lib/eligibilityAppealsEngine.ts`, `src/lib/performance-utils.ts`, `src/lib/submissionUtils.ts`, `src/lib/securityConfig.ts`, `src/lib/maintenance.ts`, `src/lib/securityUtils.ts`, `src/lib/adminNotifications.ts`, `src/lib/applicationSession.ts`
- [ ] 31.5 Phase 5 — Remove `@ts-nocheck` from components and pages: `src/pages/public/tracker/index.tsx`, `src/pages/admin/Programs.tsx`, `src/pages/admin/Users.tsx`, `src/pages/admin/Dashboard.tsx`, `src/pages/admin/EnhancedDashboard.tsx`, `src/components/notifications/PushNotificationSettings.tsx`, `src/components/notifications/NotificationAnalytics.tsx`, `src/components/notifications/NotificationPreferences.tsx`, `src/components/application/EligibilityDashboard.tsx`, `src/components/admin/TestNotifications.tsx`, `src/components/admin/applications/ApplicationApprovalActions.tsx`, `src/components/admin/applications/ApplicationDetailModal.tsx`
- [ ] 31.6 Phase 6 — Remove `@ts-nocheck` from remaining files: `src/types/eligibility.ts`, `src/v2-improvements-index.ts`, `src/utils/smart-features.ts`, `src/utils/errorMessages.ts`
- [ ] 31.7 Verify production build passes after each phase with `bun run build` — never replace `@ts-nocheck` with per-line `@ts-ignore`

## Task 32: Fix SSE Keepalive Interval for Vercel Serverless Compatibility (Req 32)

- [ ] 32.1 Update `lib/realtime.ts` to change the SSE keepalive interval from 15 seconds to 8 seconds, adding a `KEEPALIVE_INTERVAL_MS` constant with a code comment documenting the Vercel 10-second serverless timeout constraint
- [ ] 32.2 Add explicit cleanup of the `connections` Map entry in the `req.on("close")` handler to prevent stale entries across serverless invocations
- [ ] 32.3 Verify frontend SSE client hooks implement automatic reconnection with exponential backoff (1s initial, 30s max) to handle Vercel timeout gracefully

## Task 33: Validate Uploaded File Content Against MIME Type (Req 33)

- [ ] 33.1 Create `lib/fileValidator.ts` with `validateMagicBytes(buffer: Buffer, declaredMimeType: string): boolean` and `detectMimeType(buffer: Buffer): string | null` supporting PDF (`%PDF`), JPEG (`FF D8 FF`), and PNG (`89 50 4E 47`) magic bytes
- [ ] 33.2 Integrate magic byte validation into `api-src/documents.ts` `handleUpload`: after base64 decode to buffer and before R2 upload, call `validateMagicBytes()` — return HTTP 400 `INVALID_FILE_CONTENT` on mismatch
- [ ] 33.3 Write unit tests (`tests/unit/fileValidator.test.ts`) and property tests (`tests/property/fileValidator.property.test.ts`) for P30: magic byte validation
