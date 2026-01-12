-- Notification Preference Audit Trail Schema
-- Creates audit table for tracking all notification preference changes

-- Audit trail for notification preference changes
CREATE TABLE IF NOT EXISTS notification_preference_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('opt_in', 'opt_out', 'update_settings', 'initialize', 'delete_all')),
  channel VARCHAR(20) CHECK (channel IN ('email', 'sms', 'whatsapp', 'push', 'in_app', 'quiet_hours', 'all')),
  
  -- Audit metadata
  previous_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}',
  
  -- Request context
  ip_address INET,
  user_agent TEXT,
  source VARCHAR(100) DEFAULT 'system', -- 'web', 'mobile', 'api', 'system', etc.
  reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_notification_preference_audit_user_id 
  ON notification_preference_audit(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_preference_audit_action 
  ON notification_preference_audit(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_preference_audit_channel 
  ON notification_preference_audit(channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_preference_audit_created_at 
  ON notification_preference_audit(created_at DESC);

-- RLS Policy
ALTER TABLE notification_preference_audit ENABLE ROW LEVEL SECURITY;

-- Users can only view their own audit trail
CREATE POLICY "Users can view own preference audit trail" ON notification_preference_audit
  FOR SELECT USING (user_id = auth.uid());

-- Only system can insert audit records (via service role)
CREATE POLICY "System can insert audit records" ON notification_preference_audit
  FOR INSERT WITH CHECK (true);

-- Admins can view all audit trails for compliance
CREATE POLICY "Admins can view all audit trails" ON notification_preference_audit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role IN ('admin', 'super_admin')
    )
  );

-- Function to automatically create audit trail on preference changes
CREATE OR REPLACE FUNCTION create_preference_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create audit for actual changes
  IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN
    RETURN NEW;
  END IF;
  
  -- Insert audit record
  INSERT INTO notification_preference_audit (
    user_id,
    action,
    channel,
    previous_value,
    new_value,
    source,
    reason
  ) VALUES (
    COALESCE(NEW.user_id, OLD.user_id),
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'initialize'
      WHEN TG_OP = 'UPDATE' THEN 'update_settings'
      WHEN TG_OP = 'DELETE' THEN 'delete_all'
    END,
    'all',
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'trigger',
    'Automatic audit via database trigger'
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger on user_notification_preferences table
DROP TRIGGER IF EXISTS user_notification_preferences_audit_trigger ON user_notification_preferences;
CREATE TRIGGER user_notification_preferences_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION create_preference_audit_trigger();

-- Add comments for documentation
COMMENT ON TABLE notification_preference_audit IS 'Audit trail for all notification preference changes with full context tracking';
COMMENT ON COLUMN notification_preference_audit.action IS 'Type of action performed: opt_in, opt_out, update_settings, initialize, delete_all';
COMMENT ON COLUMN notification_preference_audit.channel IS 'Notification channel affected, or "all" for bulk operations';
COMMENT ON COLUMN notification_preference_audit.metadata IS 'Additional context data for the preference change';
COMMENT ON COLUMN notification_preference_audit.source IS 'Source of the change: web, mobile, api, system, trigger';
COMMENT ON COLUMN notification_preference_audit.reason IS 'Human-readable reason for the change';