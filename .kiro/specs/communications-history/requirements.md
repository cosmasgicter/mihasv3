# Requirements Document

## Introduction

The MIHAS admissions platform has a working notification system (bell icon, polling, preferences) and backend models for notifications, application status history, and audit logs. However, there is no full-page communications center where students can view all messages, no activity timeline surfacing application status changes, and no admin panel for targeted messaging with per-student communication history. This feature wires the existing backend data end-to-end into dedicated frontend pages and any missing backend endpoints.

## Glossary

- **Communications_Page**: A full-page student-facing view at `/student/communications` that displays all notifications and messages in a scrollable, filterable list
- **Activity_Timeline**: A student-facing chronological view at `/student/history` showing application status transitions, admin feedback, and key events
- **Admin_Communications_Panel**: An admin-facing view for sending targeted messages to individual students and viewing per-student communication history
- **Notification**: An in-app message stored in the `notifications` table, delivered to a specific user with title, message, type, and read status
- **Status_History_Entry**: A record in the `application_status_history` table tracking a status transition with old/new status, notes, changes, and timestamp
- **Communications_Service**: A frontend service module providing API methods for fetching communications, status history, and sending admin messages
- **Timeline_API**: A backend endpoint that returns a student's application status history as a paginated, chronologically ordered list
- **Student**: An authenticated user with the student role who applies to programs through the admissions platform
- **Admin**: An authenticated user with admin or super_admin role who reviews applications and manages communications

## Requirements

### Requirement 1: Student Communications Page

**User Story:** As a student, I want a dedicated full-page communications center, so that I can view all my notifications and messages in one place without relying solely on the notification bell dropdown.

#### Acceptance Criteria

1. WHEN a student navigates to `/student/communications`, THE Communications_Page SHALL display all Notification records for the authenticated student ordered by creation date descending
2. THE Communications_Page SHALL display each Notification with its title, message, type indicator, read status, and formatted creation timestamp
3. WHEN a student clicks on an unread Notification, THE Communications_Page SHALL mark the Notification as read via the existing mark-read endpoint
4. THE Communications_Page SHALL provide a "Mark all as read" action that marks all unread Notification records as read
5. THE Communications_Page SHALL provide a delete action for individual Notification records
6. WHEN the Notification list is empty, THE Communications_Page SHALL display an empty state message indicating no communications exist
7. THE Communications_Page SHALL provide filter controls to filter Notification records by type (info, success, warning, error) and by read status (all, unread, read)
8. WHEN a Notification contains an action_url, THE Communications_Page SHALL render the Notification as a navigable link to the action_url
9. THE Communications_Page SHALL use the existing PageShell, SectionCard, EmptyState, and ErrorDisplay UI primitives
10. IF the Notification list request fails, THEN THE Communications_Page SHALL display an error message using ErrorDisplay

### Requirement 2: Student Activity Timeline

**User Story:** As a student, I want to see a chronological timeline of all activity on my application, so that I can understand what has happened and what stage my application is at.

#### Acceptance Criteria

1. WHEN a student navigates to `/student/history`, THE Activity_Timeline SHALL display all Status_History_Entry records for the student's applications ordered by creation date descending
2. THE Activity_Timeline SHALL display each Status_History_Entry with the old status, new status, notes, and formatted timestamp
3. THE Activity_Timeline SHALL visually distinguish between different status transition types using color-coded indicators consistent with the existing application status styling
4. WHEN the student has multiple applications, THE Activity_Timeline SHALL group Status_History_Entry records by application and display the application number as a section header
5. WHEN no Status_History_Entry records exist, THE Activity_Timeline SHALL display an empty state message indicating no activity history is available
6. THE Activity_Timeline SHALL include admin feedback entries from the Application model when admin_feedback is present, displayed inline with the status history in chronological order
7. THE Activity_Timeline SHALL use the existing PageShell, SectionCard, EmptyState, and ErrorDisplay UI primitives
8. IF the timeline data request fails, THEN THE Activity_Timeline SHALL display an error message using ErrorDisplay

### Requirement 3: Timeline Backend API

**User Story:** As a frontend developer, I want a dedicated API endpoint for student activity history, so that the Activity_Timeline can fetch status history without depending on the application detail endpoint's embedded last-10 records.

#### Acceptance Criteria

1. THE Timeline_API SHALL expose a GET endpoint at `/api/v1/applications/history/` that returns Status_History_Entry records for all applications owned by the authenticated student
2. THE Timeline_API SHALL return Status_History_Entry records ordered by created_at descending
3. THE Timeline_API SHALL include the application_number field from the related Application for each Status_History_Entry
4. THE Timeline_API SHALL return responses using the standard `{"success": true, "data": [...]}` envelope format
5. THE Timeline_API SHALL support pagination using the platform convention of `{page, pageSize, totalCount, results}` inside the data envelope
6. THE Timeline_API SHALL require authentication and return only records belonging to the authenticated student's applications
7. IF an unauthenticated request is made, THEN THE Timeline_API SHALL return a 401 response with an appropriate error code
8. WHEN an admin user requests the endpoint with a `user_id` query parameter, THE Timeline_API SHALL return Status_History_Entry records for the specified student's applications

### Requirement 4: Frontend Route Registration

**User Story:** As a student, I want the communications and history pages accessible from the application navigation, so that I can find them without memorizing URLs.

#### Acceptance Criteria

1. THE Route_Config SHALL register `/student/communications` as a student-guarded lazy-loaded route pointing to the Communications_Page
2. THE Route_Config SHALL register `/student/history` as a student-guarded lazy-loaded route pointing to the Activity_Timeline
3. THE Route_Config SHALL assign the `detail` skeleton type to both new routes for consistent loading states
4. WHEN a student is on the student dashboard or any student page, THE Navigation SHALL include links to `/student/communications` and `/student/history`

### Requirement 5: Communications Frontend Service

**User Story:** As a frontend developer, I want a dedicated service module for communications and history data fetching, so that API calls are centralized and consistent with existing service patterns.

#### Acceptance Criteria

1. THE Communications_Service SHALL provide a method to fetch paginated Notification records for the current user using the existing `GET /api/v1/notifications/` endpoint
2. THE Communications_Service SHALL provide a method to fetch paginated Status_History_Entry records using the Timeline_API endpoint
3. THE Communications_Service SHALL use the existing apiClient for all HTTP requests
4. THE Communications_Service SHALL handle the `{"success": true, "data": ...}` response envelope consistently

### Requirement 6: Admin Communications Panel

**User Story:** As an admin, I want to view a student's communication history and send targeted messages from the admin interface, so that I can manage student communications efficiently.

#### Acceptance Criteria

1. WHEN an admin navigates to a student's communication panel, THE Admin_Communications_Panel SHALL display all Notification records sent to the selected student ordered by creation date descending
2. THE Admin_Communications_Panel SHALL provide a form to send a new Notification to the selected student with title, message, and type fields
3. WHEN an admin submits a new Notification, THE Admin_Communications_Panel SHALL send the Notification via the existing `POST /api/v1/notifications/` admin endpoint
4. WHEN the Notification is sent successfully, THE Admin_Communications_Panel SHALL display the new Notification in the list without requiring a full page refresh
5. THE Admin_Communications_Panel SHALL display the student's Activity_Timeline alongside the communication history for context
6. IF the send request fails, THEN THE Admin_Communications_Panel SHALL display an error message and preserve the form content so the admin can retry
7. THE Admin_Communications_Panel SHALL require admin authentication and return a 403 response for non-admin users attempting to access the panel

### Requirement 7: Admin Communication History API

**User Story:** As an admin, I want a backend endpoint to fetch all notifications sent to a specific student, so that the admin panel can display per-student communication history.

#### Acceptance Criteria

1. THE Notification_API SHALL expose a GET endpoint at `/api/v1/notifications/user/<user_id>/` that returns all Notification records for the specified user
2. THE Notification_API SHALL require admin authentication
3. THE Notification_API SHALL return Notification records ordered by created_at descending
4. THE Notification_API SHALL return responses using the standard `{"success": true, "data": [...]}` envelope format
5. THE Notification_API SHALL support pagination using the platform convention
6. IF a non-admin user requests the endpoint, THEN THE Notification_API SHALL return a 403 response with a FORBIDDEN error code
7. IF the specified user_id does not exist, THEN THE Notification_API SHALL return a 404 response with a NOT_FOUND error code
