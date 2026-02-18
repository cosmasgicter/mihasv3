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
| Production URL | https://apply.mihas.edu.zm | Live admissions portal |
| Styling | Tailwind CSS | Custom design tokens in `tailwind.config.js` |
| Components | Radix UI | Accessible primitives—prefer over custom implementations |
| Forms | React Hook Form + Zod | All forms must have Zod schemas |
| State | Zustand (client), React Query (server) | No Redux, SSE/polling for real-time |
| Routing | React Router v6 | Lazy-load all page components |
| Backend | Vercel Functions + Neon Postgres | Custom Bun-native auth, Neon serverless Postgres |
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
│   ├── middleware.ts  # Auth middleware
│   ├── ownership.ts   # Resource ownership checks
│   ├── permissions.ts # RBAC (deterministic, no DB lookup)
│   └── legacy.ts      # Supabase token migration support
├── base64.ts          # Base64 encoding utilities
├── cors.ts            # CORS handler for Vercel
├── db.ts              # Database abstraction (Neon serverless only)
├── errorHandler.ts    # Sanitized error responses (sendSuccess/sendError)
├── neon-serverless.d.ts # Neon type declarations
├── queries.ts         # Typed query builders
├── rateLimiter.ts     # Rate limiting utilities
├── auditLogger.ts     # Audit logging (no PII)
├── realtime.ts        # SSE + polling fallback
├── storage.ts         # R2 storage abstraction
└── sessions.ts        # Device session manager

api-src/               # API source TypeScript (edit these, then bundle)
├── admin.ts           # ?action=dashboard|users|settings|stats|errors|migrate
├── applications.ts    # ?action=details|documents|grades|summary|review|export or ?id=xxx
├── auth.ts            # ?action=login|logout|refresh|session|register
├── bootstrap.ts       # Database bootstrap/seed operations
├── catalog.ts         # ?type=programs|intakes|subjects
├── documents.ts       # ?action=upload|extract
├── health.ts          # ?action=ping|db|env|arcjet (consolidated)
├── notifications.ts   # ?action=preferences|send
├── payments.ts        # ?action=receipt
├── ping.ts            # Simple ping endpoint
├── sessions.ts        # ?action=track|list|revoke|revoke-all
├── [...path].ts       # Catch-all for unmatched routes
└── tsconfig.json      # TypeScript config for API

api/                   # Bundled JS files (12 endpoints — DO NOT EDIT)
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

### API Response Envelope (CRITICAL)
All API endpoints wrap responses via `sendSuccess(res, payload)` from `lib/errorHandler.ts`:
```json
{ "success": true, "data": { ...actual payload... } }
```
The frontend `ApiClient` (`src/services/client.ts`) automatically unwraps this envelope via `unwrapApiResponse()`. Frontend services receive the inner payload directly — never check `response.success` or `response.data` on service results.

### Dual API Client Architecture (IMPORTANT)
Two API client modules exist — be aware of which one a file uses:
1. `src/lib/apiClient.ts` — older module, has its own `data.data ?? data` unwrap. Used by some hooks via direct `authFetch()`.
2. `src/services/client.ts` — newer `ApiClient` class, unwraps `{ success, data }` envelope automatically. Used by all service modules (`src/services/*.ts`).

When adding new frontend code, prefer `src/services/client.ts` (the newer client). Never manually unwrap `response.data` or check `response.success` on results from either client — both handle unwrapping internally.

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
# Database (Neon Postgres - REQUIRED)
DATABASE_URL=postgres://[user]:[pass]@[host]/[db]?sslmode=require

# Custom Auth (REQUIRED)
JWT_SECRET=[32+ char secret for access tokens]
JWT_REFRESH_SECRET=[32+ char secret for refresh tokens]

# Security (REQUIRED)
ARCJET_KEY=[arcjet-api-key]

# Email
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

## Production API Endpoints

Base URL: `https://apply.mihas.edu.zm`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health check |
| `/api/health?action=ping` | GET | Simple ping/pong |
| `/api/health?action=db` | GET | Database connectivity check |
| `/api/health?action=env` | GET | Environment variables status |
| `/api/catalog?type=programs` | GET | List available programs |
| `/api/catalog?type=intakes` | GET | List available intakes |
| `/api/catalog?type=subjects` | GET | List grade 12 subjects |
| `/api/auth?action=login` | POST | User login |
| `/api/auth?action=logout` | POST | User logout |
| `/api/auth?action=session` | GET | Get current session |
| `/api/auth?action=register` | POST | User registration |
| `/api/admin` | GET/POST | Admin operations (auth required) |
| `/api/applications` | GET/POST | Application management (auth required) |
| `/api/documents` | POST | Document upload/OCR (auth required) |
| `/api/payments` | GET/POST | Payment operations (auth required) |
| `/api/sessions` | GET/POST | Session management (auth required) |
| `/api/notifications` | GET/POST | Notification preferences (auth required) |
