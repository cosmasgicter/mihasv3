-- Bulk Notification Jobs Schema
-- Creates tables for managing bulk notification jobs with queuing, throttling, and priority-based delivery

-- Bulk notification jobs table
CREATE TABLE IF NOT EXISTS bulk_notification_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'scheduled', 'processing', 'completed', 'failed', 'cancelled')),
  priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  
  -- Recipients and processing
  total_recipients INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  
  -- Template and content
  template_name VARCHAR(100),
  template_variables JSONB DEFAULT '{}',
  channels TEXT[] DEFAULT ARRAY['email', 'in_app'],
  
  -- Recipients data (stored as JSONB for flexibility)
  recipients_data JSONB NOT NULL DEFAULT '[]',
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- System settings table for throttle configuration
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add bulk_job_id to notifications table for tracking
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS bulk_job_id UUID REFERENCES bulk_notification_jobs(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bulk_notification_jobs_status_priority 
  ON bulk_notification_jobs(status, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_bulk_notification_jobs_created_by 
  ON bulk_notification_jobs(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bulk_notification_jobs_scheduled 
  ON bulk_notification_jobs(scheduled_for) 
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_bulk_notification_jobs_processing 
  ON bulk_notification_jobs(status, started_at) 
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_notifications_bulk_job 
  ON notifications(bulk_job_id) 
  WHERE bulk_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_system_settings_key 
  ON system_settings(key);

-- RLS Policies
ALTER TABLE bulk_notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage all bulk jobs
CREATE POLICY "Admins can manage bulk jobs" ON bulk_notification_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role IN ('admin', 'super_admin')
    )
  );

-- Users can view their own created jobs
CREATE POLICY "Users can view own bulk jobs" ON bulk_notification_jobs
  FOR SELECT USING (created_by = auth.uid());

-- Only super admins can manage system settings
CREATE POLICY "Super admins can manage system settings" ON system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role = 'super_admin'
    )
  );

-- Admins can read system settings
CREATE POLICY "Admins can read system settings" ON system_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role IN ('admin', 'super_admin')
    )
  );

-- Update triggers
CREATE TRIGGER update_bulk_notification_jobs_updated_at 
  BEFORE UPDATE ON bulk_notification_jobs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at 
  BEFORE UPDATE ON system_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default throttle settings
INSERT INTO system_settings (key, value, description) VALUES
  ('bulk_notification_throttle', 
   '{
     "max_concurrent_jobs": 3,
     "max_notifications_per_minute": 100,
     "max_notifications_per_hour": 5000,
     "batch_size": 50,
     "delay_between_batches_ms": 1000
   }',
   'Throttle settings for bulk notification processing')
ON CONFLICT (key) DO NOTHING;

-- Function to get next job to process (respects priority)
CREATE OR REPLACE FUNCTION get_next_bulk_job()
RETURNS TABLE (
  job_id UUID,
  job_name VARCHAR(255),
  priority VARCHAR(10),
  total_recipients INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    name,
    bulk_notification_jobs.priority,
    bulk_notification_jobs.total_recipients
  FROM bulk_notification_jobs
  WHERE status IN ('queued', 'scheduled')
    AND (scheduled_for IS NULL OR scheduled_for <= NOW())
  ORDER BY 
    CASE priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update job progress
CREATE OR REPLACE FUNCTION update_bulk_job_progress(
  p_job_id UUID,
  p_processed_count INTEGER,
  p_success_count INTEGER,
  p_failed_count INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_total_recipients INTEGER;
  v_progress_percentage INTEGER;
BEGIN
  -- Get total recipients
  SELECT total_recipients INTO v_total_recipients
  FROM bulk_notification_jobs
  WHERE id = p_job_id;
  
  IF v_total_recipients IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Calculate progress percentage
  v_progress_percentage := CASE 
    WHEN v_total_recipients = 0 THEN 100
    ELSE ROUND((p_processed_count::DECIMAL / v_total_recipients) * 100)
  END;
  
  -- Update job
  UPDATE bulk_notification_jobs
  SET 
    processed_count = p_processed_count,
    success_count = p_success_count,
    failed_count = p_failed_count,
    progress_percentage = v_progress_percentage,
    updated_at = NOW()
  WHERE id = p_job_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get bulk job statistics
CREATE OR REPLACE FUNCTION get_bulk_job_statistics(
  p_hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_jobs BIGINT,
  queued_jobs BIGINT,
  processing_jobs BIGINT,
  completed_jobs BIGINT,
  failed_jobs BIGINT,
  cancelled_jobs BIGINT,
  total_recipients BIGINT,
  total_success BIGINT,
  total_failed BIGINT,
  success_rate DECIMAL
) AS $$
DECLARE
  v_time_window TIMESTAMPTZ;
BEGIN
  v_time_window := NOW() - (p_hours_back || ' hours')::INTERVAL;
  
  RETURN QUERY
  SELECT 
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'queued') as queued_jobs,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_jobs,
    COALESCE(SUM(bulk_notification_jobs.total_recipients), 0) as total_recipients,
    COALESCE(SUM(success_count), 0) as total_success,
    COALESCE(SUM(failed_count), 0) as total_failed,
    CASE 
      WHEN SUM(bulk_notification_jobs.total_recipients) > 0 THEN
        ROUND((SUM(success_count)::DECIMAL / SUM(bulk_notification_jobs.total_recipients)) * 100, 2)
      ELSE 0
    END as success_rate
  FROM bulk_notification_jobs
  WHERE created_at >= v_time_window;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE bulk_notification_jobs IS 'Manages bulk notification jobs with queuing, throttling, and priority-based delivery';
COMMENT ON TABLE system_settings IS 'System-wide configuration settings stored as JSONB';
COMMENT ON FUNCTION get_next_bulk_job() IS 'Returns the next bulk job to process based on priority and schedule';
COMMENT ON FUNCTION update_bulk_job_progress(UUID, INTEGER, INTEGER, INTEGER) IS 'Updates bulk job progress and calculates completion percentage';
COMMENT ON FUNCTION get_bulk_job_statistics(INTEGER) IS 'Returns comprehensive statistics for bulk notification jobs within specified time window';