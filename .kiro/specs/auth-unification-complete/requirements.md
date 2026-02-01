# Auth Unification - Single Source of Truth

## Overview

Complete the migration from hybrid Supabase/Custom auth to a unified custom JWT authentication system. This spec addresses the findings from the forensic analysis showing the system is only 40% migrated, with dual auth paths creating security vulnerabilities and inconsistencies.

**Date**: January 31, 2026  
**Priority**: Critical (Security)  
**Estimated Effort**: Large (Multi-day)

## Problem Statement

The current system has:
- **Dual auth systems**: Custom JWT (3 endpoints) vs Supabase SDK (5 endpoints)
- **Triple token storage**: HTTP-only cookies + localStorage + Supabase session
- **Inconsistent RBAC**: Deterministic JWT permissions vs DB lookups
- **Security gaps**: 70% of endpoints lack Arcjet protection
- **XSS vulnerability**: Tokens stored in localStorage

## Goals

1. Single authentication source of truth (custom JWT via HTTP-only cookies)
2. All API endpoints use custom auth middleware
3. All API endpoints use database abstraction layer
4. All endpoints protected by Arcjet
5. Frontend uses only HTTP-only cookies (no localStorage tokens)
6. Remove Supabase Auth SDK dependency

---

## User Stories

### US-1: Backend API Migration

**AS A** system administrator  
**I WANT** all API endpoints to use the same authentication system  
**SO THAT** there are no security gaps or inconsistent behavior

#### Acceptance Criteria
- [ ] AC-1.1: `api/applications.ts` uses `requireAuth`/`getAuthUser` from `api/_lib/auth/middleware.ts`
- [ ] AC-1.2: `api/catalog.ts` uses database abstraction layer (`query()` from `api/_lib/db.ts`)
- [ ] AC-1.3: `api/documents.ts` uses `requireAuth` and database abstraction
- [ ] AC-1.4: `api/notifications.ts` uses `requireAuth` and database abstraction
- [ ] AC-1.5: `api/payments.ts` uses `requireAuth` and database abstraction
- [ ] AC-1.6: All endpoints wrapped with `withArcjetProtection()`
- [ ] AC-1.7: `api/_lib/supabaseClient.ts` auth functions (`getUserFromRequest`) are no longer imported by any endpoint

### US-2: Database Query Migration

**AS A** developer  
**I WANT** all database queries to use the typed query builder  
**SO THAT** queries are consistent, type-safe, and Neon-ready

#### Acceptance Criteria
- [ ] AC-2.1: `api/_lib/queries.ts` has query builders for applications, documents, notifications, payments, catalog
- [ ] AC-2.2: All `supabaseAdmin.from()` calls replaced with `query()` calls
- [ ] AC-2.3: Complex queries (joins, filters) work correctly with the abstraction layer
- [ ] AC-2.4: Error handling is consistent across all endpoints

### US-3: Frontend Auth Unification

**AS A** user  
**I WANT** authentication to work seamlessly without security vulnerabilities  
**SO THAT** my session is secure and consistent

#### Acceptance Criteria
- [ ] AC-3.1: `src/hooks/auth/useSessionListener.ts` no longer uses `supabase.auth.signInWithPassword()`
- [ ] AC-3.2: `src/lib/api/authApi.ts` no longer uses `supabase.auth.getSession()`
- [ ] AC-3.3: No tokens stored in localStorage - only HTTP-only cookies
- [ ] AC-3.4: Frontend auth state derived from `/api/auth?action=session` endpoint
- [ ] AC-3.5: Sign up flow uses custom `/api/auth?action=register` endpoint
- [ ] AC-3.6: Password reset flow uses custom API (not Supabase)
- [ ] AC-3.7: `src/lib/supabase.ts` auth configuration removed (keep DB client for storage only)

### US-4: Token Storage Security

**AS A** security engineer  
**I WANT** all auth tokens stored in HTTP-only cookies only  
**SO THAT** tokens are not accessible to XSS attacks

#### Acceptance Criteria
- [ ] AC-4.1: Remove `localStorage.setItem('mihas-auth-token', ...)` from all frontend code
- [ ] AC-4.2: Remove `localStorage.getItem('mihas-auth-token')` from all frontend code
- [ ] AC-4.3: All API calls use `credentials: 'include'` to send cookies
- [ ] AC-4.4: Backend extracts tokens from cookies (already implemented in `api/_lib/auth/cookies.ts`)
- [ ] AC-4.5: CORS configuration allows credentials from frontend origin

### US-5: Supabase SDK Cleanup

**AS A** maintainer  
**I WANT** Supabase Auth SDK removed from the codebase  
**SO THAT** there's no confusion about which auth system to use

#### Acceptance Criteria
- [ ] AC-5.1: `api/_lib/supabaseClient.ts` - Remove `getUserFromRequest`, `requireUser`, auth-related exports
- [ ] AC-5.2: `src/lib/supabase.ts` - Remove auth configuration, keep only DB/storage client
- [ ] AC-5.3: No imports of `supabase.auth.*` methods in frontend code
- [ ] AC-5.4: Update `package.json` - Supabase SDK kept only for database/storage (not auth)
- [ ] AC-5.5: Remove Supabase Realtime configuration (use SSE/polling instead)

### US-6: Realtime Migration

**AS A** user  
**I WANT** real-time updates to work without Supabase Realtime  
**SO THAT** the system is fully independent of Supabase Auth

#### Acceptance Criteria
- [ ] AC-6.1: Frontend uses `/api/sessions?action=connect` for SSE connection
- [ ] AC-6.2: Frontend falls back to `/api/sessions?action=poll` when SSE unavailable
- [ ] AC-6.3: `src/lib/supabase.ts` realtime configuration removed
- [ ] AC-6.4: Application status updates use SSE/polling instead of Supabase channels

---

## Out of Scope

- Database migration from Supabase to Neon (separate spec)
- Supabase Storage migration (keep using Supabase for file storage)
- Performance optimization (separate concern)
- UI/UX changes (auth flows remain the same from user perspective)

## Dependencies

- Existing custom auth infrastructure (`api/_lib/auth/*`)
- Existing database abstraction (`api/_lib/db.ts`, `api/_lib/queries.ts`)
- Existing Arcjet configuration (`api/_lib/arcjet.ts`)
- Database schema already supports custom auth (migration applied)

## Risks

1. **Breaking existing sessions**: Mitigated by supporting both auth methods during transition
2. **Data loss**: No data migration needed - same database, different access method
3. **Downtime**: Zero-downtime deployment possible with gradual rollout
4. **Regression**: Comprehensive testing required before removing legacy code

## Success Metrics

- 100% of API endpoints use custom auth middleware
- 0 localStorage token storage
- 100% Arcjet protection coverage
- 0 imports of `supabase.auth.*` in codebase
- All existing functionality preserved
