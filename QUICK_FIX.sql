-- QUICK FIX: Disable duplicate notification trigger
-- This stops the database from auto-sending notifications
-- The API endpoint will handle all notifications instead

-- Step 1: Disable the trigger (don't delete, just disable for safety)
ALTER TABLE applications DISABLE TRIGGER application_status_notification_trigger;

-- Step 2: Verify trigger is disabled
SELECT 
    trigger_name,
    event_object_table,
    action_timing,
    tgenabled  -- 'D' = disabled, 'O' = enabled
FROM pg_trigger
WHERE tgname = 'application_status_notification_trigger';

-- Step 3: Check for any pending emails that need manual sending
SELECT 
    id,
    to_email,
    subject,
    status,
    created_at,
    sent_at
FROM email_queue
WHERE status = 'pending'
ORDER BY created_at DESC;

-- To re-enable later (if needed):
-- ALTER TABLE applications ENABLE TRIGGER application_status_notification_trigger;
