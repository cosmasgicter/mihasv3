# MIHAS Application System — Codex

> Complete system reference for AI assistants. This document describes the full state of the MIHAS (Mukuba Institute of Health and Allied Sciences) admissions portal as of February 2026.

## 1. What This System Is

A **live production admissions portal** at `***REMOVED***` serving students in Zambia. Real users, real data. Students apply for health science programs, upload documents, pay fees, and track their application status. Admins review applications, verify payments, and manage the admissions pipeline.

**Application flow:** Registration → Email Verification → Profile Setup → Application Wizard (4 steps) → Payment → Interview → Decision

## 2. Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Frontend | React 18 + TypeScript, Vite |
| Styling | Tailwind CSS + Radix UI |
| Forms | React Hook Form + Zod |
| State | Zustand (client), React Query (server) |
| Routing | React Router v6 (lazy-loaded) |
| Backend | Vercel Serverless Functions (10 consolidated endpoints) |
| Database | Neon Serverless Postgres |
| Auth | Custom JWT (jose) + bcrypt, HTTP-only cookies |
| Security | Arcjet (shield, bot detection, rate limiting) |
| Email | Resend (queue with retry) |
| OCR | tesseract.js (only AI feature) |
| Real-time | SSE + polling fallback |
| Hosting | Vercel Free Plan |
| Testing | Vitest + fast-check (property-based) |

## 3. Project Structure

```
src/                   # React frontend (primary modification target)
├── components/        # UI components by domain (admin/, student/, auth/, ui/, forms/)
├── pages/             # Route-level components
├── hooks/             # Custom hooks (useXxx.ts)
├── services/          # API client layer
├── stores/            # Zustand stores
├── lib/               # Frontend utilities
├── types/             # TypeScript definitions
├── contexts/          # React context providers
├── routes/            # Route config and guards
└── styles/            # Global styles

api-src/               # API source TypeScript (edit these, then bundle)
├── admin.ts           # ?action=dashboard|users|settings|stats|errors|migrate
├── applications.ts    # ?action=details|documents|grades|summary|review
├── auth.ts            # ?action=login|logout|refresh|session|register
├── catalog.ts         # ?type=programs|intakes|subjects|institutions
├── documents.ts       # ?action=upload|extract|download|signed-url
├── health.ts          # ?action=ping|db|env
├── notifications.ts   # ?action=preferences|send|push-subscribe|push-send
├── payments.ts        # ?action=receipt
├── sessions.ts        # ?action=track|list|revoke|revoke-all
└── [...path].ts       # Catch-all

api/                   # Bundled JS (DO NOT EDIT — auto-generated)

lib/                   # Shared backend utilities (project root, NOT api/lib/)
├── arcjet.ts          # Security perimeter
├── auth.ts            # Auth middleware exports
├── auth/              # JWT, bcrypt, cookies, RBAC, middleware
├── cors.ts            # CORS handler
├── db.ts              # Neon serverless database abstraction
├── queries.ts         # Typed query builders
├── errorHandler.ts    # Sanitized error responses
├── auditLogger.ts     # Audit logging (no PII)
├── realtime.ts        # SSE + polling
├── storage.ts         # R2 storage abstraction
└── sessions.ts        # Device session manager

scripts/audit/         # Forensic audit tooling (9 auditors)
forensic_reports/      # Generated audit reports (Markdown)
migrations/            # Database migrations (append-only)
tests/                 # unit/, property/, integration/
.kiro/specs/           # Feature specifications
```

**API workflow:** Edit `api-src/*.ts` → Run `bun run scripts/bundle-api.mjs` → Commit both `api-src/` and `api/`

## 4. Database Schema (Neon Postgres) — Live Production Data

### Neon Project Metadata

| Property | Value |
|----------|-------|
| Project ID | `wild-bar-37055823` |
| Database Name | `mihasApplication` |
| PostgreSQL Version | 17 |
| Region | `aws-us-east-1` |
| Proxy Host | `c-3.us-east-1.aws.neon.tech` |
| Owner | `org-nameless-field-86879910` (Cosmas) |
| Created | 2026-01-30 |
| Autoscaling | 0.25 – 0.25 CU |
| Suspend Timeout | 0 (scale-to-zero enabled) |
| Storage Limit | 512 MB (536,870,912 bytes) |
| Logical Size | ~34 MB |
| Extensions | `uuid-ossp`, `pgcrypto` |
| Console | https://console.neon.tech/app/projects/wild-bar-37055823 |

### Branches

| Branch | ID | Role | State |
|--------|----|------|-------|
| `production` (default) | `br-floral-scene-aha2ybfd` | Primary, read-write | ready |
| `vercel-dev` | `br-square-bush-ah4zawi1` | Child of production | archived |

### 21 Tables (All UUIDs, All Timestamped)

#### Core Tables (Migration 002 — 11 tables)

| Table | Purpose | Key Columns | Foreign Keys |
|-------|---------|-------------|--------------|
| `profiles` | Central user table | id, email (UNIQUE), role, password_hash, refresh_token_hash, failed_login_attempts, locked_until, email_verified, nrc_number, nationality, notification_preferences (JSONB) | — |
| `programs` | Academic programs (4 rows) | id, name, code (UNIQUE), duration_months, application_fee (default 153 ZMW), regulatory_body, accreditation_status, requirements (JSONB) | — |
| `intakes` | Enrollment periods (3 rows) | id, name, year, semester, application_deadline, max_capacity, current_enrollment | — |
| `subjects` | ECZ Grade 12 subjects (17 rows) | id, name, code, category, is_core | — |
| `institutions` | Educational institutions (2 rows) | id, name, code (UNIQUE), type, accreditation_status | — |
| `applications` | Main business entity | id, application_number (UNIQUE, auto-generated), user_id, full_name, nrc_number, date_of_birth, sex, phone, email, program, intake, institution, status, eligibility_score, public_tracking_code, payment_status, submitted_at | user_id → profiles, payment_verified_by → profiles, admin_feedback_by → profiles, reviewed_by → profiles |
| `application_documents` | Uploaded documents per application | id, application_id, document_type, document_name, file_url, verification_status, system_generated | application_id → applications, verified_by → profiles |
| `application_grades` | ECZ grades per application | id, application_id, subject_id, grade (CHECK 1-9), UNIQUE(application_id, subject_id) | application_id → applications, subject_id → subjects |
| `device_sessions` | Auth sessions per device | id, user_id, device_id, session_token, ip_address, is_active, expires_at (default 30 days) | user_id → profiles |
| `audit_logs` | Immutable audit trail (protected by trigger) | id, actor_id, action, entity_type, entity_id, changes (JSONB), ip_address (INET) | actor_id → profiles |
| `notifications` | User notifications | id, user_id, title, message, type, priority, action_url, metadata (JSONB), is_read | user_id → profiles |

#### Supporting Tables (Migration 003 — 10 tables)

| Table | Purpose | Key Columns | Foreign Keys |
|-------|---------|-------------|--------------|
| `application_drafts` | Auto-save drafts (8-second interval) | id, user_id, draft_data (JSONB), step_completed, is_active | user_id → profiles |
| `application_status_history` | Status change audit trail | id, application_id, status, changed_by, notes, changes (JSONB) | application_id → applications, changed_by → profiles |
| `application_interviews` | Interview scheduling | id, application_id, scheduled_at, mode (CHECK: in_person/online/phone), status (CHECK: scheduled/completed/cancelled/no_show/rescheduled) | application_id → applications, created_by → profiles, updated_by → profiles |
| `payments` | Payment records (ZMW currency) | id, application_id, user_id, amount, currency (default ZMW), payment_method, transaction_reference, status, receipt_number, metadata (JSONB) | application_id → applications, user_id → profiles, verified_by → profiles |
| `documents` | General document storage | id, application_id, uploader_id, document_type, file_name, file_path, verdict | application_id → applications, uploader_id → profiles, verified_by → profiles |
| `course_requirements` | Program admission requirements | id, program_id, subject_id, is_mandatory, minimum_grade (CHECK 1-9), weight, requirement_type | program_id → programs, subject_id → subjects |
| `program_intakes` | Many-to-many: programs ↔ intakes | id, program_id, intake_id, max_capacity, current_enrollment, UNIQUE(program_id, intake_id) | program_id → programs, intake_id → intakes |
| `email_queue` | Email queue with retry | id, recipient_email, subject, body, html_body, template_name, template_data (JSONB), status, priority, retry_count, max_retries (default 3) | — |
| `user_notification_preferences` | Per-user notification settings | id, user_id (UNIQUE), email_enabled, push_enabled, sms_enabled, application_updates, payment_reminders, interview_reminders, timezone (default Africa/Lusaka) | user_id → profiles |
| `settings` | System-wide key-value settings | id, key (UNIQUE), value (JSONB), description, category, is_public | updated_by → profiles |

### Reference Data (Seeded via Migration 006)

| Table | Rows | Details |
|-------|------|---------|
| `institutions` | 2 | MIHAS (Mukuba Institute), KATC (Kalulushi Training Centre) |
| `subjects` | 17 | ECZ Grade 12: English, Mathematics, Biology, Chemistry, Physics, Science + 11 electives |
| `intakes` | 3 | January 2026 (3 enrolled), July 2026, January 2027 |
| `programs` | 4 | DCM (Clinical Medicine, 36mo), DRN (Registered Nursing, 36mo), DEH (Environmental Health, 36mo), CPC (Psychosocial Counselling, 12mo) — all 153 ZMW fee |

### Indexes (55+ indexes)

Key indexes beyond primary keys:

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_profiles_email` | profiles | Login lookups |
| `idx_profiles_role` | profiles | Role-based queries |
| `idx_profiles_refresh_token` | profiles | Token refresh (partial: WHERE NOT NULL) |
| `idx_applications_user` | applications | User's applications |
| `idx_applications_status` | applications | Status filtering |
| `idx_applications_number` | applications | Application number lookup |
| `idx_applications_tracking` | applications | Public tracking (partial: WHERE NOT NULL) |
| `idx_applications_program` | applications | Program filtering |
| `idx_applications_intake` | applications | Intake filtering |
| `idx_applications_created` | applications | Chronological listing (DESC) |
| `idx_sessions_token` | device_sessions | Token validation |
| `idx_sessions_active` | device_sessions | Active sessions (partial: WHERE active) |
| `idx_sessions_expires` | device_sessions | Expiry cleanup |
| `idx_audit_entity` | audit_logs | Entity lookup (composite: type + id) |
| `idx_audit_created` | audit_logs | Chronological audit (DESC) |
| `idx_notifications_unread` | notifications | Unread count (composite + partial) |
| `idx_email_queue_status` | email_queue | Queue processing |
| `idx_email_queue_priority` | email_queue | Priority ordering (composite) |
| `idx_drafts_active` | application_drafts | Active drafts (composite + partial) |

### Database Functions (11 functions)

| Function | Type | Purpose |
|----------|------|---------|
| `update_updated_at_column()` | TRIGGER | Auto-update `updated_at` on row changes |
| `generate_application_number()` | TEXT | Generates `MIHAS` + 2-digit year + 4-digit sequence (e.g., MIHAS260001) |
| `generate_tracking_code()` | TEXT | 8-character alphanumeric public tracking code (excludes ambiguous chars: I, O, 0, 1) |
| `validate_zambian_phone(phone)` | BOOLEAN | Validates +260 or 0 prefix + 9 digits (IMMUTABLE) |
| `validate_nrc(nrc)` | BOOLEAN | Validates NRC format: XXXXXX/XX/X (IMMUTABLE) |
| `validate_email(email)` | BOOLEAN | Basic email format validation (IMMUTABLE) |
| `calculate_best_5_subjects_points(app_id)` | INTEGER | ECZ grading: grade 1-6 = pass (points = 7 - grade), selects best 5 subjects |
| `set_application_defaults()` | TRIGGER | Auto-generates application_number and tracking_code on INSERT/UPDATE |
| `prevent_audit_modification()` | TRIGGER | Raises exception on UPDATE/DELETE of audit_logs |
| `cleanup_expired_sessions()` | INTEGER | Deletes expired sessions and inactive sessions older than 7 days |
| `cleanup_old_drafts()` | INTEGER | Deletes inactive drafts older than 30 days |

### Triggers (16 triggers)

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| `update_profiles_updated_at` | profiles | BEFORE UPDATE | `update_updated_at_column()` |
| `update_applications_updated_at` | applications | BEFORE UPDATE | `update_updated_at_column()` |
| `update_application_documents_updated_at` | application_documents | BEFORE UPDATE | `update_updated_at_column()` |
| `update_device_sessions_updated_at` | device_sessions | BEFORE UPDATE | `update_updated_at_column()` |
| `update_programs_updated_at` | programs | BEFORE UPDATE | `update_updated_at_column()` |
| `update_intakes_updated_at` | intakes | BEFORE UPDATE | `update_updated_at_column()` |
| `update_notifications_updated_at` | notifications | BEFORE UPDATE | `update_updated_at_column()` |
| `update_application_drafts_updated_at` | application_drafts | BEFORE UPDATE | `update_updated_at_column()` |
| `update_payments_updated_at` | payments | BEFORE UPDATE | `update_updated_at_column()` |
| `update_documents_updated_at` | documents | BEFORE UPDATE | `update_updated_at_column()` |
| `update_settings_updated_at` | settings | BEFORE UPDATE | `update_updated_at_column()` |
| `update_user_notification_preferences_updated_at` | user_notification_preferences | BEFORE UPDATE | `update_updated_at_column()` |
| `update_application_interviews_updated_at` | application_interviews | BEFORE UPDATE | `update_updated_at_column()` |
| `set_application_defaults_trigger` | applications | BEFORE INSERT OR UPDATE | `set_application_defaults()` |
| `prevent_audit_logs_modification` | audit_logs | BEFORE UPDATE OR DELETE | `prevent_audit_modification()` |

## 5. Auth System

### Token Flow
```
Login → Generate Access (15min) + Refresh (7d) → HTTP-only Cookies
API Request → Extract from Cookie/Bearer → Verify JWT (jose, HS256) → AuthContext
Token Expired → Auto-refresh via /api/auth?action=refresh → Rotate both tokens
```

### Role-Based Access Control (Embedded in JWT, No DB Lookup)

| Role | Permissions |
|------|------------|
| `super_admin` | Full CRUD on everything |
| `admin` | Read users, manage applications, verify payments/documents, view analytics |
| `reviewer` | Read/review applications, read documents only |
| `student` | Own applications, documents, payments, profile only |

### Arcjet Rate Limits

| Route | Limit | Window |
|-------|-------|--------|
| /api/auth/* | 5 requests | 5 minutes |
| /api/sessions/* | 30 requests | 10 minutes |
| /api/admin/* | 20 requests | 10 minutes |
| /api/notifications/* | 50 requests | 10 minutes |

## 6. Business Rules

- **Grading:** Zambian ECZ scale 1-9 (1-6 = pass, 7-9 = fail)
- **Payment:** Required before interview scheduling, default fee 153 ZMW
- **Auto-save:** Every 8 seconds, silent, non-blocking — never remove this
- **Eligibility:** Advisory only, manual admin override always available
- **External APIs:** HPCZ, GNC/NMCZ, ECZ are unreliable — always provide fallbacks, never block
- **Offline:** PWA must work on unreliable Zambian connections
- **PII:** Never log personal data in audit logs or error messages

## 7. Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies |
| `bun run dev` | Local dev server (port 5173) |
| `bun run build` | Production build with type-check |
| `bun run test` | Run Vitest tests |
| `bun run lint` | ESLint check |
| `bun run audit` | Run full forensic audit |
| `bun run audit:contract` | Contract mismatch audit only |
| `bun run audit:page` | Page validation audit only |
| `bun run audit:performance` | Performance audit only |
| `bun run audit:deadcode` | Dead code audit only |

## 8. Completed Specs

### Spec 1: Frontend-Backend Forensic Audit (COMPLETE ✅)

**Location:** `.kiro/specs/frontend-backend-forensic-audit/`

Built a comprehensive forensic audit system with 9 auditors, 23 property-based tests, and automated report generation. All 17 tasks complete.

**Auditors built:**
1. Contract Auditor — maps frontend API calls to backend endpoints
2. Page Auditor — checks auth, error handling, loading states, race conditions, mobile responsiveness
3. Loader Auditor — identifies redundant loader/spinner/skeleton implementations
4. Auth Auditor — maps auth workflows, detects state fragmentation and security issues
5. SSE Auditor — verifies SSE endpoint/listener pairing and reconnection logic
6. Notification Auditor — audits triggers, email dispatch, idempotency
7. Performance Auditor — flags heavy animations, analyzes bundle size
8. Dead Code Auditor — finds unused exports, legacy imports, commented code
9. Master Runner — orchestrates all auditors, generates summary

**Reports generated to `forensic_reports/`:**
- `contract-mismatch-report.md`
- `page-validation-matrix.md`
- `loader-unification-plan.md`
- `notification-flow-report.md`
- `sse-implementation-report.md`
- `performance-fixes-report.md`
- `stale-code-removal-list.md`

### Spec 2: Audit Issue Remediation (IN PROGRESS 🔄)

**Location:** `.kiro/specs/audit-issue-remediation/`

Phased remediation of issues found by the forensic audit. 7 priority areas:

| Phase | Status | Summary |
|-------|--------|---------|
| 1. Performance/Animation | ✅ Complete | Replaced framer-motion with CSS transitions in 98 files, added Tailwind animation tokens |
| 2. Dead Code Removal | 🔄 In Progress | Some unused services deleted, more to clean |
| 3. API Contract Alignment | ⬜ Not Started | 70 MISSING_ENDPOINT mismatches to fix (frontend uses path-based URLs, backend uses query params) |
| 4. Page Quality | ⬜ Not Started | 42 critical pages need auth guards, error handling, race condition fixes |
| 5. Auth Unification | ⬜ Not Started | Fragmented auth state across multiple stores/contexts |
| 6. Notification Idempotency | ⬜ Not Started | 0% idempotency coverage, 100 triggers without keys |
| 7. SSE Wiring | ⬜ Not Started | 6 unwired features (application_update, payment_update, etc.) |

## 9. Forensic Audit Findings Summary

### Contract Audit
- **92 frontend API calls**, **12 backend endpoints**
- **70 MISSING_ENDPOINT** — frontend calls paths like `/api/admin/users` but backend expects `/api/admin?action=users`
- **7 UNUSED_ENDPOINT** — backend endpoints with no frontend callers
- **1 AUTH_MISMATCH** — push notification subscribe sends no auth

### Page Audit
- **65 pages analyzed**, **42 critical**, **20 warning**, **3 healthy**
- **38 pages** missing auth checks
- **31 pages** with error handling gaps
- **24 pages** with race condition risks (async useEffect without cleanup)
- **16 pages** missing mobile responsive styles

### Loader Audit
- **57 loader definitions**, **49 redundant**
- 5 redundancy groups (progress, skeleton, overlay, spinner, inline)
- UnifiedLoader component created at `src/components/ui/UnifiedLoader.tsx`
- Loading state store at `src/stores/loadingStore.ts`

### Performance Audit
- **587 total issues**, **577 heavy animations** (framer-motion)
- **JS bundle: 4.18 MB** (target: 500 KB) — framer-motion in 98 files
- **10 oversized chunks**
- Phase 1 remediation replaced framer-motion with CSS transitions

### Notification Audit
- **100 notification triggers**, **0% idempotency coverage**
- **5 email dispatch points**, only 1 with deduplication, 0 with retry
- **6 critical issues**, **3 high risk issues**

### SSE Audit
- **1 backend SSE module** (lib/realtime.ts) with 6 event types
- **1 frontend listener** (useRealtime.ts) — generic, not wired to specific events
- **6 unwired features**: notifications, application status, admin dashboard, payments, interviews, document processing

### Dead Code Audit
- Legacy Supabase/Cloudflare references still present
- Unused service files: backupRecovery, databaseOptimization, systemMonitoring, performanceAlerting, consents, pushSubscriptions, communicationService
- Commented-out code blocks throughout codebase

## 10. Environment Variables

```
# Required
DATABASE_URL=postgres://[user]:[pass]@[host].neon.tech/[db]?sslmode=require
JWT_SECRET=[32+ char secret for access tokens]
JWT_REFRESH_SECRET=[32+ char secret for refresh tokens]
ARCJET_KEY=[arcjet-api-key]

# Email
RESEND_API_KEY=[resend-key]
EMAIL_FROM=noreply@mihas.edu.zm
```

**Removed (migration complete):** All Supabase, Cloudflare, Sentry, Umami, Twilio variables.

## 11. Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.3.1 | UI framework |
| zustand | ^5.0.2 | Client state management |
| @tanstack/react-query | ^5.62.7 | Server state/caching |
| react-hook-form | ^7.54.0 | Form management |
| zod | 4.3.6 | Schema validation |
| jose | 6.1.3 | JWT signing/verification |
| bcryptjs | 3.0.3 | Password hashing |
| @neondatabase/serverless | 1.0.2 | Database driver |
| @arcjet/node | 1.0.0 | Security perimeter |
| resend | 6.9.1 | Email delivery |
| recharts | ^3.2.1 | Charts (lazy-loaded) |
| tesseract.js | ^5.1.1 | OCR (only AI feature) |
| fast-check | 4.5.3 | Property-based testing |
| vitest | 4.0.18 | Test runner |

## 12. Hard Constraints

1. Never remove auto-save (8-second interval)
2. Never block on external API failures (HPCZ, GNC/NMCZ, ECZ)
3. Never log PII
4. Maintain backward compatibility (existing data in 21+ tables)
5. Preserve offline functionality (PWA)
6. Use Bun for all commands (not npm)
7. API endpoints in `api/` directory (not `functions/`)
8. HTTP-only cookies for auth tokens (not localStorage)
9. Deterministic RBAC from JWT (no DB lookup for permissions)
10. Never edit `api/*.js` directly — edit `api-src/*.ts` and bundle

## 13. What Needs Work Next

Priority order based on user impact:

1. **Dead code removal** (Phase 2 in progress) — delete unused services, legacy references, commented code
2. **API contract alignment** — rewrite 70 frontend service URLs from path-based to query-parameter routing
3. **Page quality** — add auth guards to 38 pages, fix 24 race conditions, add error handling to 31 pages
4. **Auth unification** — consolidate fragmented auth state into single Zustand store
5. **Notification idempotency** — create idempotency service, add keys to all 100 triggers
6. **SSE wiring** — connect 6 backend event types to frontend listeners
7. **Loader unification** — replace 49 redundant loaders with UnifiedLoader component
