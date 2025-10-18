-- ============================================
-- FIX ORPHANED GRADES - MIHAS V3
-- ============================================
-- This script fixes the critical data integrity issue
-- where application_grades have subject_ids that don't exist
-- ============================================

-- Step 1: Create backup table
CREATE TABLE IF NOT EXISTS application_grades_backup_20250123 AS 
SELECT * FROM application_grades;

-- Verify backup
SELECT COUNT(*) as backed_up_records FROM application_grades_backup_20250123;

-- Step 2: Show current orphaned grades
SELECT 
  ag.application_id,
  a.full_name,
  COUNT(*) as orphaned_grade_count
FROM application_grades ag
LEFT JOIN subjects s ON ag.subject_id = s.id
LEFT JOIN applications a ON ag.application_id = a.id
WHERE s.id IS NULL
GROUP BY ag.application_id, a.full_name;

-- Step 3: Delete orphaned grades
DELETE FROM application_grades 
WHERE subject_id NOT IN (SELECT id FROM subjects);

-- Step 4: Verify deletion
SELECT 
  COUNT(*) as remaining_grades,
  COUNT(DISTINCT application_id) as apps_with_grades
FROM application_grades;

-- Step 5: Show valid subjects for reference
SELECT id, name, code FROM subjects ORDER BY name;

-- ============================================
-- NOTES:
-- ============================================
-- After running this script:
-- 1. All orphaned grades will be deleted
-- 2. Grades need to be re-entered through the UI
-- 3. Use the subject IDs shown in Step 5
-- 4. Backup is saved in application_grades_backup_20250123
-- ============================================

-- To restore from backup if needed:
-- DELETE FROM application_grades;
-- INSERT INTO application_grades SELECT * FROM application_grades_backup_20250123;
