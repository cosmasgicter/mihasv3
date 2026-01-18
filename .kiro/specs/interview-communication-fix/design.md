# Design Document: Interview and Communication Fix

## Overview

This design document outlines the fixes required for the interview scheduling and communication system's integration with Supabase. The system currently has three main issues:

1. **RLS Helper Function Inconsistency** - The `check_is_admin()` function only queries `user_profiles` table, while the system primarily uses `profiles` table
2. **Student Interview Query Failure** - Students cannot view their scheduled interviews due to RLS policy conflicts
3. **Communication Service Bug** - The in-app notification function writes to the wrong table

## Architecture

The interview and communication system follows this architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  Interview Page     │  InterviewScheduler  │  CommunicationService│
│  (Student View)     │  (Admin Component)   │  (Admin → Student)   │
└─────────┬───────────┴──────────┬───────────┴──────────┬──────────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Functions API                      │
├─────────────────────────────────────────────────────────────────┤
│  /interview/schedule  │  /applications/interview/[id]           │
└─────────┬─────────────┴──────────────────────┬──────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                 │
├─────────────────────────────────────────────────────────────────┤
│  application_interviews  │  in_app_notifications  │  profiles   │
│  interview_reminders     │  email_notifications   │  applications│
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. RLS Helper Function Fix

The `check_is_admin()` function needs to be updated to check both `profiles` and `user_profiles` tables:

```sql
-- Updated check_is_admin function
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'super_admin', 'admissions_officer')
    AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin', 'admissions_officer')
  ) OR EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin', 'admissions_officer')
    AND is_active = true
  );
END;
$$;
```

### 2. Student Interview RLS Policy Fix

The current RLS policy for students uses a subquery pattern that may conflict with join queries. The policy needs to be updated:

```sql
-- Drop existing student policy
DROP POLICY IF EXISTS "Users can view their own interview records" ON application_interviews;

-- Create improved student policy
CREATE POLICY "Users can view their own interview records"
ON application_interviews FOR SELECT
TO authenticated
USING (
  application_id IN (
    SELECT id FROM applications WHERE user_id = (SELECT auth.uid())
  )
);
```

### 3. Communication Service Fix

The `sendInAppMessage` function in `communicationService.ts` needs to be updated to use the correct table:

```typescript
// Before (incorrect)
const { error } = await supabase
  .from('notifications')
  .insert({
    user_id: params.userId,
    title: params.title,
    message: params.message,
    type: 'admin_message',
    priority: 'high'
  })

// After (correct)
const { error } = await supabase
  .from('in_app_notifications')
  .insert({
    user_id: params.userId,
    title: params.title,
    content: params.message,  // Note: field is 'content' not 'message'
    type: 'admin_message',
    read: false
  })
```

## Data Models

### application_interviews Table (Existing)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| application_id | uuid | FK to applications |
| scheduled_at | timestamptz | Interview date/time |
| mode | text | 'in_person', 'virtual', 'phone' |
| location | text | Location or meeting link |
| status | text | 'scheduled', 'rescheduled', 'completed', 'cancelled' |
| notes | text | Additional notes |
| created_by | uuid | Admin who scheduled |
| updated_by | uuid | Admin who last updated |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Update timestamp |

### in_app_notifications Table (Existing)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| title | varchar | Notification title |
| content | text | Notification content |
| type | varchar | Notification type |
| read | boolean | Read status |
| action_url | varchar | Optional action URL |
| created_at | timestamptz | Creation timestamp |
| read_at | timestamptz | When read |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Admin Role Check Consistency

*For any* user with admin role ('admin', 'super_admin', or 'admissions_officer') in any of the `profiles`, `user_profiles`, or `user_roles` tables, the `check_is_admin()` function SHALL return true, and for any user without admin role in any of these tables, the function SHALL return false.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

### Property 2: Student Interview Visibility

*For any* authenticated student, querying `application_interviews` with a join on `applications` SHALL return exactly the interviews associated with applications where `user_id` matches the student's auth.uid(), including all required fields (scheduled_at, mode, location, status, notes).

**Validates: Requirements 2.1, 2.2, 2.3, 2.5**

### Property 3: In-App Notification Creation

*For any* in-app message sent via the communication service with valid user_id, title, and message, a record SHALL be created in the `in_app_notifications` table with the correct user_id, title, content (mapped from message), type, and read=false.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 4: Interview Scheduling Notification

*For any* interview scheduled, rescheduled, or cancelled via the API, an in-app notification SHALL be created for the student containing the interview details (scheduled date, time, mode, and location for scheduled/rescheduled, or cancellation message for cancelled).

**Validates: Requirements 4.2, 4.3, 4.4**

### Property 5: Payment Verification Before Interview Scheduling

*For any* interview scheduling request, the system SHALL verify that the application's payment_status is 'verified' before allowing the interview to be scheduled, and SHALL reject scheduling attempts for applications without verified payment.

**Validates: Requirements 4.1**

### Property 6: Duplicate Interview Prevention

*For any* application with an existing active interview (status 'scheduled' or 'rescheduled'), the system SHALL prevent scheduling a new interview and return an appropriate error message.

**Validates: Requirements 5.5**

## Error Handling

### Database Errors

- **RLS Policy Violations**: Return 403 Forbidden with clear error message
- **Foreign Key Violations**: Return 400 Bad Request with validation error
- **Connection Errors**: Retry with exponential backoff, max 3 attempts

### API Errors

- **Authentication Failures**: Return 401 Unauthorized
- **Authorization Failures**: Return 403 Forbidden
- **Validation Errors**: Return 400 Bad Request with field-specific errors
- **Server Errors**: Return 500 with generic message, log details server-side

### Frontend Error Handling

- Display user-friendly error messages
- Provide retry options for transient failures
- Log errors to console for debugging (no PII)
- Graceful degradation when data unavailable

## Testing Strategy

### Unit Tests

Unit tests will verify specific examples and edge cases:

1. **RLS Helper Function Tests**
   - Test admin detection from `profiles` table
   - Test admin detection from `user_profiles` table
   - Test admin detection from `user_roles` table
   - Test non-admin user returns false
   - Test unauthenticated user returns false

2. **Communication Service Tests**
   - Test in-app notification creation with correct table
   - Test error handling for missing user
   - Test error handling for database errors

### Property-Based Tests

Property-based tests will use **fast-check** library with minimum 100 iterations per test:

1. **Property 1 Test**: Generate random users with various role configurations across tables, verify `check_is_admin()` returns correct result
2. **Property 2 Test**: Generate random students with applications and interviews, verify query returns correct interviews
3. **Property 3 Test**: Generate random notification data, verify correct record creation
4. **Property 4 Test**: Generate random interview scheduling requests, verify notification creation

### Integration Tests

1. **End-to-End Interview Flow**
   - Admin schedules interview
   - Student views interview on Interview page
   - Notification appears in student's notifications

2. **Communication Flow**
   - Admin sends in-app message
   - Message appears in student's notifications
   - Message marked as read when viewed
