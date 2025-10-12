-- MIHAS Application System - Fixed SQL for 100% API Success
-- Run this in Supabase SQL Editor

-- Fix 1: Create user_roles table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role)
);

-- Fix 2: Enable RLS on user_roles table
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Fix 3: Create RLS policies for user_roles
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

-- Fix 4: Grant permissions
GRANT SELECT, INSERT, UPDATE ON user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_roles TO service_role;

-- Fix 5: Add admin role to test user
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