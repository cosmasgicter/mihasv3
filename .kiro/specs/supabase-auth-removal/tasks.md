# Implementation Plan: Supabase Auth Removal

## Overview

This plan removes all Supabase Auth SDK dependencies from the frontend while preserving the Supabase client for storage and database operations. The backend custom JWT auth is already complete. Tasks are ordered to prevent build failures during migration.

## Tasks

- [x] 1. Fix deployment blockers in vercel.json
  - Remove api/migrate.ts reference from functions configuration (line ~43)
  - Verify all other file references in vercel.json exist
  - _Requirements: 1.1, 1.3_

- [x] 2. Create custom auth types
  - [x] 2.1 Create src/types/auth.ts with User, UserProfile, AuthSession, SignInResult, SignUpResult interfaces
    - Match structure to /api/auth endpoint responses
    - Include role enum: 'student' | 'reviewer' | 'admin' | 'super_admin'
    - _Requirements: 2.3_
  
  - [ ] 2.2 Write unit test verifying auth types exist and have required fields
    - Test User interface has id, email, role fields
    - Test UserProfile interface has required fields
    - _Requirements: 2.3_

- [x] 3. Update AuthContext to use custom types
  - [x] 3.1 Update src/contexts/AuthContext.tsx
    - Replace `import { User } from '@supabase/supabase-js'` with `import { User, UserProfile } from '@/types/auth'`
    - Remove @ts-nocheck comment after fixing types
    - _Requirements: 2.1_
  
  - [ ] 3.2 Write unit test verifying AuthContext imports from @/types/auth
    - Verify no @supabase/supabase-js User import
    - _Requirements: 2.1_

- [x] 4. Update auth hooks to use custom types
  - [x] 4.1 Update src/hooks/auth/useOptimizedAuthState.ts
    - Remove local User interface definition (lines ~30-35)
    - Import User from @/types/auth
    - _Requirements: 2.2_
  
  - [x] 4.2 Update src/hooks/auth/useRoleQuery.ts
    - Replace `import { User } from '@supabase/supabase-js'` with `import { User } from '@/types/auth'`
    - _Requirements: 2.4_
  
  - [ ] 4.3 Write unit tests for auth hook imports
    - Verify useOptimizedAuthState uses custom User type
    - Verify useRoleQuery uses custom User type
    - _Requirements: 2.2, 2.4_

- [x] 5. Clean up src/lib/supabase.ts
  - [x] 5.1 Update src/lib/supabase.ts
    - Remove UserProfile interface (now in types/auth.ts)
    - Keep only SupabaseClient import from @supabase/supabase-js
    - Verify auth config has autoRefreshToken: false, persistSession: false, detectSessionInUrl: false
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ] 5.2 Write unit test verifying Supabase client auth is disabled
    - Check auth configuration values
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Update analytics and analysis files
  - [x] 6.1 Update src/lib/analytics.ts
    - Remove `import type { Session } from '@supabase/supabase-js'`
    - Replace with inline type or remove if unused
    - _Requirements: 2.2_
  
  - [x] 6.2 Update src/analysis/security/SecurityAnalyzer.ts
    - Configure Supabase client with auth disabled
    - _Requirements: 6.1_
  
  - [x] 6.3 Update src/analysis/security/RLSPolicyAnalyzer.ts
    - Configure Supabase client with auth disabled
    - _Requirements: 6.2_
  
  - [x] 6.4 Update src/analysis/security/FunctionSearchPathAnalyzer.ts
    - Configure Supabase client with auth disabled
    - _Requirements: 6.3_
  
  - [x] 6.5 Update src/analysis/database/SchemaAnalyzer.ts
    - Configure Supabase client with auth disabled
    - _Requirements: 6.4_

- [x] 7. Checkpoint - Verify type changes compile
  - Run `bun run type-check` to verify no TypeScript errors
  - Fix any remaining type issues before proceeding
  - _Requirements: 7.2_

- [x] 8. Remove deprecated Supabase Auth UI components
  - [x] 8.1 Delete src/components/supabase-ui/auth-form.tsx
    - File is marked @deprecated and not imported anywhere
    - _Requirements: 3.3_
  
  - [x] 8.2 Update src/components/supabase-ui/index.ts
    - Remove auth-form exports (AuthForm, SignInForm, SignUpForm, ForgotPasswordForm, UpdatePasswordForm)
    - Keep any non-auth exports if they exist
    - _Requirements: 3.3, 3.4_
  
  - [ ] 8.3 Write unit test verifying no supabase-ui auth imports exist
    - Scan src/ for imports from supabase-ui auth components
    - _Requirements: 3.4_

- [x] 9. Remove Supabase Auth UI packages from dependencies
  - [x] 9.1 Update package.json
    - Remove @supabase/auth-ui-react from dependencies
    - Remove @supabase/auth-ui-shared from dependencies
    - _Requirements: 3.1, 3.2_
  
  - [x] 9.2 Run bun install to update lockfile
    - Verify packages are removed from bun.lock
    - _Requirements: 3.1, 3.2_

- [x] 10. Checkpoint - Verify build succeeds
  - Run `bun run build` to verify production build works
  - Ensure dist/ directory is created
  - _Requirements: 7.1, 7.3_

- [x] 11. Write property tests for auth removal verification
  - [x] 11.1 Create tests/property/supabase-auth-removal.property.test.ts
    - **Property 1: Config File Reference Integrity**
    - **Validates: Requirements 1.3**
  
  - [x] 11.2 Add property test for no Supabase auth imports
    - **Property 2: No Supabase Auth Imports**
    - **Validates: Requirements 2.2, 3.4**
  
  - [x] 11.3 Add property test for no localStorage token storage
    - **Property 3: No LocalStorage Token Storage**
    - **Validates: Requirements 5.4**
  
  - [x] 11.4 Add property test for no supabase.auth method calls
    - **Property 4: No Supabase Auth Method Calls**
    - **Validates: Requirements 5.5**

- [x] 12. Final checkpoint - Full verification
  - Run `bun run type-check` - no errors
  - Run `bun run build` - successful build
  - Run `bun run test` - all tests pass
  - Verify dist/ directory exists and contains index.html
  - _Requirements: 7.1, 7.2, 7.3_

## Notes

- All tasks are required for comprehensive testing
- Create new types BEFORE removing old imports to prevent build failures
- The backend auth system requires no changes - it's already complete
- Supabase client is retained for Storage and database queries only
- All auth flows already use /api/auth endpoints with HTTP-only cookies
