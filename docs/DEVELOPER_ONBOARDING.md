# Developer Onboarding Guide

## Welcome! 🎉

This guide will get you from zero to productive in 30 minutes.

## Quick Setup (30 minutes)

### 1. Prerequisites (5 min)

Install these first:
```bash
# Check versions
node --version  # Need 18+
npm --version   # Need 9+
git --version   # Any recent version
```

Don't have them? Install:
- Node.js: https://nodejs.org (LTS version)
- Git: https://git-scm.com

### 2. Clone & Install (5 min)

```bash
# Clone repository
git clone https://github.com/mihas/mihasv3.git
cd mihasv3

# Install dependencies
npm install

# This installs ~500MB of packages, takes 2-3 minutes
```

### 3. Environment Setup (5 min)

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your credentials
nano .env  # or use your favorite editor
```

Required variables:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these from:
1. Go to https://supabase.com
2. Create free project (or use existing)
3. Settings → API → Copy URL and anon key

### 4. Database Setup (10 min)

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run all migrations
supabase db push

# Verify (should show 86 tables)
supabase db list
```

### 5. Start Development Server (5 min)

```bash
# Start dev server
npm run dev

# Opens at http://localhost:5173
```

You should see the MIHAS homepage! 🎉

## Project Structure

```
mihasv3/
├── src/                    # Frontend React code
│   ├── components/         # Reusable UI components
│   │   ├── ui/            # Base components (Button, Input, etc.)
│   │   ├── admin/         # Admin-specific components
│   │   └── student/       # Student-specific components
│   ├── pages/             # Page components (routes)
│   ├── hooks/             # Custom React hooks
│   ├── services/          # API service layer
│   ├── lib/               # Utilities and helpers
│   ├── stores/            # Zustand state management
│   └── types/             # TypeScript type definitions
│
├── functions/             # Cloudflare Pages Functions (API)
│   ├── applications/      # Application CRUD endpoints
│   ├── auth/             # Authentication endpoints
│   └── payments/         # Payment endpoints
│
├── docs/                  # Documentation
│   ├── guides/           # User guides
│   ├── reports/          # Analysis reports
│   └── analysis/         # Technical analysis
│
├── scripts/              # Utility scripts
│   ├── tests/           # Test scripts
│   └── setup/           # Setup scripts
│
└── supabase/            # Database migrations
    └── migrations/      # SQL migration files
```

## Key Files to Know

### Must Read First
1. `README.md` - Project overview
2. `API_STRUCTURE_GUIDE.md` - API patterns and standards
3. `UNIFIED_TEMPLATES_SYSTEM.md` - Email templates
4. `SECURITY_AUDIT_REPORT.md` - Security review

### Configuration
- `vite.config.ts` - Vite build config
- `wrangler.toml` - Cloudflare deployment config
- `tsconfig.json` - TypeScript config
- `tailwind.config.js` - Tailwind CSS config

### Entry Points
- `src/main.tsx` - React app entry
- `src/App.tsx` - Main app component
- `functions/_middleware.ts` - API middleware

## Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool (fast!)
- **Tailwind CSS** - Styling
- **Radix UI** - Accessible components
- **React Hook Form** - Form handling
- **Zod** - Schema validation
- **Zustand** - State management
- **React Query** - Server state

### Backend
- **Supabase** - Database (PostgreSQL)
- **Supabase Auth** - Authentication
- **Supabase Storage** - File storage
- **Cloudflare Pages Functions** - API endpoints

### Tools
- **Sentry** - Error monitoring
- **ESLint** - Code linting
- **Prettier** - Code formatting

## Common Tasks

### Add New Page

1. Create component in `src/pages/`:
```typescript
// src/pages/NewPage.tsx
export function NewPage() {
  return <div>New Page</div>
}
```

2. Add route in `src/App.tsx`:
```typescript
<Route path="/new-page" element={<NewPage />} />
```

### Add New API Endpoint

See `API_STRUCTURE_GUIDE.md` for detailed patterns.

Quick example:
```typescript
// functions/example/index.ts
export async function onRequest(context) {
  const { request, env } = context
  
  // Your logic here
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
```

### Add New Component

```typescript
// src/components/MyComponent.tsx
interface MyComponentProps {
  title: string
}

export function MyComponent({ title }: MyComponentProps) {
  return <div>{title}</div>
}
```

### Add Database Migration

```bash
# Create new migration
supabase migration new add_new_table

# Edit the generated file in supabase/migrations/
# Add your SQL

# Apply migration
supabase db push
```

### Run Tests

```bash
# All tests
npm run test

# Unit tests only
npm run test:unit

# Watch mode
npm run test:watch
```

## Development Workflow

### Daily Workflow

1. **Pull latest changes**
```bash
git pull origin main
npm install  # If package.json changed
```

2. **Create feature branch**
```bash
git checkout -b feature/my-feature
```

3. **Make changes**
- Write code
- Test locally
- Check console for errors

4. **Commit changes**
```bash
git add .
git commit -m "feat: Add my feature"
```

5. **Push and create PR**
```bash
git push origin feature/my-feature
# Create PR on GitHub
```

### Commit Message Format

Follow conventional commits:
```
feat: Add new feature
fix: Fix bug
docs: Update documentation
style: Format code
refactor: Refactor code
test: Add tests
chore: Update dependencies
```

## Debugging

### Frontend Debugging

**React DevTools**:
1. Install browser extension
2. Open DevTools → Components tab
3. Inspect component state/props

**Console Logging**:
```typescript
console.log('Debug:', variable)
console.table(arrayData)
console.error('Error:', error)
```

**React Query DevTools**:
Already included in dev mode. Check bottom-left corner.

### Backend Debugging

**Check Logs**:
```bash
# Cloudflare logs
wrangler pages deployment tail

# Supabase logs
supabase functions logs
```

**Test API Locally**:
```bash
# Start local functions
wrangler pages dev dist

# Test endpoint
curl http://localhost:8788/api/applications
```

### Database Debugging

**Query Database**:
```bash
# Open SQL editor
supabase db studio

# Or use psql
supabase db psql
```

**Check RLS Policies**:
```sql
SELECT * FROM pg_policies WHERE tablename = 'applications';
```

## Code Style

### TypeScript

```typescript
// ✅ Good
interface User {
  id: string
  name: string
}

function getUser(id: string): User {
  // ...
}

// ❌ Bad
function getUser(id: any): any {
  // ...
}
```

### React Components

```typescript
// ✅ Good - Named export, typed props
interface ButtonProps {
  label: string
  onClick: () => void
}

export function Button({ label, onClick }: ButtonProps) {
  return <button onClick={onClick}>{label}</button>
}

// ❌ Bad - Default export, no types
export default function Button(props) {
  return <button>{props.label}</button>
}
```

### Async/Await

```typescript
// ✅ Good
async function fetchData() {
  try {
    const data = await api.get('/data')
    return data
  } catch (error) {
    console.error('Error:', error)
    throw error
  }
}

// ❌ Bad
function fetchData() {
  return api.get('/data')
    .then(data => data)
    .catch(err => console.log(err))
}
```

## Testing

### Unit Tests

```typescript
// src/utils/__tests__/grades.test.ts
import { calculatePoints } from '../grades'

describe('calculatePoints', () => {
  it('calculates points correctly', () => {
    expect(calculatePoints([1, 2, 3, 4, 5])).toBe(15)
  })
})
```

### Integration Tests

```typescript
// src/services/__tests__/applications.test.ts
import { applicationService } from '../applications'

describe('applicationService', () => {
  it('creates application', async () => {
    const app = await applicationService.create({
      full_name: 'Test User'
    })
    expect(app.id).toBeDefined()
  })
})
```

## Performance Tips

### React Performance

```typescript
// Use memo for expensive calculations
const expensiveValue = useMemo(() => {
  return calculateExpensive(data)
}, [data])

// Use callback for functions passed to children
const handleClick = useCallback(() => {
  doSomething()
}, [])

// Lazy load heavy components
const HeavyComponent = lazy(() => import('./HeavyComponent'))
```

### Database Performance

```typescript
// ✅ Good - Select only needed fields
const { data } = await supabase
  .from('applications')
  .select('id, full_name, status')
  .limit(50)

// ❌ Bad - Select everything
const { data } = await supabase
  .from('applications')
  .select('*')
```

## Common Errors & Solutions

### Error: "Supabase client not initialized"
**Solution**: Check `.env` has correct Supabase URL and key

### Error: "RLS policy violation"
**Solution**: Check user is authenticated and has correct role

### Error: "Module not found"
**Solution**: Run `npm install` again

### Error: "Port 5173 already in use"
**Solution**: Kill existing process or use different port:
```bash
npm run dev -- --port 3000
```

## Resources

### Documentation
- React: https://react.dev
- TypeScript: https://typescriptlang.org
- Supabase: https://supabase.com/docs
- Tailwind: https://tailwindcss.com/docs

### Internal Docs
- `API_STRUCTURE_GUIDE.md` - API patterns
- `SECURITY_AUDIT_REPORT.md` - Security guidelines
- `CRITICAL_USER_FLOWS_TEST.md` - Testing checklist

### Getting Help

1. **Check docs first** - Most answers are here
2. **Search codebase** - Similar code might exist
3. **Ask team** - Slack/Discord/Email
4. **Create issue** - If it's a bug

## Next Steps

Now that you're set up:

1. ✅ Read `API_STRUCTURE_GUIDE.md`
2. ✅ Explore the codebase
3. ✅ Pick a small task from backlog
4. ✅ Make your first PR
5. ✅ Attend team standup

## Checklist

Before your first PR:
- [ ] Code runs locally without errors
- [ ] No console errors or warnings
- [ ] TypeScript types are correct
- [ ] Code follows style guide
- [ ] Tested manually
- [ ] Commit messages follow convention
- [ ] PR description is clear

Welcome to the team! 🚀

---

**Questions?** Ask in #dev-help channel or email dev@mihas.edu.zm
