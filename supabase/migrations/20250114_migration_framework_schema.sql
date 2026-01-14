-- Migration Framework Schema
-- Provides tracking and management for automated migrations
-- Requirements: 10.4

-- Migration history table
CREATE TABLE IF NOT EXISTS migration_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id TEXT NOT NULL,
  migration_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT unique_migration_execution UNIQUE (migration_id, started_at)
);

-- Migration backups table
CREATE TABLE IF NOT EXISTS migration_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_id TEXT NOT NULL UNIQUE,
  migration_id TEXT NOT NULL,
  backup_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_at TIMESTAMPTZ,
  size_bytes BIGINT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Migration validation results table
CREATE TABLE IF NOT EXISTS migration_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_history_id UUID REFERENCES migration_history(id) ON DELETE CASCADE,
  validation_type TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('passed', 'failed', 'warning')),
  validation_message TEXT,
  validation_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration progress tracking table
CREATE TABLE IF NOT EXISTS migration_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_history_id UUID REFERENCES migration_history(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_migration_history_migration_id ON migration_history(migration_id);
CREATE INDEX IF NOT EXISTS idx_migration_history_status ON migration_history(status);
CREATE INDEX IF NOT EXISTS idx_migration_history_started_at ON migration_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_backups_migration_id ON migration_backups(migration_id);
CREATE INDEX IF NOT EXISTS idx_migration_backups_backup_id ON migration_backups(backup_id);
CREATE INDEX IF NOT EXISTS idx_migration_validations_history_id ON migration_validations(migration_history_id);
CREATE INDEX IF NOT EXISTS idx_migration_progress_history_id ON migration_progress(migration_history_id);

-- Enable Row Level Security
ALTER TABLE migration_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for migration_history
CREATE POLICY "Admin users can view migration history"
  ON migration_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admin users can insert migration history"
  ON migration_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admin users can update migration history"
  ON migration_history FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for migration_backups
CREATE POLICY "Admin users can view migration backups"
  ON migration_backups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admin users can manage migration backups"
  ON migration_backups FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for migration_validations
CREATE POLICY "Admin users can view migration validations"
  ON migration_validations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admin users can insert migration validations"
  ON migration_validations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for migration_progress
CREATE POLICY "Admin users can view migration progress"
  ON migration_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admin users can manage migration progress"
  ON migration_progress FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- Helper function to find orphaned records
CREATE OR REPLACE FUNCTION find_orphaned_records(
  table_name TEXT,
  foreign_key TEXT,
  referenced_table TEXT
)
RETURNS TABLE (id UUID) AS $$
BEGIN
  RETURN QUERY EXECUTE format(
    'SELECT t.id FROM %I t LEFT JOIN %I r ON t.%I = r.id WHERE r.id IS NULL AND t.%I IS NOT NULL',
    table_name, referenced_table, foreign_key, foreign_key
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to find duplicate values
CREATE OR REPLACE FUNCTION find_duplicate_values(
  table_name TEXT,
  column_name TEXT
)
RETURNS TABLE (value TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY EXECUTE format(
    'SELECT %I::TEXT, COUNT(*) as count FROM %I GROUP BY %I HAVING COUNT(*) > 1',
    column_name, table_name, column_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get migration statistics
CREATE OR REPLACE FUNCTION get_migration_statistics()
RETURNS TABLE (
  total_migrations BIGINT,
  completed_migrations BIGINT,
  failed_migrations BIGINT,
  rolled_back_migrations BIGINT,
  average_duration_seconds NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_migrations,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as completed_migrations,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed_migrations,
    COUNT(*) FILTER (WHERE status = 'rolled_back')::BIGINT as rolled_back_migrations,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))::NUMERIC as average_duration_seconds
  FROM migration_history;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_migration_history_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER migration_history_updated_at
  BEFORE UPDATE ON migration_history
  FOR EACH ROW
  EXECUTE FUNCTION update_migration_history_timestamp();

-- Comments for documentation
COMMENT ON TABLE migration_history IS 'Tracks all migration executions with status and metadata';
COMMENT ON TABLE migration_backups IS 'Stores backup points for migration rollback capabilities';
COMMENT ON TABLE migration_validations IS 'Records validation results for each migration';
COMMENT ON TABLE migration_progress IS 'Tracks detailed progress of multi-step migrations';
COMMENT ON FUNCTION find_orphaned_records IS 'Identifies records with invalid foreign key references';
COMMENT ON FUNCTION find_duplicate_values IS 'Finds duplicate values in specified columns';
COMMENT ON FUNCTION get_migration_statistics IS 'Provides aggregate statistics on migration executions';
