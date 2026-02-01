# Requirements Document

## Introduction

This specification defines the complete removal of Supabase Auth dependencies from the MIHAS Application System. The backend has already migrated to custom JWT authentication with HTTP-only cookies, but the frontend still contains Supabase Auth SDK imports and deprecated UI components that block deployment. This cleanup will establish a single source of truth for authentication and unblock Vercel deployment.

## Glossary

- **Auth_System**: The custom JWT-based authentication system using jose for token signing and HTTP-only cookies for secure token storage
- **Supabase_Client**: The @supabase/supabase-js client, which will be retained ONLY for Supabase Storage (file uploads) and direct database queries
- **Auth_API**: The /api/auth endpoint that handles all authentication operations (login, logout, register, session, refresh)
- **User_Type**: A TypeScript interface defining the authenticated user structure, replacing the Supabase User type
- **Vercel_Config**: The vercel.json configuration file that defines serverless function routing and deployment settings
- **SSE_Realtime**: Server-Sent Events based realtime system that replaced Supabase Realtime

## Requirements

### Requirement 1: Fix Deployment Blockers

**User Story:** As a DevOps engineer, I want to fix all deployment blockers, so that the application can be successfully deployed to Vercel.

#### Acceptance Criteria

1. WHEN vercel.json references api/migrate.ts THEN THE Vercel_Config SHALL either remove the reference or THE Auth_System SHALL provide the missing file
2. WHEN the build process runs THEN THE Auth_System SHALL complete without import errors from missing Supabase Auth types
3. THE Vercel_Config SHALL NOT reference any non-existent API endpoint files

### Requirement 2: Remove Supabase Auth Type Dependencies

**User Story:** As a developer, I want all Supabase Auth type imports removed, so that the codebase has a clean separation between authentication and database concerns.

#### Acceptance Criteria

1. WHEN AuthContext.tsx imports User type THEN THE Auth_System SHALL use a custom User_Type interface instead of @supabase/supabase-js User
2. WHEN any frontend file imports from @supabase/supabase-js THEN THE Auth_System SHALL ensure only SupabaseClient and storage-related types are imported
3. THE Auth_System SHALL define a custom User_Type interface that matches the structure returned by /api/auth endpoints
4. WHEN useRoleQuery.ts imports User type THEN THE Auth_System SHALL use the custom User_Type interface

### Requirement 3: Remove Deprecated Supabase Auth UI Components

**User Story:** As a developer, I want deprecated Supabase Auth UI components removed, so that the codebase does not contain unused dependencies.

#### Acceptance Criteria

1. THE Auth_System SHALL remove the @supabase/auth-ui-react package dependency from package.json
2. THE Auth_System SHALL remove the @supabase/auth-ui-shared package dependency from package.json
3. THE Auth_System SHALL delete src/components/supabase-ui/auth-form.tsx and related exports
4. WHEN any component imports from supabase-ui THEN THE Auth_System SHALL update imports to use custom auth pages

### Requirement 4: Clean Up Supabase Client Configuration

**User Story:** As a developer, I want the Supabase client configured only for storage and database, so that authentication concerns are fully separated.

#### Acceptance Criteria

1. THE Supabase_Client SHALL have auth.autoRefreshToken set to false
2. THE Supabase_Client SHALL have auth.persistSession set to false
3. THE Supabase_Client SHALL have auth.detectSessionInUrl set to false
4. WHEN src/lib/supabase.ts is loaded THEN THE Supabase_Client SHALL NOT initialize any auth listeners
5. THE Supabase_Client SHALL export only storage and database query functionality

### Requirement 5: Ensure All Auth Flows Use Custom API

**User Story:** As a user, I want all authentication to work through the custom auth API, so that my credentials are handled securely with HTTP-only cookies.

#### Acceptance Criteria

1. WHEN a user signs in THEN THE Auth_System SHALL call POST /api/auth?action=login with credentials: 'include'
2. WHEN a user signs out THEN THE Auth_System SHALL call POST /api/auth?action=logout with credentials: 'include'
3. WHEN checking session state THEN THE Auth_System SHALL call GET /api/auth?action=session with credentials: 'include'
4. THE Auth_System SHALL NOT store any tokens in localStorage
5. THE Auth_System SHALL NOT use any supabase.auth.* methods

### Requirement 6: Update Analysis Tools

**User Story:** As a developer, I want analysis tools updated to not depend on Supabase Auth, so that security analysis can run without auth SDK.

#### Acceptance Criteria

1. WHEN SecurityAnalyzer.ts creates a Supabase client THEN THE Auth_System SHALL configure it without auth features
2. WHEN RLSPolicyAnalyzer.ts creates a Supabase client THEN THE Auth_System SHALL configure it without auth features
3. WHEN FunctionSearchPathAnalyzer.ts creates a Supabase client THEN THE Auth_System SHALL configure it without auth features
4. WHEN SchemaAnalyzer.ts creates a Supabase client THEN THE Auth_System SHALL configure it without auth features

### Requirement 7: Verify Build Success

**User Story:** As a DevOps engineer, I want the build to complete successfully, so that the application can be deployed.

#### Acceptance Criteria

1. WHEN running bun run build THEN THE Auth_System SHALL complete without TypeScript errors
2. WHEN running bun run type-check THEN THE Auth_System SHALL report no type errors related to Supabase Auth
3. THE Auth_System SHALL produce a valid dist/ output directory
4. IF any import errors occur THEN THE Auth_System SHALL provide clear error messages indicating the missing dependency
