# Project Structure & Organization

## Root Directory Layout

```
mihasv3/
├── src/                    # Frontend React application
├── functions/              # Cloudflare Pages Functions (API)
├── docs/                   # Documentation and reports
├── scripts/                # Utility and deployment scripts
├── tests/                  # E2E and integration tests
├── supabase/              # Database migrations and functions
├── public/                # Static assets
└── infra/                 # Terraform infrastructure code
```

## Frontend Structure (`src/`)

```
src/
├── components/            # React components
│   ├── ui/               # Base UI components (Button, Input, etc.)
│   ├── admin/            # Admin-specific components
│   ├── student/          # Student-specific components
│   ├── auth/             # Authentication components
│   ├── navigation/       # Navigation and layout components
│   └── forms/            # Form components and wizards
├── pages/                # Page-level components (route handlers)
├── hooks/                # Custom React hooks (38 total)
├── services/             # API service layer and external integrations
├── lib/                  # Utilities, helpers, and configurations
├── stores/               # Zustand state management stores
├── types/                # TypeScript type definitions
├── contexts/             # React context providers
├── routes/               # Route configuration and guards
├── styles/               # Global styles and Tailwind customizations
└── utils/                # Pure utility functions
```

## API Structure (`functions/`)

**Organization**: Feature-based directories with flat deployment structure

```
functions/
├── _lib/                 # Shared utilities and middleware
├── _middleware.js        # Global API middleware
├── admin/               # Admin management endpoints
├── applications/        # Application CRUD operations
├── auth/                # Authentication and session management
├── catalog/             # Course and program catalog
├── documents/           # PDF generation and file handling
├── notifications/       # Email, SMS, WhatsApp services
├── payments/            # Payment processing
├── analytics/           # Usage tracking and reporting
└── cron/                # Scheduled background jobs
```

## Component Organization Patterns

### UI Components (`src/components/ui/`)
- **Base components**: Button, Input, Card, Modal
- **Compound components**: DataTable, FormField, Toast
- **Layout components**: Container, Grid, Stack

### Feature Components
- **Grouped by domain**: admin/, student/, auth/
- **Co-located with related files**: Component.tsx, Component.test.tsx, Component.stories.tsx
- **Index files**: Export public API from directories

### Naming Conventions
- **Components**: PascalCase (e.g., `ApplicationWizard.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useApplicationForm.ts`)
- **Services**: camelCase (e.g., `supabaseClient.ts`)
- **Types**: PascalCase with descriptive suffixes (e.g., `ApplicationFormData`)
- **API Functions**: kebab-case (e.g., `send-email.js`)

## Documentation Structure (`docs/`)

```
docs/
├── guides/              # User and developer guides
├── reports/             # Analysis and audit reports (200+ files)
├── analysis/            # Technical deep-dives and investigations
└── design-system/       # UI/UX documentation and patterns
```

## Import Path Conventions

Use TypeScript path mapping with `@/` alias:

```typescript
// ✅ Correct - Use alias for src imports
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

// ❌ Avoid - Relative imports from src
import { Button } from '../../../components/ui/Button'
```

## File Organization Rules

1. **Co-location**: Keep related files together (component + test + styles)
2. **Index exports**: Use index.ts files to create clean public APIs
3. **Single responsibility**: One main export per file
4. **Consistent naming**: Follow established patterns across the codebase
5. **Feature grouping**: Organize by business domain, not technical layer

## State Management Organization

- **Global state**: Zustand stores in `src/stores/`
- **Server state**: React Query in `src/services/`
- **Form state**: React Hook Form with Zod validation
- **Component state**: Local useState for UI-only state

## Testing Structure (`tests/`)

```
tests/
├── e2e/                 # End-to-end user flows
├── integration/         # API and service integration tests
├── unit/                # Component and utility unit tests
├── api/                 # API endpoint testing
├── mobile/              # Mobile-specific test scenarios
└── production/          # Production environment validation
```