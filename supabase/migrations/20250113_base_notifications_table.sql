-- Base Notifications Table
-- Creates the main notifications table that other notification features depend on
-- This table is referenced by notification_deliveries and analytics functions

-- Main notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'application_update')),
  read BOOLEAN DEFAULT false,
  action_url TEXT,
  metadata JSONB DEFAULT '{}',
  bulk_job_id UUID REFERENCES bulk_notification_jobs(id) ON DELETE SET NULL,
  dedup_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
  ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
  ON notifications(user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type 
  ON notifications(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_dedup 
  ON notifications(user_id, dedup_hash, created_at) 
  WHERE dedup_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_bulk_job 
  ON notifications(bulk_job_id) 
  WHERE bulk_job_id IS NOT NULL;

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Admins can manage all notifications
CREATE POLICY "Admins can manage all notifications" ON notifications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role IN ('admin', 'super_admin')
    )
  );

-- Update trigger
CREATE TRIGGER update_notifications_updated_at 
  BEFORE UPDATE ON notifications 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Deduplication trigger
CREATE OR REPLACE FUNCTION generate_notification_dedup_hash()
RETURNS TRIGGER AS $
BEGIN
  IF NEW.dedup_hash IS NULL THEN
    NEW.dedup_hash := encode(
      digest(
        COALESCE(NEW.user_id::text, '') || 
        COALESCE(NEW.title, '') || 
        COALESCE(NEW.message, '') || 
        COALESCE(NEW.type, ''), 
        'sha256'
      ), 
      'hex'
    );
  END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER notification_dedup_hash_trigger
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION generate_notification_dedup_hash();

COMMENT ON TABLE notifications IS 'Main notifications table for in-app notifications and multi-channel delivery tracking';
COMMENT ON COLUMN notifications.dedup_hash IS 'SHA-256 hash for preventing duplicate notifications';
COMMENT ON COLUMN notifications.bulk_job_id IS 'Reference to bulk notification job if part of bulk operation';