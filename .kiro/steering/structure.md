---
inclusion: always
---

# Project Structure & Code Organization

## Directory Rules

| Directory | Purpose | AI Action |
|-----------|---------|-----------|
| `src/` | React frontend | Primary modification target |
| `api/` | Vercel Serverless Functions | Use `_lib/` for shared code |
| `tests/` | Test files | Match test type to subdirectory |
| `supabase/migrations/` | DB migrations | Append-only, never modify existing |
| `public/` | Static assets, PWA | Rarely modify |
| `scripts/` | Build/deploy utilities | Reference only, do not modify |
| `docs/` | Documentation | **Do not modify unless explicitly asked** |
| `functions/` | **DEPRECATED** - Cloudflare | Being migrated to `api/` |

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
| API endpoint | `api/{feature}/` | feature: admin, applications, auth, documents, notifications, payments |
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

Structure:
- `_lib/` → Shared utilities (cors, auth helpers, response builders)
- Feature directories: `admin/`, `applications/`, `auth/`, `documents/`, `notifications/`, `payments/`

Pattern:
```typescript
// api/{feature}/[action].ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Use helpers from _lib/
  // Access env via process.env
}
```

## Removed Directories (Migration Cleanup)

| Directory | Status |
|-----------|--------|
| `functions/ai/` | REMOVED - AI features deleted |
| `functions/analytics/` | REMOVED - Analytics deleted |
| `functions/mcp/` | REMOVED - MCP integration deleted |
| `functions/` | DEPRECATED - Migrating to `api/` |

## Testing

| Type | Directory | Framework |
|------|-----------|-----------|
| Unit tests | `tests/unit/` | Vitest |
| Property tests | `tests/property/` | fast-check |
| Integration | `tests/integration/` | Vitest |
| E2E flows | `tests/e2e/` | Playwright |
