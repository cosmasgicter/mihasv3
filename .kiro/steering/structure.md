---
inclusion: always
---

# Project Structure & Code Organization

## Directory Rules

| Directory | Purpose | AI Action |
|-----------|---------|-----------|
| `src/` | React frontend | Primary modification target |
| `api-src/` | API source TypeScript files | Edit these, then run bundle script |
| `api/` | Bundled JS files for Vercel | DO NOT EDIT - auto-generated |
| `lib/` | Shared backend utilities | Used by API endpoints |
| `lib/validation/` | Zod input validation schemas | One file per API domain |
| `tests/` | Test files | Match test type to subdirectory |
| `tests/ui/` | UI component tests | Rendering, accessibility, interaction patterns |
| `migrations/` | DB migrations | Append-only, never modify existing |
| `public/` | Static assets, PWA | Rarely modify |
| `scripts/` | Build/deploy utilities | Reference only, do not modify |
| `docs/` | Documentation | **Do not modify unless explicitly asked** |

## API Development Workflow

1. Edit TypeScript source files in `api-src/`
2. Run `bun run scripts/bundle-api.mjs` to bundle
3. Commit both `api-src/*.ts` AND `api/*.js` files
4. Push to trigger Vercel deployment

**IMPORTANT**: Never edit files in `api/` directly - they are auto-generated!

## Frontend Structure (`src/`)

```
components/
├── ui/            → Primitives (Button, Input, Card, Modal, Toast, ConfirmDialog, PasswordInput, InfoCallout, ErrorDisplay, SaveStatusIndicator)
├── admin/         → Admin dashboard components
├── student/       → Student-facing components
├── application/   → Application flow components (ContinueApplication, etc.)
├── auth/          → Authentication flows
├── forms/         → Form components, wizards
├── layout/        → Layout wrappers
├── navigation/    → Nav components
├── notifications/ → Notification UI
├── pwa/           → PWA install prompts
├── seo/           → SEO meta components
├── icons/         → Icon components
├── eligibility/   → Eligibility check UI
├── dev/           → Developer/debug components
├── examples/      → Example/demo components
└── smoothui/      → Smooth UI animation components

pages/         → Route-level components (register in routes/)
hooks/         → Custom hooks (useXxx.ts) — 50+ hooks (3 subdirs: admin/, auth/, queries/)
services/      → API clients, external integrations
stores/        → Zustand stores (xxxStore.ts)
lib/           → Frontend utilities, configs, security
types/         → TypeScript definitions
contexts/      → React context providers
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
| `securityUtils.ts` | Frontend security utilities |
| `accessibility-utils.ts` | Accessibility helper functions |
| `touch-target-utils.ts` | Touch target size utilities for mobile |
| `performance-utils.ts` | Performance monitoring utilities |

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
import { useAuth } from '@/hooks/useAuth'

// ✅ Use ./ for same-directory imports only
import { helper } from './utils'

// ❌ NEVER use relative paths beyond ./
import { Button } from '../../../components/ui/Button'
```

## File Placement

| Adding | Location | Notes |
|--------|----------|-------|
| Component | `src/components/{domain}/` | domain: admin, student, application, auth, forms, ui, etc. |
| Hook | `src/hooks/useXxx.ts` | Must prefix with `use` |
| API endpoint | `api-src/{feature}.ts` | Add action to existing consolidated endpoint |
| Page | `src/pages/` | Must register route in `src/routes/` |
| Type | `src/types/` or co-locate | Co-locate component-specific types |
| Store | `src/stores/xxxStore.ts` | Follow existing Zustand patterns |
| Validation schema | `lib/validation/{domain}.ts` | One file per API domain, export from index.ts |
| UI test | `tests/ui/{component}.test.tsx` | Component rendering and accessibility tests |
| Migration | `migrations/add_{feature}.sql` | Append-only, use IF NOT EXISTS |

## State Management

Choose based on data type:
1. **Server data** → React Query (`services/`)
2. **Global app state** → Zustand (`stores/`)
3. **Form state** → React Hook Form + Zod (component-level)
4. **UI-only state** → `useState` (component-level)

## Code Principles

- Co-locate related files (component + test + styles)
- Export via `index.ts` for clean public APIs
- One main export per file
- Extract to hooks/utilities when component exceeds 200 lines
- Organize by feature domain, not technical layer

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

| Type | Directory | Framework | Count |
|------|-----------|-----------|-------|
| Unit tests | `tests/unit/` | Vitest | 60+ test files |
| Property tests | `tests/property/` | fast-check + Vitest | 85+ test files |
| UI tests | `tests/ui/` | Vitest | 3 test files |
| Integration | `tests/integration/` | Vitest | 6 test files |
| E2E flows | `tests/e2e/` | Playwright | 2 spec files |
| Auth tests | `tests/auth/` | Vitest | 1 test file |

### Test Conventions
- Use `// @vitest-environment node` directive for tests using Node.js fs/path modules
- Property tests use `numRuns: 10` for fast CI execution
- UI tests in `tests/ui/` cover component rendering, accessibility, and interaction patterns
- Test files co-located with source when component-specific, otherwise in `tests/`
