---
inclusion: always
---

# MIHAS Application System - Product Context

Live production admissions platform for Mukuba Institute of Health and Allied Sciences (Zambia). Real users, real data—treat all changes as production-critical.

## Hard Constraints (Non-Negotiable)

| Rule | Reason |
|------|--------|
| Never remove auto-save | 8-second interval prevents data loss for students |
| Never block on external API failures | HPCZ, GNC/NMCZ, ECZ APIs are unreliable—always provide fallbacks |
| Never log PII | Student applications contain medical credentials and personal data |
| Maintain backward compatibility | 28 database tables with existing data |
| Preserve offline functionality | PWA must work on unreliable Zambian connections |
| Validate all API inputs | Zod schemas required on every endpoint |
| CSRF protection on state-changing requests | All POST/PUT/DELETE require CSRF token |

## User Roles

| Role | Capabilities |
|------|-------------|
| Student | Apply, upload documents, track status, pay, schedule interviews |
| Admin | Review applications, verify eligibility, approve/reject (simplified) |
| Reviewer | Review applications, view documents (read-only) |
| Super Admin | Full access + user management, system config, audit logs |

### Role Permissions (Embedded in JWT, No DB Lookup)
- **super_admin**: Full CRUD on users, applications, programs, payments, documents, analytics, settings
- **admin**: Read users, manage applications, verify payments/documents, view analytics
- **reviewer**: Read/review applications, read documents only
- **student**: Own applications, documents, payments, profile only

## Simplified Admin (Migration)

The admin interface has been simplified:
- ✅ Application review and status management
- ✅ Basic user management (CRUD)
- ✅ Simple email notifications
- ❌ Complex workflow engine (REMOVED)
- ❌ Predictive analytics dashboards (REMOVED)
- ❌ Bulk notification management (REMOVED)
- ❌ AI-powered features (REMOVED except OCR)

## Application Flow

`Registration → Email Verification → Profile Setup → Application Wizard → Payment → Interview → Decision`

### Application Wizard (4 Steps)
1. Personal Information
2. Academic History
3. Program Selection
4. Document Upload

### Wizard Behaviors
- Auto-save: every 8 seconds, silent, non-blocking
- Validation: non-blocking—students can proceed even if eligibility checks fail
- Persistence: draft state persists across sessions
- Eligibility: advisory only, manual admin override always available

## Business Rules

| Rule | Details |
|------|---------|
| Payment timing | Required before interview scheduling |
| Documents | Requirements vary by program; validated with magic byte verification |
| Grading | Zambian ECZ: 1-9 scale (1-6 = pass, 7-9 = fail) |
| Interviews | First-come-first-served with admin override |
| Audit | All state changes require audit trail entries with retention categories |
| Password reset | Token-based, 1-hour expiry, single-use, rate-limited (3/email/15min) |
| Login protection | Progressive backoff after 5 failures, 30-min lock after 10 |

## Performance Targets

| Metric | Target |
|--------|--------|
| First load (3G) | <2.5s |
| Wizard navigation | <100ms |
| Auto-save | Silent, no UI blocking |
| Offline mode | Core features functional |
| Lighthouse score | >90 |

## Security Posture

| Layer | Implementation |
|-------|---------------|
| Transport | HSTS (1-year), TLS-only |
| Headers | CSP, X-Frame-Options DENY, nosniff, Permissions-Policy |
| Auth | JWT in HTTP-only cookies, refresh token rotation, shared signing key during dual-run |
| Auth cookies | `Domain=.mihas.edu.zm`, `SameSite=Lax`, `Secure`, `HttpOnly` (subdomain strategy) |
| CSRF | SHA-256 hashed tokens in `csrf_tokens` table |
| Rate limiting | django-ratelimit (replacing Arcjet) + per-email login attempt tracking |
| Input validation | DRF serializers (replacing Zod schemas) on all API endpoints |
| File uploads | Magic byte verification + MIME type validation |
| URL handling | Open redirect prevention on all URL inputs |
| Audit | Retention categories: standard (90d) / security (365d) |
| PII | Never logged; email/IP stored as SHA-256 hashes only |
| Connection pooling | Neon built-in pooler, separate limits for web + Celery worker |

## External Integrations

### Active

| Service | Failure Handling |
|---------|------------------|
| Neon Postgres | Critical—no fallback (shared by Vercel + Django during dual-run) |
| Vercel (frontend hosting) | Infrastructure layer |
| Koyeb (Django API hosting) | Container platform — web + worker services |
| Redis (Celery broker) | Critical for async tasks — Celery reconnects automatically |
| Cloudflare R2 (file storage) | S3-compatible, signed URLs for document access |
| Resend (email) | Queue with retry via Celery (3 retries, exponential backoff) |
| HPCZ/GNC/NMCZ/ECZ (eligibility) | Advisory only, never blocking |

### Migration State

| Component | Current | Target | Status |
|-----------|---------|--------|--------|
| API backend | Vercel Functions | Django on Koyeb | **IN PROGRESS** |
| API URL | apply.mihas.edu.zm/api/ | api.mihas.edu.zm/api/v1/ | **PLANNED** |
| Auth | jose (Node.js) | SimpleJWT (Python) | **PLANNED** — shared JWT key during dual-run |
| Rate limiting | Arcjet | django-ratelimit | **PLANNED** |
| OCR | tesseract.js (client) | pytesseract (server/Celery) | **PLANNED** |
| Validation | Zod schemas | DRF serializers | **PLANNED** |
| Email delivery | In-process (Vercel) | Celery async (Koyeb) | **PLANNED** |
| File storage | R2 (direct) | django-storages + R2 | **PLANNED** |

## Removed Integrations (Migration Cleanup)

| Service | Status |
|---------|--------|
| Supabase (all) | REMOVED - Fully migrated to Neon Postgres |
| Cloudflare Pages | REMOVED - Migrated to Vercel |
| Cloudflare AI | REMOVED - AI features deleted |
| Supabase Realtime | REMOVED - Replaced with Bun-native SSE/polling |
| Supabase Auth SDK | REMOVED - Replaced with custom JWT auth |
| Twilio (SMS/WhatsApp) | REMOVED - Simplification |
| Sentry | REMOVED - Error monitoring removed |
| Umami | REMOVED - Analytics removed |

## Development Checklist

When modifying code, verify:
- [ ] Impact on in-progress applications (students may have drafts)
- [ ] Zambian data formats (+260 phone numbers, ECZ grades 1-9)
- [ ] Mobile responsiveness (most users are on mobile)
- [ ] Graceful degradation for external API calls
- [ ] Accessibility (screen reader support, focus traps, escape key handling)
- [ ] Audit trails for state changes (no PII in logs, use retention categories)
- [ ] HTTP-only cookies for auth tokens (not localStorage)
- [ ] Deterministic RBAC from JWT (no DB lookup for permissions)
- [ ] CSRF tokens on state-changing requests
- [ ] URL inputs validated against open redirects
- [ ] Async effects have proper cleanup (AbortController, clearInterval, removeEventListener)

### Frontend-specific
- [ ] Using Bun commands (not npm)
- [ ] API responses use `sendSuccess()` envelope — `ApiClient` (`src/services/client.ts`) unwraps automatically
- [ ] New utilities go in `src/lib/` (canonical) — never `src/utils/`
- [ ] Sanitization uses `src/lib/sanitize/` — never create new sanitizer files
- [ ] Import from canonical paths only (see structure.md Canonical Import Paths table)
- [ ] `NEXT_PUBLIC_API_BASE_URL` env var controls which backend the frontend talks to

### Django backend-specific
- [ ] All models use `managed = False` during dual-run (shared Neon schema)
- [ ] All responses use envelope format: `{ "success": true, "data": ... }` / `{ "success": false, "error": "...", "code": "..." }`
- [ ] All endpoints prefixed with `/api/v1/`
- [ ] DRF serializers validate all inputs (equivalent to Zod schemas)
- [ ] File uploads validated with magic byte verification
- [ ] Rate limits match existing Arcjet configuration per scope
- [ ] Celery tasks for emails, OCR, bulk notifications (not in-process)
- [ ] Connection pooling via Neon pooler endpoint
- [ ] Shared `JWT_SIGNING_KEY` with Vercel backend during dual-run
- [ ] Auth cookies use `Domain=.mihas.edu.zm` for subdomain sharing
- [ ] Property tests tagged with `# Feature: python-backend-migration, Property {N}`
- [ ] Contract tests verify parity with Vercel backend responses
