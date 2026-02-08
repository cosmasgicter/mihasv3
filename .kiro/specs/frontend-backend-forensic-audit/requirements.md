# Requirements Document

## Introduction

This document defines the requirements for a comprehensive forensic audit and synchronization of the MIHAS Application System - a production Zambian admissions portal. The goal is to ensure frontend and backend communicate flawlessly, deterministically, and efficiently, with particular focus on low-end mobile devices and unreliable network conditions.

## Glossary

- **Audit_System**: The forensic analysis tooling and processes that examine the codebase
- **Frontend**: React SPA built with Vite, located in `src/` directory
- **Backend**: Vercel Serverless Functions in `api/` directory (bundled from `api-src/`)
- **Contract**: The agreed interface between frontend API calls and backend endpoints
- **SSE**: Server-Sent Events for realtime updates
- **Loader**: Any UI component showing loading state (spinner, skeleton, progress indicator)
- **Dead_Code**: Code that is never executed or serves no purpose
- **Race_Condition**: A bug where system behavior depends on timing of uncontrolled events

## Requirements

### Requirement 1: Frontend-Backend Contract Audit

**User Story:** As a developer, I want a complete mapping of all frontend API calls to their backend endpoints, so that I can identify and fix any mismatches.

#### Acceptance Criteria

1. WHEN the Audit_System scans the Frontend THEN it SHALL document every API call with file path, line number, endpoint URL, HTTP method, headers, and auth mechanism
2. WHEN the Audit_System scans the Backend THEN it SHALL verify each endpoint exists and matches the Frontend's expected HTTP method
3. WHEN the Audit_System compares Frontend and Backend THEN it SHALL validate that request payload schemas match
4. WHEN the Audit_System compares Frontend and Backend THEN it SHALL validate that response schemas match
5. IF a mismatch is detected THEN the Audit_System SHALL flag it with specific file paths and line numbers
6. IF an endpoint is called by Frontend but missing in Backend THEN the Audit_System SHALL flag it as MISSING_ENDPOINT
7. IF an endpoint exists in Backend but is never called by Frontend THEN the Audit_System SHALL flag it as UNUSED_ENDPOINT
8. WHEN the audit completes THEN the Audit_System SHALL generate a CONTRACT_MISMATCH_REPORT

### Requirement 2: Page-by-Page Functional Audit

**User Story:** As a user (student or admin), I need every page to work reliably without race conditions, on mobile, and with graceful network recovery.

#### Acceptance Criteria

1. WHEN the Audit_System examines a page THEN it SHALL trace and document the complete data load path
2. WHEN the Audit_System examines a page THEN it SHALL verify auth checks are present and correct
3. WHEN the Audit_System examines a page THEN it SHALL verify error handling exists for all API calls
4. WHEN the Audit_System examines a page THEN it SHALL verify empty states are handled
5. WHEN the Audit_System examines a page THEN it SHALL verify loading states are handled
6. IF a page has concurrent data fetches THEN the Audit_System SHALL verify no race conditions exist
7. WHEN the Audit_System examines a page THEN it SHALL verify mobile responsiveness
8. WHEN the Audit_System examines a page THEN it SHALL verify network loss recovery behavior
9. IF dead code is found on a page THEN the Audit_System SHALL flag it with evidence
10. IF duplicate logic is found THEN the Audit_System SHALL flag it with evidence
11. IF unused hooks are found THEN the Audit_System SHALL flag them with evidence
12. IF over-fetching is detected THEN the Audit_System SHALL flag it with evidence

### Requirement 3: Loader System Unification

**User Story:** As a user, I need a consistent loading experience without flicker or double loaders.

#### Acceptance Criteria

1. WHEN the Audit_System scans the codebase THEN it SHALL identify all loader/spinner/skeleton implementations
2. IF redundant loader implementations exist THEN the Audit_System SHALL flag them for removal
3. THE unified Loader_System SHALL provide a single global loading mechanism
4. WHEN a page transitions THEN the Loader_System SHALL NOT cause visual flicker
5. WHEN multiple components load simultaneously THEN the Loader_System SHALL NOT display double loaders
6. WHEN navigation occurs THEN the Loader_System SHALL handle loading states correctly
7. WHEN running on slow devices THEN the Loader_System SHALL perform without degradation

### Requirement 4: Auth and Workflow Coherence

**User Story:** As a user, I need auth state to propagate correctly with proper role enforcement and no cross-role leakage.

#### Acceptance Criteria

1. WHEN the Audit_System examines auth THEN it SHALL map the complete student workflow step-by-step
2. WHEN the Audit_System examines auth THEN it SHALL map the complete admin workflow step-by-step
3. WHEN the Audit_System examines auth THEN it SHALL verify auth state propagates correctly across all components
4. WHEN the Audit_System examines auth THEN it SHALL verify role enforcement is consistent
5. WHEN the Audit_System examines auth THEN it SHALL verify redirect logic is correct
6. WHEN the Audit_System examines auth THEN it SHALL verify permission boundaries are enforced
7. IF cross-role data leakage is possible THEN the Audit_System SHALL flag it as SECURITY_ISSUE
8. IF broken workflow transitions exist THEN the Audit_System SHALL flag them with evidence
9. IF stale session assumptions exist THEN the Audit_System SHALL flag them with evidence
10. IF auth state management is fragmented THEN the Audit_System SHALL recommend unification

### Requirement 5: Realtime System (SSE) Audit

**User Story:** As a user, I need realtime updates to work reliably even on low-end mobile devices with poor connectivity.

#### Acceptance Criteria

1. WHEN the Audit_System examines SSE THEN it SHALL verify all Backend SSE endpoints function correctly
2. WHEN the Audit_System examines SSE THEN it SHALL verify all Frontend SSE listeners are properly implemented
3. THE SSE_System SHALL implement auto-reconnect on connection loss
4. THE SSE_System SHALL implement exponential backoff strategy
5. THE SSE_System SHALL be battery-friendly on mobile devices
6. THE SSE_System SHALL be wired to notification updates
7. THE SSE_System SHALL be wired to application status updates
8. THE SSE_System SHALL be wired to admin dashboard updates
9. THE SSE_System SHALL be wired to user-facing updates
10. WHERE SSE is proven impossible THEN polling SHALL be used as fallback

### Requirement 6: Notifications and Email Pipeline Audit

**User Story:** As a user, I need notifications to appear instantly and emails to be triggered exactly once.

#### Acceptance Criteria

1. WHEN the Audit_System examines notifications THEN it SHALL audit all notification triggers
2. WHEN the Audit_System examines notifications THEN it SHALL audit all delivery mechanisms
3. WHEN the Audit_System examines notifications THEN it SHALL verify realtime sync works correctly
4. WHEN the Audit_System examines email THEN it SHALL verify dispatch mechanisms
5. THE Notification_System SHALL display notifications instantly upon trigger
6. THE Email_System SHALL trigger emails exactly once per event
7. IF duplicate notification sends are possible THEN the Audit_System SHALL flag them
8. WHERE idempotency is required THEN the system SHALL implement idempotency keys

### Requirement 7: Mobile and Performance Forensics

**User Story:** As a user on a low-end Android phone with slow network, I need pages to load quickly and use minimal resources.

#### Acceptance Criteria

1. WHEN the Audit_System examines a page THEN it SHALL test layout responsiveness
2. IF heavy animations exist THEN the Audit_System SHALL flag them for removal
3. THE Frontend SHALL maintain low memory usage on mobile devices
4. THE Frontend SHALL maintain low CPU usage on mobile devices
5. THE Frontend SHALL minimize JS bundle impact
6. THE Frontend SHALL be optimized for cheap Android phones
7. THE Frontend SHALL be optimized for slow networks (3G)

### Requirement 8: UI Polish - Logo Animation

**User Story:** As a user, I want subtle, non-blocking animations that respect accessibility preferences.

#### Acceptance Criteria

1. THE Logo_Animation SHALL use a lightweight character-shuffle effect
2. THE Logo_Animation SHALL be non-blocking to page rendering
3. WHEN reduced-motion preference is set THEN the Logo_Animation SHALL be disabled
4. THE Logo_Animation SHALL NOT affect page performance metrics

### Requirement 9: Stale Code Elimination

**User Story:** As a developer, I need all unused code removed to maintain a clean, auditable codebase.

#### Acceptance Criteria

1. WHEN the Audit_System scans the codebase THEN it SHALL identify unused components
2. WHEN the Audit_System scans the codebase THEN it SHALL identify unused hooks
3. WHEN the Audit_System scans the codebase THEN it SHALL identify legacy integrations (Supabase, Cloudflare)
4. WHEN the Audit_System scans the codebase THEN it SHALL identify commented-out logic
5. WHEN the Audit_System scans the codebase THEN it SHALL identify dead feature flags
6. WHEN Dead_Code is identified THEN the Audit_System SHALL provide evidence (file path, line numbers, reason)
7. THE Audit_System SHALL NOT remove code without documented justification
