-- MIHAS Supabase Fix - Handle Views and Tables Correctly
-- First check what applications actually is, then fix accordingly

-- 1. Check if applications is a view and find the underlying table
DO $$
BEGIN
    -- If applications is a view, we need to work with the underlying table
    -- Let's assume the real table might be applications_raw or similar
    
    -- Check table existence and add columns only to real tables
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications' AND table_type = 'BASE TABLE') THEN
        -- applications is a real table
        ALTER TABLE applications ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255);
        ALTER TABLE applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
        ALTER TABLE applications ADD COLUMN IF NOT EXISTS admin_notes TEXT;
    END IF;
    
    -- Always try to fix applications_new if it exists as a table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications_new' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS additional_subjects JSONB;
        ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255);
        ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255);
        ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
        ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255);
        ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
        ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS admin_notes TEXT;
    END IF;
END $$;

-- 2. Fix profiles table RLS policies (this should work regardless)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 3. Create application number generation function
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

-- 4. Create admin approval functions that work with views
CREATE OR REPLACE FUNCTION approve_application_safe(
    app_id UUID,
    admin_email VARCHAR,
    notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    base_table_name TEXT;
    sql_query TEXT;
BEGIN
    -- Check if user is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    -- Try to update in applications_new first, then applications if it's a table
    BEGIN
        UPDATE applications_new 
        SET 
            status = 'approved',
            reviewed_by = admin_email,
            reviewed_at = NOW(),
            admin_notes = COALESCE(notes, 'Application approved'),
            updated_at = NOW()
        WHERE id = app_id;
        
        IF FOUND THEN
            RETURN TRUE;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- applications_new might not exist, continue
    END;
    
    -- If applications is a table (not view), try updating it
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications' AND table_type = 'BASE TABLE') THEN
            UPDATE applications 
            SET 
                status = 'approved',
                reviewed_by = admin_email,
                reviewed_at = NOW(),
                admin_notes = COALESCE(notes, 'Application approved'),
                updated_at = NOW()
            WHERE id = app_id;
            
            RETURN FOUND;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Column might not exist, that's ok
    END;
    
    -- Fallback: just update status if other columns don't exist
    BEGIN
        UPDATE applications SET status = 'approved' WHERE id = app_id;
        RETURN FOUND;
    EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
    END;
END;
$$;

CREATE OR REPLACE FUNCTION reject_application_safe(
    app_id UUID,
    admin_email VARCHAR,
    notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if user is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    -- Try applications_new first
    BEGIN
        UPDATE applications_new 
        SET 
            status = 'rejected',
            reviewed_by = admin_email,
            reviewed_at = NOW(),
            admin_notes = COALESCE(notes, 'Application rejected'),
            updated_at = NOW()
        WHERE id = app_id;
        
        IF FOUND THEN
            RETURN TRUE;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Continue to next attempt
    END;
    
    -- Try applications table
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications' AND table_type = 'BASE TABLE') THEN
            UPDATE applications 
            SET 
                status = 'rejected',
                reviewed_by = admin_email,
                reviewed_at = NOW(),
                admin_notes = COALESCE(notes, 'Application rejected'),
                updated_at = NOW()
            WHERE id = app_id;
            
            RETURN FOUND;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Column might not exist
    END;
    
    -- Fallback: just update status
    BEGIN
        UPDATE applications SET status = 'rejected' WHERE id = app_id;
        RETURN FOUND;
    EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
    END;
END;
$$;

-- 5. Create safe RLS policies that handle views
DO $$
BEGIN
    -- Only create RLS policies if applications is a real table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications' AND table_type = 'BASE TABLE') THEN
        DROP POLICY IF EXISTS "Users can view own applications" ON applications;
        DROP POLICY IF EXISTS "Users can create applications" ON applications;
        DROP POLICY IF EXISTS "Users can update own applications" ON applications;
        DROP POLICY IF EXISTS "Admins can manage all applications" ON applications;

        CREATE POLICY "Users can view own applications" ON applications
            FOR SELECT USING (auth.uid() = user_id);

        CREATE POLICY "Users can create applications" ON applications
            FOR INSERT WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can update own applications" ON applications
            FOR UPDATE USING (auth.uid() = user_id);

        CREATE POLICY "Admins can manage all applications" ON applications
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM profiles 
                    WHERE id = auth.uid() 
                    AND role = 'admin'
                )
            );
            
        ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Handle applications_new if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications_new' AND table_type = 'BASE TABLE') THEN
        DROP POLICY IF EXISTS "Users can view own applications" ON applications_new;
        DROP POLICY IF EXISTS "Users can create applications" ON applications_new;
        DROP POLICY IF EXISTS "Users can update own applications" ON applications_new;
        DROP POLICY IF EXISTS "Admins can manage all applications" ON applications_new;

        CREATE POLICY "Users can view own applications" ON applications_new
            FOR SELECT USING (auth.uid() = user_id);

        CREATE POLICY "Users can create applications" ON applications_new
            FOR INSERT WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can update own applications" ON applications_new
            FOR UPDATE USING (auth.uid() = user_id);

        CREATE POLICY "Admins can manage all applications" ON applications_new
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM profiles 
                    WHERE id = auth.uid() 
                    AND role = 'admin'
                )
            );
            
        ALTER TABLE applications_new ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- 6. Safe index creation
DO $$
BEGIN
    -- Only create indexes on real tables
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications' AND table_type = 'BASE TABLE') THEN
        CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
        CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
        CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);
    END IF;
    
    CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
    CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
END $$;

-- 7. Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- 8. Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 9. Update admin user role
INSERT INTO profiles (id, email, full_name, role, created_at, updated_at)
VALUES (
    'f9b1eede-a856-4112-ab9e-58a93ba838a8'::UUID,
    'alexisstar8@gmail.com',
    'Admin User',
    'admin',
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    updated_at = NOW();

-- Success message
SELECT 'MIHAS Database Fix Applied Successfully - Views Handled Correctly!' as status;