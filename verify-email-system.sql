-- Email System Verification Script
-- Run this to verify the email queue system is ready

-- 1. Check trigger is disabled (should show tgenabled='D')
SELECT 
    tgname as trigger_name,
    tgenabled as status
FROM pg_trigger
WHERE tgname = 'application_status_notification_trigger';
-- Expected: tgenabled = 'D' (disabled)

-- 2. Check pending emails
SELECT 
    COUNT(*) as pending_count,
    MIN(created_at) as oldest_pending,
    MAX(created_at) as newest_pending
FROM email_queue
WHERE status = 'pending';

-- 3. List all pending emails
SELECT 
    id,
    to_email,
    subject,
    priority,
    created_at,
    scheduled_for
FROM email_queue
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC;

-- 4. Check email queue statistics
SELECT 
    status,
    COUNT(*) as count,
    MAX(created_at) as last_created
FROM email_queue
GROUP BY status
ORDER BY count DESC;

-- 5. Check for failed emails
SELECT 
    id,
    to_email,
    subject,
    error_message,
    created_at
FROM email_queue
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- 6. Verify email_queue table structure
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'email_queue'
ORDER BY ordinal_position;

-- Summary Report
SELECT 
    'System Status' as check_type,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_trigger 
            WHERE tgname = 'application_status_notification_trigger' 
            AND tgenabled = 'D'
        ) THEN '✅ Trigger Disabled'
        ELSE '❌ Trigger Still Active'
    END as status
UNION ALL
SELECT 
    'Pending Emails',
    CONCAT(COUNT(*), ' emails waiting') as status
FROM email_queue
WHERE status = 'pending'
UNION ALL
SELECT 
    'Failed Emails',
    CONCAT(COUNT(*), ' emails failed') as status
FROM email_queue
WHERE status = 'failed';
