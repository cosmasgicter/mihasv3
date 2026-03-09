# MIHAS - Application Management System 

## Project Overview

MIHAS (Mukuba Institute of Health and Allied Sciences) Application System V3 — a production TypeScript/React admissions portal for student applications, document management, payments, and interview scheduling.

**Production URL**: ***REMOVED***

## Project Structure

```
mihasv3/
├── src/                  # React frontend (components, hooks, pages, stores, services)
├── api-src/              # API source TypeScript (edit these)
├── api/                  # Bundled Vercel Functions (DO NOT EDIT — auto-generated)
├── lib/                  # Shared backend utilities (auth, validation, db, security)
│   ├── auth/             # JWT, bcrypt, cookies, RBAC, middleware
│   └── validation/       # Zod input validation schemas per API domain
├── migrations/           # Database migrations (append-only)
├── tests/                # Unit, property, integration, E2E tests
│   ├── unit/             # Vitest unit tests
│   ├── property/         # fast-check property-based tests
│   ├── integration/      # Integration tests
│   └── e2e/              # Playwright E2E specs
├── public/               # Static assets, PWA files
├── scripts/              # Build/deploy utilities
├── docs/                 # Documentation
├── vercel.json           # Vercel config + security headers
└── package.json          # Dependencies (Bun)
```

## Quick Start

```bash
bun install
bun run dev
```

### Build & Deploy
```bash
bun run build                      # Production build
bun run scripts/bundle-api.mjs     # Bundle api-src/ → api/
bun run test                       # Run tests
bun run lint                       # ESLint check
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + Radix UI |
| State | Zustand (client) + React Query (server) |
| Forms | React Hook Form + Zod |
| Backend | Vercel Serverless Functions |
| Database | Neon Serverless Postgres |
| Auth | Custom JWT (jose) + bcrypt, HTTP-only cookies |
| Security | Arcjet (WAF) + CSRF tokens + CSP headers + Zod validation |
| Email | Resend (queue with retry) |
| OCR | tesseract.js |
| Real-time | SSE + polling |
| Testing | Vitest + fast-check + Playwright |

## Key Features

- 4-step application wizard with 8-second auto-save
- Enterprise eligibility checking (HPCZ, GNC/NMCZ, ECZ)
- Role-based access control (student, admin, reviewer, super_admin)
- Document upload with OCR and magic byte validation
- Payment tracking and receipt generation
- Interview scheduling
- PWA with offline capability
- Mobile-first responsive design

## Security

- CSRF protection on all state-changing endpoints
- Content Security Policy, HSTS, X-Frame-Options via `vercel.json`
- Arcjet shield rules, bot detection, rate limiting
- JWT tokens in HTTP-only cookies with refresh rotation
- Zod input validation on all API endpoints
- File content validation (magic bytes + MIME type)
- URL validation against open redirects
- Login attempt tracking with progressive backoff and account lockout
- Audit logging with retention categories (standard 90d / security 365d)
- No PII in logs — email/IP stored as SHA-256 hashes only

## API Endpoints

Base URL: `***REMOVED***`

| Endpoint | Description |
|----------|-------------|
| `/api/auth` | Login, logout, register, session, password reset |
| `/api/admin` | Dashboard, user management, settings |
| `/api/applications` | Application CRUD, review, export |
| `/api/catalog` | Programs, intakes, subjects |
| `/api/documents` | Document upload, OCR extraction |
| `/api/email` | Email sending |
| `/api/health` | Health checks (ping, db, env) |
| `/api/notifications` | Notification preferences |
| `/api/payments` | Payment operations |
| `/api/sessions` | Device session management |

All endpoints use query parameter routing (`?action=xxx`) and return `{ success, data }` envelope.

## Database

Neon Serverless Postgres (project: `wild-bar-37055823`). 28 tables total:

**Core application tables**: `profiles`, `applications`, `application_documents`, `application_grades`, `application_interviews`, `application_status_history`, `application_drafts`

**Catalog tables**: `programs`, `intakes`, `program_intakes`, `course_requirements`, `subjects`, `institutions`

**Financial**: `payments`

**Communication**: `notifications`, `user_notification_preferences`, `email_queue`

**Security & auth**: `csrf_tokens`, `password_reset_tokens`, `login_attempts`, `device_sessions`, `idempotency_keys`

**System**: `audit_logs`, `settings`, `user_permission_overrides`, `documents` (legacy, unused), `document_migration_log`, `migration_history`

## Documentation

- **Developer Onboarding**: `docs/DEVELOPER_ONBOARDING.md`
- **API Reference**: `docs/API_REFERENCE.md`
- **Deployment Guide**: `docs/DEPLOYMENT_GUIDE.md`
- **Design System**: `docs/DESIGN_SYSTEM.md`
- **Changelog**: `docs/CHANGELOG.md`

## Support

- **Technical**: ***REMOVED***
- **Admissions**: ***REMOVED***

---

**Version**: 3.2 (Forensic DB Analysis Complete)
**Status**: Production
**Hosting**: Vercel
**Last Updated**: 2026-03-09
