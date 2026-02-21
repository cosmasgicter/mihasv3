# Requirements Document

## Introduction

This feature addresses four areas of technical debt and missing functionality in the MIHAS admissions system: (1) building a working email delivery pipeline using Resend with automatic triggers on key application lifecycle events, (2) replacing the unused `ping.ts` endpoint with a dedicated `email.ts` endpoint to handle email queue processing, (3) removing legacy `infra/` and `supabase/` directories that are no longer used after the Vercel/Neon migration, and (4) cleaning up documentation and artifact files cluttering the project root directory.

## Glossary

- **Email_Endpoint**: The new `api-src/email.ts` Vercel serverless function that handles email queue processing, sending, status checks, and retry logic
- **Notification_API**: The existing `api-src/notifications.ts` Vercel serverless function that manages in-app notifications and queues emails for delivery
- **Email_Queue**: The `email_queue` database table that stores pending, sent, and failed email records
- **Notification_Service**: The frontend `src/lib/notificationService.ts` class that creates in-app notifications and triggers email queuing via the Notification_API
- **Email_Template_Module**: A server-side module (`lib/emailTemplates.ts`) that generates branded HTML email content from structured template data
- **Resend_API**: The third-party email delivery service accessed via `RESEND_API_KEY` environment variable
- **Lifecycle_Event**: A key application event that triggers both an in-app notification and an email: registration welcome, application submitted, status change, payment verified, interview scheduled
- **Legacy_Directories**: The `infra/` and `supabase/` directories containing Terraform/Cloudflare and Supabase configuration that are no longer used
- **Root_Artifacts**: Documentation files, one-off scripts, and stale configuration files in the project root that should be relocated or deleted

## Requirements

### Requirement 1: Email Queue Pipeline

**User Story:** As a system operator, I want emails to be queued in the database and processed reliably, so that email delivery failures do not block application workflows and failed emails can be retried.

#### Acceptance Criteria

1. WHEN a Lifecycle_Event occurs, THE Notification_API SHALL insert a row into the Email_Queue with status `pending`, the recipient email, subject, HTML body, and template metadata
2. WHEN the Email_Endpoint receives a `process-queue` action, THE Email_Endpoint SHALL select pending emails ordered by priority and creation time, send each via the Resend_API, and update the status to `sent` with a `sent_at` timestamp
3. IF an email send fails, THEN THE Email_Endpoint SHALL increment the `retry_count`, record the error message, and keep the status as `pending` if `retry_count` is less than `max_retries`
4. IF an email send fails and `retry_count` equals `max_retries`, THEN THE Email_Endpoint SHALL update the status to `failed`
5. WHEN the Email_Endpoint receives a `retry-failed` action, THE Email_Endpoint SHALL reset `failed` emails to `pending` with `retry_count` set to zero
6. WHEN the Email_Endpoint receives a `queue-status` action, THE Email_Endpoint SHALL return counts of emails grouped by status (pending, sent, failed)

### Requirement 2: Email Endpoint Replaces Ping

**User Story:** As a system architect, I want to replace the unused `ping.ts` endpoint with a dedicated `email.ts` endpoint, so that email operations have a dedicated API surface without exceeding the Vercel 12-function limit.

#### Acceptance Criteria

1. THE Email_Endpoint SHALL handle four actions via query parameter routing: `send`, `process-queue`, `retry-failed`, and `queue-status`
2. WHEN the Email_Endpoint receives a `send` action with recipient, subject, and body, THE Email_Endpoint SHALL insert the email into the Email_Queue with status `pending`
3. WHEN the Email_Endpoint receives any action, THE Email_Endpoint SHALL require authentication via the existing auth middleware
4. WHEN the Email_Endpoint receives `process-queue` or `retry-failed` actions, THE Email_Endpoint SHALL require admin or super_admin role
5. THE Email_Endpoint SHALL be protected by Arcjet rate limiting consistent with existing endpoint patterns
6. WHEN the old `api-src/ping.ts` and `api/ping.js` files exist, THE build process SHALL exclude them after the Email_Endpoint is deployed

### Requirement 3: Automatic Email on Lifecycle Events

**User Story:** As a student, I want to receive email notifications when key events happen in my application process, so that I stay informed without needing to check the portal constantly.

#### Acceptance Criteria

1. WHEN a new user registers, THE Notification_API SHALL queue a welcome email to the user via the Email_Queue
2. WHEN a student submits an application, THE Notification_API SHALL queue an application-submitted confirmation email via the Email_Queue
3. WHEN an application status changes (approved, rejected, under review, pending documents), THE Notification_API SHALL queue a status-change email via the Email_Queue
4. WHEN a payment is verified, THE Notification_API SHALL queue a payment-verified email via the Email_Queue
5. WHEN an interview is scheduled, THE Notification_API SHALL queue an interview-scheduled email via the Email_Queue
6. WHEN queuing a non-mandatory email type, THE Notification_API SHALL check the user's notification preferences and skip queuing if the user has opted out of that email category

### Requirement 4: Email Template System

**User Story:** As a developer, I want email content generated from reusable templates with consistent branding, so that emails are maintainable and visually consistent.

#### Acceptance Criteria

1. THE Email_Template_Module SHALL provide a function that accepts a template name and data object and returns an HTML string
2. THE Email_Template_Module SHALL support templates for: welcome, application-submitted, status-change, payment-verified, and interview-scheduled
3. WHEN generating an email, THE Email_Template_Module SHALL include the MIHAS branding header, the template-specific content, and a consistent footer
4. WHEN a template name is not recognized, THE Email_Template_Module SHALL fall back to a generic notification template using the provided subject and message

### Requirement 5: Frontend Notification Service Integration

**User Story:** As a developer, I want the frontend notification service to create in-app notifications that also trigger email queuing, so that both channels are activated from a single call.

#### Acceptance Criteria

1. WHEN the Notification_Service sends a notification, THE Notification_Service SHALL call the `create` action on the Notification_API which handles both in-app creation and email queuing
2. WHEN the Notification_API receives a `create` action with an email-eligible notification type, THE Notification_API SHALL insert a corresponding row into the Email_Queue
3. WHEN an admin sends a manual notification via the `send` action, THE Notification_API SHALL create an in-app notification and queue an email for the target user

### Requirement 6: Admin Email Management

**User Story:** As an admin, I want to view email queue status and retry failed emails, so that I can monitor and manage email delivery.

#### Acceptance Criteria

1. WHEN an admin requests queue status, THE Email_Endpoint SHALL return the count of pending, sent, and failed emails
2. WHEN an admin triggers retry of failed emails, THE Email_Endpoint SHALL reset all failed emails to pending status for reprocessing
3. WHEN an admin sends a manual notification, THE Notification_API SHALL create both an in-app notification and queue an email regardless of user email preferences for mandatory notification types

### Requirement 7: Remove Legacy Directories

**User Story:** As a developer, I want legacy infrastructure and Supabase directories removed, so that the codebase only contains files relevant to the current Vercel/Neon architecture.

#### Acceptance Criteria

1. WHEN the cleanup is performed, THE system SHALL delete the entire `infra/` directory including all Terraform and CDN configuration files
2. WHEN the cleanup is performed, THE system SHALL delete the entire `supabase/` directory including the dead `send-email` function, all old migration files, and the scripts directory
3. WHEN the legacy directories are deleted, THE system SHALL verify that no remaining source files import from or reference the deleted paths

### Requirement 8: Clean Root Directory

**User Story:** As a developer, I want documentation files moved to appropriate subdirectories and stale artifacts deleted, so that the project root is clean and navigable.

#### Acceptance Criteria

1. WHEN the cleanup is performed, THE system SHALL move all root-level documentation `.md` files (excluding `README.md`) to appropriate subdirectories under `docs/` (reports, deployment, migration)
2. WHEN the cleanup is performed, THE system SHALL move root-level `.txt` documentation files (`codex.txt`, `correctenvs.txt`) to `docs/`
3. WHEN the cleanup is performed, THE system SHALL delete one-off scripts and artifacts that are no longer needed: `DEPLOY_REALTIME_FIX.bat`, `cleanup-root.js`, `node-installer.msi`, `yarn.cmd`, `database.db`, `r2.env`, `.token`, `package.json.patch`, `package-lock.json`, `performance-audit-report.json`, `task9-structure-validation.json`, `task9-validation-report.json`, `vitest-results.json`, `full-flow-test.mjs`, `test-api.mjs`, `test-login-admin.json`, `test-login-student.json`, `tailwind.config.optimized.js`, `vite.config.production.optimized.ts`, `vite.config.production.ts`, `vite.config.local.ts`
4. WHEN the cleanup is performed, THE system SHALL delete or move test output files (`test_output.txt`, `test-output.txt`) and log files (`dev.log`, `vitest-stderr.log`) from the root
5. WHEN files are moved, THE system SHALL preserve file content without modification
