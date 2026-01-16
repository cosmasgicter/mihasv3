---
inclusion: always
---

# Project Structure & Code Organization

## Directory Rules

| Directory | Purpose | AI Action |
|-----------|---------|-----------|
| `src/` | React frontend | Primary modification target |
| `functions/` | Cloudflare API endpoints | Use `_lib/` for shared code |
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
| API Functions | kebab-case `.js` | `send-email.js` |
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
| API endpoint | `functions/{feature}/` | feature: admin, applications, auth, documents, notifications, payments |
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

## API Functions (`functions/`)

Structure:
- `_lib/` → Shared utilities (auth helpers, response builders)
- `_middleware.js` → Global CORS, auth, error handling
- Feature directories: `admin/`, `applications/`, `auth/`, `documents/`, `notifications/`, `payments/`

Pattern:
```javascript
// functions/{feature}/action.js
export async function onRequest(context) {
  // Use helpers from _lib/
}
```

## Testing

| Type | Directory | Framework |
|------|-----------|-----------|
| E2E flows | `tests/e2e/` | Playwright |
| API tests | `tests/api/` | Playwright |
| Unit tests | `tests/unit/` | Vitest |
| Integration | `tests/integration/` | Playwright |
