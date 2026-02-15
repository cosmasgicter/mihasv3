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

## 4. Database Schema (Neon Postgres)

**Neon Project:** `wild-bar-37055823` (database: `mihasApplication`)

### Core Tables (Migration 002)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | Central user table (students, admins) | id (UUID), email, role, password_hash, refresh_token_hash, failed_login_attempts, locked_until |
| `programs` | Academic programs offered | id, name, code, duration_months, application_fee (default 153 ZMW), regulatory_body |
| `intakes` | Enrollment periods | id, name, year, semester, application_deadline, max_capacity |
| `subjects` | Grade 12 subjects (ECZ) | id, name, code, category, is_core |
| `institutions` | Educational institutions | id, name, code, type, accreditation_status |
| `applications` | Main business entity | id, application_number (MIHAS + year + seq), user_id → profiles, status, program, intake, eligibility_score, public_tracking_code |
| `application_documents` | Uploaded documents per application | id, application_id → applications, document_type, verification_status |
| `application_grades` | ECZ grades per application | id, application_id → applications, subject_id → subjects, grade (1-9, CHECK constraint) |
| `device_sessions` | Auth sessions per device | id, user_id → profiles, session_token, ip_address, expires_at |
| `audit_logs` | Immutable audit trail (protected by trigger) | id, actor_id, action, entity_type, entity_id, changes (JSONB) |
| `notifications` | User notifications | id, user_id → profiles, title, message, type, is_read |

### Supporting Tables (Migration 003)

| Table | Purpose |
|-------|---------|
| `application_drafts` | Auto-save drafts (8-second interval) |
| `application_status_history` | Status change audit trail |
| `application_interviews` | Interview scheduling (in_person, online, phone) |
| `payments` | Payment records (ZMW currency) |
| `documents` | General document storage |
| `course_requirements` | Program admission requirements (subject + minimum grade) |
| `program_intakes` | Many-to-many: programs ↔ intakes |
| `email_queue` | Email queue with retry (max 3 retries) |
| `user_notification_preferences` | Per-user notification settings |
| `settings` | System-wide key-value settings |

### Database Functions (Migration 004)

| Function | Purpose |
|----------|---------|
| `update_updated_at_column()` | Auto-update `updated_at` on row changes |
| `generate_application_number()` | Generates `MIHAS` + 2-digit year + 4-digit sequence |
| `generate_tracking_code()` | 8-character alphanumeric public tracking code |
| `validate_zambian_phone(phone)` | Validates +260 or 0 prefix + 9 digits |
| `validate_nrc(nrc)` | Validates NRC format: XXXXXX/XX/X |
| `validate_email(email)` | Basic email format validation |
| `calculate_best_5_subjects_points(app_id)` | ECZ grading: grade 1-6 = pass (points = 7 - grade), best 5 subjects |
| `set_application_defaults()` | Auto-generates application_number and tracking_code |
| `prevent_audit_modification()` | Blocks UPDATE/DELETE on audit_logs |
| `cleanup_expired_sessions()` | Removes expired device sessions |
| `cleanup_old_drafts()` | Removes inactive drafts older than 30 days |

### Triggers (Migration 005)

- `updated_at` auto-update triggers on all major tables
- `set_application_defaults_trigger` on applications (BEFORE INSERT OR UPDATE)
- `prevent_audit_logs_modification` on audit_logs (BEFORE UPDATE OR DELETE)

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
