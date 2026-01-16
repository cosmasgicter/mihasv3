---
inclusion: always
---

# Technology Stack & Development Conventions

## Stack Overview

| Layer | Technology | Notes |
|-------|------------|-------|
| UI Framework | React 18 + TypeScript | Functional components only |
| Build Tool | Vite | Use `vite.config.production.ts` for prod builds |
| Styling | Tailwind CSS | Custom design tokens in `tailwind.config.js` |
| Components | Radix UI | Accessible primitives—prefer over custom implementations |
| Forms | React Hook Form + Zod | All forms must have Zod schemas |
| State | Zustand (client), React Query (server) | No Redux |
| Routing | React Router v6 | Lazy-load all page components |
| Backend | Supabase + Cloudflare Functions | 47 API endpoints in `functions/` |
| Email/SMS | Resend, Twilio | Queue with retry on failure |

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

## API Development (functions/)

### Structure

```
functions/
├── _lib/           # Shared utilities (auth, db, validation)
├── _middleware.js  # Global CORS, auth, error handling
└── [feature]/      # Feature-grouped endpoints
```

### Conventions
- File naming: `kebab-case.js` (e.g., `send-email.js`)
- Always import shared utilities from `_lib/`
- Return consistent JSON: `{ success: boolean, data?: any, error?: string }`
- Handle errors gracefully—never expose stack traces
- Log errors but never log PII

### Response Pattern
```javascript
// Success
return new Response(JSON.stringify({ success: true, data: result }), {
  headers: { 'Content-Type': 'application/json' }
});

// Error
return new Response(JSON.stringify({ success: false, error: 'Message' }), {
  status: 400,
  headers: { 'Content-Type': 'application/json' }
});
```

## Build & Deployment

### Commands
| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server (port 5173) |
| `npm run build:prod` | Production build with optimizations |
| `npm run deploy` | Deploy to Cloudflare Pages |
| `npm run test` | Playwright E2E tests |
| `npm run test:unit` | Vitest unit tests |

### Environment Variables
Required in `.env`:
```
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon-key]
VITE_API_BASE_URL=***REMOVED***
```

### Build Optimizations (Already Configured)
- Manual code splitting for vendor chunks (React, Supabase, forms)
- Terser minification with console.log removal
- Assets <4KB inlined as base64
- Critical CSS inlined in HTML
- Service worker for PWA offline support

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
| OCR | tesseract.js | Web worker for performance |

## Configuration Files

| File | Purpose |
|------|---------|
| `vite.config.production.ts` | Production build settings |
| `wrangler.toml` | Cloudflare Pages config |
| `tailwind.config.js` | Design tokens and theme |
| `tsconfig.json` | TypeScript (strict: false) |
| `playwright.config.ts` | E2E test configuration |
