-- Multi-draft support for application wizard
-- Allows users to save multiple draft applications

-- Add draft_name and is_active columns to application_drafts
ALTER TABLE application_drafts 
ADD COLUMN IF NOT EXISTS draft_name TEXT DEFAULT 'Draft Application',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster draft queries
CREATE INDEX IF NOT EXISTS idx_application_drafts_user_active 
ON application_drafts(user_id, is_active, updated_at DESC);

-- Add constraint to ensure at least one draft name per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_application_drafts_user_name 
ON application_drafts(user_id, draft_name) 
WHERE is_active = true;

-- Update RLS policies to support multiple drafts
DROP POLICY IF EXISTS "Users can view own drafts" ON application_drafts;
CREATE POLICY "Users can view own drafts" ON application_drafts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own drafts" ON application_drafts;
CREATE POLICY "Users can insert own drafts" ON application_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own drafts" ON application_drafts;
CREATE POLICY "Users can update own drafts" ON application_drafts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own drafts" ON application_drafts;
CREATE POLICY "Users can delete own drafts" ON application_drafts
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update last_accessed_at
CREATE OR REPLACE FUNCTION update_draft_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_accessed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update last_accessed_at
DROP TRIGGER IF EXISTS trigger_update_draft_last_accessed ON application_drafts;
CREATE TRIGGER trigger_update_draft_last_accessed
  BEFORE UPDATE ON application_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_draft_last_accessed();
