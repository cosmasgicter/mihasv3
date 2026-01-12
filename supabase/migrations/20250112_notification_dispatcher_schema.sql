-- Multi-Channel Notification Dispatcher Schema
-- Creates tables for tracking notification delivery across multiple channels

-- Notification delivery tracking table
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'push', 'in_app')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  delivery_attempt INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 3,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  external_id VARCHAR(255), -- For tracking with external services (Twilio SID, etc.)
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User notification preferences (enhanced)
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  whatsapp_enabled BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  
  -- Consent tracking
  email_consent_at TIMESTAMPTZ,
  sms_consent_at TIMESTAMPTZ,
  whatsapp_consent_at TIMESTAMPTZ,
  push_consent_at TIMESTAMPTZ,
  
  -- Preference settings
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '08:00',
  timezone VARCHAR(50) DEFAULT 'Africa/Lusaka',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, endpoint)
);

-- Notification templates for channel-specific formatting
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'push', 'in_app')),
  subject_template TEXT,
  body_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]', -- Array of variable names used in template
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification_id 
  ON notification_deliveries(notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status 
  ON notification_deliveries(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_channel_status 
  ON notification_deliveries(channel, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id 
  ON user_notification_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id 
  ON push_subscriptions(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_notification_templates_name_channel 
  ON notification_templates(name, channel) WHERE is_active = true;

-- RLS Policies
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notification deliveries
CREATE POLICY "Users can view own notification deliveries" ON notification_deliveries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM notifications n 
      WHERE n.id = notification_deliveries.notification_id 
      AND n.user_id = auth.uid()
    )
  );

-- Users can manage their own preferences
CREATE POLICY "Users can manage own preferences" ON user_notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- Users can manage their own push subscriptions
CREATE POLICY "Users can manage own push subscriptions" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- Only admins can manage templates
CREATE POLICY "Admins can manage templates" ON notification_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role IN ('admin', 'super_admin')
    )
  );

-- Everyone can read active templates
CREATE POLICY "Everyone can read active templates" ON notification_templates
  FOR SELECT USING (is_active = true);

-- Update triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notification_deliveries_updated_at 
  BEFORE UPDATE ON notification_deliveries 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_notification_preferences_updated_at 
  BEFORE UPDATE ON user_notification_preferences 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_push_subscriptions_updated_at 
  BEFORE UPDATE ON push_subscriptions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default notification templates
INSERT INTO notification_templates (name, channel, subject_template, body_template, variables) VALUES
  ('application_status_update', 'email', 'Application Status Update - {{application_number}}', 
   '<h2>Application Status Update</h2><p>Dear {{full_name}},</p><p>Your application {{application_number}} status has been updated to: <strong>{{status}}</strong></p><p>{{message}}</p>', 
   '["full_name", "application_number", "status", "message"]'),
  
  ('application_status_update', 'sms', '', 
   'MIHAS: Your application {{application_number}} status: {{status}}. {{message}}', 
   '["application_number", "status", "message"]'),
   
  ('application_status_update', 'whatsapp', '', 
   'Hello {{full_name}}! Your MIHAS application {{application_number}} status has been updated to: {{status}}. {{message}}', 
   '["full_name", "application_number", "status", "message"]'),
   
  ('application_status_update', 'push', '{{status}} - Application {{application_number}}', 
   'Your application status has been updated to {{status}}', 
   '["application_number", "status"]'),
   
  ('application_status_update', 'in_app', 'Application Status Update', 
   'Your application {{application_number}} status: {{status}}. {{message}}', 
   '["application_number", "status", "message"]');

COMMENT ON TABLE notification_deliveries IS 'Tracks delivery status for each notification channel';
COMMENT ON TABLE user_notification_preferences IS 'User preferences for notification channels and consent tracking';
COMMENT ON TABLE push_subscriptions IS 'Web push notification subscriptions';
COMMENT ON TABLE notification_templates IS 'Channel-specific notification templates with variable substitution';