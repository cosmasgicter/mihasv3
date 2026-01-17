# Requirements Document

## Introduction

This specification addresses a collection of production bugs and critical issues identified in the MIHAS Application System on January 16, 2026. The system is a live production admissions platform for Mukuba Institute of Health and Allied Sciences (Zambia) with real users and real data. All fixes must maintain backward compatibility with existing data (86 database tables, 25 applications) and preserve the system's production stability.

The issues span multiple areas: database function misalignment, frontend-backend API contract violations, UI/UX inconsistencies, authentication performance, and component implementation correctness. Each fix requires careful analysis to ensure professional, smooth operation.

## Glossary

- **Admin_Dashboard**: The administrative interface for managing applications, users, and system settings
- **Application_List**: The page displaying all student applications with filtering capabilities
- **Auth_System**: The authentication system powered by Supabase GoTrueClient v2.76.1
- **Skip_Link**: Accessibility feature allowing keyboard users to skip to main content
- **Draft_Application**: An application with status='draft' that has been started but not yet submitted
- **React_Error_321**: A React error indicating "Cannot update a component while rendering a different component"
- **Shadcn_Registry**: The component library registry used for UI components (Radix UI primitives)
- **applications**: The primary applications table in Supabase (NOT applications_new)
- **notifications**: The notifications table with column `is_read` (NOT `read`)
- **profiles**: User profile table linked to auth.users
- **user_profiles**: Legacy user profile table with role information
- **get_admin_dashboard_stats**: Supabase RPC function for dashboard statistics
- **get_admin_dashboard_overview**: Supabase RPC function for comprehensive dashboard data

## Requirements

### Requirement 1: Fix Database Function Table References

**User Story:** As an administrator, I want the dashboard to query the correct database tables, so that I see accurate statistics.

#### Acceptance Criteria

1. THE get_admin_dashboard_stats function SHALL reference the `applications` table (NOT `applications_new`)
2. THE get_admin_dashboard_overview function SHALL reference the `applications` table (NOT `applications_new`)
3. WHEN the dashboard loads THEN the System SHALL return correct counts: 25 total, 13 approved, 6 submitted, 3 draft, 2 rejected, 1 under_review
4. THE approval rate calculation SHALL correctly compute 52% (13 approved / 25 total)

### Requirement 2: Fix Notifications API Column Name

**User Story:** As a user, I want to see my notifications without errors, so that I stay informed about my application status.

#### Acceptance Criteria

1. THE notifications query SHALL use column `is_read` (NOT `read`)
2. WHEN fetching unread notifications THEN the System SHALL query `is_read=eq.false`
3. THE System SHALL not return 400 errors when fetching notifications

### Requirement 3: Reduce Console Logging Noise

**User Story:** As a developer, I want to reduce excessive Supabase auth debug logging, so that the console remains useful for debugging actual issues.

#### Acceptance Criteria

1. WHEN the application initializes in production mode THEN the Auth_System SHALL suppress verbose GoTrueClient debug logs
2. WHEN the application runs in development mode THEN the Auth_System SHALL allow configurable log levels
3. THE Auth_System SHALL only log errors and critical warnings in production

### Requirement 4: Fix Skip Link Visibility

**User Story:** As a user, I want skip links to only be visible when focused, so that they don't create visual artifacts on the page.

#### Acceptance Criteria

1. THE Skip_Link component SHALL be visually hidden by default using CSS transform
2. WHEN a Skip_Link receives keyboard focus THEN the Skip_Link SHALL become visible
3. WHEN a Skip_Link loses focus THEN the Skip_Link SHALL return to hidden state
4. THE Skip_Link SHALL have correct href targets (main content, not footer)

### Requirement 5: Update Track Application Page Design

**User Story:** As a student, I want the track application page to use the current design system, so that I have a consistent experience across the application.

#### Acceptance Criteria

1. THE Track_Application_Page SHALL use the current design system components
2. THE Track_Application_Page SHALL display application status with consistent styling
3. THE Track_Application_Page SHALL be responsive on mobile devices
4. THE Track_Application_Page SHALL match the visual style of other updated pages

### Requirement 6: Consolidate Duplicate Visual Elements

**User Story:** As a developer, I want to eliminate duplicate visual elements, so that the codebase is maintainable and the UI is consistent.

#### Acceptance Criteria

1. WHEN duplicate components exist THEN the System SHALL use the newer implementation
2. THE System SHALL remove or deprecate older duplicate implementations
3. THE System SHALL maintain consistent styling across all pages

### Requirement 7: Fix Mobile Auth Page Text Visibility

**User Story:** As a mobile user, I want to see informative text on sign up and sign in pages, so that I understand the application process.

#### Acceptance Criteria

1. WHEN viewing the sign up page on mobile THEN the Auth_System SHALL display informative text
2. WHEN viewing the sign in page on mobile THEN the Auth_System SHALL display informative text
3. THE informative text SHALL be readable and properly styled on all screen sizes
4. THE mobile layout SHALL not hide essential information

### Requirement 8: Fix Admin Dashboard Statistics Display

**User Story:** As an administrator, I want to see accurate statistics on the dashboard, so that I can make informed decisions.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display the correct total application count (25)
2. THE Admin_Dashboard SHALL calculate and display the correct approval rate percentage (52%)
3. THE AI Insights section SHALL call `get_admin_dashboard_overview` RPC function
4. THE System SHALL NOT call non-existent `get_dashboard_stats` function (404 error)

### Requirement 9: Display Draft Applications in List

**User Story:** As an administrator, I want to see draft applications in the applications list, so that I can monitor application progress.

#### Acceptance Criteria

1. THE Application_List SHALL include applications with status='draft'
2. THE Application_List SHALL allow filtering by application status including drafts
3. WHEN a draft application exists THEN it SHALL appear in the appropriate filtered view
4. THE Application_List SHALL clearly indicate draft status visually

### Requirement 10: Fix Approve/Reject Functionality

**User Story:** As an administrator, I want to approve or reject applications without errors, so that I can process applications efficiently.

#### Acceptance Criteria

1. WHEN an administrator clicks approve THEN the System SHALL update the application status without React errors
2. WHEN an administrator clicks reject THEN the System SHALL update the application status without React errors
3. IF an error occurs during status update THEN the System SHALL display a user-friendly error message
4. THE System SHALL properly handle component state during status transitions (avoid React Error #321)

### Requirement 11: Fix Users Page Display

**User Story:** As an administrator, I want to view the users list without errors, so that I can manage system users.

#### Acceptance Criteria

1. WHEN an administrator navigates to the users page THEN the System SHALL display the user list from profiles table
2. THE Users_Page SHALL not display "user not found" when users exist (20 profiles in database)
3. IF no users match the current filter THEN the System SHALL display an appropriate empty state message
4. THE Users_Page SHALL handle loading and error states gracefully

### Requirement 12: Synchronize Recent Activity with Application List

**User Story:** As an administrator, I want recent activity entries to correspond to visible applications, so that I can track application flow accurately.

#### Acceptance Criteria

1. WHEN an application appears in recent activity THEN it SHALL also appear in the Application_List
2. THE System SHALL use consistent data sources for activity and application displays
3. THE Application_List query SHALL include all application statuses shown in recent activity
4. Applications from Nicole Nokutenda Marera and Bwalya machipi SHALL appear in both views

### Requirement 13: Improve Logout Performance

**User Story:** As a user, I want to log out quickly, so that I can securely end my session without waiting.

#### Acceptance Criteria

1. WHEN a user clicks logout THEN the Auth_System SHALL complete the logout within 2 seconds
2. THE logout process SHALL clear local session data immediately
3. THE logout process SHALL not block on external API calls
4. IF the logout API call fails THEN the System SHALL still clear local state and redirect

### Requirement 14: Verify Shadcn Component Implementation

**User Story:** As a developer, I want shadcn components to be correctly implemented, so that the UI behaves as expected.

#### Acceptance Criteria

1. THE System SHALL use shadcn components according to their documented API
2. THE System SHALL not override shadcn component internals incorrectly
3. THE System SHALL use proper composition patterns for shadcn components
4. WHEN shadcn components are customized THEN the customizations SHALL follow documented extension patterns
