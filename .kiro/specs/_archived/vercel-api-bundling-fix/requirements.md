# Requirements Document

## Introduction

This document specifies the requirements for fixing the Vercel API deployment issue where serverless functions fail with ERR_MODULE_NOT_FOUND errors. The root cause is that Vercel's Node File Trace (NFT) cannot trace imports from the `lib/` directory at runtime because it exists outside the `api/` directory. The solution must bundle shared utilities with each API function while respecting Vercel Hobby plan constraints (12 function limit).

## Glossary

- **NFT**: Node File Trace - Vercel's system for detecting and bundling dependencies for serverless functions
- **API_Endpoint**: A TypeScript file in the `api/` directory that exports a serverless function handler
- **Shared_Utility**: A TypeScript module in the `lib/` directory that provides common functionality (CORS, database, auth, etc.)
- **Bundle_Script**: A build script that pre-bundles API endpoints with their dependencies before deployment
- **Vercel_Function**: A serverless function deployed to Vercel's infrastructure
- **External_Package**: An npm package that Vercel installs at runtime (not bundled)

## Requirements

### Requirement 1: Pre-Bundle API Endpoints

**User Story:** As a developer, I want API endpoints to be pre-bundled with their dependencies, so that Vercel can deploy them without NFT tracing failures.

#### Acceptance Criteria

1. WHEN the build script runs, THE Bundle_Script SHALL process each `.ts` file in the `api/` directory
2. WHEN bundling an API_Endpoint, THE Bundle_Script SHALL inline all imports from the `lib/` directory into the output
3. WHEN bundling an API_Endpoint, THE Bundle_Script SHALL mark npm packages as external (not bundled)
4. WHEN bundling completes, THE Bundle_Script SHALL output `.js` files that Vercel can execute directly
5. IF bundling fails for any API_Endpoint, THEN THE Bundle_Script SHALL report the error and exit with non-zero status

### Requirement 2: Preserve Vercel Function Limit

**User Story:** As a developer, I want the bundling solution to respect Vercel's 12 function limit, so that deployment succeeds on the Hobby plan.

#### Acceptance Criteria

1. THE Bundle_Script SHALL produce exactly one output file per API_Endpoint
2. THE Bundle_Script SHALL NOT create additional files that Vercel counts as functions
3. WHEN bundling completes, THE Bundle_Script SHALL verify the total function count does not exceed 12
4. IF the function count exceeds 12, THEN THE Bundle_Script SHALL report an error with the count

### Requirement 3: External Package Handling

**User Story:** As a developer, I want npm packages to be installed by Vercel at runtime, so that bundle sizes remain small and native modules work correctly.

#### Acceptance Criteria

1. THE Bundle_Script SHALL mark `@vercel/node` as external (Vercel runtime types)
2. THE Bundle_Script SHALL mark `@neondatabase/serverless` as external (database driver)
3. THE Bundle_Script SHALL mark `@arcjet/node` as external (security service)
4. THE Bundle_Script SHALL mark `arcjet` as external (security service core)
5. THE Bundle_Script SHALL mark `jose` as external (JWT library)
6. THE Bundle_Script SHALL mark `bcryptjs` as external (password hashing)
7. THE Bundle_Script SHALL mark `web-push` as external (push notifications)
8. THE Bundle_Script SHALL mark `resend` as external (email service - future use)
9. WHEN an external package is imported, THE Bundle_Script SHALL preserve the import statement in the output

### Requirement 4: Build Integration

**User Story:** As a developer, I want the bundling to integrate with the existing build process, so that deployment works automatically.

#### Acceptance Criteria

1. THE Bundle_Script SHALL run before the Vite build in the build command
2. WHEN `vercel.json` specifies a build command, THE Build_System SHALL execute the Bundle_Script first
3. THE Bundle_Script SHALL use Bun for bundling operations
4. WHEN bundling succeeds, THE Bundle_Script SHALL log the size of each bundled file
5. IF the build command fails, THEN THE Build_System SHALL prevent deployment

### Requirement 5: Source File Management

**User Story:** As a developer, I want the build process to manage source and output files correctly, so that Vercel deploys the bundled versions.

#### Acceptance Criteria

1. WHEN bundling completes, THE Bundle_Script SHALL replace `.ts` source files with bundled `.js` files
2. THE Bundle_Script SHALL preserve the original file names (minus extension change)
3. THE Bundle_Script SHALL NOT modify files starting with `_` (underscore)
4. WHEN the build completes, THE Build_System SHALL have only `.js` files in the `api/` directory for deployment
5. THE Bundle_Script SHALL handle the `[...path].ts` catch-all route correctly

### Requirement 6: Vercel Configuration

**User Story:** As a developer, I want Vercel to be configured correctly for bundled JavaScript files, so that functions execute properly.

#### Acceptance Criteria

1. THE Vercel_Config SHALL specify functions configuration for `api/*.js` files
2. THE Vercel_Config SHALL set appropriate maxDuration for API functions
3. THE Vercel_Config SHALL include rewrites for all API endpoints
4. WHEN a request matches an API route, THE Vercel_Config SHALL route it to the correct function

### Requirement 7: Error Handling and Logging

**User Story:** As a developer, I want clear error messages and logging during the build process, so that I can diagnose deployment issues.

#### Acceptance Criteria

1. WHEN bundling starts, THE Bundle_Script SHALL log the number of endpoints found
2. WHEN each endpoint is bundled, THE Bundle_Script SHALL log success with file size
3. IF bundling fails, THEN THE Bundle_Script SHALL log the specific error message
4. WHEN bundling completes, THE Bundle_Script SHALL log a summary of successes and failures
5. THE Bundle_Script SHALL use emoji indicators for visual clarity (✅ success, ❌ failure)

### Requirement 8: Development Workflow Compatibility

**User Story:** As a developer, I want local development to work without bundling, so that I can iterate quickly.

#### Acceptance Criteria

1. WHEN running `bun run dev`, THE Dev_Server SHALL use TypeScript files directly
2. THE Bundle_Script SHALL only run during production builds
3. WHEN developing locally, THE Dev_Server SHALL resolve `../lib/` imports correctly
4. THE Bundle_Script SHALL NOT affect the local development experience
