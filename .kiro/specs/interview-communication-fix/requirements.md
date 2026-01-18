# Requirements Document

## Introduction

This document specifies the requirements for fixing the interview scheduling and communication system's integration with Supabase. The current implementation has several issues:

1. **RLS Policy Inconsistency** - The `check_is_admin()` function only checks `user_profiles` table while the system primarily uses `profiles` table for role management
2. **Student Interview Query Failure** - Students cannot view their scheduled interviews due to RLS policy conflicts with the join query pattern
3. **Communication Service Bug** - The in-app notification function writes to the wrong table (`notifications` instead of `in_app_notifications`)

## Glossary

- **Application_Interviews**: The Supabase table storing interview scheduling data
- **Interview_Reminders**: The Supabase table tracking sent interview reminders
- **RLS_Policy**: Row Level Security policy controlling data access in Supabase
- **Communication_Service**: The frontend service handling admin-to-applicant messaging
- **In_App_Notifications**: The Supabase table storing user notifications displayed in the app

## Requirements

### Requirement 1: Fix RLS Helper Function Consistency

**User Story:** As a system administrator, I want the RLS helper functions to consistently check user roles across all relevant tables, so that access control works reliably.

#### Acceptance Criteria

1. THE check_is_admin function SHALL query both profiles and user_profiles tables for admin role verification
2. WHEN a user has admin role in either profiles or user_profiles table THEN the check_is_admin function SHALL return true
3. THE check_is_admin function SHALL match the behavior of is_admin_user function for consistency
4. IF a user's role is 'admin', 'super_admin', or 'admissions_officer' THEN the function SHALL grant admin access

### Requirement 2: Fix Student Interview Visibility

**User Story:** As a student, I want to view my scheduled interviews on the Interview page, so that I can prepare for and attend my interviews.

#### Acceptance Criteria

1. WHEN a student accesses the Interview page THEN the System SHALL display all interviews for their applications
2. THE RLS policy for application_interviews SHALL allow students to SELECT their own interview records
3. WHEN querying application_interviews with a join on applications THEN the query SHALL succeed for authenticated students
4. IF a student has no scheduled interviews THEN the System SHALL display an appropriate empty state message
5. THE interview query SHALL return interview data including scheduled_at, mode, location, status, and notes

### Requirement 3: Fix Communication Service In-App Notifications

**User Story:** As an admin, I want to send in-app notifications to applicants, so that they receive important messages within the application.

#### Acceptance Criteria

1. WHEN an admin sends an in-app message THEN the System SHALL insert into the in_app_notifications table
2. THE in-app notification record SHALL include user_id, title, content, and type fields
3. WHEN the notification is created THEN the System SHALL set the read field to false
4. IF the notification insert fails THEN the System SHALL return an appropriate error message
5. THE Communication_Service SHALL use the correct table name 'in_app_notifications' instead of 'notifications'

### Requirement 4: Ensure Interview API Endpoint Consistency

**User Story:** As a developer, I want the interview API endpoints to work consistently with the database schema, so that interview scheduling functions correctly.

#### Acceptance Criteria

1. WHEN scheduling an interview via API THEN the System SHALL verify payment status before allowing scheduling
2. WHEN an interview is scheduled THEN the System SHALL create an in_app_notification for the student
3. THE interview notification SHALL include the scheduled date, time, mode, and location
4. WHEN an interview is rescheduled or cancelled THEN the System SHALL send appropriate notifications
5. THE API SHALL use the supabaseAdminClient to bypass RLS for admin operations

### Requirement 5: Validate Interview Data Integrity

**User Story:** As a system administrator, I want interview data to maintain referential integrity, so that the system remains reliable.

#### Acceptance Criteria

1. THE application_interviews table SHALL have a foreign key constraint to applications table
2. WHEN an application is deleted THEN the System SHALL handle associated interview records appropriately
3. THE interview_reminders table SHALL have a foreign key constraint to application_interviews table
4. WHEN an interview is deleted THEN the System SHALL cascade delete associated reminders
5. THE System SHALL prevent scheduling duplicate active interviews for the same application
