---
inclusion: always
---

# Project Structure & Code Organization

## Directory Rules

| Directory | Purpose | AI Action |
|-----------|---------|-----------|
| `src/` | React frontend | Primary modification target |
| `api/` | Vercel Serverless Functions (8 consolidated endpoints) | Use `lib/` for shared code |
| `tests/` | Test files | Match test type to subdirectory |
| `supabase/migrations/` | DB migrations | Append-only, never modify existing |
| `public/` | Static assets, PWA | Rarely modify |
| `scripts/` | Build/deploy utilities | Reference only, do not modify |
| `docs/` | Documentation | **Do not modify unless explicitly asked** |

## Frontend Structure (`src/`)

```
components/
├── ui/        → Primitives (Button, Input, Card, Modal)
├── admin/     → Admin dashboard components
├── student/   → Student-facing components
├── auth/      → Authentication flows
└── forms/     → Form components, wizards

pages/         → Route-level components (register in routes/)
hooks/         → Custom hooks (useXxx.ts)
services/      → API clients, external integrations
stores/        → Zustand stores (xxxStore.ts)
lib/           → Utilities, configs, supabase client
types/         → TypeScript definitions
contexts/      → React context providers
routes/        → Route config and guards
```

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Components | PascalCase `.tsx` | `ApplicationWizard.tsx` |
| Hooks | `use` + PascalCase `.ts` | `useApplicationForm.ts` |
| Services | camelCase `.ts` | `supabaseClient.ts` |
| Types | PascalCase | `ApplicationFormData` |
| API Functions | kebab-case `.ts` | `send-email.ts` |
| Stores | camelCase + `Store` | `applicationStore.ts` |

## Import Rules

```typescript
// ✅ ALWAYS use @/ alias for cross-directory imports
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

// ✅ Use ./ for same-directory imports only
import { helper } from './utils'

// ❌ NEVER use relative paths beyond ./
import { Button } from '../../../components/ui/Button'
```

## File Placement

| Adding | Location | Notes |
|--------|----------|-------|
| Component | `src/components/{domain}/` | domain: admin, student, auth, forms, ui |
| Hook | `src/hooks/useXxx.ts` | Must prefix with `use` |
| API endpoint | `api/{feature}.ts` | Add action to existing consolidated endpoint |
| Page | `src/pages/` | Must register route in `src/routes/` |
| Type | `src/types/` or co-locate | Co-locate component-specific types |
| Store | `src/stores/xxxStore.ts` | Follow existing Zustand patterns |

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

## API Functions (`api/`)

**Consolidated Structure** (Vercel Hobby plan limit: 12 functions):
```
lib/                   # Shared utilities at PROJECT ROOT (not api/lib/)
├── arcjet.ts          # Security perimeter (shield, bot, rate limits)
├── auth.ts            # Auth middleware exports
├── auth/              # Auth components
│   ├── password.ts    # bcrypt hashing
│   ├── jwt.ts         # JWT manager (jose)
│   ├── cookies.ts     # HTTP-only cookies
│   ├── middleware.ts  # getAuthUser, requireAuth, requireRole
│   ├── permissions.ts # RBAC (deterministic)
│   └── legacy.ts      # Supabase migration support
├── cors.ts            # CORS handler
├── db.ts              # Database abstraction (Supabase/Neon)
├── queries.ts         # Typed query builders
├── errorHandler.ts    # Sanitized errors
├── auditLogger.ts     # Audit logging
├── realtime.ts        # SSE + polling
└── sessions.ts        # Device session manager

api/                   # Vercel Serverless Functions (10 endpoints)
├── admin.ts           # ?action=dashboard|users|settings|stats|errors|migrate
├── applications.ts    # ?action=details|documents|grades|summary|review or ?id=xxx
├── auth.ts            # ?action=login|logout|refresh|session|register
├── catalog.ts         # ?type=programs|intakes|subjects
├── documents.ts       # ?action=upload|extract
├── health.ts          # ?action=ping|db|env|arcjet (consolidated)
├── notifications.ts   # ?action=preferences|send
├── payments.ts        # ?action=receipt
├── sessions.ts        # ?action=track|list|revoke|revoke-all
└── [...path].ts       # Catch-all for unmatched routes
```

**Pattern** (query parameter routing with Arcjet protection):
```typescript
// api/{feature}.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';           // Note: ../lib/ (project root)
import { withArcjetProtection } from '../lib/arcjet';
import { requireAuth, requireRole } from '../lib/auth';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  const action = req.query.action as string;
  
  switch (action) {
    case 'action1':
      // Public action
      break;
    case 'protected':
      const user = await requireAuth(req);
      // Authenticated action
      break;
    case 'admin-only':
      const admin = await requireRole(req, ['admin', 'super_admin']);
      // Admin action
      break;
    default:
      return res.status(400).json({ success: false, error: 'Invalid action' });
  }
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
```

**Adding new functionality**: Add a new `case` to the appropriate consolidated endpoint's switch statement. Wrap with appropriate auth middleware.

## Removed Directories (Migration Complete)

| Directory | Status |
|-----------|--------|
| `functions/` | DELETED - Fully migrated to `api/` (174 files removed) |
| `api/admin/` | CONSOLIDATED into `api/admin.ts` |
| `api/applications/` | CONSOLIDATED into `api/applications.ts` |
| `api/auth/` | CONSOLIDATED into `api/auth.ts` |
| `api/catalog/` | CONSOLIDATED into `api/catalog.ts` |
| `api/documents/` | CONSOLIDATED into `api/documents.ts` |
| `api/notifications/` | CONSOLIDATED into `api/notifications.ts` |
| `api/payments/` | CONSOLIDATED into `api/payments.ts` |
| `api/sessions/` | CONSOLIDATED into `api/sessions.ts` |

## Testing

| Type | Directory | Framework |
|------|-----------|-----------|
| Unit tests | `tests/unit/` | Vitest |
| Property tests | `tests/property/` | fast-check |
| Integration | `tests/integration/` | Vitest |
| E2E flows | `tests/e2e/` | Playwright |
