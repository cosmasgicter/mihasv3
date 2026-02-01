---
inclusion: always
---

# Technology Stack & Development Conventions

## Stack Overview

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Bun | All dev and prod commands use Bun |
| UI Framework | React 18 + TypeScript | Functional components only |
| Build Tool | Vite + Bun | Use `bunx --bun vite` for builds |
| Hosting | Vercel Free Plan | Static + Serverless Functions |
| Styling | Tailwind CSS | Custom design tokens in `tailwind.config.js` |
| Components | Radix UI | Accessible primitives—prefer over custom implementations |
| Forms | React Hook Form + Zod | All forms must have Zod schemas |
| State | Zustand (client), React Query (server) | No Redux, SSE/polling for real-time |
| Routing | React Router v6 | Lazy-load all page components |
| Backend | Vercel Functions + DB Abstraction | Custom Bun-native auth, Supabase/Neon Postgres |
| Security | Arcjet | Shield rules, bot detection, rate limiting |
| Auth | Custom JWT (jose) | HTTP-only cookies, bcrypt passwords |
| Email | Resend | Queue with retry on failure |
| OCR | tesseract.js | Only AI feature retained |

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

```
api/
├── lib/               # Shared utilities (NOTE: renamed from _lib for Vercel compatibility)
│   ├── arcjet.ts      # Arcjet security perimeter (shield, bot, rate limits)
│   ├── auth.ts        # Auth middleware (getAuthUser, requireAuth, requireRole)
│   ├── auth/          # Auth components
│   │   ├── password.ts   # bcrypt hashing (12 rounds)
│   │   ├── jwt.ts        # JWT manager (jose, HS256)
│   │   ├── cookies.ts    # HTTP-only cookie manager
│   │   ├── middleware.ts # Auth middleware
│   │   ├── permissions.ts # RBAC (deterministic, no DB lookup)
│   │   └── legacy.ts     # Supabase token migration support
│   ├── cors.ts        # CORS handler for Vercel
│   ├── db.ts          # Database abstraction (Supabase REST / Neon serverless)
│   ├── queries.ts     # Typed query builders
│   ├── errorHandler.ts # Sanitized error responses
│   ├── auditLogger.ts # Audit logging (no PII)
│   ├── realtime.ts    # SSE + polling fallback
│   └── sessions.ts    # Device session manager
├── admin.ts           # ?action=dashboard|users|settings (Arcjet: 20/10min)
├── applications.ts    # ?action=details|documents|grades|summary|review
├── auth.ts            # ?action=login|logout|refresh|session|register (Arcjet: 5/5min)
├── catalog.ts         # ?type=programs|intakes|subjects
├── documents.ts       # ?action=upload|extract
├── notifications.ts   # ?action=preferences|send (Arcjet: 50/10min)
├── payments.ts        # ?action=receipt
├── realtime.ts        # ?action=connect|poll (SSE/polling)
└── sessions.ts        # ?action=track|list|revoke|revoke-all (Arcjet: 30/10min)
```

### Vercel Function Pattern (Query Parameter Routing)
```typescript
// api/{feature}.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './lib/cors';
import { supabaseAdmin } from './lib/supabaseClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
```

### Conventions
- File naming: `{feature}.ts` (one file per domain, TypeScript)
- Use query parameters for action routing (`?action=xxx`)
- Use `process.env` for environment variables (not `context.env`)
- Always import shared utilities from `lib/`
- Return consistent JSON: `{ success: boolean, data?: any, error?: string, code?: string }`
- Handle errors gracefully—never expose stack traces
- Log errors but never log PII
- Add new functionality as cases in existing consolidated endpoints

### Security Conventions (Arcjet + Custom Auth)
- Wrap all sensitive routes with `withArcjetProtection()` before handler logic
- Use `requireAuth()` middleware for authenticated routes
- Use `requireRole(['admin', 'super_admin'])` for admin-only routes
- Store tokens in HTTP-only cookies (not localStorage)
- Use separate secrets: `JWT_SECRET` (access), `JWT_REFRESH_SECRET` (refresh)
- Return 403 with code `SECURITY_VIOLATION` for Arcjet blocks
- Return 401 without revealing email/password specificity on login failure
- Rotate refresh tokens on every use (replay attack prevention)

## Build & Deployment

### Commands (All Bun)
| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies (generates bun.lockb) |
| `bun run dev` | Local dev server (port 5173) |
| `bun run build` | Production build with type-check |
| `bun run preview` | Preview production build |
| `bun run test` | Run Vitest tests |
| `bun run lint` | ESLint check |

### Environment Variables
Required in Vercel dashboard and `.env`:
```
# Database (Supabase or Neon)
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[service-key]
# OR for Neon migration:
# DATABASE_URL=postgres://[user]:[pass]@[host]/[db]?sslmode=require

# Frontend (Vite)
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon-key]

# Custom Auth (NEW - required)
JWT_SECRET=[32+ char secret for access tokens]
JWT_REFRESH_SECRET=[32+ char secret for refresh tokens]

# Security (NEW - required)
ARCJET_KEY=[arcjet-api-key]

# Email
RESEND_API_KEY=[resend-key]
EMAIL_FROM=noreply@mihas.edu.zm
```

### Removed Variables (No Longer Needed)
- `VITE_TURNSTILE_SITE_KEY` - Cloudflare-specific
- `VITE_ANALYTICS_*` - Analytics removed
- `VITE_SENTRY_DSN` - Sentry removed
- `CLOUDFLARE_AI_*` - AI features removed
- Supabase Auth SDK dependencies - Replaced with custom JWT auth

### Build Optimizations (Already Configured)
- Manual code splitting for vendor chunks (React, Supabase, forms)
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

| Use Case | Library | Notes |
|----------|---------|-------|
| JWT tokens | jose | Bun-native, HS256 signing |
| Password hashing | bcrypt | 12 rounds minimum |
| Security perimeter | @arcjet/node | Shield, bot detection, rate limiting |
| Database (Neon) | @neondatabase/serverless | For Neon migration |
| PDF generation | jspdf, pdf-lib | Server-side preferred |
| Excel export | xlsx, exceljs | Use exceljs for styling |
| File uploads | react-dropzone | With validation |
| Charts | recharts | Lazy-load chart components |
| OCR | tesseract.js | Web worker for performance—ONLY AI feature |
| Real-time | SSE + polling | Bun-native, replaces Supabase Realtime |

## Configuration Files

| File | Purpose |
|------|---------|
| `vercel.json` | Vercel deployment config |
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
| Supabase Realtime | Replaced with Bun-native SSE/polling |
| Supabase Auth SDK | Replaced with custom JWT auth (jose + bcrypt) |
| Sentry | Error monitoring removed |
| Umami | Analytics removed |

## Auth System Architecture

### Token Flow
```
Login → Generate Access (15min) + Refresh (7d) → HTTP-only Cookies
     ↓
API Request → Extract from Cookie/Bearer → Verify JWT → AuthContext
     ↓
Token Expired → Auto-refresh via /api/auth?action=refresh → Rotate both tokens
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
| /api/auth/* | 5 requests | 5 minutes |
| /api/sessions/* | 30 requests | 10 minutes |
| /api/admin/* | 20 requests | 10 minutes |
| /api/notifications/* | 50 requests | 10 minutes |
