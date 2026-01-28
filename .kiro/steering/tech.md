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
| State | Zustand (client), React Query (server) | No Redux, polling for real-time |
| Routing | React Router v6 | Lazy-load all page components |
| Backend | Supabase + Vercel Functions | ~30 API endpoints in `api/` |
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

### Structure

```
api/
├── _lib/           # Shared utilities (auth, db, cors, validation)
│   ├── cors.ts     # CORS handler for Vercel
│   ├── supabaseClient.ts
│   ├── errorHandler.ts
│   └── rateLimiter.ts
├── admin/          # Admin endpoints
├── applications/   # Application CRUD
├── auth/           # Authentication
├── documents/      # Document upload + OCR
├── notifications/  # Email notifications
└── payments/       # Payment processing
```

### Vercel Function Pattern
```typescript
// api/{feature}/[action].ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin } from '../_lib/supabaseClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return; // Handle OPTIONS preflight
  
  try {
    // Handler logic using process.env for env vars
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}
```

### Conventions
- File naming: `kebab-case.ts` (TypeScript for all functions)
- Use `process.env` for environment variables (not `context.env`)
- Always import shared utilities from `_lib/`
- Return consistent JSON: `{ success: boolean, data?: any, error?: string }`
- Handle errors gracefully—never expose stack traces
- Log errors but never log PII

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
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[service-key]
RESEND_API_KEY=[resend-key]
EMAIL_FROM=noreply@mihas.edu.zm
```

### Removed Variables (No Longer Needed)
- `VITE_TURNSTILE_SITE_KEY` - Cloudflare-specific
- `VITE_ANALYTICS_*` - Analytics removed
- `VITE_SENTRY_DSN` - Sentry removed
- `CLOUDFLARE_AI_*` - AI features removed

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
| PDF generation | jspdf, pdf-lib | Server-side preferred |
| Excel export | xlsx, exceljs | Use exceljs for styling |
| File uploads | react-dropzone | With validation |
| Charts | recharts | Lazy-load chart components |
| OCR | tesseract.js | Web worker for performance—ONLY AI feature |
| Real-time | React Query polling | 30-second intervals, replaces Supabase Realtime |

## Configuration Files

| File | Purpose |
|------|---------|
| `vercel.json` | Vercel deployment config |
| `bunfig.toml` | Bun runtime configuration |
| `vite.config.ts` | Vite build settings (simplified) |
| `tailwind.config.js` | Design tokens and theme |
| `tsconfig.json` | TypeScript (strict: false) |
| `vitest.config.ts` | Unit test configuration |

## Removed (Migration Cleanup)

| Removed | Reason |
|---------|--------|
| `wrangler.toml` | Cloudflare-specific |
| `.cfignore` | Cloudflare-specific |
| `functions/ai/*` | AI features removed (except OCR) |
| `functions/analytics/*` | Analytics removed |
| Supabase Realtime | Replaced with polling |
| Sentry | Error monitoring removed |
| Umami | Analytics removed |
