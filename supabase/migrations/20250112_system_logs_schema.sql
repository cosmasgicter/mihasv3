-- System Logs Schema
-- Creates table for tracking system events, cron jobs, and error logging

-- System logs table
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'critical')),
  source VARCHAR(100) NOT NULL, -- e.g., 'cron_bulk_notifications', 'api_endpoint', 'background_job'
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_system_logs_level_created 
  ON system_logs(level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_source_created 
  ON system_logs(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_user_created 
  ON system_logs(user_id, created_at DESC) 
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at 
  ON system_logs(created_at DESC);

-- Partial index for errors and critical logs
CREATE INDEX IF NOT EXISTS idx_system_logs_errors 
  ON system_logs(created_at DESC) 
  WHERE level IN ('error', 'critical');

-- RLS Policies
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Only super admins can view system logs
CREATE POLICY "Super admins can view system logs" ON system_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role = 'super_admin'
    )
  );

-- System can insert logs (no RLS for inserts from functions)
CREATE POLICY "System can insert logs" ON system_logs
  FOR INSERT WITH CHECK (true);

-- Function to clean up old logs (keep last 30 days by default)
CREATE OR REPLACE FUNCTION cleanup_system_logs(
  p_days_to_keep INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  v_cutoff_date := NOW() - (p_days_to_keep || ' days')::INTERVAL;
  
  DELETE FROM system_logs 
  WHERE created_at < v_cutoff_date;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  -- Log the cleanup operation
  INSERT INTO system_logs (level, source, message, details)
  VALUES (
    'info',
    'system_maintenance',
    'System logs cleanup completed',
    jsonb_build_object(
      'deleted_count', v_deleted_count,
      'cutoff_date', v_cutoff_date,
      'days_kept', p_days_to_keep
    )
  );
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get log statistics
CREATE OR REPLACE FUNCTION get_system_log_statistics(
  p_hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_logs BIGINT,
  debug_logs BIGINT,
  info_logs BIGINT,
  warn_logs BIGINT,
  error_logs BIGINT,
  critical_logs BIGINT,
  top_sources JSONB
) AS $$
DECLARE
  v_time_window TIMESTAMPTZ;
BEGIN
  v_time_window := NOW() - (p_hours_back || ' hours')::INTERVAL;
  
  RETURN QUERY
  WITH log_stats AS (
    SELECT 
      COUNT(*) as total_logs,
      COUNT(*) FILTER (WHERE level = 'debug') as debug_logs,
      COUNT(*) FILTER (WHERE level = 'info') as info_logs,
      COUNT(*) FILTER (WHERE level = 'warn') as warn_logs,
      COUNT(*) FILTER (WHERE level = 'error') as error_logs,
      COUNT(*) FILTER (WHERE level = 'critical') as critical_logs
    FROM system_logs
    WHERE created_at >= v_time_window
  ),
  source_stats AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'source', source,
        'count', log_count
      ) ORDER BY log_count DESC
    ) as top_sources
    FROM (
      SELECT source, COUNT(*) as log_count
      FROM system_logs
      WHERE created_at >= v_time_window
      GROUP BY source
      ORDER BY COUNT(*) DESC
      LIMIT 10
    ) t
  )
  SELECT 
    ls.total_logs,
    ls.debug_logs,
    ls.info_logs,
    ls.warn_logs,
    ls.error_logs,
    ls.critical_logs,
    COALESCE(ss.top_sources, '[]'::jsonb) as top_sources
  FROM log_stats ls
  CROSS JOIN source_stats ss;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log system events (helper function)
CREATE OR REPLACE FUNCTION log_system_event(
  p_level VARCHAR(20),
  p_source VARCHAR(100),
  p_message TEXT,
  p_details JSONB DEFAULT '{}',
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO system_logs (level, source, message, details, user_id)
  VALUES (p_level, p_source, p_message, p_details, p_user_id)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE system_logs IS 'System-wide event and error logging with structured data';
COMMENT ON FUNCTION cleanup_system_logs(INTEGER) IS 'Removes old system logs beyond specified retention period';
COMMENT ON FUNCTION get_system_log_statistics(INTEGER) IS 'Returns comprehensive statistics for system logs within specified time window';
COMMENT ON FUNCTION log_system_event(VARCHAR, VARCHAR, TEXT, JSONB, UUID) IS 'Helper function to log system events with structured data';