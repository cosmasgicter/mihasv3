# Notification Bug Report - Duplicate Notifications & Missing Emails

**Date**: 2025-01-25  
**Severity**: HIGH  
**Status**: IDENTIFIED - REQUIRES FIX

---

## 🐛 Issues Identified

### 1. **DUPLICATE NOTIFICATIONS** ✅ ROOT CAUSE FOUND

**Problem**: When an application is approved, notifications are sent TWICE to the student.

**Root Cause**: **DOUBLE NOTIFICATION TRIGGER**

There are TWO separate systems sending notifications for the same status change:

#### Location 1: Database Trigger (AUTOMATIC)
- **File**: Database function `notify_application_status_change()`
- **Trigger**: `application_status_notification_trigger` on `applications` table
- **Action**: AFTER UPDATE on applications table
- **What it does**: Automatically sends notification when status changes

```sql
-- This trigger fires AUTOMATICALLY on ANY status update
CREATE TRIGGER application_status_notification_trigger
AFTER UPDATE ON applications
FOR EACH ROW
EXECUTE FUNCTION notify_application_status_change();
```

#### Location 2: API Endpoint (MANUAL)
- **File**: `/functions/applications/[id].js` (Lines 310-350)
- **Action**: Manually sends notification in PATCH request handler
- **What it does**: Sends notification when admin updates status via API

```javascript
// This code ALSO sends notification manually
if (data) {
  // In-app notification
  await supabase.from('in_app_notifications').insert({
    user_id: data.user_id,
    title,
    content,
    type,
    action_url: `/student/application/${id}`,
    read: false
  });
}
```

**Result**: When admin approves application → Database trigger fires → API also sends notification → **DUPLICATE NOTIFICATIONS**

---

### 2. **MISSING EMAILS** ✅ ROOT CAUSE FOUND

**Problem**: No email is sent when application is approved.

**Root Cause**: **WRONG TABLE + MISSING EMAIL PROCESSOR**

#### Issue A: Database Trigger Uses Wrong Table
The database trigger inserts into `email_notifications` table:

```sql
INSERT INTO email_notifications (
  application_id,
  recipient_email,
  subject,
  body,
  status,
  created_at
)
```

But the system checks `email_queue` table for pending emails (confirmed by query results showing emails stuck in `email_queue` with status='pending').

#### Issue B: No Email Processor Running
- Emails are queued but never sent
- No background worker/cron job processing the email queue
- Evidence: Email from Oct 25 still has `status='pending'` and `sent_at=null`

```sql
-- From database query:
{
  "id": "7f784c7d-4111-402e-8808-87246765e67d",
  "to_email": "cosmaskanchepa8@gmail.com",
  "subject": "✅ Application Submitted Successfully - MIHAS202537299",
  "status": "pending",
  "created_at": "2025-10-25 08:58:59.858026+00",
  "sent_at": null,  // ❌ NEVER SENT
  "error_message": null
}
```

#### Issue C: API Endpoint Email Logic Has Condition
The API endpoint only sends email if `context.env.RESEND_API_KEY` exists:

```javascript
if (data.email && context.env.RESEND_API_KEY) {
  const { sendEmail } = await import('../_lib/emailService.js');
  sendEmail({...}).catch(err => console.error('Email send error:', err));
}
```

If `RESEND_API_KEY` is not configured, emails are silently skipped.

---

## 📊 Evidence from Database

### Duplicate Notifications
```json
// User: 6e147ead-e34d-41e2-bc05-358a653ff633
// Same message sent multiple times within seconds:

{
  "id": "54fbf531-2277-412c-9796-f6b45e458836",
  "type": "application_update",
  "title": "Application Update",
  "message": "Your application status has been updated...",
  "created_at": "2025-09-22 12:18:43.313715+00"
},
{
  "id": "1018b39b-f5d5-44a9-a909-f0e22eee8c1d",
  "type": "application_update",
  "title": "Application Update",
  "message": "Your application status has been updated...",
  "created_at": "2025-09-22 12:18:43.307102+00"  // 0.006 seconds apart!
}
```

### Missing Emails
```json
// Emails stuck in queue, never sent:
{
  "id": "7f784c7d-4111-402e-8808-87246765e67d",
  "status": "pending",
  "sent_at": null,
  "error_message": null
}
```

---

## 🔧 Recommended Fixes

### Fix 1: Remove Duplicate Notification Logic

**Option A: Remove from Database Trigger (RECOMMENDED)**
```sql
-- Modify the trigger function to NOT send in-app notifications
-- Let the API handle all notifications for better control
DROP TRIGGER IF EXISTS application_status_notification_trigger ON applications;
```

**Option B: Remove from API Endpoint**
```javascript
// Remove the manual notification code from /functions/applications/[id].js
// Lines 310-350
// Let database trigger handle it
```

**Recommendation**: Use Option A - Remove from database trigger because:
- API has better error handling
- API can send emails immediately
- API has audit logging
- API has workflow execution
- More maintainable (single source of truth)

---

### Fix 2: Fix Email System

**Step 1: Standardize Email Table**
```sql
-- Either:
-- A) Update trigger to use email_queue instead of email_notifications
-- OR
-- B) Create a view/function to sync between tables
```

**Step 2: Verify RESEND_API_KEY Configuration**
```bash
# Check if environment variable is set
echo $RESEND_API_KEY

# Or check in wrangler.toml
cat wrangler.toml | grep RESEND_API_KEY
```

**Step 3: Create Email Processor**
```javascript
// Create: /functions/cron/process-email-queue.js
// This should run every 1-5 minutes to process pending emails
```

**Step 4: Alternative - Send Emails Immediately**
```javascript
// In API endpoint, send email synchronously instead of queuing
// This is what the code tries to do, but needs RESEND_API_KEY
```

---

## 🚀 Implementation Priority

### CRITICAL (Fix Immediately)
1. ✅ Remove duplicate notification trigger
2. ✅ Verify RESEND_API_KEY is configured
3. ✅ Test email sending works

### HIGH (Fix This Week)
4. Create email queue processor
5. Add monitoring for failed emails
6. Add retry logic for failed emails

### MEDIUM (Fix This Month)
7. Consolidate email tables (email_queue vs email_notifications)
8. Add email delivery tracking
9. Add email templates system

---

## 🧪 Testing Checklist

After implementing fixes:

- [ ] Approve an application
- [ ] Verify only ONE notification appears in database
- [ ] Verify only ONE notification shows in student UI
- [ ] Verify email is sent immediately
- [ ] Check email arrives in inbox
- [ ] Verify email content is correct
- [ ] Test with multiple status changes
- [ ] Test with different statuses (approved, rejected, pending_documents)

---

## 📝 Files to Modify

1. **Database**: Remove or modify trigger
   - Function: `notify_application_status_change()`
   - Trigger: `application_status_notification_trigger`

2. **API Endpoint**: `/functions/applications/[id].js`
   - Keep notification logic (lines 310-350)
   - Ensure email sending works

3. **Environment**: `wrangler.toml` or `.env`
   - Add/verify: `RESEND_API_KEY=re_xxxxx`

4. **New File**: `/functions/cron/process-email-queue.js`
   - Create email processor (if using queue approach)

---

## 🔍 Additional Findings

### Database Triggers on Applications Table
```
1. application_status_notification_trigger (AFTER UPDATE) ← DUPLICATE SOURCE
2. applications_defaults_trigger (BEFORE INSERT/UPDATE)
3. trigger_update_applications_updated_at (BEFORE UPDATE)
```

### Notification Tables
```
- notifications (legacy?)
- in_app_notifications (current)
- email_notifications (used by trigger)
- email_queue (used by system)
- notification_logs (tracking)
```

**Recommendation**: Consolidate notification tables to reduce complexity.

---

## 📞 Next Steps

1. **Immediate**: Disable database trigger to stop duplicates
2. **Urgent**: Configure RESEND_API_KEY to enable emails
3. **Important**: Test the fix with a real application approval
4. **Follow-up**: Implement email queue processor for reliability

---

**Report Generated**: 2025-01-25  
**Analyzed By**: Amazon Q Developer  
**Confidence Level**: HIGH (Root causes confirmed via code + database analysis)
