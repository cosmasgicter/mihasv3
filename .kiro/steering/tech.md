# Technology Stack & Build System

## Frontend Stack

- **React 18** with TypeScript - UI framework with strict type safety
- **Vite** - Build tool and dev server (fast HMR)
- **Tailwind CSS** - Utility-first styling with custom design tokens
- **Radix UI** - Accessible component primitives
- **React Hook Form + Zod** - Form handling with schema validation
- **Zustand** - Lightweight state management
- **React Query** - Server state management and caching
- **React Router** - Client-side routing

## Backend & Infrastructure

- **Supabase** - PostgreSQL database, auth, and real-time subscriptions
- **Cloudflare Pages** - Static hosting with edge functions
- **Cloudflare Functions** - Serverless API endpoints (47 functions)
- **Resend** - Email delivery service
- **Twilio** - SMS and WhatsApp notifications

## Key Libraries

- **PDF Generation**: jspdf, pdf-lib
- **Excel Processing**: xlsx, exceljs  
- **File Uploads**: react-dropzone
- **Charts**: recharts
- **OCR**: tesseract.js
- **Animations**: framer-motion (being phased out for performance)

## Development Commands

```bash
# Development
npm run dev                    # Start dev server (localhost:5173)
npm run dev:network           # Dev server accessible on network
npm run dev:prod              # Build and preview production

# Building
npm run build                 # Standard build
npm run build:prod           # Optimized production build with image optimization
npm run build:analyze        # Build with bundle analysis

# Testing
npm run test                  # Playwright E2E tests
npm run test:unit            # Vitest unit tests
npm run test:unit:coverage   # Unit tests with coverage
npm run test:production      # Production environment tests

# Deployment
npm run deploy               # Deploy to Cloudflare Pages
wrangler pages deploy dist   # Direct Cloudflare deployment

# Utilities
npm run lint                 # ESLint
npm run type-check          # TypeScript checking
```

## Configuration Files

- **vite.config.production.ts** - Production build optimization
- **wrangler.toml** - Cloudflare Pages configuration
- **tailwind.config.js** - Design system tokens
- **tsconfig.json** - TypeScript settings (strict: false for legacy compatibility)

## Build Optimization

- **Code Splitting**: Manual chunks for vendor libraries (React, Supabase, forms)
- **Tree Shaking**: Terser with console.log removal in production
- **Asset Optimization**: Image compression and inlining <4KB assets
- **PWA**: Service worker with offline caching strategies
- **Critical CSS**: Inlined for faster initial paint

## Environment Variables

Required for development:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=https://apply.mihas.edu.zm
```

## Performance Targets

- **First Contentful Paint**: <1.5s
- **Largest Contentful Paint**: <2.5s  
- **Bundle Size**: Main chunk <500KB
- **Lighthouse Score**: >90 across all metrics

Please note that my terminal is Ubuntu WSL on a windows Machine