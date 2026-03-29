---
inclusion: always
---

# Project Structure & Code Organization

## Directory Rules

| Directory | Purpose | AI Action |
|-----------|---------|-----------|
| `src/` | React frontend | Primary modification target |
| `django_api/` | Django backend (Python) | New backend — primary development target |
| `django_api/apps/` | Django apps (accounts, applications, documents, catalog, common) | Feature code |
| `django_api/config/` | Django project config + settings | Configuration |
| `api-src/` | Legacy API source TypeScript files | **BEING REPLACED** — edit only for legacy fixes |
| `api/` | Bundled JS files for Vercel | DO NOT EDIT - auto-generated, **BEING REPLACED** |
| `lib/` | Shared backend utilities (legacy) | **BEING REPLACED** by Django apps |
| `lib/validation/` | Zod input validation schemas (legacy) | **BEING REPLACED** by DRF serializers |
| `tests/` | Frontend + legacy test files | Match test type to subdirectory |
| `tests/ui/` | UI component tests | Rendering, accessibility, interaction patterns |
| `tests/property/` | Frontend property tests (fast-check) | Legacy property tests |
| `django_api/tests/` | Django backend tests | pytest + hypothesis |
| `django_api/tests/property/` | Django property tests (hypothesis) | PBT for backend |
| `django_api/tests/contract/` | Contract parity tests | Vercel vs Django response comparison |
| `migrations/` | DB migrations (legacy SQL) | Append-only, never modify existing |
| `public/` | Static assets, PWA | Rarely modify |
| `scripts/` | Build/deploy utilities | Reference only, do not modify |
| `docs/` | Documentation | **Do not modify unless explicitly asked** |

## API Development Workflow

### Django Backend (New — Primary)

1. Edit Python source files in `django_api/apps/`
2. Run `pytest` to verify tests pass
3. Build Docker image: `docker build -t mihas-api .`
4. Deploy to Koyeb

### Legacy Vercel Backend (Being Decommissioned)

1. Edit TypeScript source files in `api-src/`
2. Run `bun run scripts/bundle-api.mjs` to bundle
3. Commit both `api-src/*.ts` AND `api/*.js` files
4. Push to trigger Vercel deployment

**IMPORTANT**: Never edit files in `api/` directly - they are auto-generated!

## Frontend Structure (`src/`)

```
components/
├── ui/            → Primitives (Button, Input, Card, Modal, Toast, ConfirmDialog, PasswordInput, InfoCallout, ErrorDisplay, SaveStatusIndicator, ErrorBoundary, ResponsiveLayout, skeletons/)
├── admin/         → Admin dashboard components
├── student/       → Student-facing components
├── application/   → Application flow components (ContinueApplication, etc.)
├── auth/          → Authentication flows (AuthLayout lives here)
├── forms/         → Form components, wizards
├── layout/        → Layout wrappers
├── navigation/    → Nav components
├── notifications/ → Notification UI (NotificationPreferences lives here)
├── pwa/           → PWA install prompts
├── seo/           → SEO meta components
├── icons/         → Icon components
├── dev/           → Developer/debug components
├── examples/      → Example/demo components
└── smoothui/      → Smooth UI animation components

pages/         → Route-level components (register in routes/)
hooks/         → Custom hooks (useXxx.ts) — 50+ hooks (3 subdirs: admin/, auth/, queries/)
services/      → API clients, external integrations (notifications.ts is canonical)
stores/        → Zustand stores (xxxStore.ts)
lib/           → Frontend utilities, configs, security (CANONICAL for all utilities)
lib/sanitize/  → Unified sanitization API
types/         → TypeScript definitions
contexts/      → React context providers (AuthContext is canonical for auth)
routes/        → Route config and guards
```

### Key Frontend Utilities (`src/lib/`)
| File | Purpose |
|------|---------|
| `csrfToken.ts` | CSRF token management for state-changing requests |
| `secureStorage.ts` | Encrypted localStorage wrapper |
| `urlSafety.ts` | Frontend URL validation and open redirect prevention |
| `localStorageCache.ts` | TTL-based localStorage caching |
| `apiErrorToast.ts` | Standardized API error toast notifications |
| `securityConfig.ts` | CSP generation, security headers, rate limiting, session security |
| `accessibility-utils.ts` | All accessibility helpers (focus trap, screen reader, contrast) |
| `touch-target-utils.ts` | Touch target size utilities for mobile |
| `performance-utils.ts` | Performance monitoring utilities |
| `sanitize/index.ts` | Unified sanitization API (HTML, log, text, file path, email, PII) |
| `logger.ts` | Structured logger with timestamps (single canonical logger) |
| `errorMessages.ts` | Error codes, categories, retry logic, domain-specific messages |
| `draftManager.ts` | Draft management with race-condition protection and cleanup |

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Components | PascalCase `.tsx` | `ApplicationWizard.tsx` |
| Hooks | `use` + PascalCase `.ts` | `useApplicationForm.ts` |
| Services | camelCase `.ts` | `apiClient.ts` |
| Types | PascalCase | `ApplicationFormData` |
| API Functions | kebab-case `.ts` | `send-email.ts` |
| Stores | camelCase + `Store` | `applicationStore.ts` |
| Validators | domain `.ts` in `lib/validation/` | `auth.ts`, `applications.ts` |

## Import Rules

```typescript
// ✅ ALWAYS use @/ alias for cross-directory imports
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'

// ✅ Use ./ for same-directory imports only
import { helper } from './utils'

// ❌ NEVER use relative paths beyond ./
import { Button } from '../../../components/ui/Button'
```

### Canonical Import Paths (Post-Consolidation)

These are the single source of truth for each domain. Do NOT import from deprecated paths.

| Domain | Canonical Import | Deprecated (DO NOT USE) |
|--------|-----------------|------------------------|
| Utilities | `@/lib/utils` | `@/utils/file-helpers` |
| Accessibility | `@/lib/accessibility-utils` | `@/utils/keyboardNavigation`, `@/utils/contrastChecker` |
| Sanitization | `@/lib/sanitize` | `@/lib/sanitizer`, `@/lib/securityEnhancements` |
| Logger | `@/lib/logger` | `@/utils/logger` |
| Error messages | `@/lib/errorMessages` | `@/utils/errorMessages` |
| Draft management | `@/lib/draftManager` | `@/lib/draftCleanup` |
| Security config | `@/lib/securityConfig` | `@/lib/securityPatches`, `@/lib/securityHeaders`, `@/lib/securityUtils` |
| Network status | `@/hooks/useNetworkStatus` | `@/lib/networkChecker`, `@/lib/networkDiagnostics` |
| Error handling | `@/hooks/useErrorHandler` | `@/hooks/useErrorHandling` |
| Toast | `@/hooks/useToast` | `@/stores/toastStore` |
| Notifications | `@/services/notifications` | `@/lib/notificationService`, `@/lib/adminNotifications` |
| Notification prefs | `@/hooks/queries/useNotificationQueries` | `@/hooks/useNotificationPreferences` |
| Application queries | `@/hooks/queries/useApplicationDataQueries` | `@/hooks/useApiServices` (application hooks) |
| Auth context | `@/contexts/AuthContext` | `@/hooks/useAuth` (deprecated shim) |
| ErrorBoundary | `@/components/ui/ErrorBoundary` | `@/components/ErrorBoundary` |
| DashboardSkeleton | `@/components/ui/skeletons/DashboardSkeleton` | `@/components/student/DashboardSkeleton`, `@/components/admin/DashboardSkeleton` |

ESLint `no-restricted-imports` rules enforce these canonical paths at error level.

## File Placement

| Adding | Location | Notes |
|--------|----------|-------|
| Component | `src/components/{domain}/` | domain: admin, student, application, auth, forms, ui, etc. |
| Hook | `src/hooks/useXxx.ts` | Must prefix with `use` |
| Frontend utility | `src/lib/` | Canonical directory — NOT `src/utils/` |
| Sanitization function | `src/lib/sanitize/` | Unified sanitization module |
| API endpoint | `api-src/{feature}.ts` | Add action to existing consolidated endpoint |
| Page | `src/pages/` | Must register route in `src/routes/` |
| Type | `src/types/` or co-locate | Co-locate component-specific types |
| Store | `src/stores/xxxStore.ts` | Follow existing Zustand patterns |
| Validation schema | `lib/validation/{domain}.ts` | One file per API domain, export from index.ts |
| UI test | `tests/ui/{component}.test.tsx` | Component rendering and accessibility tests |
| Migration | `migrations/add_{feature}.sql` | Append-only, use IF NOT EXISTS |

## State Management

Choose based on data type:
1. **Server data** → React Query (`services/` and `hooks/queries/`)
2. **Global app state** → Zustand (`stores/`)
3. **Global loading state** → Zustand (`stores/loadingStore.ts`)
4. **Component loading state** → `hooks/useLoadingState.ts` (with min-duration)
5. **Form state** → React Hook Form + Zod (component-level)
6. **UI-only state** → `useState` (component-level)

## Code Principles

- Co-locate related files (component + test + styles)
- Export via `index.ts` for clean public APIs
- One main export per file
- Extract to hooks/utilities when component exceeds 200 lines
- Organize by feature domain, not technical layer
- `src/lib/` is the canonical directory for all frontend utilities — never add new utilities to `src/utils/`
- All sanitization goes through `src/lib/sanitize/` — never create new sanitizer files
- All async effects must have proper cleanup (AbortController for fetch, clearInterval/clearTimeout for timers, removeEventListener for listeners)
- Never use deprecated `MediaQueryList.addListener`/`removeListener` — use `addEventListener('change', ...)`

## API Functions (`api-src/` → `api/`)

**Source files in `api-src/`** (TypeScript, edit these):
```
api-src/                # Source TypeScript files
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
```

**Bundled files in `api/`** (JavaScript, auto-generated — DO NOT EDIT):
```
api/
├── admin.js           ├── email.js
├── applications.js    ├── health.js
├── auth.js            ├── notifications.js
├── bootstrap.js       ├── payments.js
├── catalog.js         ├── sessions.js
├── documents.js       └── [...path].js
```

**Shared utilities at PROJECT ROOT** (not api/lib/):
```
lib/                   # Shared backend utilities
├── arcjet.ts          # Security perimeter (shield, bot, rate limits)
├── auth.ts            # Auth middleware exports (re-exports from auth/)
├── auth/              # Auth components
│   ├── password.ts    # bcrypt hashing (12 rounds)
│   ├── jwt.ts         # JWT manager (jose, HS256)
│   ├── cookies.ts     # HTTP-only cookie manager
│   ├── middleware.ts  # getAuthUser, requireAuth, requireRole
│   ├── ownership.ts   # Resource ownership checks
│   └── permissions.ts # RBAC (deterministic, no DB lookup)
├── validation/        # Zod input validation schemas
│   ├── index.ts       # Re-exports all validators
│   ├── middleware.ts  # validateInput() middleware
│   ├── sanitize.ts    # XSS/SQL injection sanitization
│   ├── zambian.ts     # Zambian formats (+260, NRC, ECZ grades)
│   ├── auth.ts        # Auth schemas
│   ├── applications.ts # Application schemas
│   ├── admin.ts       # Admin schemas
│   ├── documents.ts   # Document schemas
│   ├── notifications.ts # Notification schemas
│   ├── payments.ts    # Payment schemas
│   ├── sessions.ts    # Session schemas
│   └── email.ts       # Email schemas
├── base64.ts          # Base64 encoding utilities
├── cors.ts            # CORS handler
├── csrf.ts            # CSRF token generation/validation (SHA-256 hashed)
├── db.ts              # Database abstraction (Neon serverless only)
├── emailTemplates.ts  # Email template rendering
├── envValidator.ts    # Environment variable validation
├── errorHandler.ts    # Sanitized errors (sendSuccess/sendError envelope)
├── fileValidator.ts   # File content validation (magic bytes, MIME types)
├── neon-serverless.d.ts # Neon type declarations
├── notificationPolicy.ts # Notification rate limiting/policy
├── queries.ts         # Typed query builders
├── rateLimiter.ts     # Rate limiting utilities
├── auditLogger.ts     # Audit logging (no PII, retention categories)
├── realtime.ts        # SSE + polling (8s keepalive)
├── realtimeBroker.ts  # SSE connection broker
├── sessions.ts        # Device session manager
├── storage.ts         # R2 storage abstraction
└── urlValidator.ts    # URL validation, open redirect prevention
```

**Pattern** (query parameter routing with Arcjet protection + validation):
```typescript
// api-src/{feature}.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { withArcjetProtection } from '../lib/arcjet';
import { requireAuth, requireRole } from '../lib/auth';
import { validateInput } from '../lib/validation/middleware';
import { someSchema } from '../lib/validation/feature';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  const action = req.query.action as string;
  
  switch (action) {
    case 'action1':
      // Validate input
      const validated = validateInput(someSchema, req.body);
      break;
    case 'protected':
      const user = await requireAuth(req);
      break;
    case 'admin-only':
      const admin = await requireRole(req, ['admin', 'super_admin']);
      break;
    default:
      return res.status(400).json({ success: false, error: 'Invalid action' });
  }
}

export default withArcjetProtection(handler, 'general');
```

## API Client Architecture

All frontend code uses a single API client: `src/services/client.ts` — the canonical `ApiClient` class that automatically unwraps the `{ success, data }` envelope via `unwrapApiResponse()`. Import as `apiClient` from `@/services/client`.

All API endpoints return `{ success: true, data: payload }` via `sendSuccess()` in `lib/errorHandler.ts`. The client unwraps this internally. **Never manually check `response.success` or access `response.data`** on service results — you get the inner payload directly.

The older `src/lib/apiClient.ts` module has been removed.

## Database Migrations

```
migrations/
├── add_csrf_tokens_table.sql           # CSRF token storage
├── add_password_reset_tokens_table.sql # Password reset tokens
├── add_login_attempts_table.sql        # Login attempt tracking
├── add_audit_retention_category.sql    # Audit log retention categories
├── add_idempotency_and_status_history.sql # Idempotency keys + status history columns
├── normalize_data.sql                  # Data normalization (phone, nationality)
├── seed_and_normalize_data.sql         # Schema additions + data seeding
├── seed_program_intakes_and_requirements.sql # Program-intake links + course requirements
├── fix_forensic_analysis_round2.sql    # Round 2 forensic fixes
├── apply-migrations.ts                 # Migration runner script
└── RLS_REPLACEMENT.md                  # RLS migration documentation
```

All migrations use `IF NOT EXISTS` for idempotent re-runs. Never modify existing migration files — create new ones.

## Removed Directories (Migration Complete)

| Directory | Status |
|-----------|--------|
| `functions/` | DELETED - Fully migrated to `api/` (174 files removed) |
| `lib/auth/legacy.ts` | DELETED - Supabase token migration no longer needed |
| `api/admin/` | CONSOLIDATED into `api/admin.ts` |
| `api/applications/` | CONSOLIDATED into `api/applications.ts` |
| `api/auth/` | CONSOLIDATED into `api/auth.ts` |
| `api/catalog/` | CONSOLIDATED into `api/catalog.ts` |
| `api/documents/` | CONSOLIDATED into `api/documents.ts` |
| `api/notifications/` | CONSOLIDATED into `api/notifications.ts` |
| `api/payments/` | CONSOLIDATED into `api/payments.ts` |
| `api/sessions/` | CONSOLIDATED into `api/sessions.ts` |

## Testing

### Frontend Tests (Vitest/fast-check)

| Type | Directory | Framework | Count |
|------|-----------|-----------|-------|
| Unit tests | `tests/unit/` | Vitest | 60+ test files |
| Property tests | `tests/property/` | fast-check + Vitest | 85+ test files |
| UI tests | `tests/ui/` | Vitest | 3 test files |
| Integration | `tests/integration/` | Vitest | 6 test files |
| E2E flows | `tests/e2e/` | Playwright | 2 spec files |
| Auth tests | `tests/auth/` | Vitest | 1 test file |

### Django Backend Tests (pytest/hypothesis)

| Type | Directory | Framework |
|------|-----------|-----------|
| Unit tests | `django_api/tests/unit/` | pytest + pytest-django |
| Property tests | `django_api/tests/property/` | hypothesis |
| Contract tests | `django_api/tests/contract/` | pytest (Vercel vs Django parity) |

### Test Conventions
- Frontend: Use `// @vitest-environment node` directive for tests using Node.js fs/path modules
- Frontend: Property tests use `numRuns: 10` for fast CI execution
- Frontend: UI tests in `tests/ui/` cover component rendering, accessibility, and interaction patterns
- Django: Property tests use `@settings(max_examples=100)` for hypothesis
- Django: Use `factory_boy` for model factories
- Django: Contract tests compare Vercel vs Django responses for parity verification
- Django: Tag property tests with `# Feature: python-backend-migration, Property {N}: {title}`
