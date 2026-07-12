# Implementation Plan: Admin System Health Fixes

## Overview

This implementation plan addresses critical issues in the MIHAS Admin System Health Dashboard through incremental fixes to API endpoints, database queries, and frontend components. Each task builds on previous work to ensure the system remains stable throughout the implementation.

## Tasks

- [x] 1. Add HEAD method support to API endpoints
  - [x] 1.1 Update api/applications.ts to handle HEAD requests
    - Add HEAD method check before authentication
    - Return 200 status with empty body for HEAD requests
    - _Requirements: 1.1, 1.3_
  
  - [x] 1.2 Update api/notifications.ts to handle HEAD requests
    - Add HEAD method check before authentication
    - Return 200 status with empty body for HEAD requests
    - _Requirements: 1.2, 1.3_
  
  - [x] 1.3 Update remaining API endpoints (admin, auth, catalog, documents, payments, sessions) with HEAD support
    - Apply same pattern to all consolidated endpoints
    - _Requirements: 1.3_
  
  - [x] 1.4 Write property test for HEAD method support
    - **Property 1: HEAD Method Support for API Endpoints**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 2. Add settings action to admin API endpoint
  - [x] 2.1 Add settings action handlers to api/admin.ts
    - Implement handleSettings function for GET (list all settings)
    - Implement POST handler for creating new settings
    - Implement PUT handler for updating settings
    - Implement DELETE handler for removing settings
    - Add action routing in main handler switch statement
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_
  
  - [x] 2.2 Write property test for settings CRUD round-trip
    - **Property 2: Settings CRUD Round-Trip**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  
  - [x] 2.3 Write property test for settings authentication
    - **Property 3: Settings Authentication Requirement**
    - **Validates: Requirements 2.6**

- [x] 3. Update frontend to use correct settings endpoint
  - [x] 3.1 Update src/lib/api/adminApi.ts to use /api/admin?action=settings
    - Change fetchSettings to call /api/admin?action=settings
    - Change createSetting to call /api/admin?action=settings with POST
    - Change updateSetting to call /api/admin?action=settings with PUT
    - Change deleteSetting to call /api/admin?action=settings with DELETE
    - _Requirements: 6.1_
  
  - [x] 3.2 Add HTML response detection to API client
    - Check if response starts with "<!DOCTYPE" or "<html"
    - Throw descriptive error when HTML is detected
    - _Requirements: 6.4_
  
  - [x] 3.3 Write property test for HTML error response detection
    - **Property 8: Frontend HTML Error Response Detection**
    - **Validates: Requirements 6.4**

- [x] 4. Checkpoint - Verify API endpoints work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Fix audit log actor relationship
  - [x] 5.1 Update src/services/admin/audit.ts query pattern
    - Change join syntax to use explicit foreign key reference
    - Use LEFT JOIN pattern: `profiles!audit_logs_actor_id_fkey`
    - Handle null actor data in response mapping
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 5.2 Write property test for audit log actor resilience
    - **Property 4: Audit Log Actor Relationship Resilience**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 6. Create RLS policy migration for user_roles
  - [x] 6.1 Create Supabase migration for user_roles RLS policy
    - Create migration file in supabase/migrations/
    - Add policy allowing super_admin to manage all roles
    - Ensure policy uses proper auth.uid() checks
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 6.2 Write property tests for RLS policies
    - **Property 5: Super Admin Role Management**
    - **Property 6: Non-Admin Role Management Rejection**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 7. Update System Health Dashboard for graceful degradation
  - [x] 7.1 Update src/analysis/security/SecurityAnalyzer.ts
    - Remove calls to get_security_definer_views RPC
    - Remove calls to get_permissive_rls_policies RPC
    - Add try-catch with fallback for all security checks
    - Return default healthy status when checks fail
    - _Requirements: 5.1, 5.4, 5.5_
  
  - [x] 7.2 Update src/analysis/database/SchemaAnalyzer.ts
    - Remove calls to detect_orphaned_records RPC
    - Remove calls to execute_sql RPC
    - Remove queries to information_schema tables
    - Add try-catch with fallback for all schema checks
    - Return default healthy status when checks fail
    - _Requirements: 5.1, 5.2, 5.4, 5.5_
  
  - [x] 7.3 Update src/analysis/AnalysisOrchestrator.ts
    - Wrap all analysis calls in safe error handlers
    - Return default dashboard data when analysis fails
    - Log warnings instead of throwing errors
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 7.4 Write property test for health dashboard resilience
    - **Property 7: Health Dashboard Graceful Degradation**
    - **Validates: Requirements 5.1, 5.2, 5.4**

- [x] 8. Add helpful 404 for legacy admin-settings endpoint
  - [x] 8.1 Update api/[...path].ts catch-all handler
    - Add specific check for /api/admin-settings path
    - Return 404 with message guiding to /api/admin?action=settings
    - _Requirements: 2.5_

- [x] 9. Final checkpoint - Verify all fixes work together
  - Ensure all tests pass, ask the user if questions arise.
  - Verify System Health Dashboard loads without errors
  - Verify Admin Settings page works correctly
  - Verify Audit Log page displays correctly

## Notes

- All tasks are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- All API changes maintain backward compatibility
- Database migrations are append-only per project conventions
