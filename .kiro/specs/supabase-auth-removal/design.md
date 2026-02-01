# Design Document: Supabase Auth Removal

## Overview

This design specifies the complete removal of Supabase Auth SDK dependencies from the MIHAS Application System frontend. The backend already uses custom JWT authentication with HTTP-only cookies via the `/api/auth` endpoints. This cleanup establishes a single source of truth for authentication and unblocks Vercel deployment.

### Current State
- **Backend**: Complete - Custom JWT auth with bcrypt, jose, HTTP-only cookies
- **Frontend**: Hybrid - Uses custom auth API but still imports Supabase Auth types
- **Deployment**: Blocked - vercel.json references non-existent api/migrate.ts

### Target State
- **Backend**: No changes required
- **Frontend**: All Supabase Auth imports removed, custom User type used
- **Deployment**: Clean build with no missing file references

## Architecture

```mermaid
graph TB
    subgraph "Frontend (React)"
        AC[AuthContext]
        UOA[useOptimizedAuthState]
        USL[useSessionListener]
        UT[Custom User Type]
    end
    
    subgraph "API Layer"
        AUTH[/api/auth]
        COOKIE[HTTP-only Cookies]
    end
    
    subgraph "Backend Auth (No Changes)"
        JWT[JWT Manager - jose]
        PWD[Password - bcrypt]
        PERM[Permissions - RBAC]
    end
    
    subgraph "Supabase (Storage Only)"
        SC[Supabase Client]
        STOR[Storage API]
        DB[Database Queries]
    end
    
    AC --> UOA
    AC --> USL
    UOA --> UT
    USL --> AUTH
    AUTH --> COOKIE
    AUTH --> JWT
    AUTH --> PWD
    AUTH --> PERM
    
    SC --> STOR
    SC --> DB
    SC -.->|NO AUTH| AUTH
```

### Key Architectural Decisions

1. **Custom User Type**: Define a TypeScript interface matching the API response structure instead of importing from @supabase/supabase-js
2. **Supabase Client Retained**: Keep @supabase/supabase-js for Storage and database queries only, with auth features disabled
3. **No Migration File**: Remove api/migrate.ts reference from vercel.json (file doesn't exist and isn't needed)
4. **Deprecated Components Deleted**: Remove auth-form.tsx and related Supabase Auth UI components entirely

## Components and Interfaces

### Custom User Type Definition

```typescript
// src/types/auth.ts - New file

/**
 * User type for custom JWT authentication
 * Replaces @supabase/supabase-js User type
 */
export interface User {
  id: string;
  email: string;
  role: 'student' | 'reviewer' | 'admin' | 'super_admin';
  full_name?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

/**
 * User profile from profiles table
 */
export interface UserProfile {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role: string;
  date_of_birth?: string;
  sex?: string;
  nationality?: string;
  address?: string;
  city?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Auth session response from /api/auth?action=session
 */
export interface AuthSession {
  user: User | null;
  profile: UserProfile | null;
}

/**
 * Sign in result
 */
export interface SignInResult {
  user?: User;
  profile?: UserProfile | null;
  error?: string;
}

/**
 * Sign up result
 */
export interface SignUpResult {
  user?: User | null;
  error?: string;
}
```

### Updated AuthContext Interface

```typescript
// src/contexts/AuthContext.tsx - Updated imports

import { User, UserProfile, SignInResult, SignUpResult } from '@/types/auth';
// Remove: import { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (email: string, password: string, userData: any) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
}
```

### Supabase Client Configuration (Storage Only)

```typescript
// src/lib/supabase.ts - Updated configuration

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// Note: Only SupabaseClient type imported, NOT User or Session types

export function createSupabaseClient(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      // Completely disable Supabase Auth SDK
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    // ... rest of config
  });
}
```

### Files to Delete

| File | Reason |
|------|--------|
| `src/components/supabase-ui/auth-form.tsx` | Deprecated, uses @supabase/auth-ui-react |
| `src/components/supabase-ui/index.ts` | Re-exports deleted auth-form components |

### Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/AuthContext.tsx` | Import User from @/types/auth |
| `src/hooks/auth/useOptimizedAuthState.ts` | Use custom User interface |
| `src/hooks/auth/useRoleQuery.ts` | Import User from @/types/auth |
| `src/lib/supabase.ts` | Remove UserProfile export (move to types/auth) |
| `src/lib/analytics.ts` | Remove Session import |
| `src/analysis/security/*.ts` | Configure clients without auth |
| `src/analysis/database/*.ts` | Configure clients without auth |
| `vercel.json` | Remove api/migrate.ts reference |
| `package.json` | Remove @supabase/auth-ui-* packages |

## Data Models

### User Type Mapping

| Supabase User Field | Custom User Field | Notes |
|---------------------|-------------------|-------|
| `id` | `id` | UUID string |
| `email` | `email` | Required |
| `user_metadata.role` | `role` | Enum type |
| `user_metadata.full_name` | `full_name` | Optional |
| `user_metadata` | `user_metadata` | Generic record |
| `app_metadata` | `app_metadata` | Generic record |

### Auth API Response Structure

```typescript
// GET /api/auth?action=session
{
  success: true,
  data: {
    user: {
      id: "uuid",
      email: "user@example.com",
      role: "student",
      full_name: "John Doe"
    },
    profile: { /* UserProfile */ }
  }
}

// POST /api/auth?action=login
{
  success: true,
  data: {
    user: { /* User */ },
    profile: { /* UserProfile */ }
  }
}
// HTTP-only cookies set: access_token, refresh_token
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties can be verified through property-based testing:

### Property 1: Config File Reference Integrity

*For any* file path referenced in vercel.json functions configuration, that file SHALL exist in the filesystem.

**Validates: Requirements 1.3**

This property ensures deployment configuration integrity by verifying all referenced serverless function files exist.

### Property 2: No Supabase Auth Imports

*For any* TypeScript/TSX file in the src/ directory that imports from `@supabase/supabase-js`, the import SHALL NOT include `User`, `Session`, `AuthChangeEvent`, `AuthSession`, or other auth-related types.

**Validates: Requirements 2.2, 3.4**

This property ensures complete separation of authentication concerns from the Supabase client, which is retained only for storage and database operations.

### Property 3: No LocalStorage Token Storage

*For any* TypeScript/TSX file in the src/ directory, there SHALL be no `localStorage.setItem` calls that store authentication tokens (access_token, refresh_token, auth-token, supabase.auth.token).

**Validates: Requirements 5.4**

This property ensures all authentication tokens are stored only in HTTP-only cookies, preventing XSS attacks from accessing credentials.

### Property 4: No Supabase Auth Method Calls

*For any* TypeScript/TSX file in the src/ directory, there SHALL be no calls to `supabase.auth.*` methods (signIn, signOut, getSession, onAuthStateChange, etc.).

**Validates: Requirements 5.5**

This property ensures all authentication flows use the custom `/api/auth` endpoints instead of the Supabase Auth SDK.

## Error Handling

### Build-Time Errors

| Error Type | Handling Strategy |
|------------|-------------------|
| Missing type imports | TypeScript compiler will fail with clear error messages pointing to the missing import |
| Undefined User type | Create custom User type in src/types/auth.ts before removing Supabase imports |
| Missing file references | Remove references from vercel.json before deployment |

### Runtime Errors

| Error Type | Handling Strategy |
|------------|-------------------|
| Auth API unavailable | useSessionListener already handles network errors gracefully |
| Invalid session | Return null user, redirect to login |
| Cookie not set | Credentials: 'include' ensures cookies are sent; server handles missing cookies |

### Migration Safety

1. **Order of Operations**: Create new types BEFORE removing old imports
2. **Incremental Changes**: Update one file at a time, verify build after each
3. **Backward Compatibility**: Custom User type matches existing API response structure

## Testing Strategy

### Dual Testing Approach

This cleanup requires both unit tests for specific examples and property tests for universal guarantees.

#### Unit Tests (Specific Examples)

| Test | Purpose |
|------|---------|
| vercel.json has no migrate.ts reference | Verify deployment blocker fixed |
| AuthContext imports from @/types/auth | Verify correct import source |
| package.json has no auth-ui packages | Verify dependencies cleaned |
| supabase.ts has auth disabled | Verify client configuration |
| Build completes successfully | Integration test for overall correctness |

#### Property Tests (Universal Properties)

Property-based tests will use **fast-check** (already in devDependencies) to verify universal properties across all files.

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with design property reference

**Test File**: `tests/property/supabase-auth-removal.property.test.ts`

```typescript
// Example property test structure
import fc from 'fast-check';
import { glob } from 'glob';
import { readFileSync } from 'fs';

describe('Supabase Auth Removal Properties', () => {
  // Feature: supabase-auth-removal, Property 2: No Supabase Auth Imports
  it('should not import auth types from @supabase/supabase-js', async () => {
    const files = await glob('src/**/*.{ts,tsx}');
    
    fc.assert(
      fc.property(fc.constantFrom(...files), (file) => {
        const content = readFileSync(file, 'utf-8');
        const hasSupabaseImport = content.includes("from '@supabase/supabase-js'");
        if (!hasSupabaseImport) return true;
        
        // If importing from Supabase, verify no auth types
        const authTypes = ['User', 'Session', 'AuthChangeEvent', 'AuthSession'];
        return !authTypes.some(type => 
          new RegExp(`import.*\\b${type}\\b.*from '@supabase/supabase-js'`).test(content)
        );
      }),
      { numRuns: 100 }
    );
  });
});
```

### Test Coverage Requirements

| Category | Coverage Target |
|----------|-----------------|
| Type definitions | 100% - All auth types defined |
| Import statements | 100% - All files scanned |
| Configuration | 100% - All config values verified |
| Build success | Pass/Fail - Binary outcome |

### Verification Commands

```bash
# Type checking
bun run type-check

# Unit tests
bun run test -- tests/unit/supabase-auth-removal.test.ts

# Property tests
bun run test -- tests/property/supabase-auth-removal.property.test.ts

# Full build verification
bun run build
```
