-- MIHAS Application System - Complete Supabase SQL Setup
-- Run this SQL in Supabase SQL Editor for full system functionality

-- 1. Add missing columns to applications_new table
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS additional_subjects JSONB;
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- 2. Create application number generation function
CREATE OR REPLACE FUNCTION generate_application_number(prefix VARCHAR DEFAULT 'MIHAS')
RETURNS VARCHAR 
LANGUAGE plpgsql
AS $$
DECLARE
    year_part VARCHAR := EXTRACT(YEAR FROM NOW())::VARCHAR;
    random_part VARCHAR := LPAD(FLOOR(RANDOM() * 10000)::VARCHAR, 4, '0');
BEGIN
    RETURN prefix || year_part || random_part;
END;
$$;

-- 3. Create user_roles table for admin permissions
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role)
);

-- 4. Enable RLS on user_roles table
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies for user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
CREATE POLICY "Users can view their own roles" ON user_roles
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
CREATE POLICY "Admins can manage all roles" ON user_roles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role IN ('admin', 'super_admin') 
            AND ur.is_active = true
        )
    );

-- 6. Grant permissions for user_roles
GRANT SELECT, INSERT, UPDATE ON user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_roles TO service_role;

-- 7. Add admin role to test user (replace with actual user ID)
INSERT INTO user_roles (user_id, role, is_active, created_at, updated_at)
SELECT 
    'f9b1eede-a856-4112-ab9e-58a93ba838a8',
    'admin',
    true,
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = 'f9b1eede-a856-4112-ab9e-58a93ba838a8' 
    AND role = 'admin'
);

-- 8. Update check constraint for submitted applications
ALTER TABLE applications_new DROP CONSTRAINT IF EXISTS check_submitted_at_when_submitted;
ALTER TABLE applications_new ADD CONSTRAINT check_submitted_at_when_submitted 
CHECK (
    (status = 'submitted' AND submitted_at IS NOT NULL) OR 
    (status != 'submitted')
);