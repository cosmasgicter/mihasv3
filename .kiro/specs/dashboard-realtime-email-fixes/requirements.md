# Requirements Document: Dashboard Real-time Updates & Email Notification Fixes

## Introduction

The MIHAS Application System has critical production issues affecting user experience: dashboard data not updating in real-time after application submissions, admin approval changes not reflecting immediately, and email notifications not being sent upon application submission. This document outlines requirements to fix these issues.

## Glossary

- **Dashboard**: The student or admin interface showing application status and statistics
- **Real-time_Update**: Immediate reflection of data changes without page refresh
- **Cache_Invalidation**: Process of clearing stale cached data to show fresh data
- **Email_Queue**: Database table storing emails to be sent asynchronously
- **React_Query**: Client-side data fetching and caching library
- **Supabase_Realtime**: Real-time subscription service for database changes

## Requirements

### Requirement 1: Dashboard Real-time Data Refresh

**User Story:** As a student, I want my dashboard to show my newly submitted application immediately, so that I can confirm my submission was successful.

#### Acceptance Criteria

1. WHEN a student submits an application, THE Dashboard SHALL display the new application within 2 seconds without requiring page refresh
2. WHEN application data changes in the database, THE Dashboard SHALL automatically invalidate cached data and refetch
3. WHEN the user returns to the dashboard from another page, THE System SHALL fetch fresh data instead of serving stale cache
4. WHEN the browser window regains focus, THE Dashboard SHALL check for data updates
5. IF cache invalidation fails, THEN THE System SHALL provide a manual refresh button that forces data reload

### Requirement 2: Admin Dashboard Real-time Updates

**User Story:** As an administrator, I want to see application status changes immediately after I approve or reject them, so that I can verify my actions were successful.

#### Acceptance Criteria

1. WHEN an admin approves or rejects an application, THE Admin_Dashboard SHALL reflect the status change within 2 seconds
2. WHEN an admin verifies or rejects a payment, THE Application_List SHALL update the payment status immediately
3. WHEN multiple admins are working simultaneously, THE System SHALL ensure all admins see consistent data
4. WHEN status changes occur, THE System SHALL invalidate all related query caches (list, detail, stats)
5. IF real-time updates fail, THEN THE System SHALL fall back to polling every 30 seconds

### Requirement 3: Email Notification on Application Submission

**User Story:** As a student, I want to receive an email confirmation when I submit my application, so that I have proof of submission.

#### Acceptance Criteria

1. WHEN a student submits an application, THE System SHALL queue a confirmation email immediately
2. WHEN the email is queued, THE System SHALL attempt to send it within 60 seconds
3. WHEN the email is sent successfully, THE System SHALL log the delivery status
4. IF email sending fails, THEN THE System SHALL retry up to 3 times with exponential backoff
5. WHEN the application status changes to 'submitted', THE Email SHALL contain application number, program name, and submission timestamp

### Requirement 4: Cache Configuration Optimization

**User Story:** As a user, I want to see fresh data when I navigate the application, so that I don't see outdated information.

#### Acceptance Criteria

1. WHEN application data is fetched, THE Cache SHALL have a staleTime of 0 for critical data (applications list, stats)
2. WHEN mutations succeed, THE System SHALL immediately invalidate all affected query keys
3. WHEN the user logs in, THE System SHALL clear any stale cached data from previous sessions
4. WHEN navigating between pages, THE System SHALL refetch data if it's older than 30 seconds
5. IF the user manually refreshes, THEN THE System SHALL bypass cache and fetch fresh data

### Requirement 5: Submission Flow Email Integration

**User Story:** As a student completing my application, I want the submission process to trigger all necessary notifications, so that I'm kept informed.

#### Acceptance Criteria

1. WHEN the application wizard completes submission, THE System SHALL call the notification endpoint
2. WHEN the status changes to 'submitted', THE Backend SHALL queue both in-app and email notifications
3. WHEN the email is queued, THE System SHALL use the professional email template with all application details
4. IF the email queue insert fails, THEN THE System SHALL log the error and continue with the submission
5. WHEN the submission is complete, THE System SHALL dispatch a custom event to trigger dashboard refresh

