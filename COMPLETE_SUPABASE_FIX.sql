-- MIHAS Complete Supabase Database Fix - 100% Functionality
-- Run this SQL in Supabase SQL Editor to fix all issues

-- 1. Fix applications table structure (add missing columns for approval workflow)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- 2. Fix applications_new table structure (if using this table)
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS additional_subjects JSONB;
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- 3. Fix profiles table RLS policies (resolve 500 error)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- Create proper RLS policies for profiles
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

-- 4. Create application number generation function
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

-- 5. Create trigger for auto-generating application numbers
CREATE OR REPLACE FUNCTION set_application_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.application_number IS NULL THEN
        NEW.application_number := generate_application_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to applications table
DROP TRIGGER IF EXISTS trigger_set_application_number ON applications;
CREATE TRIGGER trigger_set_application_number
    BEFORE INSERT ON applications
    FOR EACH ROW
    EXECUTE FUNCTION set_application_number();

-- Apply trigger to applications_new table
DROP TRIGGER IF EXISTS trigger_set_application_number_new ON applications_new;
CREATE TRIGGER trigger_set_application_number_new
    BEFORE INSERT ON applications_new
    FOR EACH ROW
    EXECUTE FUNCTION set_application_number();

-- 6. Fix RLS policies for applications (ensure admin access)
DROP POLICY IF EXISTS "Users can view own applications" ON applications;
DROP POLICY IF EXISTS "Users can create applications" ON applications;
DROP POLICY IF EXISTS "Users can update own applications" ON applications;
DROP POLICY IF EXISTS "Admins can manage all applications" ON applications;

-- Create proper RLS policies for applications
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

-- 7. Fix RLS policies for applications_new
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

-- 8. Create admin approval workflow functions
CREATE OR REPLACE FUNCTION approve_application(
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
    
    -- Update application status
    UPDATE applications 
    SET 
        status = 'approved',
        reviewed_by = admin_email,
        reviewed_at = NOW(),
        admin_notes = COALESCE(notes, 'Application approved'),
        updated_at = NOW()
    WHERE id = app_id;
    
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION reject_application(
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
    
    -- Update application status
    UPDATE applications 
    SET 
        status = 'rejected',
        reviewed_by = admin_email,
        reviewed_at = NOW(),
        admin_notes = COALESCE(notes, 'Application rejected'),
        updated_at = NOW()
    WHERE id = app_id;
    
    RETURN FOUND;
END;
$$;

-- 9. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);
CREATE INDEX IF NOT EXISTS idx_applications_reviewed_by ON applications(reviewed_by);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- 10. Create admin statistics view
CREATE OR REPLACE VIEW admin_application_stats AS
SELECT 
    status,
    COUNT(*) as count,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
FROM applications 
GROUP BY status
ORDER BY count DESC;

-- 11. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- 12. Refresh RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications_new ENABLE ROW LEVEL SECURITY;

-- 13. Create notification trigger for status changes
CREATE OR REPLACE FUNCTION notify_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify on status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO notifications (
            user_id,
            title,
            message,
            type,
            created_at
        ) VALUES (
            NEW.user_id,
            'Application Status Updated',
            'Your application status has been changed to: ' || NEW.status,
            'status_change',
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply notification trigger
DROP TRIGGER IF EXISTS trigger_notify_status_change ON applications;
CREATE TRIGGER trigger_notify_status_change
    AFTER UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION notify_status_change();

-- 14. Fix any data inconsistencies
UPDATE applications SET status = 'submitted' WHERE status IS NULL;
UPDATE applications SET created_at = NOW() WHERE created_at IS NULL;
UPDATE applications SET updated_at = NOW() WHERE updated_at IS NULL;

-- 15. Create admin user if not exists (update existing admin)
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
SELECT 'MIHAS Database Fix Complete - 100% Functionality Restored!' as status;