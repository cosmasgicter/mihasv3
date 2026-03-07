MIHAS Application System — Kiro (Opus 4.6) Handoff Document
=========================================================================
Date: 2026-02-22
Prepared by: Kiro (Opus 4.6)
Audience: Next agent session / developer
Priority: CRITICAL (Production system with live users)

==========================================================================
SECTION 1 — EXECUTIVE SUMMARY
==========================================================================

MIHAS (Mukuba Institute of Health and Allied Sciences) is a live production
admissions portal at ***REMOVED*** serving Zambian students.

Stack: React 18 + TypeScript | Vite + Bun | Vercel (Hobby Plan, 12 function limit)
Database: Neon Postgres (project: wild-bar-37055823, db: neondb)
Auth: Custom JWT (jose + bcrypt, HTTP-only cookies)
Security: Arcjet (shield, bot detection, rate limiting)
Email: Resend (queue-based with retry)
Real-time: SSE + polling (Bun-native)

Key constraints:
  - Vercel Hobby Plan: 12 serverless functions max, 10s timeout
  - Never log PII (student medical credentials and personal data)
  - Never remove auto-save (8-second interval)
  - Never block on external API failures
  - Maintain backward compatibility (22 tables with live data)
  - PWA offline support required (unreliable Zambian connections)


==========================================================================
SECTION 2 — NEON DATABASE: FULL SCHEMA REFERENCE
==========================================================================

Neon MCP Configuration:
  Organization: org-nameless-field-86879910 (name: "Cosmas")
  Project ID: wild-bar-37055823 (name: "mihasApplication")
  Default database: neondb
  Tool: run_sql with params { projectId: "wild-bar-37055823", sql: "..." }

Applied Migrations (9 total, all applied 2026-02-19):
  1  001_extensions.sql               — uuid-ossp, pgcrypto
  2  002_core_schema.sql              — profiles, programs, intakes, subjects, institutions,
                                        applications, application_documents, application_grades,
                                        device_sessions, audit_logs, notifications
  3  003_supporting_tables.sql        — application_drafts, application_status_history,
                                        application_interviews, payments, documents,
                                        course_requirements, program_intakes, email_queue,
                                        user_notification_preferences, settings
  4  004_functions.sql                — update_updated_at_column, generate_application_number,
                                        generate_tracking_code, validate_zambian_phone,
                                        validate_nrc, validate_email,
                                        calculate_best_5_subjects_points,
                                        set_application_defaults, prevent_audit_modification,
                                        cleanup_expired_sessions, cleanup_old_drafts
  5  005_triggers.sql                 — updated_at triggers on 13 tables, application defaults
                                        trigger, audit log protection trigger
  6  006_data_migration.sql           — Reference data: 2 institutions, 17 subjects, 3 intakes,
                                        4 programs
  7  007_password_reset.sql           — reset_token_hash, reset_token_expires, reset_token_used
                                        on profiles
  8  008_notification_idempotency.sql — idempotency_key column + index on notifications
  9  009_document_migration_log.sql   — document_migration_log table for R2 migration rollback

Live Row Counts (as of 2026-02-21):
  profiles: 21 | applications: 42 | application_grades: 150
  application_documents: 11 | application_interviews: 6 | audit_logs: 686
  device_sessions: 587 | institutions: 2 | intakes: 3 | programs: 4
  subjects: 17 | migration_history: 9
  email_queue: 0 | notifications: 0 | payments: 0 | documents: 0
  application_drafts: 0 | application_status_history: 0
  course_requirements: 0 | program_intakes: 0 | settings: 0
  user_notification_preferences: 0 | document_migration_log: 0


--- PUBLIC SCHEMA TABLES (22 tables + migration_history) ---

TABLE: profiles
  id                      UUID PK DEFAULT gen_random_uuid()
  email                   VARCHAR(255) NOT NULL UNIQUE
  role                    VARCHAR(50) DEFAULT 'student'
  first_name              VARCHAR(255)
  last_name               VARCHAR(255)
  phone                   VARCHAR(20)
  is_active               BOOLEAN DEFAULT true
  password_hash           TEXT
  refresh_token_hash      TEXT
  failed_login_attempts   INTEGER DEFAULT 0
  locked_until            TIMESTAMPTZ
  password_changed_at     TIMESTAMPTZ
  email_verified          BOOLEAN DEFAULT false
  avatar_url              TEXT
  date_of_birth           DATE
  nrc_number              VARCHAR(20)
  nationality             VARCHAR(100) DEFAULT 'Zambian'
  address                 TEXT
  notification_preferences JSONB DEFAULT '{}'
  last_login_at           TIMESTAMPTZ
  created_at              TIMESTAMPTZ DEFAULT now()
  updated_at              TIMESTAMPTZ DEFAULT now()
  reset_token_hash        TEXT          -- migration 007
  reset_token_expires     TIMESTAMPTZ   -- migration 007
  reset_token_used        BOOLEAN DEFAULT false  -- migration 007
  Indexes: pkey(id), UNIQUE(email), idx_profiles_email, idx_profiles_role,
           idx_profiles_refresh_token(WHERE NOT NULL)

TABLE: applications
  id                      UUID PK DEFAULT gen_random_uuid()
  application_number      VARCHAR(20) NOT NULL UNIQUE  -- auto-generated MIHASYYNNNN
  user_id                 UUID NOT NULL FK->profiles(id) ON DELETE CASCADE
  full_name               VARCHAR(255) NOT NULL
  nrc_number              VARCHAR(20)
  passport_number         VARCHAR(50)
  date_of_birth           DATE NOT NULL
  sex                     VARCHAR(10) NOT NULL
  phone                   VARCHAR(20) NOT NULL
  email                   VARCHAR(255) NOT NULL
  residence_town          VARCHAR(100) NOT NULL
  nationality             VARCHAR(100) DEFAULT 'Zambian'
  address_line_1/2        VARCHAR(255)
  postal_code             VARCHAR(20)
  next_of_kin_name        VARCHAR(255)
  next_of_kin_phone       VARCHAR(20)
  program                 VARCHAR(50) NOT NULL
  intake                  VARCHAR(50) NOT NULL
  institution             VARCHAR(50) NOT NULL
  result_slip_url         VARCHAR(500)
  extra_kyc_url           VARCHAR(500)
  application_fee         NUMERIC DEFAULT 153.00
  payment_method          VARCHAR(20)
  payer_name/phone        VARCHAR(255)/VARCHAR(20)
  amount                  NUMERIC
  paid_at                 TIMESTAMPTZ
  momo_ref                VARCHAR(100)
  pop_url                 VARCHAR(500)
  receipt_number          VARCHAR(50)
  payment_status          VARCHAR(20) DEFAULT 'pending_review'
  payment_verified_at     TIMESTAMPTZ
  payment_verified_by     UUID FK->profiles(id)
  status                  VARCHAR(20) NOT NULL DEFAULT 'draft'
  eligibility_status      VARCHAR(20) DEFAULT 'pending'
  eligibility_score       INTEGER
  eligibility_notes       TEXT
  admin_feedback          TEXT
  admin_feedback_date     TIMESTAMPTZ
  admin_feedback_by       UUID FK->profiles(id)
  review_started_at       TIMESTAMPTZ
  decision_date           TIMESTAMPTZ
  reviewed_by             UUID FK->profiles(id)
  additional_subjects     JSONB
  public_tracking_code    VARCHAR(20)
  submitted_at            TIMESTAMPTZ
  created_at/updated_at   TIMESTAMPTZ DEFAULT now()
  Indexes: pkey(id), UNIQUE(application_number), idx_applications_user,
           idx_applications_status, idx_applications_created(DESC),
           idx_applications_program, idx_applications_intake,
           idx_applications_number, idx_applications_tracking(WHERE NOT NULL)

TABLE: application_documents
  id, application_id(FK), document_type, document_name, file_url, file_size,
  mime_type, verification_status(DEFAULT 'pending'), verified_by(FK),
  verified_at, verification_notes, system_generated(DEFAULT false),
  uploaded_at, created_at, updated_at

TABLE: application_grades
  id, application_id(FK), subject_id(FK), grade(1-9 CHECK), created_at
  UNIQUE(application_id, subject_id)

TABLE: application_drafts
  id, user_id(FK), draft_data(JSONB), draft_name, step_completed(DEFAULT 0),
  is_active(DEFAULT true), last_accessed_at, created_at, updated_at

TABLE: application_status_history
  id, application_id(FK), status, changed_by(FK), notes, changes(JSONB),
  ip_address, user_agent, created_at

TABLE: application_interviews
  id, application_id(FK), scheduled_at, mode(in_person|online|phone),
  location, status(scheduled|completed|cancelled|no_show|rescheduled),
  notes, created_by(FK), updated_by(FK), created_at, updated_at

TABLE: audit_logs
  id, actor_id(FK), action, entity_type, entity_id, changes(JSONB),
  ip_address(INET), user_agent, created_at
  PROTECTED: trigger prevents UPDATE/DELETE

TABLE: device_sessions
  id, user_id(FK), device_id, device_info, session_token, ip_address,
  user_agent, last_activity, is_active(DEFAULT true),
  expires_at(DEFAULT now()+30days), created_at, updated_at

TABLE: notifications
  id, user_id(FK), title, message, type, priority(DEFAULT 'normal'),
  action_url, metadata(JSONB), is_read(DEFAULT false), read_at,
  created_at, updated_at, idempotency_key(TEXT) -- migration 008

TABLE: email_queue
  id                      UUID PK DEFAULT gen_random_uuid()
  recipient_email         VARCHAR(255) NOT NULL
  recipient_name          VARCHAR(255)
  subject                 VARCHAR(255) NOT NULL
  body                    TEXT NOT NULL
  html_body               TEXT
  template_name           VARCHAR(100)
  template_data           JSONB
  status                  VARCHAR(20) DEFAULT 'pending'
  priority                INTEGER DEFAULT 5  -- 1=highest (mandatory), 5=normal
  retry_count             INTEGER DEFAULT 0
  max_retries             INTEGER DEFAULT 3
  error_message           TEXT
  sent_at                 TIMESTAMPTZ
  created_at              TIMESTAMPTZ DEFAULT now()
  Indexes: idx_email_queue_status, idx_email_queue_priority(priority, created_at)

TABLE: payments
  id, application_id(FK), user_id(FK), amount, currency(DEFAULT 'ZMW'),
  payment_method, transaction_reference, status(DEFAULT 'pending'),
  verified_by(FK), verified_at, receipt_number, receipt_url, metadata(JSONB),
  created_at, updated_at

TABLE: documents
  id, application_id(FK), uploader_id(FK), document_type, document_name,
  file_name, file_path, file_size, mime_type, verdict(DEFAULT 'pending'),
  verified_by(FK), verified_at, notes, created_at, updated_at

TABLE: programs
  id, name, code(UNIQUE), description, duration_months, application_fee(153.00),
  tuition_fee, requirements(JSONB), regulatory_body, accreditation_status,
  is_active(DEFAULT true), created_at, updated_at

TABLE: intakes
  id, name, year, semester, start_date, end_date, application_start_date,
  application_deadline, max_capacity, current_enrollment(DEFAULT 0),
  is_active(DEFAULT true), created_at, updated_at

TABLE: subjects
  id, name, code, category, is_core(DEFAULT false), is_active(DEFAULT true),
  created_at

TABLE: institutions
  id, name, code(UNIQUE), type, address, phone, email, website,
  accreditation_status, is_active(DEFAULT true), created_at, updated_at

TABLE: course_requirements
  id, program_id(FK), subject_id(FK), is_mandatory(DEFAULT true),
  minimum_grade(1-9 CHECK), weight(DEFAULT 1.0), requirement_type, created_at

TABLE: program_intakes
  id, program_id(FK), intake_id(FK), max_capacity, current_enrollment(DEFAULT 0),
  created_at  UNIQUE(program_id, intake_id)

TABLE: user_notification_preferences
  id, user_id(FK UNIQUE), email_enabled(DEFAULT true), push_enabled(DEFAULT true),
  sms_enabled(DEFAULT false), application_updates(DEFAULT true),
  payment_reminders(DEFAULT true), interview_reminders(DEFAULT true),
  marketing_emails(DEFAULT false), quiet_hours_start(TIME),
  quiet_hours_end(TIME), timezone(DEFAULT 'Africa/Lusaka'),
  created_at, updated_at

TABLE: settings
  id, key(UNIQUE), value(JSONB), description, category, is_public(DEFAULT false),
  updated_by(FK), created_at, updated_at

TABLE: document_migration_log  -- migration 009
  id, document_id, old_url, new_r2_path, new_r2_url, checksum, status, error,
  migrated_at

TABLE: migration_history
  id(SERIAL PK), migration_name(UNIQUE), applied_at(DEFAULT now())


==========================================================================
SECTION 3 — API ENDPOINTS (12 Vercel Functions)
==========================================================================

Source: api-src/*.ts (TypeScript, edit these)
Bundled: api/*.js (auto-generated via `bun run scripts/bundle-api.mjs`)
Shared libs: lib/ at project root (NOT api/lib/)

Endpoint                  Actions
─────────────────────────────────────────────────────────────────────────
/api/admin                dashboard, users, settings, stats, errors, migrate
/api/applications         details, documents, grades, summary, review, export, ?id=xxx
/api/auth                 login, logout, refresh, session, register
/api/bootstrap            Database bootstrap/seed operations
/api/catalog              ?type=programs|intakes|subjects
/api/documents            upload, extract (OCR via tesseract.js)
/api/email                send, process-queue, retry-failed, queue-status  [NEW]
/api/health               ping, db, env, arcjet
/api/notifications        preferences, list, mark-read, mark-all-read, delete,
                          check-duplicate, create, send, push-subscribe, push-send
/api/payments             receipt
/api/sessions             track, list, revoke, revoke-all
/api/[...path]            Catch-all for unmatched routes

Total: 12 functions (Vercel Hobby Plan limit)


==========================================================================
SECTION 4 — EMAIL NOTIFICATION SYSTEM (NEW — 2026-02-21)
==========================================================================

Architecture: Queue-based email delivery via Resend API

Flow:
  1. Notification created (via /api/notifications?action=create or send)
  2. queueEmailForNotification() checks:
     a. Is the notification type email-eligible? (EMAIL_TYPE_MAP in lib/notificationPolicy.ts)
     b. Does the user have an email on their profile?
     c. For non-mandatory types: has the user opted out? (user_notification_preferences)
  3. If eligible, renders HTML via lib/emailTemplates.ts and inserts into email_queue
  4. Admin calls /api/email?action=process-queue to send pending emails via Resend
  5. On failure: retry_count incremented, status set to 'failed' after max_retries (3)
  6. Admin can call /api/email?action=retry-failed to reset failed emails

Email Templates (lib/emailTemplates.ts):
  welcome               — Account creation, portal onboarding steps
  application-submitted  — Confirmation with application number and programme
  status-change          — Application status update with new status display
  payment-verified       — Payment confirmation
  interview-scheduled    — Interview details (date, time, location)
  generic                — Fallback for any unrecognized template name

Notification Type → Email Mapping (lib/notificationPolicy.ts):
  welcome                    → template: welcome              (mandatory, priority 1)
  application_submitted      → template: application-submitted (opt-out: application_updates)
  application_status_change  → template: status-change         (mandatory, priority 1)
  payment_verified           → template: payment-verified      (mandatory, priority 1)
  interview_scheduled        → template: interview-scheduled   (mandatory, priority 1)
  info                       → template: generic               (opt-out: application_updates)
  warning                    → template: generic               (opt-out: application_updates)

Mandatory types (always sent regardless of user preferences):
  application_status_change, payment_verified, interview_scheduled, welcome

Environment variables (already configured in Vercel):
  RESEND_API_KEY — Resend API key
  EMAIL_FROM — noreply@mihas.edu.zm

RBAC:
  send           — any authenticated user
  process-queue  — admin/super_admin only
  retry-failed   — admin/super_admin only
  queue-status   — admin/super_admin only


==========================================================================
SECTION 5 — WHAT WAS DONE (LATEST CYCLES)
==========================================================================

--- Cycle 2026-02-21: Email Notification Cleanup ---
Spec: .kiro/specs/email-notification-cleanup/

1. Email Template Module
   - Created lib/emailTemplates.ts with 6 branded MIHAS templates
   - Pure functions, no side effects, HTML-safe escaping
   - Shared layout with MIHAS header/footer branding

2. Notification Policy Extension
   - Extended lib/notificationPolicy.ts with EMAIL_TYPE_MAP
   - Added EmailMapping interface, getEmailMapping() helper
   - Maps notification types to templates and preference keys

3. Email Endpoint (replaced ping)
   - Created api-src/email.ts with 4 actions
   - Arcjet protection, auth middleware, admin role checks
   - Resend API integration with retry logic

4. Notifications Endpoint Email Integration
   - Updated api-src/notifications.ts create action to queue emails
   - Updated send action to use queue instead of inline Resend calls
   - Removed legacy buildNotificationEmailHtml function
   - Email queuing is additive — never blocks in-app notification creation

5. Endpoint Swap
   - Deleted api-src/ping.ts and api/ping.js
   - Bundled api/email.js (12 function count maintained)

6. Legacy Directory Removal
   - Deleted infra/ directory (Terraform CDN configs — unused)
   - Deleted supabase/ directory (send-email function, 24 migration files, scripts)
   - Verified no stale references in src/, api-src/, lib/

7. Root Directory Cleanup
   - Moved 20 root .md files to docs/deployment/, docs/reports/, docs/migration/
   - Moved 3 root .txt files to docs/migration/ and docs/
   - Deleted 25+ stale artifacts (scripts, configs, test outputs, installers, logs)

8. Database Verification
   - All 9 migrations confirmed applied via Neon MCP
   - email_queue table schema verified matching endpoint expectations
   - All functions, triggers, and indexes confirmed present

--- Cycle 2026-02-22: Fix Vercel Build ---
Spec: .kiro/specs/fix-vercel-build/

The Vite production build was failing on Vercel (Linux, case-sensitive filesystem)
due to import resolution errors accumulated during migration cleanup. All fixed:

1. UI Barrel File Re-exports
   - Added TooltipProvider, TooltipTrigger, TooltipContent exports to
     src/components/ui/index.ts (FieldHelp.tsx needed these from barrel)
   - Created src/components/ui/Spinner.tsx stub re-exporting LoadingSpinner
     as Spinner for backward compatibility

2. Case-Sensitivity Fixes (Linux/Vercel critical)
   - Fixed @/components/ui/button → @/components/ui/Button in:
     OfflineFormWrapper.tsx, CacheMonitorDashboard.tsx, CacheMonitor.tsx
   - Fixed @/components/ui/alert → @/components/ui/Alert in:
     OfflineFormWrapper.tsx, RealtimeStatus.tsx
   - Fixed ../ui/Input → ../ui/input (lowercase) in:
     RegulatoryGuidelinesTable.tsx, CommandPalette.tsx, SubjectSelection.tsx

3. Stub Module Verification
   - Confirmed src/components/smoothui/ already had full implementations
   - Confirmed src/components/8starlabs/ already had full implementations
   - Confirmed src/components/navigation/ResponsiveHeader.tsx existed with barrel
   - Confirmed src/components/icons/index.ts existed with lucide-react re-exports

4. Additional Fixes Found During Build Verification
   - useRealtime.ts: Fixed unsafe type cast, built proper RealtimeEventEnvelope
   - dashboardPreloader.ts: Added intermediate unknown cast for type compatibility
   - LandingPage.tsx: Removed invalid `hover` prop from 3 Card usages
   - FieldHelp.tsx: Changed Tooltip → TooltipRoot for proper Radix composition

5. Build Verification
   - `bunx --bun vite build` passes cleanly: 3004 modules, zero errors
   - Tests: 517 passed, 14 failed (all pre-existing from other specs)


==========================================================================
SECTION 6 — KNOWN LOOPHOLES AND ISSUES TO ADDRESS
==========================================================================

CRITICAL:

1. Email Queue Processing Is Manual
   The process-queue action must be called by an admin to actually send emails.
   There is no automated cron/scheduler triggering this.
   FIX: Set up a Vercel Cron Job or external scheduler to call
   POST /api/email?action=process-queue every 1-5 minutes with admin credentials.
   Vercel Hobby Plan supports cron jobs (vercel.json "crons" config).

2. No Email Verification Flow for New Registrations
   profiles.email_verified exists but the registration flow does not send a
   verification email or enforce it. Students can use the system without
   verifying their email address.
   FIX: Add email verification token generation on register, send verification
   email via email_queue, add verify action to auth endpoint.

3. Resend Domain/SPF/DKIM Not Verified Here
   The RESEND_API_KEY is configured in Vercel, but we have not verified that
   the sending domain (mihas.edu.zm) has proper SPF/DKIM/DMARC records.
   FIX: Check Resend dashboard for domain verification status. Emails may
   land in spam without proper DNS records.

HIGH:

4. No Automated Session Cleanup
   device_sessions has 587 rows, many likely expired. cleanup_expired_sessions()
   function exists but is never called automatically.
   FIX: Add a cron job or periodic call to clean up expired sessions.

5. course_requirements Table Is Empty
   Programs exist but have no course requirements defined. The eligibility
   engine cannot properly evaluate applications without this data.
   FIX: Admin needs to populate course_requirements for each program.

6. program_intakes Table Is Empty
   Programs and intakes exist separately but are not linked. This means the
   system cannot enforce capacity limits per program-intake combination.
   FIX: Admin needs to create program_intakes associations.

7. user_notification_preferences Has 0 Rows
   No users have set notification preferences. The system defaults to
   email_enabled=true for all users, which is correct behavior, but means
   no user has explicitly configured their preferences.
   FIX: Consider auto-creating default preferences on user registration.

8. Notification Dedup Uses Different Key Formats
   createNotificationWithDedup uses `event_type:entity_type:entity_id`
   handleCreate uses `user_id:type:title:message`
   This inconsistency means dedup behavior differs between the two paths.
   FIX: Standardize idempotency key format across all notification creation paths.

MEDIUM:

9. Push Notifications Are Stubbed
   push-subscribe and push-send actions return graceful "not configured" responses.
   The push_subscriptions table does not exist.
   FIX: Implement when push notification support is needed.

10. payments Table Has 0 Rows Despite 42 Applications
    Payment data is stored inline on the applications table (payment_status,
    amount, momo_ref, etc.) rather than in the dedicated payments table.
    This is a data model inconsistency.
    FIX: Decide whether to migrate payment data to the payments table or
    deprecate it. Currently both exist in parallel.

11. application_status_history Has 0 Rows
    Status changes are not being recorded in the history table despite
    the table existing. Audit logs capture some of this but the dedicated
    history table is unused.
    FIX: Add status history recording when application status changes.

12. settings Table Is Empty
    No system settings have been configured. The admin settings endpoint
    exists but has no data to serve.
    FIX: Seed default settings (application deadlines, fee amounts, etc.).

13. Pre-existing Test Failures
    Some tests from prior specs have known failures:
    - Cookie-related tests (httpOnly cookie mocking)
    - Password hashing tests (bcrypt mock edge cases)
    - HEAD method tests (Vercel handler signature)
    FIX: Address these in a dedicated test cleanup pass.

14. UI Duplicate Primitives (from Codex 5.4 audit)
    Card.tsx/card.tsx, Tooltip.tsx/tooltip.tsx, Skeleton.tsx/skeleton.tsx
    duplicates still exist in src/components/ui/.
    The input.tsx file is lowercase — all imports must use lowercase.
    FIX: Canonicalize to lowercase shadcn convention, update all imports.
    NOTE: Case-sensitivity imports were fixed in fix-vercel-build spec,
    but the duplicate files themselves still exist on disk.

15. Hero CTA Interaction Pattern Is Inconsistent (UI/UX + A11y)
    Hero actions mix interactive composition styles across variants, which can
    produce uneven keyboard focus treatment, hover/active behavior drift, and
    confusion when analytics handlers sit on wrappers instead of click targets.
    SOLUTION:
    - Standardize all hero CTAs on `Button asChild` with a single Link/a child.
    - Attach analytics handlers on the actual clickable Link/a element only.
    - Ensure parity of disabled/loading semantics and aria-disabled behavior.
    - Keep min touch target >= 48px and visible focus ring on both variants.
    - Add regression checks in LandingPage tests for role, tab order, and
      analytics click firing from the interactive element.

LOW:

16. R2 Storage Migration Script Exists But May Not Be Needed
    document_migration_log table has 0 rows. The migration script
    (scripts/migrate-legacy-documents-to-r2.ts) exists but live DB showed
    0 legacy URLs needing migration.
    FIX: Verify if R2 migration is still needed or can be removed.

17. neon_auth Schema Exists (Unused)
    Neon Auth was provisioned (account, session, user, etc. tables in
    neon_auth schema) but the app uses custom JWT auth exclusively.
    FIX: Consider removing neon_auth schema if not planned for use.


==========================================================================
SECTION 7 — PROJECT CONVENTIONS
==========================================================================

Runtime: Bun (not npm)
API source: edit api-src/*.ts, then run `bun run scripts/bundle-api.mjs`
Never edit api/*.js directly — auto-generated
Database: Neon Postgres exclusively (never Supabase)
Auth: Custom JWT via jose + bcrypt, HTTP-only cookies
Security: Arcjet on all sensitive routes
Frontend: React 18 + TypeScript, Tailwind, Radix UI, Zustand + React Query
Tests: Vitest + fast-check, run with `bun run test`
Shared libs at project root lib/ (NOT api/lib/)
API response envelope: { success: true, data: payload } via sendSuccess()
Frontend clients unwrap automatically — never check response.success on results
tsconfig.json has strict: false — do not enable strict mode

Key commands:
  bun install                          — Install dependencies
  bun run dev                          — Local dev server (port 5173)
  bun run build                        — Production build
  bun run test                         — Run Vitest tests
  bun run scripts/bundle-api.mjs       — Bundle API endpoints

Roles (embedded in JWT, no DB lookup):
  super_admin — Full access
  admin       — Manage applications, verify payments/documents
  reviewer    — Read/review applications and documents
  student     — Own data only


==========================================================================
SECTION 8 — KEY FILES REFERENCE
==========================================================================

Email System:
  api-src/email.ts              — Email endpoint (send, process-queue, retry-failed, queue-status)
  lib/emailTemplates.ts         — 6 branded HTML email templates
  lib/notificationPolicy.ts     — Email type mapping, mandatory types, preference keys

Notification System:
  api-src/notifications.ts      — Notifications endpoint (create, send, list, preferences, etc.)
  src/services/notifications.ts — Frontend notification service
  src/hooks/useStudentNotifications.ts — Student notification hook

Auth System:
  api-src/auth.ts               — Auth endpoint (login, logout, refresh, session, register)
  lib/auth/                     — JWT, cookies, middleware, permissions, password hashing
  lib/auth.ts                   — Re-exports from auth/

Core API:
  api-src/admin.ts              — Admin dashboard, users, settings, stats
  api-src/applications.ts       — Application CRUD, review, export
  api-src/catalog.ts            — Programs, intakes, subjects
  api-src/documents.ts          — Document upload, OCR extraction
  api-src/payments.ts           — Payment receipts
  api-src/sessions.ts           — Device session management
  api-src/health.ts             — Health checks

Specs:
  .kiro/specs/email-notification-cleanup/   — Email system + cleanup (completed)
  .kiro/specs/fix-vercel-build/             — Vercel build fixes (completed)
  .kiro/specs/mcp-verification-recovery/    — DB verification + recovery (completed)

Steering:
  .kiro/steering/tech.md        — Technology stack conventions
  .kiro/steering/structure.md   — Project structure rules
  .kiro/steering/product.md     — Product context and business rules


==========================================================================
SECTION 9 — IMMEDIATE NEXT STEPS (PRIORITY ORDER)
==========================================================================

1. Set up email queue cron job (CRITICAL — emails won't send without this)
   Add to vercel.json:
   {
     "crons": [{
       "path": "/api/email?action=process-queue",
       "schedule": "*/5 * * * *"
     }]
   }
   Note: Cron needs admin auth — may need a service token approach.

2. Resolve hero CTA UI/UX consistency gap (HIGH)
   - Use one composition pattern: `Button asChild` + single Link/a child.
   - Keep tracking hooks on clickable element (Link/a), not wrapper.
   - Verify keyboard tab order, focus-visible ring, hover, active, and
     disabled/loading parity for both primary and secondary CTAs.
   - Add/adjust tests to lock in semantics and prevent wrapper regressions.

3. Verify Resend domain DNS (SPF/DKIM/DMARC for mihas.edu.zm)

4. Test end-to-end email flow:
   - Create a notification for a test user
   - Call process-queue
   - Verify email arrives in inbox (not spam)

5. Deploy to Vercel and verify build passes in production
   (Build was verified locally — `bunx --bun vite build` passes clean)

6. Populate course_requirements and program_intakes tables

7. Add email verification flow to registration

8. Clean up expired device_sessions (587 rows)

9. Standardize notification idempotency key format

10. Canonicalize UI duplicate primitives (Card, Tooltip, Skeleton)
    to lowercase shadcn convention and remove PascalCase duplicates

11. Run full test suite and fix pre-existing failures (14 known)

12. Consider adding admin UI for email queue monitoring
