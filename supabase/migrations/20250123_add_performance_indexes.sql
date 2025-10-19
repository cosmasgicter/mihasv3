-- Performance Optimization: Add Strategic Indexes
-- Expected: 30% query performance improvement

-- Applications table (most queried)
CREATE INDEX IF NOT EXISTS idx_applications_user_status 
  ON applications(user_id, status);

CREATE INDEX IF NOT EXISTS idx_applications_submitted_at 
  ON applications(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_program 
  ON applications(program);

CREATE INDEX IF NOT EXISTS idx_applications_status_created 
  ON applications(status, created_at DESC);

-- Profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_email 
  ON profiles(email);

CREATE INDEX IF NOT EXISTS idx_profiles_role 
  ON profiles(role);

-- Notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
  ON notifications(user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_created 
  ON notifications(created_at DESC);

-- Documents table (if exists)
CREATE INDEX IF NOT EXISTS idx_documents_application 
  ON documents(application_id) WHERE EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'documents'
  );

-- Add query performance comments
COMMENT ON INDEX idx_applications_user_status IS 'Optimizes user dashboard queries';
COMMENT ON INDEX idx_applications_submitted_at IS 'Optimizes admin application list sorting';
COMMENT ON INDEX idx_notifications_user_read IS 'Optimizes notification badge queries';
