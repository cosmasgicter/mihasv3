---
inclusion: always
---

# Technology Stack & Development Conventions

## Stack Overview

### Frontend (Vercel — unchanged)

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Bun | All frontend dev and build commands use Bun |
| UI Framework | React 18 + TypeScript | Functional components only |
| Build Tool | Vite + Bun | Use `bunx --bun vite` for builds |
| Hosting | Vercel Free Plan | Static SPA hosting |
| Production URL | ***REMOVED*** | Live admissions portal |
| Styling | Tailwind CSS | Custom design tokens in `tailwind.config.js` |
| Components | Radix UI | Accessible primitives—prefer over custom implementations |
| Forms | React Hook Form + Zod | All forms must have Zod schemas |
| State | Zustand (client), React Query (server) | No Redux, SSE/polling for real-time |
| Routing | React Router v6 | Lazy-load all page components |
| Validation | Zod | Client-side form validation |

### Backend (Koyeb — Django migration in progress)

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Django 5 + Django REST Framework | Python backend replacing Vercel Functions |
| Runtime | Python 3.12 + gunicorn | Container-based on Koyeb |
| API URL | ***REMOVED*** | Subdomain of production domain |
| Database | Neon Postgres (shared) | Same 26-table schema, `managed = False` during dual-run |
| Connection pooling | Neon built-in pooler | Separate pooled strings for web + worker |
| Auth | SimpleJWT (custom) | HS256, shared `JWT_SIGNING_KEY` with Vercel backend during dual-run |
| Security | django-ratelimit + custom middleware | Replaces Arcjet; same per-scope rate limits |
| CSRF | Custom SHA-256 token validation | X-CSRF-Token header, same as current system |
| Email | Resend (via Celery) | Async delivery with retry, `RESEND_API_KEY` |
| OCR | pytesseract (Celery task) | Server-side, replaces client-side tesseract.js |
| Background tasks | Celery + Redis | Emails, OCR, bulk notifications, long-running ops |
| File storage | django-storages + S3/R2 | Cloudflare R2, signed URLs (15-min expiry) |
| Static files | WhiteNoise | Admin panel, API docs |
| API docs | drf-spectacular | OpenAPI 3.0, Swagger UI + ReDoc |
| Validation | DRF serializers | Equivalent to current Zod schemas |
| Property testing | hypothesis (Python) | Equivalent to fast-check |
| Deployment | Docker + gunicorn on Koyeb | Web service + Celery worker (same image) |

### Legacy Backend (Vercel Functions — being decommissioned)

| Layer | Technology | Notes |
|-------|------------|-------|
| Backend | Vercel Functions + Neon Postgres | **BEING REPLACED** by Django on Koyeb |
| Security | Arcjet + CSRF + CSP | **BEING REPLACED** by django-ratelimit + middleware |
| Auth | Custom JWT (jose) | **SHARED JWT_SIGNING_KEY** with Django during dual-run |
| OCR | tesseract.js | **BEING REPLACED** by pytesseract |
| Validation | Zod | **BEING REPLACED** by DRF serializers |

## Code Conventions

### TypeScript
- Use `@/` path alias for all `src/` imports
- Prefer `interface` over `type` for object shapes
- Export types alongside components when needed externally
- `tsconfig.json` has `strict: false` for legacy compatibility—don't enable strict mode

### React Components
- Functional components with hooks only—no class components
- Co-locate component, test, and styles in same directory
- Use named exports (not default) for better refactoring
- Memoize expensive computations with `useMemo`/`useCallback`
- All `useEffect` hooks with async operations must include cleanup:
  - Fetch calls → `AbortController` with `controller.abort()` in cleanup
  - Timers → `clearInterval`/`clearTimeout` in cleanup
  - Event listeners → `removeEventListener` in cleanup
  - Never use deprecated `MediaQueryList.addListener`/`removeListener`

### Styling
- Tailwind utility classes preferred over custom CSS
- Design tokens defined in `tailwind.config.js`—use them
- Avoid inline styles except for dynamic values
- Mobile-first responsive design (`sm:`, `md:`, `lg:` breakpoints)

### Forms
- All forms use React Hook Form with Zod validation
- Define schemas in separate files when reused
- Use controlled components for complex inputs
- Implement auto-save for multi-step forms (8-second interval)

### State Management
- Zustand: Global UI state, user preferences
- React Query: All server data fetching and caching
- Local state: Component-specific UI state only
- Never duplicate server state in Zustand

## API Development (api/)

### Consolidated Structure (Vercel Hobby Plan: 12 function limit)

**IMPORTANT**: Shared utilities are at PROJECT ROOT `lib/`, NOT `api/lib/`.
This is because Vercel counts any directory inside `api/` toward the function limit.

```
lib/                   # PROJECT ROOT - shared utilities
├── arcjet.ts          # Arcjet security perimeter (shield, bot, rate limits)
├── auth.ts            # Auth middleware exports (re-exports from auth/)
├── auth/              # Auth components
│   ├── password.ts    # bcrypt hashing (12 rounds)
│   ├── jwt.ts         # JWT manager (jose, HS256)
│   ├── cookies.ts     # HTTP-only cookie manager
│   ├── middleware.ts  # Auth middleware (getAuthUser, requireAuth, requireRole)
│   ├── ownership.ts   # Resource ownership checks
│   └── permissions.ts # RBAC (deterministic, no DB lookup)
├── validation/        # Zod input validation schemas for all API endpoints
│   ├── index.ts       # Re-exports all validators
│   ├── middleware.ts  # validateInput() middleware for request validation
│   ├── sanitize.ts    # Input sanitization (XSS, SQL injection prevention)
│   ├── zambian.ts     # Zambian-specific formats (+260 phones, NRC, ECZ grades)
│   ├── auth.ts        # Auth endpoint schemas (login, register, reset)
│   ├── applications.ts # Application endpoint schemas
│   ├── admin.ts       # Admin endpoint schemas
│   ├── documents.ts   # Document upload schemas
│   ├── notifications.ts # Notification schemas
│   ├── payments.ts    # Payment schemas
│   ├── sessions.ts    # Session schemas
│   └── email.ts       # Email validation schemas
├── base64.ts          # Base64 encoding utilities
├── cors.ts            # CORS handler for Vercel
├── csrf.ts            # CSRF token generation, hashing, and validation
├── db.ts              # Database abstraction (Neon serverless only)
├── emailTemplates.ts  # Email template rendering
├── envValidator.ts    # Environment variable validation at startup
├── errorHandler.ts    # Sanitized error responses (sendSuccess/sendError)
├── fileValidator.ts   # File content validation (magic bytes, MIME type verification)
├── neon-serverless.d.ts # Neon type declarations
├── notificationPolicy.ts # Notification rate limiting and policy enforcement
├── queries.ts         # Typed query builders
├── rateLimiter.ts     # Rate limiting utilities
├── auditLogger.ts     # Audit logging (no PII, retention categories)
├── realtime.ts        # SSE + polling fallback (8s keepalive)
├── realtimeBroker.ts  # SSE connection broker
├── sessions.ts        # Device session manager
├── storage.ts         # R2 storage abstraction
└── urlValidator.ts    # URL validation and open redirect prevention

api-src/               # API source TypeScript (edit these, then bundle)
├── admin.ts           # ?action=dashboard|users|settings|stats|errors|migrate
├── applications.ts    # ?action=details|documents|grades|summary|review|export or ?id=xxx
├── auth.ts            # ?action=login|logout|refresh|session|register|reset-request|reset-confirm
├── bootstrap.ts       # Database bootstrap/seed operations
├── catalog.ts         # ?type=programs|intakes|subjects
├── documents.ts       # ?action=upload|extract (with file content validation)
├── email.ts           # Email sending endpoint
├── health.ts          # ?action=ping|db|env|arcjet (consolidated)
├── notifications.ts   # ?action=preferences|send
├── payments.ts        # ?action=receipt
├── sessions.ts        # ?action=track|list|revoke|revoke-all
├── [...path].ts       # Catch-all for unmatched routes
└── tsconfig.json      # TypeScript config for API

api/                   # Bundled JS files (DO NOT EDIT)
```

### Vercel Function Pattern (Query Parameter Routing)
```typescript
// api/{feature}.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';           // Note: ../lib/ (project root)
import { withArcjetProtection } from '../lib/arcjet';
import { query } from '../lib/db';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return; // Handle OPTIONS preflight

  const action = req.query.action as string;

  try {
    switch (action) {
      case 'action1':
        // Handler logic using process.env for env vars
        return res.status(200).json({ success: true, data: result });
      case 'action2':
        // Another action
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
```

### Conventions
- File naming: `{feature}.ts` (one file per domain, TypeScript)
- Use query parameters for action routing (`?action=xxx`)
- Use `process.env` for environment variables (not `context.env`)
- Import shared utilities from `../lib/` (project root, NOT `./lib/`)
- Return consistent JSON: `{ success: boolean, data?: any, error?: string, code?: string }`
- Handle errors gracefully—never expose stack traces
- Log errors but never log PII
- Add new functionality as cases in existing consolidated endpoints
- Validate all inputs with Zod schemas from `lib/validation/`
- Validate file uploads with `lib/fileValidator.ts` (magic bytes + MIME type)

### API Response Envelope (CRITICAL)
All API endpoints wrap responses via `sendSuccess(res, payload)` from `lib/errorHandler.ts`:
```json
{ "success": true, "data": { ...actual payload... } }
```
The frontend `ApiClient` (`src/services/client.ts`) automatically unwraps this envelope via `unwrapApiResponse()`. Frontend services receive the inner payload directly — never check `response.success` or `response.data` on service results.


The older `src/lib/apiClient.ts` module has been removed. All frontend code now uses `src/services/client.ts` exclusively.
### Security Conventions (Arcjet + Custom Auth + CSRF + CSP)
- Wrap all sensitive routes with `withArcjetProtection()` before handler logic
- Use `requireAuth()` middleware for authenticated routes
- Use `requireRole(['admin', 'super_admin'])` for admin-only routes
- Store tokens in HTTP-only cookies (not localStorage)
- Use separate secrets: `JWT_SECRET` (access), `JWT_REFRESH_SECRET` (refresh)
- Return 403 with code `SECURITY_VIOLATION` for Arcjet blocks
- Return 401 without revealing email/password specificity on login failure
- Rotate refresh tokens on every use (replay attack prevention)
- CSRF tokens required on all state-changing (POST/PUT/DELETE) endpoints
- Security headers enforced via `vercel.json` (CSP, HSTS, X-Frame-Options, etc.)
- File uploads validated with magic byte verification (`lib/fileValidator.ts`)
- URL inputs validated against open redirect attacks (`lib/urlValidator.ts`)
- All user inputs sanitized via `lib/validation/sanitize.ts`
- Frontend sanitization uses `src/lib/sanitize/` (unified module) — never create new sanitizer files
- CSP generation consolidated in `src/lib/securityConfig.ts` — single source for all security config

### Input Validation (CRITICAL)
All API endpoints must validate inputs using Zod schemas from `lib/validation/`:
```typescript
import { validateInput } from '../lib/validation/middleware';
import { loginSchema } from '../lib/validation/auth';

// In handler:
const validated = validateInput(loginSchema, req.body);
if (!validated.success) {
  return res.status(400).json({ success: false, error: validated.error });
}
const { email, password } = validated.data;
```

## Build & Deployment

### Frontend Commands (All Bun)
| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies (generates bun.lockb) |
| `bun run dev` | Local dev server (port 5173) |
| `bun run build` | Production build with type-check |
| `bun run preview` | Preview production build |
| `bun run test` | Run Vitest tests |
| `bun run lint` | ESLint check |
| `bun run scripts/bundle-api.mjs` | Bundle api-src/ → api/ (legacy) |

### Django Backend Commands (Python)
| Command | Purpose |
|---------|---------|
| `pip install -r requirements.txt` | Install Python dependencies |
| `python manage.py runserver` | Local dev server (port 8000) |
| `python manage.py test` | Run Django tests |
| `pytest` | Run pytest test suite |
| `pytest tests/property/` | Run property-based tests (hypothesis) |
| `celery -A config worker` | Start Celery worker |
| `docker build -t mihas-api .` | Build Docker image |
| `docker-compose up` | Local dev: Django + Redis + Celery |

### Environment Variables

#### Frontend (Vercel)
```
# API Base URL (switches between Vercel backend and Django API)
NEXT_PUBLIC_API_BASE_URL=***REMOVED***/api/v1
```

#### Django Backend (Koyeb)
```
# Django
DJANGO_SETTINGS_MODULE=config.settings.prod
SECRET_KEY=[django-secret-key]
ALLOWED_HOSTS=api.mihas.edu.zm
DEBUG=false

# Database (Neon Postgres - REQUIRED, use pooled connection string)
DATABASE_URL=postgres://[user]:[pass]@[host]/[db]?sslmode=require

# Redis (REQUIRED for Celery)
REDIS_URL=redis://[host]:6379/0
CELERY_BROKER_URL=redis://[host]:6379/0

# Auth (REQUIRED — shared with Vercel backend during dual-run)
JWT_SIGNING_KEY=[shared-jwt-signing-key]

# CORS (REQUIRED)
CORS_ALLOWED_ORIGINS=***REMOVED***
CSRF_TRUSTED_ORIGINS=***REMOVED***

# Email (REQUIRED)
RESEND_API_KEY=[resend-key]
EMAIL_FROM=noreply@mihas.edu.zm

# Storage (REQUIRED — S3/R2)
S3_ENDPOINT_URL=[r2-endpoint]
S3_BUCKET=[bucket-name]
S3_ACCESS_KEY=[access-key]
S3_SECRET_KEY=[secret-key]
```

#### Legacy Vercel Backend (being decommissioned)
```
DATABASE_URL=postgres://[user]:[pass]@[host]/[db]?sslmode=require
JWT_SECRET=[32+ char secret for access tokens]
JWT_REFRESH_SECRET=[32+ char secret for refresh tokens]
ARCJET_KEY=[arcjet-api-key]
RESEND_API_KEY=[resend-key]
EMAIL_FROM=noreply@mihas.edu.zm
```

### Removed Variables (No Longer Needed)
- `SUPABASE_URL` - Migrated to Neon
- `SUPABASE_SERVICE_ROLE_KEY` - Migrated to Neon
- `VITE_SUPABASE_URL` - Migrated to Neon
- `VITE_SUPABASE_ANON_KEY` - Migrated to Neon
- `VITE_TURNSTILE_SITE_KEY` - Cloudflare-specific
- `VITE_ANALYTICS_*` - Analytics removed
- `VITE_SENTRY_DSN` - Sentry removed
- `CLOUDFLARE_AI_*` - AI features removed
- Supabase Auth SDK dependencies - Replaced with custom JWT auth

### Build Optimizations (Already Configured)
- Manual code splitting for vendor chunks (React, forms)
- Terser minification with console.log removal
- Assets <4KB inlined as base64
- Critical CSS inlined in HTML
- Service worker for PWA offline support
- Bun's native bundling for faster builds

## Performance Requirements

| Metric | Target |
|--------|--------|
| First Contentful Paint | <1.5s |
| Largest Contentful Paint | <2.5s |
| Main bundle size | <500KB |
| Lighthouse score | >90 |

### Performance Rules
- Lazy-load all page components with `React.lazy()`
- Avoid `framer-motion`—being phased out for performance
- Use `loading="lazy"` on images below the fold
- Prefer CSS transitions over JS animations
- Debounce search inputs (300ms minimum)

## Key Libraries

### Frontend (TypeScript/Bun)

| Use Case | Library | Notes |
|----------|---------|-------|
| JWT tokens | jose | Bun-native, HS256 signing (legacy backend) |
| Password hashing | bcrypt | 12 rounds minimum (legacy backend) |
| Security perimeter | @arcjet/node | Shield, bot detection, rate limiting (legacy backend) |
| Database (Neon) | @neondatabase/serverless | Neon serverless Postgres (legacy backend) |
| Input validation | zod | Client-side form validation + legacy server-side |
| PDF generation | jspdf, pdf-lib | Server-side preferred |
| Excel export | xlsx, exceljs | Use exceljs for styling |
| File uploads | react-dropzone | With magic byte validation |
| Charts | recharts | Lazy-load chart components |
| Real-time | SSE + polling | Frontend SSE client |
| Property testing | fast-check | Property-based tests in tests/property/ |

### Backend (Python/Django — new)

| Use Case | Library | Notes |
|----------|---------|-------|
| Web framework | Django 5 + DRF | REST API with ViewSets |
| JWT tokens | djangorestframework-simplejwt | HS256, custom claims for RBAC |
| Password hashing | bcrypt (via Django) | 12 rounds, compatible with existing hashes |
| Rate limiting | django-ratelimit | Per-scope limits matching Arcjet config |
| Database | dj-database-url + psycopg2 | Neon Postgres with connection pooling |
| Background tasks | celery + redis | Emails, OCR, bulk ops |
| File storage | django-storages + boto3 | S3/R2 compatible |
| Static files | whitenoise | Compressed static serving |
| API docs | drf-spectacular | OpenAPI 3.0 schema generation |
| OCR | pytesseract | Server-side text extraction |
| Email | resend (Python SDK) | Async via Celery |
| Property testing | hypothesis | Python PBT library |
| Test framework | pytest + pytest-django | With factory_boy for fixtures |

## Configuration Files

| File | Purpose |
|------|---------|
| `vercel.json` | Vercel deployment config + security headers (CSP, HSTS, etc.) |
| `bunfig.toml` | Bun runtime configuration |
| `vite.config.ts` | Vite build settings (simplified) |
| `tailwind.config.js` | Design tokens and theme |
| `tsconfig.json` | TypeScript (strict: false) |
| `vitest.config.ts` | Unit test configuration |

## Removed (Migration Complete)

| Removed | Reason |
|---------|--------|
| `wrangler.toml` | Cloudflare-specific |
| `.cfignore` | Cloudflare-specific |
| `functions/` directory | Fully migrated to `api/` (174 files, 26K lines removed) |
| `api/*/` subdirectories | Consolidated into single-file endpoints |
| `lib/auth/legacy.ts` | Supabase token migration no longer needed |
| Supabase (all) | Fully migrated to Neon Postgres |
| Supabase Realtime | Replaced with Bun-native SSE/polling |
| Supabase Auth SDK | Replaced with custom JWT auth (jose + bcrypt) |
| Sentry | Error monitoring removed |
| Umami | Analytics removed |

## Database Access

**CRITICAL**: This project uses Neon Postgres exclusively. Never use Supabase.

### For AI Assistants
- Use the **Neon MCP** for all database operations
- Never use Supabase MCP - it's not connected to this project
- Connection string format: `DATABASE_URL=postgres://...@...neon.tech/...`
- Neon project ID: `wild-bar-37055823` (mihasApplication)

### Database Schema (26 Tables — Verified 2026-03-27)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User accounts | id, email, first_name, last_name, phone, nationality, role |
| `applications` | Student applications | id, user_id, program, intake, status, version |
| `application_documents` | Uploaded documents per application | id, application_id, document_type, file_url, verification_status |
| `application_grades` | ECZ grade 12 results | id, application_id, subject_id, grade (1-9) |
| `application_interviews` | Interview scheduling | id, application_id, scheduled_at, status |
| `application_status_history` | Status change audit trail | id, application_id, old_status, new_status, changed_by |
| `application_drafts` | Client-side auto-save drafts | id, application_id, draft_data (jsonb) |
| `programs` | Academic programs | id, name, code, institution_id, requirements (jsonb) |
| `intakes` | Enrollment periods | id, name, year, application_deadline, max_capacity |
| `program_intakes` | Program-intake mapping | id, program_id, intake_id, max_capacity, current_enrollment |
| `course_requirements` | Program prerequisites | id, program_id, subject_id, minimum_grade |
| `subjects` | ECZ grade 12 subjects | id, name, code, category, is_core |
| `institutions` | Educational institutions | id, name, code, full_name, type, accreditation_status |
| `payments` | Payment records | id, application_id, user_id, amount, currency, status |
| `documents` | Legacy document table (DROPPED) | Removed — superseded by application_documents |
| `document_migration_log` | Migration tracking (DROPPED) | Removed — migration complete |
| `notifications` | User notifications | id, user_id, title, message, type, is_read, idempotency_key |
| `user_notification_preferences` | Notification settings | id, user_id, email_enabled, push_enabled, quiet_hours |
| `email_queue` | Email send queue with retry | id, recipient_email, subject, body, status, retry_count |
| `device_sessions` | Active device sessions | id, user_id, device_info, ip_hash, last_active |
| `csrf_tokens` | CSRF token hashes (SHA-256) | id, user_id, token_hash, created_at |
| `password_reset_tokens` | Reset tokens (1-hour expiry) | id, user_id, token_hash, expires_at, used |
| `login_attempts` | Login tracking (no PII) | id, email_hash, ip_hash, success, created_at |
| `audit_logs` | Audit trail with retention | id, actor_id, action, entity_type, retention_category |
| `idempotency_keys` | Request deduplication | key (PK), endpoint, response_json, created_at |
| `settings` | System configuration | id, key, value, updated_at |
| `user_permission_overrides` | Per-user permission overrides | id, user_id, permissions (jsonb) |
| `migration_history` | Schema migration history | id, migration_name, applied_at |

### Database Operations
```typescript
import { query } from '../lib/db';

// All queries go through Neon serverless
const result = await query('SELECT * FROM profiles WHERE id = $1', [userId]);
```

## Auth System Architecture

### Token Flow
```
Login → Generate Access (15min) + Refresh (7d) → HTTP-only Cookies
     ↓
API Request → Extract from Cookie/Bearer → Verify JWT → AuthContext
     ↓
Token Expired → Auto-refresh via /api/auth?action=refresh → Rotate both tokens
```

### CSRF Protection Flow
```
Login → Generate CSRF token → Store SHA-256 hash in csrf_tokens table
     ↓
State-changing request → Include CSRF token in X-CSRF-Token header
     ↓
Server → Hash received token → Compare with stored hash → Allow/Deny
```

### Password Reset Flow
```
Request reset → Generate token → Store SHA-256 hash in password_reset_tokens
     ↓
Email link with raw token → User clicks → Verify hash → Single-use consumption
     ↓
Rate limited: 3 requests per email per 15 minutes
```

### Role-Based Access Control
| Role | Permissions (deterministic, no DB lookup) |
|------|------------------------------------------|
| super_admin | Full access: users, applications, programs, payments, documents, analytics, settings |
| admin | Read users, manage applications, verify payments/documents, view analytics |
| reviewer | Read/review applications, read documents |
| student | Own applications, documents, payments, profile only |

### Arcjet Rate Limits
| Route | Limit | Window |
|-------|-------|--------|
| /api/auth/* | 60 requests | 5 minutes |
| /api/sessions/* | 30 requests | 10 minutes |
| /api/admin/* | 60 requests | 10 minutes |
| /api/notifications/* | 50 requests | 10 minutes |
| /api/documents/* | 20 requests | 10 minutes |

### Login Attempt Protection
| Threshold | Action |
|-----------|--------|
| 5 failures per email | 15-minute progressive backoff |
| 10 consecutive failures | 30-minute account lock + notification email |

## Security Headers (vercel.json)

All responses include:
- `Content-Security-Policy` — restricts script/style/connect sources
- `Strict-Transport-Security` — HSTS with 1-year max-age
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Permissions-Policy` — disables camera, microphone, geolocation, payment
- `Referrer-Policy: strict-origin-when-cross-origin`

## Production API Endpoints

### Django API (New — api.mihas.edu.zm)

Base URL: `***REMOVED***/api/v1`

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health/live/` | GET | None | Liveness check (no DB) |
| `/health/ready/` | GET | None | Readiness check (DB + Redis) |
| `/auth/login/` | POST | None | User login |
| `/auth/logout/` | POST | Auth | User logout |
| `/auth/refresh/` | POST | Cookie | Token refresh + rotation |
| `/auth/register/` | POST | None | User registration |
| `/auth/session/` | GET | Auth | Get current session |
| `/auth/password-reset/` | POST | None | Request password reset |
| `/auth/password-reset/confirm/` | POST | None | Confirm password reset |
| `/applications/` | GET/POST | Auth | List/create applications |
| `/applications/{id}/` | GET/PATCH | Auth | Get/update application |
| `/applications/{id}/details/` | GET | Auth | Application details |
| `/applications/{id}/documents/` | GET | Auth | Application documents |
| `/applications/{id}/grades/` | GET/POST | Auth | Application grades |
| `/applications/{id}/summary/` | GET | Auth | Application summary |
| `/applications/{id}/review/` | POST | Admin | Review application |
| `/applications/export/` | GET | Admin | Export applications |
| `/applications/track/` | GET | None | Public tracking |
| `/catalog/programs/` | GET/POST | None/Admin | Programs |
| `/catalog/intakes/` | GET/POST | None/Admin | Intakes |
| `/catalog/subjects/` | GET | None | Subjects |
| `/documents/upload/` | POST | Auth | Document upload |
| `/documents/{id}/extract/` | POST | Auth | OCR extraction |
| `/payments/{id}/receipt/` | GET | Auth | Payment receipt |
| `/payments/{id}/verify/` | POST | Admin | Verify payment |
| `/admin/dashboard/` | GET | Admin | Dashboard stats |
| `/admin/users/` | GET/POST | Admin | User management |
| `/admin/settings/` | GET/POST | Admin | System settings |
| `/sessions/` | GET | Auth | List sessions |
| `/sessions/{id}/revoke/` | POST | Auth | Revoke session |
| `/sessions/revoke-all/` | POST | Auth | Revoke all sessions |
| `/notifications/preferences/` | GET/PUT | Auth | Notification prefs |
| `/notifications/` | POST | Admin | Send notification |
| `/email/send/` | POST | Admin | Send email |
| `/events/stream/` | GET | Auth | SSE real-time events |
| `/docs/` | GET | None | Swagger UI |
| `/redoc/` | GET | None | ReDoc |

### Legacy Vercel Backend (being decommissioned)

Base URL: `***REMOVED***`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health check |
| `/api/health?action=ping` | GET | Simple ping/pong |
| `/api/health?action=db` | GET | Database connectivity check |
| `/api/catalog?type=programs` | GET | List available programs |
| `/api/catalog?type=intakes` | GET | List available intakes |
| `/api/catalog?type=subjects` | GET | List grade 12 subjects |
| `/api/auth?action=login` | POST | User login |
| `/api/auth?action=logout` | POST | User logout |
| `/api/auth?action=session` | GET | Get current session |
| `/api/auth?action=register` | POST | User registration |
| `/api/auth?action=reset-request` | POST | Request password reset |
| `/api/auth?action=reset-confirm` | POST | Confirm password reset |
| `/api/admin` | GET/POST | Admin operations (auth required) |
| `/api/applications` | GET/POST | Application management (auth required) |
| `/api/documents` | POST | Document upload/OCR (auth required) |
| `/api/email` | POST | Email sending (auth required) |
| `/api/payments` | GET/POST | Payment operations (auth required) |
| `/api/sessions` | GET/POST | Session management (auth required) |
| `/api/notifications` | GET/POST | Notification preferences (auth required) |
