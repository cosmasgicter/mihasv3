-- Verification Script for Duplicate Functionality Fixes
-- Run this after applying fixes to verify system integrity

-- ============================================
-- 1. Verify Application Triggers
-- ============================================
SELECT 
  '1. Application Triggers' as check_name,
  COUNT(*) as trigger_count,
  CASE 
    WHEN COUNT(*) = 3 THEN '✅ PASS'
    ELSE '❌ FAIL - Expected 3 triggers'
  END as status
FROM information_schema.triggers
WHERE event_object_table = 'applications';

-- ============================================
-- 2. Verify No Duplicate Notification Trigger
-- ============================================
SELECT 
  '2. Duplicate Trigger Removed' as check_name,
  COUNT(*) as found_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL - status_change_notification still exists'
  END as status
FROM information_schema.triggers
WHERE event_object_table = 'applications'
  AND trigger_name = 'status_change_notification';

-- ============================================
-- 3. Verify Notification Trigger Exists
-- ============================================
SELECT 
  '3. Main Notification Trigger' as check_name,
  COUNT(*) as found_count,
  CASE 
    WHEN COUNT(*) = 1 THEN '✅ PASS'
    ELSE '❌ FAIL - application_status_notification_trigger missing'
  END as status
FROM information_schema.triggers
WHERE event_object_table = 'applications'
  AND trigger_name = 'application_status_notification_trigger';

-- ============================================
-- 4. Check for Recent Duplicate Notifications
-- ============================================
WITH duplicate_check AS (
  SELECT 
    user_id,
    title,
    content,
    COUNT(*) as count,
    MAX(created_at) - MIN(created_at) as time_diff
  FROM in_app_notifications
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY user_id, title, content
  HAVING COUNT(*) > 1
)
SELECT 
  '4. Recent Duplicate Notifications' as check_name,
  COUNT(*) as duplicate_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '⚠️ WARNING - Found ' || COUNT(*) || ' duplicate notifications in last hour'
  END as status
FROM duplicate_check;

-- ============================================
-- 5. Verify Application Number Generation
-- ============================================
SELECT 
  '5. Application Numbers' as check_name,
  COUNT(*) as null_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL - Found ' || COUNT(*) || ' applications without numbers'
  END as status
FROM applications
WHERE application_number IS NULL;

-- ============================================
-- 6. Verify Tracking Codes
-- ============================================
SELECT 
  '6. Tracking Codes' as check_name,
  COUNT(*) as null_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL - Found ' || COUNT(*) || ' applications without tracking codes'
  END as status
FROM applications
WHERE public_tracking_code IS NULL;

-- ============================================
-- 7. Check Email Notification Queue
-- ============================================
SELECT 
  '7. Email Queue Status' as check_name,
  COUNT(*) as pending_count,
  CASE 
    WHEN COUNT(*) < 100 THEN '✅ PASS'
    WHEN COUNT(*) < 500 THEN '⚠️ WARNING - ' || COUNT(*) || ' pending emails'
    ELSE '❌ FAIL - Email queue backed up: ' || COUNT(*) || ' pending'
  END as status
FROM email_notifications
WHERE status = 'pending';

-- ============================================
-- 8. Summary Report
-- ============================================
SELECT 
  '========================================' as separator,
  'VERIFICATION SUMMARY' as title,
  '========================================' as separator2;

SELECT 
  'Total Applications' as metric,
  COUNT(*) as value
FROM applications;

SELECT 
  'Total Notifications (24h)' as metric,
  COUNT(*) as value
FROM in_app_notifications
WHERE created_at > NOW() - INTERVAL '24 hours';

SELECT 
  'Active Triggers on Applications' as metric,
  COUNT(*) as value
FROM information_schema.triggers
WHERE event_object_table = 'applications';

-- ============================================
-- 9. List All Application Triggers
-- ============================================
SELECT 
  '========================================' as separator,
  'ACTIVE APPLICATION TRIGGERS' as title,
  '========================================' as separator2;

SELECT 
  trigger_name,
  event_manipulation as event,
  action_timing as timing,
  action_statement as function
FROM information_schema.triggers
WHERE event_object_table = 'applications'
ORDER BY trigger_name;

-- ============================================
-- Expected Results:
-- ============================================
-- 1. Application Triggers: 3 (PASS)
-- 2. Duplicate Trigger Removed: 0 (PASS)
-- 3. Main Notification Trigger: 1 (PASS)
-- 4. Recent Duplicate Notifications: 0 (PASS)
-- 5. Application Numbers: 0 null (PASS)
-- 6. Tracking Codes: 0 null (PASS)
-- 7. Email Queue: < 100 pending (PASS)
-- 
-- Active Triggers Should Be:
-- - applications_new_defaults_trigger (BEFORE INSERT/UPDATE)
-- - application_status_notification_trigger (AFTER UPDATE)
-- - trigger_update_applications_new_updated_at (BEFORE UPDATE)
