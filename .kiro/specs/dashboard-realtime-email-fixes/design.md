# Design Document: Dashboard Real-time Updates & Email Notification Fixes

## Overview

This design addresses three critical production issues in the MIHAS Application System:
1. Student dashboard not showing newly submitted applications
2. Admin dashboard not reflecting approval/rejection changes
3. Email notifications not being sent on application submission

The root causes are:
- React Query cache configuration with high staleTime preventing fresh data
- Missing cache invalidation after mutations
- Application submission bypassing the notification system
- No real-time subscription for data changes

## Architecture

### Current Data Flow (Broken)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Application    │────▶│   Supabase      │     │  React Query    │
│  Submission     │     │   Database      │     │  Cache (stale)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │  Dashboard      │
                                                │  (shows old)    │
                                                └─────────────────┘
```

### Fixed Data Flow (End-to-End with Supabase)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Application    │────▶│   Supabase      │────▶│  email_queue    │
│  Submission     │     │   applications  │     │  table          │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │                       ▼
        │                       │               ┌─────────────────┐
        │                       │               │  Cron Worker    │
        │                       │               │  (sends email)  │
        │                       │               └─────────────────┘
        │                       ▼
        │               ┌─────────────────┐
        │               │  Supabase       │
        │               │  Realtime       │
        │               │  (postgres_changes)
        │               └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  React Query    │────▶│  Dashboard      │
│  Invalidation   │     │  (fresh data)   │
└─────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐
│ in_app_         │
│ notifications   │
└─────────────────┘
```

## Supabase Database Integration

### Existing Tables Used

Based on the actual database schema, this implementation leverages:

| Table | Purpose |
|-------|---------|
| `applications` | Main application data with status tracking |
| `email_queue` | Queue for outbound emails (to_email, subject, template, status, sent_at) |
| `in_app_notifications` | In-app notifications (user_id, title, content, type, read, action_url) |
| `email_notifications` | Application-specific email tracking (application_id, recipient_email, status) |
| `notification_logs` | Delivery tracking across channels |

### Supabase Realtime Configuration

Enable Postgres Changes for the `applications` table:

```sql
-- Enable realtime for applications table (if not already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE applications;

-- Enable realtime for payments table for payment status updates
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
```

## Components and Interfaces

### 1. Cache Configuration Fix

The current cache configuration in `src/data/applications.ts` has `staleTime: 30000` which keeps data "fresh" for 30 seconds even after mutations.

```typescript
// Current (problematic)
useList: (filters) => {
  return useQuery({
    queryKey: QUERY_KEYS.applicationsList(filters),
    queryFn: async () => { ... },
    staleTime: 30000,  // Data considered fresh for 30s
    refetchOnWindowFocus: false  // Doesn't refetch on focus
  })
}

// Fixed
useList: (filters) => {
  return useQuery({
    queryKey: QUERY_KEYS.applicationsList(filters),
    queryFn: async () => { ... },
    staleTime: 0,  // Always consider data stale
    gcTime: 5 * 60 * 1000,  // Keep in cache for 5 min for background refetch
    refetchOnWindowFocus: true,  // Refetch when window gains focus
    refetchOnMount: 'always'  // Always refetch on component mount
  })
}
```

### 2. Mutation Cache Invalidation Enhancement

Current mutations invalidate queries but the invalidation may not be immediate due to React Query's batching.

```typescript
// Enhanced mutation with immediate invalidation
useCreate: () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data) => applicationService.create(data),
    onSuccess: async () => {
      // Force immediate invalidation and refetch
      await queryClient.invalidateQueries({ 
        queryKey: ['applications'],
        refetchType: 'all'  // Refetch all matching queries
      })
      await queryClient.invalidateQueries({ 
        queryKey: ['application-stats'] 
      })
      await queryClient.invalidateQueries({ 
        queryKey: ['payment-status']  // Also invalidate payment-related queries
      })
      // Dispatch custom event for components not using React Query
      window.dispatchEvent(new CustomEvent('applicationCreated'))
    }
  })
}
```

### 2.1 Manual Refresh Functionality

Provide a fallback manual refresh button for cases where automatic cache invalidation fails:

```typescript
// Manual refresh hook for dashboard components
// File: src/hooks/useManualRefresh.ts
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

export const useManualRefresh = () => {
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  const forceRefresh = async () => {
    setIsRefreshing(true)
    try {
      // Bypass cache completely and fetch fresh data
      await queryClient.resetQueries({ 
        queryKey: ['applications'],
        exact: false 
      })
      await queryClient.refetchQueries({ 
        queryKey: ['applications'],
        type: 'active'
      })
    } finally {
      setIsRefreshing(false)
    }
  }
  
  return { forceRefresh, isRefreshing }
}
```

### 2.2 Session Login Cache Clear

Clear stale cached data when user logs in to prevent showing data from previous sessions:

```typescript
// In auth context or login handler
// File: src/contexts/AuthContext.tsx (modification)
const handleLoginSuccess = async (session: Session) => {
  const queryClient = useQueryClient()
  
  // Clear all cached data from previous sessions
  queryClient.clear()
  
  // Optionally prefetch critical data for the new session
  await queryClient.prefetchQuery({
    queryKey: ['applications', 'list', { userId: session.user.id }],
    queryFn: () => applicationService.list({ userId: session.user.id })
  })
}
```

### 3. Application Submission Email Integration (Supabase Direct)

Instead of calling a separate API endpoint, insert directly into Supabase tables for email queue and in-app notifications:

```typescript
// File: src/hooks/useApplicationSubmitFixed.ts (modification)
import { supabase } from '@/lib/supabase'

const triggerSubmissionNotifications = async (
  applicationId: string, 
  applicationData: {
    user_id: string
    email: string
    full_name: string
    application_number: string
    program: string
  }
) => {
  const { user_id, email, full_name, application_number, program } = applicationData
  
  // 1. Insert into email_queue table (existing table in schema)
  const { error: emailError } = await supabase
    .from('email_queue')
    .insert({
      to_email: email,
      subject: '✅ Application Submitted Successfully - MIHAS',
      template: 'application_submitted',
      template_data: {
        studentName: full_name,
        applicationNumber: application_number,
        program: program,
        applicationUrl: `https://apply.mihas.edu.zm/student/application/${applicationId}`,
        submittedAt: new Date().toISOString()
      },
      priority: 'high',
      status: 'pending',
      scheduled_for: new Date().toISOString()
    })
  
  if (emailError) {
    console.error('Failed to queue email:', emailError)
    // Don't fail submission - email is non-critical
  }
  
  // 2. Insert into in_app_notifications table (existing table in schema)
  const { error: notifError } = await supabase
    .from('in_app_notifications')
    .insert({
      user_id: user_id,
      title: '✅ Application Submitted Successfully',
      content: `Your application #${application_number} for ${program} has been submitted and is now under review.`,
      type: 'success',
      action_url: `/student/application/${applicationId}`,
      read: false
    })
  
  if (notifError) {
    console.error('Failed to create in-app notification:', notifError)
  }
  
  // 3. Also insert into email_notifications for tracking (existing table)
  await supabase
    .from('email_notifications')
    .insert({
      application_id: applicationId,
      recipient_email: email,
      subject: '✅ Application Submitted Successfully - MIHAS',
      body: `Application #${application_number} for ${program} submitted`,
      status: 'pending'
    })
}
```

### 4. Email Queue Processing (Cron Worker Enhancement)

The existing cron worker at `functions/cron/process-email-queue.js` should be enhanced to process emails within 60 seconds:

```javascript
// File: functions/cron/process-email-queue.js (modification)
export async function onRequest(context) {
  const { env } = context
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
  
  // Fetch pending emails scheduled for now or earlier
  const { data: pendingEmails, error } = await supabase
    .from('email_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('priority', { ascending: false }) // high priority first
    .order('created_at', { ascending: true })
    .limit(50)
  
  if (error || !pendingEmails?.length) {
    return new Response(JSON.stringify({ processed: 0 }))
  }
  
  let processed = 0
  let failed = 0
  
  for (const email of pendingEmails) {
    try {
      // Send via Resend
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'MIHAS Admissions <admissions@mihas.edu.zm>',
          to: email.to_email,
          subject: email.subject,
          html: renderEmailTemplate(email.template, email.template_data)
        })
      })
      
      if (response.ok) {
        // Update status to sent
        await supabase
          .from('email_queue')
          .update({ 
            status: 'sent', 
            sent_at: new Date().toISOString() 
          })
          .eq('id', email.id)
        
        processed++
      } else {
        throw new Error(`Resend API error: ${response.status}`)
      }
    } catch (err) {
      // Increment retry count, mark as failed after 3 attempts
      const newRetryCount = (email.retry_count || 0) + 1
      await supabase
        .from('email_queue')
        .update({ 
          status: newRetryCount >= 3 ? 'failed' : 'pending',
          error_message: err.message,
          retry_count: newRetryCount
        })
        .eq('id', email.id)
      
      failed++
    }
  }
  
  return new Response(JSON.stringify({ processed, failed }))
}
```

### 5. Student Dashboard Real-time Subscription (Supabase Postgres Changes)

Add Supabase real-time subscription using the official Postgres Changes feature:

```typescript
// File: src/hooks/useStudentDashboardRealtime.ts (new file)
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export const useStudentDashboardRealtime = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  
  useEffect(() => {
    if (!user?.id) return
    
    // Subscribe to changes on applications table filtered by user_id
    const channel = supabase
      .channel(`student-applications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'applications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Application change received:', payload.eventType)
          
          // Invalidate all application-related queries
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          queryClient.invalidateQueries({ queryKey: ['application-stats'] })
          queryClient.invalidateQueries({ queryKey: ['student-dashboard'] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // Refresh notifications when new one arrives
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscription active for student dashboard')
        }
      })
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, queryClient])
}
```

### 6. Admin Dashboard Real-time Updates (Multi-Table Subscription)

Subscribe to multiple tables for comprehensive admin dashboard updates:

```typescript
// File: src/hooks/useAdminDashboardRealtime.ts (new file)
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/toast'

export const useAdminDashboardRealtime = () => {
  const queryClient = useQueryClient()
  const lastUpdateRef = useRef<Record<string, number>>({})
  
  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-changes')
      // Listen to all application changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applications'
        },
        (payload) => {
          const now = Date.now()
          const lastUpdate = lastUpdateRef.current['applications'] || 0
          
          // Debounce rapid updates (within 500ms)
          if (now - lastUpdate < 500) return
          lastUpdateRef.current['applications'] = now
          
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          queryClient.invalidateQueries({ queryKey: ['application-stats'] })
          queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
          
          // Show toast for status changes
          if (payload.eventType === 'UPDATE' && payload.new?.status !== payload.old?.status) {
            toast.info(`Application ${payload.new?.application_number} status changed to ${payload.new?.status}`)
          }
        }
      )
      // Listen to payment changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          queryClient.invalidateQueries({ queryKey: ['payment-status'] })
          queryClient.invalidateQueries({ queryKey: ['payment-stats'] })
        }
      )
      // Listen to application status history for audit
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'application_status_history'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['application-history'] })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Admin realtime subscription active')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription error - falling back to polling')
          // Enable polling fallback
          startPollingFallback()
        }
      })
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}

// Polling fallback when realtime fails
const startPollingFallback = () => {
  const pollInterval = setInterval(async () => {
    // Poll for updates every 30 seconds
    queryClient.invalidateQueries({ queryKey: ['applications'] })
  }, 30000)
  
  return () => clearInterval(pollInterval)
}
```

### 6.1 Multi-Admin Consistency with Optimistic Locking

Handle concurrent modifications when multiple admins work simultaneously:

```typescript
// File: src/hooks/admin/useApplicationStatusUpdate.ts (new file)
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/toast'

interface StatusUpdateParams {
  applicationId: string
  newStatus: string
  currentUpdatedAt: string // For optimistic locking
  adminFeedback?: string
}

export const useApplicationStatusUpdate = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ applicationId, newStatus, currentUpdatedAt, adminFeedback }: StatusUpdateParams) => {
      // Use updated_at as optimistic lock
      const { data, error } = await supabase
        .from('applications')
        .update({ 
          status: newStatus,
          admin_feedback: adminFeedback,
          decision_date: newStatus === 'approved' || newStatus === 'rejected' 
            ? new Date().toISOString() 
            : undefined,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId)
        .eq('updated_at', currentUpdatedAt) // Optimistic lock check
        .select()
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          throw new Error('CONCURRENT_MODIFICATION')
        }
        throw error
      }
      
      return data
    },
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['applications', data.id] })
      
      // Record in status history
      supabase.from('application_status_history').insert({
        application_id: data.id,
        status: data.status,
        notes: data.admin_feedback
      })
      
      toast.success(`Application ${data.application_number} updated to ${data.status}`)
    },
    onError: (error: Error) => {
      if (error.message === 'CONCURRENT_MODIFICATION') {
        toast.warning('This application was modified by another admin. Refreshing data...')
        queryClient.invalidateQueries({ queryKey: ['applications'] })
      } else {
        toast.error('Failed to update application status')
      }
    }
  })
}
```

## Data Models

### Existing Tables Used (No Schema Changes Required)

The implementation leverages existing Supabase tables:

#### `applications` table
- Primary table for application data
- Key columns: `id`, `user_id`, `status`, `application_number`, `program`, `email`, `full_name`, `updated_at`
- Status values: `draft`, `submitted`, `under_review`, `approved`, `rejected`, `deleted`

#### `email_queue` table
- Queue for outbound emails
- Key columns: `id`, `to_email`, `subject`, `template`, `template_data`, `priority`, `status`, `scheduled_for`, `sent_at`, `error_message`
- Status values: `pending`, `sent`, `failed`

#### `in_app_notifications` table
- In-app notification storage
- Key columns: `id`, `user_id`, `title`, `content`, `type`, `read`, `action_url`, `created_at`, `read_at`
- Type values: `info`, `success`, `warning`, `error`

#### `email_notifications` table
- Application-specific email tracking
- Key columns: `id`, `application_id`, `recipient_email`, `subject`, `body`, `status`, `sent_at`, `retry_count`, `error_message`

#### `application_status_history` table
- Audit trail for status changes
- Key columns: `id`, `application_id`, `status`, `changed_by`, `notes`, `created_at`

#### `payments` table
- Payment tracking
- Key columns: `id`, `application_id`, `status`, `verified_by`, `verified_at`

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do.*

### Property 1: Real-time Update Latency
*For any* application status change (submission, approval, rejection, payment verification), the corresponding dashboard (student or admin) SHALL display the updated data within 2 seconds without requiring manual page refresh.
**Validates: Requirements 1.1, 2.1, 2.2**

### Property 2: Cache Invalidation Completeness
*For any* mutation that modifies application data, the System SHALL invalidate all related query caches (applications list, application detail, application stats) immediately upon mutation success.
**Validates: Requirements 1.2, 2.4, 4.2**

### Property 3: Navigation Data Freshness
*For any* navigation to the dashboard page, the System SHALL fetch fresh data from the server if the cached data is older than 30 seconds or if the component is mounting for the first time.
**Validates: Requirements 1.3, 4.4**

### Property 4: Window Focus Refetch
*For any* browser window focus event on a dashboard page, the System SHALL trigger a data refetch to check for updates that occurred while the window was inactive.
**Validates: Requirements 1.4**

### Property 5: Submission Notification Creation
*For any* successful application submission, the System SHALL create both an in-app notification record in `in_app_notifications` table and queue an email in `email_queue` table containing the application number, program name, and student name.
**Validates: Requirements 3.1, 5.1, 5.2, 5.3**

### Property 6: Email Content Completeness
*For any* queued submission confirmation email in `email_queue`, the `template_data` JSON SHALL contain the application number, program name, student name, and a link to view the application.
**Validates: Requirements 3.5, 5.3**

### Property 7: Dashboard Refresh Event
*For any* completed application submission, the System SHALL dispatch a custom 'applicationSubmitted' event that triggers dashboard data refresh.
**Validates: Requirements 5.5**

### Property 8: Email Queue Status Tracking
*For any* email in `email_queue` that is successfully sent, the System SHALL update the record with `status='sent'` and populate `sent_at` timestamp.
**Validates: Requirements 3.3**

### Property 9: Email Send Timing
*For any* email queued with `priority='high'`, the cron worker SHALL attempt to send it within 60 seconds of `scheduled_for` timestamp.
**Validates: Requirements 3.2**

### Property 10: Manual Refresh Availability
*For any* dashboard page, the System SHALL provide a visible manual refresh button that forces a complete data reload when clicked.
**Validates: Requirements 1.5**

### Property 11: Multi-Admin Consistency
*For any* concurrent modification attempt by multiple admins on the same application, the System SHALL detect the conflict using `updated_at` timestamp comparison and notify the second admin to refresh.
**Validates: Requirements 2.3**

### Property 12: Polling Fallback
*For any* Supabase realtime subscription failure, the System SHALL automatically fall back to polling the database every 30 seconds.
**Validates: Requirements 2.5**

### Property 13: Login Cache Clear
*For any* successful user login, the System SHALL clear all React Query cached data to prevent showing stale data from previous sessions.
**Validates: Requirements 4.3**

## Error Handling

### Cache Invalidation Failure
- If `invalidateQueries` throws an error, log the error and continue
- Provide manual refresh button as fallback (Requirement 1.5)
- Show toast notification suggesting manual refresh

### Email Queue Failure
- If email queue insert fails, log error but don't fail the submission (Requirement 5.4)
- Store failed notification attempts in `email_notifications` table with error_message
- Admin can view failed notifications in audit log
- Retry up to 3 times with exponential backoff (Requirement 3.4)

### Real-time Subscription Failure
- If Supabase real-time connection fails, fall back to polling (Requirement 2.5)
- Poll every 30 seconds for data updates
- Show connection status indicator to user
- Log subscription errors to `system_logs` table

### Network Errors
- Implement retry with exponential backoff for API calls
- Show offline indicator when network is unavailable
- Queue actions for retry when connection is restored

### Concurrent Modification Handling
- Detect via `updated_at` timestamp mismatch
- Show warning toast to admin
- Auto-refresh the affected application data
- Log conflict to `system_audit_log` table

## Testing Strategy

### Unit Tests
- Test cache configuration values (staleTime, gcTime, refetchOnWindowFocus)
- Test mutation onSuccess callbacks call invalidateQueries
- Test email template generation with various inputs
- Test event dispatch on submission completion
- Test `useManualRefresh` hook behavior

### Integration Tests
- Test full submission flow triggers `email_queue` insert
- Test full submission flow triggers `in_app_notifications` insert
- Test admin status change triggers cache invalidation
- Test real-time subscription receives database changes via Supabase
- Test dashboard refresh on custom events
- Test cron worker processes `email_queue` correctly

### Property-Based Tests
Using fast-check for property-based testing:

1. **Cache Invalidation Property**: For any mutation type, verify all related query keys are invalidated
2. **Email Content Property**: For any application data, verify `template_data` contains required fields
3. **Event Dispatch Property**: For any submission, verify custom event is dispatched
4. **Notification Creation Property**: For any submission, verify both `email_queue` and `in_app_notifications` records are created

### End-to-End Tests
- Submit application and verify dashboard updates within 2 seconds
- Approve application as admin and verify status change reflects
- Verify email appears in `email_queue` after submission
- Test multi-tab synchronization via Supabase realtime
- Test manual refresh button functionality
- Test polling fallback when realtime disconnects

## Implementation Notes

### Files to Modify

1. `src/data/applications.ts` - Fix cache configuration (staleTime: 0, refetchOnWindowFocus: true)
2. `src/hooks/useApplicationSubmitFixed.ts` - Add direct Supabase inserts for notifications
3. `src/pages/student/Dashboard.tsx` - Add `useStudentDashboardRealtime` hook
4. `src/hooks/admin/useApplicationsData.ts` - Add `useAdminDashboardRealtime` hook
5. `src/contexts/AuthContext.tsx` - Add cache clear on login

### New Files to Create

1. `src/hooks/useStudentDashboardRealtime.ts` - Student realtime subscription hook
2. `src/hooks/useAdminDashboardRealtime.ts` - Admin realtime subscription hook
3. `src/hooks/useManualRefresh.ts` - Manual refresh functionality
4. `src/hooks/admin/useApplicationStatusUpdate.ts` - Optimistic locking for admin updates

### Supabase Configuration Required

```sql
-- Enable realtime for required tables (run in Supabase SQL Editor)
ALTER PUBLICATION supabase_realtime ADD TABLE applications;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE in_app_notifications;
```

### Migration Strategy

1. **Phase 1**: Enable Supabase realtime publication for tables
2. **Phase 2**: Deploy frontend cache configuration changes
3. **Phase 3**: Deploy notification integration in submission hook
4. **Phase 4**: Deploy realtime subscription hooks
5. **Phase 5**: Monitor for any issues and rollback if needed

### Performance Considerations

- Real-time subscriptions add WebSocket connections - monitor connection count
- Setting staleTime to 0 increases API calls - monitor server load
- Email queue processing should be rate-limited to avoid Resend API limits
- Debounce rapid realtime updates (500ms) to prevent UI thrashing
- Use filtered subscriptions (`filter: user_id=eq.${user.id}`) to reduce message volume
