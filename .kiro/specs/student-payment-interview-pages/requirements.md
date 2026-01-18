# Requirements Document

## Introduction

This specification addresses the missing student payment and interview pages in the MIHAS application system. Currently, the QuickActions component links to `/student/payment` and `/student/interview` routes that do not exist, causing 404 errors. This feature creates dedicated pages for students to view payment information and interview schedules.

**Root Cause Analysis:**
- QuickActions component links to `/student/payment` but no route or page exists
- QuickActions component links to `/student/interview` but no route or page exists
- Payment is currently handled as Step 3 in the Application Wizard
- Interviews are stored in `application_interviews` table with scheduling data
- Applications table contains payment fields: `payment_status`, `payment_method`, `momo_ref`, `pop_url`, `amount`, `paid_at`

## Glossary

- **Payment_Page**: The dedicated student page for viewing payment status and instructions
- **Interview_Page**: The dedicated student page for viewing scheduled interviews
- **Application_Wizard**: The 4-step application form where payment is Step 3
- **QuickActions**: The component displaying quick action cards on the student dashboard
- **application_interviews**: Database table storing interview scheduling data (scheduled_at, mode, location, status)
- **applications**: Database table containing payment fields (payment_status, payment_method, amount, pop_url)

## Requirements

### Requirement 1: Payment Page Navigation

**User Story:** As a student, I want to click "Complete Payment" in quick actions and see a payment information page, so that I can understand how to complete my application payment.

#### Acceptance Criteria

1. WHEN a student clicks "Complete Payment" quick action, THE Payment_Page SHALL load without 404 error
2. THE Payment_Page SHALL display payment instructions including the K153 fee amount
3. THE Payment_Page SHALL provide a button to navigate to the Application Wizard payment step
4. WHEN the student has pending payment applications, THE Payment_Page SHALL list them with status indicators
5. THE Payment_Page SHALL be accessible only to authenticated students (guard: 'student')

### Requirement 2: Payment Status Display

**User Story:** As a student, I want to see my payment status for each application, so that I know which applications need payment.

#### Acceptance Criteria

1. WHEN the Payment_Page loads, THE Payment_Page SHALL query applications where payment_status is null or 'pending_review'
2. THE Payment_Page SHALL display each pending application with program name and payment status
3. WHEN an application has payment_status='verified', THE Payment_Page SHALL show a success indicator
4. WHEN an application has payment_status='rejected', THE Payment_Page SHALL show rejection reason if available
5. THE Payment_Page SHALL show a "View Application" button for each listed application

### Requirement 3: Interview Page Navigation

**User Story:** As a student, I want to click "View Interview Details" in quick actions and see my interview schedule, so that I can prepare for my interviews.

#### Acceptance Criteria

1. WHEN a student clicks "View Interview Details" quick action, THE Interview_Page SHALL load without 404 error
2. THE Interview_Page SHALL query application_interviews for the student's applications
3. THE Interview_Page SHALL be accessible only to authenticated students (guard: 'student')
4. WHEN no interviews are scheduled, THE Interview_Page SHALL display an appropriate empty state message
5. THE Interview_Page SHALL provide a "Back to Dashboard" navigation link

### Requirement 4: Interview Details Display

**User Story:** As a student, I want to see complete details of my scheduled interviews, so that I know when and where to attend.

#### Acceptance Criteria

1. WHEN displaying an interview, THE Interview_Page SHALL show scheduled_at date and time
2. WHEN displaying an interview, THE Interview_Page SHALL show the interview mode (in_person, virtual, phone)
3. WHEN the interview mode is 'virtual', THE Interview_Page SHALL display a "Join Meeting" button if meeting link exists
4. WHEN the interview mode is 'in_person', THE Interview_Page SHALL display the location
5. THE Interview_Page SHALL show interview status (scheduled, rescheduled, completed, cancelled)
6. THE Interview_Page SHALL separate upcoming interviews from past interviews

### Requirement 5: Route Configuration

**User Story:** As a developer, I want the payment and interview routes properly configured, so that navigation works correctly.

#### Acceptance Criteria

1. THE routes config SHALL include `/student/payment` route with guard 'student'
2. THE routes config SHALL include `/student/interview` route with guard 'student'
3. THE routes SHALL use React.lazy for code splitting
4. THE routes SHALL redirect unauthenticated users to sign-in page

### Requirement 6: Error Handling

**User Story:** As a student, I want to see helpful error messages when data fails to load, so that I understand what went wrong.

#### Acceptance Criteria

1. IF the Payment_Page fails to load applications, THEN THE Payment_Page SHALL display an error message
2. IF the Interview_Page fails to load interviews, THEN THE Interview_Page SHALL display an error message
3. WHEN loading data, THE pages SHALL display a loading spinner
4. IF the user is not authenticated, THEN THE pages SHALL redirect to sign-in

