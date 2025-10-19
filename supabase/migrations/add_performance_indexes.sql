-- Performance Optimization Indexes
-- Created: 2025-01-23

-- Applications table (most queried)
CREATE INDEX IF NOT EXISTS idx_applications_user_status 
  ON applications(user_id, status) 
  WHERE status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_submitted_at 
  ON applications(submitted_at DESC NULLS LAST) 
  WHERE submitted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_program 
  ON applications(program) 
  WHERE program IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_tracking 
  ON applications(public_tracking_code) 
  WHERE public_tracking_code IS NOT NULL;

-- Profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_email 
  ON profiles(email) 
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_role 
  ON profiles(role) 
  WHERE role IS NOT NULL;

-- Notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
  ON notifications(user_id, read, created_at DESC) 
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user 
  ON in_app_notifications(user_id, read, created_at DESC) 
  WHERE user_id IS NOT NULL;

-- Application status history
CREATE INDEX IF NOT EXISTS idx_status_history_application 
  ON application_status_history(application_id, created_at DESC) 
  WHERE application_id IS NOT NULL;

-- Email notifications
CREATE INDEX IF NOT EXISTS idx_email_notifications_status 
  ON email_notifications(status, created_at DESC) 
  WHERE status IS NOT NULL;

-- Analyze tables for query planner
ANALYZE applications;
ANALYZE profiles;
ANALYZE notifications;
ANALYZE in_app_notifications;
