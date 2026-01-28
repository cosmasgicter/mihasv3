# Requirements Document

## Introduction

This document specifies the requirements for migrating the MIHAS Application System from Cloudflare Pages to Vercel Free Plan with a complete Bun runtime migration. The migration aims to simplify the system by removing AI features (except OCR), analytics, and complex admin workflows while preserving core application functionality, offline PWA support, and the critical 8-second auto-save mechanism.

## Glossary

- **MIHAS**: Mukuba Institute of Health and Allied Sciences - the educational institution this system serves
- **Application_Wizard**: The 4-step form (Personal Info → Academic History → Program Selection → Document Upload) students use to apply
- **Auto_Save_System**: The mechanism that saves form data every 8 seconds to prevent data loss
- **Vercel_Functions**: Serverless functions running on Vercel's infrastructure (replacing Cloudflare Functions)
- **Bun_Runtime**: A fast JavaScript runtime that replaces Node.js for both development and production
- **PWA**: Progressive Web App - enables offline functionality for unreliable Zambian connections
- **ECZ_Grades**: Zambian Examinations Council grading scale (1-9, where 1-6 is pass, 7-9 is fail)
- **Supabase**: Backend-as-a-service providing authentication, database, and storage (retained)
- **WebSocket_Service**: Real-time communication layer for dashboard updates (migrating from Supabase Realtime)

## Requirements

### Requirement 1: Platform Migration from Cloudflare to Vercel

**User Story:** As a system administrator, I want to migrate the hosting platform from Cloudflare Pages to Vercel Free Plan, so that we can leverage Vercel's deployment infrastructure and reduce operational complexity.

#### Acceptance Criteria

1. THE Migration_System SHALL deploy the React frontend to Vercel's static hosting
2. WHEN a Cloudflare Function exists, THE Migration_System SHALL convert it to a Vercel Serverless Function with equivalent functionality
3. THE Migration_System SHALL preserve all 47 existing API endpoints during migration
4. WHEN environment variables are configured in wrangler.toml, THE Migration_System SHALL migrate them to Vercel environment configuration
5. THE Migration_System SHALL configure Vercel to use Bun as the build runtime
6. IF a deployment fails, THEN THE Migration_System SHALL provide clear error messages without exposing sensitive configuration
7. THE Migration_System SHALL maintain the same URL routing patterns for API endpoints

### Requirement 2: Bun Runtime Migration

**User Story:** As a developer, I want to migrate from Node.js to Bun runtime, so that we can benefit from faster build times, native TypeScript support, and improved performance.

#### Acceptance Criteria

1. THE Build_System SHALL use Bun for all development commands (dev server, testing, linting)
2. THE Build_System SHALL use Bun for production builds
3. WHEN a Node.js-specific API is used, THE Migration_System SHALL replace it with Bun-native equivalent
4. THE Build_System SHALL configure Vite to work with Bun runtime
5. THE Migration_System SHALL update package.json scripts to use Bun commands
6. WHEN dependencies are installed, THE Build_System SHALL use bun install instead of npm install
7. THE Build_System SHALL generate a bun.lockb file for dependency locking
8. IF a dependency is incompatible with Bun, THEN THE Migration_System SHALL identify and replace it with a compatible alternative

### Requirement 3: Vercel Serverless Function Migration

**User Story:** As a developer, I want to convert Cloudflare Functions to Vercel Serverless Functions, so that the API layer works correctly on the new platform.

#### Acceptance Criteria

1. WHEN a Cloudflare Function uses `onRequest(context)` pattern, THE Migration_System SHALL convert it to Vercel's `export default function handler(req, res)` pattern
2. THE Migration_System SHALL create an `api/` directory structure for Vercel functions
3. WHEN the Cloudflare middleware handles CORS, THE Migration_System SHALL implement equivalent CORS handling in Vercel
4. THE Migration_System SHALL preserve rate limiting functionality in the new function format
5. WHEN a function accesses environment variables via `context.env`, THE Migration_System SHALL convert to `process.env` access
6. THE Migration_System SHALL maintain the same request/response JSON format for API compatibility
7. IF a function uses Cloudflare-specific features (AI binding, KV), THEN THE Migration_System SHALL remove or replace with alternatives

### Requirement 4: Feature Removal - AI Systems

**User Story:** As a product owner, I want to remove AI features except OCR, so that we can simplify the system and reduce complexity.

#### Acceptance Criteria

1. THE Migration_System SHALL remove the Cloudflare AI chat assistant (`functions/ai/chat.ts`)
2. THE Migration_System SHALL remove the AI admission prediction system (`functions/ai/predict.ts`)
3. THE Migration_System SHALL remove the AI document analysis system (`functions/ai/analyze-document.ts`)
4. THE Migration_System SHALL remove the AI trend analysis system (`functions/ai/trends.ts`)
5. THE Migration_System SHALL preserve tesseract.js for OCR document scanning
6. THE Migration_System SHALL remove the `CloudflareAI` client class from frontend code
7. WHEN AI features are referenced in UI components, THE Migration_System SHALL remove those UI elements
8. THE Migration_System SHALL remove the AI binding configuration from deployment settings

### Requirement 5: Feature Removal - Analytics Systems

**User Story:** As a product owner, I want to remove analytics systems, so that we can simplify the codebase and reduce third-party dependencies.

#### Acceptance Criteria

1. THE Migration_System SHALL remove Umami analytics integration
2. THE Migration_System SHALL remove Sentry error monitoring integration
3. THE Migration_System SHALL remove the analytics API endpoints (`functions/analytics/`)
4. THE Migration_System SHALL remove analytics tracking code from frontend components
5. THE Migration_System SHALL remove telemetry collection functionality
6. WHEN analytics environment variables exist, THE Migration_System SHALL remove them from configuration
7. THE Migration_System SHALL preserve basic console logging for debugging purposes

### Requirement 6: Feature Simplification - Admin Workflows

**User Story:** As a product owner, I want to simplify admin workflows, so that the system is easier to maintain while preserving core review capabilities.

#### Acceptance Criteria

1. THE Migration_System SHALL preserve admin application review functionality
2. THE Migration_System SHALL preserve admin user management (basic CRUD operations)
3. THE Migration_System SHALL remove complex workflow engine functionality
4. THE Migration_System SHALL remove predictive analytics dashboards
5. THE Migration_System SHALL remove bulk notification management complexity
6. THE Migration_System SHALL preserve simple email notification sending
7. WHEN admin dashboard components use removed features, THE Migration_System SHALL simplify or remove those components

### Requirement 7: WebSocket Migration from Supabase Realtime

**User Story:** As a developer, I want to migrate from Supabase Realtime to a Vercel-compatible WebSocket solution, so that real-time dashboard updates continue to work.

#### Acceptance Criteria

1. THE Migration_System SHALL remove Supabase Realtime channel subscriptions
2. THE Migration_System SHALL implement polling-based updates as a fallback for real-time features
3. WHEN dashboard data needs real-time updates, THE System SHALL use React Query's refetch intervals
4. THE Migration_System SHALL remove the RealtimeProvider component
5. THE Migration_System SHALL remove the RealtimeIndicator component
6. THE Migration_System SHALL update admin dashboard hooks to use polling instead of WebSocket subscriptions
7. THE Migration_System SHALL update student dashboard hooks to use polling instead of WebSocket subscriptions
8. IF real-time updates are critical, THEN THE System SHALL implement a lightweight polling mechanism with 30-second intervals

### Requirement 8: Preserve Core Application Functionality

**User Story:** As a student, I want the application wizard and auto-save to continue working after migration, so that I can complete my application without data loss.

#### Acceptance Criteria

1. THE Application_Wizard SHALL maintain the 4-step flow (Personal Info → Academic History → Program Selection → Document Upload)
2. THE Auto_Save_System SHALL continue saving form data every 8 seconds
3. THE Auto_Save_System SHALL work offline using localStorage
4. WHEN a student returns to an incomplete application, THE System SHALL restore their saved progress
5. THE System SHALL preserve document upload functionality with tesseract.js OCR
6. THE System SHALL preserve payment proof upload functionality
7. THE System SHALL maintain Zambian data format support (+260 phone numbers, ECZ grades 1-9)
8. THE System SHALL preserve the non-blocking validation approach (students can proceed even if eligibility checks fail)

### Requirement 9: Preserve PWA and Offline Functionality

**User Story:** As a student in Zambia with unreliable internet, I want the application to work offline, so that I can continue working on my application during connectivity issues.

#### Acceptance Criteria

1. THE PWA SHALL continue to function offline for core features
2. THE Service_Worker SHALL cache static assets for offline access
3. WHEN the user is offline, THE System SHALL queue form submissions for later sync
4. THE System SHALL display offline status indicators to users
5. WHEN connectivity is restored, THE System SHALL automatically sync queued data
6. THE PWA SHALL maintain the existing manifest.json configuration
7. THE Build_System SHALL generate service worker with Vite PWA plugin

### Requirement 10: Database Compatibility

**User Story:** As a system administrator, I want to maintain backward compatibility with the existing database, so that no student data is lost during migration.

#### Acceptance Criteria

1. THE Migration_System SHALL NOT modify existing Supabase database schema
2. THE Migration_System SHALL preserve all 86 existing database tables
3. THE System SHALL continue using Supabase for authentication
4. THE System SHALL continue using Supabase for database operations
5. THE System SHALL continue using Supabase Storage for file uploads
6. WHEN API endpoints access the database, THE Migration_System SHALL preserve the same query patterns
7. THE Migration_System SHALL NOT require any database migrations for the platform change

### Requirement 11: Security and Compliance

**User Story:** As a system administrator, I want to maintain security standards after migration, so that student data remains protected.

#### Acceptance Criteria

1. THE System SHALL NOT log any Personally Identifiable Information (PII)
2. THE System SHALL maintain HTTPS for all communications
3. THE System SHALL preserve JWT-based authentication
4. THE System SHALL maintain CORS protection for API endpoints
5. THE System SHALL preserve rate limiting on sensitive endpoints
6. WHEN errors occur, THE System SHALL NOT expose stack traces or sensitive configuration
7. THE System SHALL maintain Content Security Policy headers

### Requirement 12: Performance Requirements

**User Story:** As a student, I want the application to load quickly on mobile devices, so that I can use it effectively on slower connections.

#### Acceptance Criteria

1. THE System SHALL achieve First Contentful Paint under 1.5 seconds
2. THE System SHALL achieve Largest Contentful Paint under 2.5 seconds
3. THE System SHALL maintain main bundle size under 500KB
4. THE System SHALL lazy-load page components
5. THE System SHALL maintain code splitting for vendor libraries
6. WHEN images are below the fold, THE System SHALL use lazy loading
7. THE Auto_Save_System SHALL NOT block UI interactions
