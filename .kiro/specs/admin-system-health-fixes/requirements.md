# Requirements Document

## Introduction

This document specifies the requirements for fixing critical issues in the MIHAS Admin System Health Dashboard. The dashboard is currently showing false positives and errors due to missing API endpoints, non-existent Supabase RPC functions, and database relationship issues. These fixes are essential for accurate system monitoring and admin functionality.

## Glossary

- **API_Endpoint**: A Vercel serverless function that handles HTTP requests
- **RPC_Function**: A Supabase Remote Procedure Call function stored in the database
- **RLS_Policy**: Row Level Security policy that controls data access in Supabase
- **HEAD_Request**: An HTTP method that requests headers only, used for health checks
- **System_Health_Dashboard**: Admin interface showing system status and metrics
- **Audit_Log**: Record of system actions for security and compliance tracking
- **Foreign_Key**: Database constraint linking records between tables

## Requirements

### Requirement 1: API Endpoint HEAD Method Support

**User Story:** As a system administrator, I want the health dashboard to accurately check API endpoint status, so that I can monitor system availability without false error reports.

#### Acceptance Criteria

1. WHEN a HEAD request is sent to /api/applications, THE API_Endpoint SHALL return a 200 status with appropriate headers
2. WHEN a HEAD request is sent to /api/notifications, THE API_Endpoint SHALL return a 200 status with appropriate headers
3. WHEN a HEAD request is sent to any consolidated API endpoint, THE API_Endpoint SHALL handle the request without requiring authentication
4. IF a HEAD request fails due to server error, THEN THE API_Endpoint SHALL return appropriate error status codes

### Requirement 2: Admin Settings API Endpoint

**User Story:** As an administrator, I want to manage system settings through the admin interface, so that I can configure the application without database access.

#### Acceptance Criteria

1. WHEN a GET request is sent to /api/admin?action=settings, THE API_Endpoint SHALL return JSON data containing system settings
2. WHEN a POST request is sent to /api/admin?action=settings with valid setting data, THE API_Endpoint SHALL create a new setting
3. WHEN a PUT request is sent to /api/admin?action=settings with valid update data, THE API_Endpoint SHALL update the existing setting
4. WHEN a DELETE request is sent to /api/admin?action=settings with a setting ID, THE API_Endpoint SHALL delete the setting
5. IF the /api/admin-settings endpoint is called, THEN THE API_Endpoint SHALL return a 404 with guidance to use /api/admin?action=settings
6. WHEN any settings action is performed, THE API_Endpoint SHALL require admin authentication

### Requirement 3: Audit Log Relationship Fix

**User Story:** As an administrator, I want to view audit logs with actor information, so that I can track who performed system actions.

#### Acceptance Criteria

1. WHEN audit logs are queried with actor information, THE Database SHALL return logs with associated profile data
2. WHEN an audit log references a deleted user, THE Database SHALL return the log with null actor information
3. THE Audit_Service SHALL query audit logs without relationship errors
4. WHEN displaying audit logs, THE System_Health_Dashboard SHALL show actor email when available

### Requirement 4: User Roles RLS Policy Fix

**User Story:** As a super administrator, I want to manage user roles, so that I can control access permissions for staff members.

#### Acceptance Criteria

1. WHEN an admin updates a user role, THE Database SHALL allow the update if the admin has super_admin privileges
2. WHEN a non-admin attempts to update user roles, THE Database SHALL reject the request with 403 status
3. THE RLS_Policy for user_roles SHALL permit super_admin users to perform INSERT, UPDATE, and DELETE operations
4. WHEN role changes are made, THE System SHALL create an audit log entry

### Requirement 5: System Health Dashboard Graceful Degradation

**User Story:** As an administrator, I want the System Health Dashboard to work even when some checks fail, so that I can still monitor available system components.

#### Acceptance Criteria

1. WHEN a Supabase RPC function does not exist, THE System_Health_Dashboard SHALL display a fallback status instead of an error
2. WHEN information_schema queries fail, THE System_Health_Dashboard SHALL skip those checks and continue with available data
3. WHEN the dashboard loads, THE System_Health_Dashboard SHALL show healthy status for components that cannot be verified
4. IF any health check fails, THEN THE System_Health_Dashboard SHALL log the failure without crashing
5. THE System_Health_Dashboard SHALL NOT call non-existent RPC functions (detect_orphaned_records, get_permissive_rls_policies, execute_sql, get_security_definer_views)

### Requirement 6: Frontend API Client Updates

**User Story:** As a developer, I want the frontend to call the correct API endpoints, so that admin features work correctly after the API consolidation.

#### Acceptance Criteria

1. WHEN the Settings page loads, THE Frontend SHALL call /api/admin?action=settings instead of /api/admin-settings
2. WHEN the audit service queries logs, THE Frontend SHALL handle missing actor relationships gracefully
3. THE Frontend SHALL display appropriate error messages when API calls fail
4. WHEN API responses contain HTML instead of JSON, THE Frontend SHALL detect this and show a user-friendly error

