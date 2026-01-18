# Requirements Document

## Introduction

This specification documents a comprehensive production readiness audit of the MIHAS Application System. The audit identifies incomplete user stories, security gaps, performance issues, and system holes that need to be addressed to ensure the platform can handle high traffic and provide a reliable experience for students and administrators.

**Audit Scope:**
- Database schema and RLS policies
- API endpoint security and error handling
- User flow completeness (Student, Admin, Super Admin)
- Performance and scalability
- Offline functionality and PWA compliance
- External integration resilience

**Current State Analysis:**
Based on the existing specs and codebase review:
- 4 existing specs with varying completion status
- 86 database tables with RLS policies needed
- 47+ API endpoints in functions/ directory
- Multiple user roles: Student, Admin, Super Admin, Admissions Officer

## Glossary

- **RLS**: Row Level Security - Postgres feature for per-user data access control
- **PWA**: Progressive Web App - Offline-capable web application
- **ECZ**: Examinations Council of Zambia - Grading authority (1-9 scale)
- **HPCZ**: Health Professions Council of Zambia - Eligibility verification
- **GNC/NMCZ**: General Nursing Council/Nursing and Midwifery Council of Zambia
- **Application_Wizard**: 4-step form for student applications
- **Auto_Save**: 8-second interval draft persistence
- **Audit_Trail**: Immutable log of all state changes

## Requirements

### Requirement 1: Complete Student Application Flow

**User Story:** As a student, I want to complete my entire application journey from registration to enrollment decision, so that I can successfully apply to MIHAS programs.

#### Acceptance Criteria

1. WHEN a student registers, THE System SHALL send email verification within 30 seconds
2. WHEN a student completes profile setup, THE System SHALL pre-populate the Application_Wizard with profile data
3. WHEN a student saves a draft, THE System SHALL persist all form data including grades within 8 seconds
4. WHEN a student continues a draft, THE System SHALL restore all saved data and navigate to the last saved step
5. WHEN a student submits an application, THE System SHALL generate a unique reference number and tracking code
6. WHEN a student uploads documents, THE System SHALL validate file types and sizes before upload
7. WHEN a student makes a payment, THE System SHALL update payment_status and notify admins
8. WHEN a student schedules an interview, THE System SHALL only allow scheduling after payment verification
9. THE Student_Dashboard SHALL display accurate completion percentage for draft applications
10. THE Student_Dashboard SHALL show real-time status updates without manual refresh

### Requirement 2: Complete Admin Application Management

**User Story:** As an admin, I want to efficiently review and process applications, so that I can make timely admission decisions.

#### Acceptance Criteria

1. WHEN an admin views the dashboard, THE System SHALL display accurate counts for all application statuses including drafts
2. WHEN an admin changes application status, THE Admin_Dashboard SHALL update within 2 seconds without refresh
3. WHEN an admin approves/rejects an application, THE System SHALL create an audit trail entry
4. WHEN an admin verifies payment, THE System SHALL update payment_status and notify the student
5. WHEN an admin schedules an interview, THE System SHALL send notification to the student via preferred channel
6. THE Admin_Dashboard SHALL display applications from all statuses: draft, submitted, under_review, approved, rejected
7. THE Admin_Dashboard SHALL provide bulk operations for status changes
8. THE Admin_Dashboard SHALL show real-time metrics without manual refresh
9. WHEN filtering applications, THE System SHALL support filtering by status, program, intake, and payment status
10. THE System SHALL provide PDF export of application details and documents

### Requirement 3: Database Security and RLS Policies

**User Story:** As a system administrator, I want all database tables to have proper RLS policies, so that user data is protected and isolated.

#### Acceptance Criteria

1. THE System SHALL enable RLS on all tables containing user data
2. FOR ALL student-owned data, THE RLS policies SHALL restrict access to the owning user
3. FOR ALL admin operations, THE RLS policies SHALL verify admin or super_admin role
4. THE profiles table SHALL have RLS policies for user self-access and admin access
5. THE applications table SHALL have RLS policies restricting students to their own applications
6. THE application_documents table SHALL have RLS policies matching application ownership
7. THE payments table SHALL have RLS policies for user and admin access
8. THE in_app_notifications table SHALL have RLS policies for recipient-only access
9. THE device_sessions table SHALL have RLS policies for user self-management
10. THE audit_trail table SHALL be read-only for admins and inaccessible to students
11. THE email_queue table SHALL only be accessible by service_role
12. THE System SHALL NOT expose sensitive data through RLS policy gaps

### Requirement 4: API Endpoint Security

**User Story:** As a developer, I want all API endpoints to be secure and properly authenticated, so that the system is protected from unauthorized access.

#### Acceptance Criteria

1. THE middleware SHALL validate authentication tokens on all protected endpoints
2. THE middleware SHALL set appropriate CORS headers for cross-origin requests
3. THE middleware SHALL set security headers: CSP, HSTS, X-Content-Type-Options, X-Frame-Options
4. WHEN an API call fails, THE System SHALL return consistent error responses without exposing stack traces
5. THE System SHALL rate-limit authentication endpoints to prevent brute force attacks
6. THE System SHALL validate all input data using Zod schemas
7. THE System SHALL sanitize user input to prevent SQL injection and XSS
8. THE admin endpoints SHALL verify admin role before processing requests
9. THE System SHALL log API errors without logging PII
10. THE System SHALL handle timeout errors gracefully with retry logic

### Requirement 5: Notification System Completeness

**User Story:** As a user, I want to receive timely notifications through my preferred channels, so that I stay informed about my application status.

#### Acceptance Criteria

1. WHEN an application status changes, THE System SHALL send notification via user's preferred channel
2. THE System SHALL support email, SMS, WhatsApp, push, and in-app notifications
3. WHEN email sending fails, THE System SHALL queue for retry with exponential backoff
4. WHEN SMS/WhatsApp fails, THE System SHALL fall back to email notification
5. THE System SHALL respect user notification preferences and quiet hours
6. THE System SHALL track notification delivery status and analytics
7. THE in-app notifications SHALL update in real-time without page refresh
8. THE notification badge SHALL show accurate unread count
9. THE System SHALL support bulk notifications for admin announcements
10. THE System SHALL maintain notification consent audit trail

### Requirement 6: Payment System Integrity

**User Story:** As a student, I want to make payments securely and have them verified promptly, so that I can proceed with my application.

#### Acceptance Criteria

1. THE Payment_Page SHALL display all applications with pending payments
2. WHEN a student uploads payment proof, THE System SHALL store it securely in Supabase storage
3. THE System SHALL generate payment receipts in PDF format
4. WHEN payment is verified, THE System SHALL update application status and notify student
5. THE System SHALL maintain payment audit trail with all status changes
6. THE System SHALL prevent duplicate payment submissions
7. THE Payment_Page SHALL show clear payment instructions and bank details
8. THE System SHALL support multiple payment methods (bank transfer, mobile money)
9. WHEN payment verification is rejected, THE System SHALL notify student with reason
10. THE System SHALL calculate and display correct payment amounts per program

### Requirement 7: Interview Scheduling System

**User Story:** As a student with verified payment, I want to schedule my interview, so that I can complete my application process.

#### Acceptance Criteria

1. THE Interview_Page SHALL only be accessible after payment verification
2. THE System SHALL display available interview slots based on admin configuration
3. WHEN a student schedules an interview, THE System SHALL send confirmation notification
4. THE System SHALL prevent double-booking of interview slots
5. THE System SHALL send interview reminders 24 hours and 1 hour before scheduled time
6. WHEN an interview is rescheduled, THE System SHALL update all parties and send notifications
7. THE Admin_Dashboard SHALL display scheduled interviews with student details
8. THE System SHALL support virtual and in-person interview types
9. THE System SHALL track interview attendance and outcomes
10. THE Interview_Page SHALL show interview preparation guidelines

### Requirement 8: Offline Functionality and PWA

**User Story:** As a student on an unreliable connection, I want the app to work offline, so that I don't lose my progress.

#### Acceptance Criteria

1. THE PWA SHALL cache critical assets for offline access
2. WHEN offline, THE System SHALL allow viewing of cached application data
3. WHEN offline, THE System SHALL queue form submissions for sync when online
4. THE System SHALL display clear offline indicator when disconnected
5. WHEN connection is restored, THE System SHALL sync queued operations automatically
6. THE System SHALL NOT show error messages for transient connection issues under 5 seconds
7. THE service worker SHALL update gracefully without disrupting user sessions
8. THE System SHALL preload critical routes for faster navigation
9. THE offline page SHALL provide useful information and retry options
10. THE System SHALL preserve draft data in localStorage as backup

### Requirement 9: Performance and Scalability

**User Story:** As a user, I want the application to load quickly and respond smoothly, so that I can complete my tasks efficiently.

#### Acceptance Criteria

1. THE System SHALL achieve Lighthouse mobile performance score of at least 80
2. THE System SHALL load initial content (FCP) within 2 seconds on 3G connections
3. THE System SHALL keep main JavaScript bundle under 300KB gzipped
4. THE System SHALL lazy-load page components and heavy libraries
5. THE System SHALL debounce search inputs with minimum 300ms delay
6. THE System SHALL use React Query for server data caching and deduplication
7. THE System SHALL eliminate duplicate API calls during page load
8. THE System SHALL use CSS transitions instead of JavaScript animations on mobile
9. THE System SHALL respect prefers-reduced-motion preference
10. THE System SHALL batch DOM operations to prevent layout thrashing

### Requirement 10: Audit Trail and Compliance

**User Story:** As a super admin, I want complete audit trails of all system actions, so that I can ensure compliance and investigate issues.

#### Acceptance Criteria

1. THE System SHALL log all application status changes with timestamp, user, and previous value
2. THE System SHALL log all payment status changes with verification details
3. THE System SHALL log all admin actions including bulk operations
4. THE System SHALL log all authentication events (login, logout, password reset)
5. THE Audit_Trail SHALL be immutable - no updates or deletes allowed
6. THE Audit_Trail SHALL NOT contain PII in log messages
7. THE System SHALL provide audit trail search and export functionality
8. THE System SHALL retain audit logs for minimum 7 years
9. THE System SHALL log notification consent changes with IP and user agent
10. THE System SHALL provide compliance reports for regulatory requirements

### Requirement 11: Error Handling and Recovery

**User Story:** As a user, I want the system to handle errors gracefully, so that I can continue using the application even when things go wrong.

#### Acceptance Criteria

1. WHEN a component fails to render, THE System SHALL display a fallback UI with retry option
2. WHEN an API call fails, THE System SHALL retry with exponential backoff (max 3 attempts)
3. WHEN external APIs (HPCZ, ECZ) fail, THE System SHALL continue with advisory-only mode
4. THE System SHALL display user-friendly error messages without technical details
5. THE System SHALL log errors with full context for debugging
6. WHEN session expires, THE System SHALL redirect to login with return URL preserved
7. THE System SHALL handle network timeouts gracefully
8. THE System SHALL recover from React Error #130 (undefined component) without crashing
9. THE System SHALL validate data integrity before database operations
10. THE System SHALL provide manual retry options for failed operations

### Requirement 12: Real-time Updates and Synchronization

**User Story:** As a user, I want to see changes in real-time, so that I always have the current information without refreshing.

#### Acceptance Criteria

1. THE System SHALL establish WebSocket connection to Supabase Realtime in production
2. WHEN database changes occur, THE System SHALL receive events within 2 seconds
3. WHEN realtime events are received, THE System SHALL invalidate relevant React Query caches
4. IF WebSocket connection fails, THE System SHALL fall back to polling every 30 seconds
5. THE System SHALL display connection status indicator on dashboards
6. WHEN connection is restored, THE System SHALL re-establish subscriptions automatically
7. THE System SHALL debounce rapid successive events (minimum 500ms between invalidations)
8. THE Student_Dashboard SHALL update when application status changes
9. THE Admin_Dashboard SHALL update when new applications are submitted
10. THE notification badge SHALL update when new notifications arrive

