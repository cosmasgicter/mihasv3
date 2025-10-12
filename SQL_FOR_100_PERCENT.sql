-- MIHAS Application System - SQL for 100% API Success
-- Run this in Supabase SQL Editor to achieve 100% test success

-- Fix 1: Add admin role to test user for analytics access
INSERT INTO user_roles (user_id, role, is_active, created_at, updated_at)
SELECT 
    'f9b1eede-a856-4112-ab9e-58a93ba838a8', -- alexisstar8@gmail.com user ID
    'admin',
    true,
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = 'f9b1eede-a856-4112-ab9e-58a93ba838a8' 
    AND role = 'admin'
);

-- Fix 2: Create user_roles table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role)
);

-- Fix 3: Enable RLS on user_roles table
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Fix 4: Create RLS policy for user_roles
CREATE POLICY "Users can view their own roles" ON user_roles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" ON user_roles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role IN ('admin', 'super_admin') 
            AND ur.is_active = true
        )
    );

-- Fix 5: Update auth registration to handle existing users gracefully
-- This is handled in the API code, but ensure unique constraint exists
ALTER TABLE auth.users ADD CONSTRAINT IF NOT EXISTS users_email_unique UNIQUE (email);

-- Fix 6: Grant necessary permissions for analytics
GRANT SELECT, INSERT, UPDATE ON user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_roles TO service_role;