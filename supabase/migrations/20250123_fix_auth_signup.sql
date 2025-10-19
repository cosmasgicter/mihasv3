-- Fix Auth Signup - Create Profile Trigger
-- Issue: Database error saving new user (500 error on signup)
-- Solution: Add trigger to automatically create profile on user signup

-- ============================================================================
-- 1. Create function to handle new user signup
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into profiles table
  INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'student', -- Default role
    NOW(),
    NOW()
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail signup
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. Create trigger on auth.users
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 3. Ensure profiles table has correct structure
-- ============================================================================

-- Add columns if they don't exist
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique ON public.profiles(email);

-- ============================================================================
-- 4. Add RLS policies for profiles
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Service role can do everything
DROP POLICY IF EXISTS "Service role full access" ON public.profiles;
CREATE POLICY "Service role full access" ON public.profiles
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 5. Backfill missing profiles for existing users
-- ============================================================================

DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  -- Count users without profiles
  SELECT COUNT(*) INTO missing_count
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  WHERE p.id IS NULL;
  
  IF missing_count > 0 THEN
    RAISE NOTICE 'Found % users without profiles, creating...', missing_count;
    
    -- Create profiles for users that don't have one
    INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
    SELECT 
      u.id,
      u.email,
      COALESCE(u.raw_user_meta_data->>'full_name', ''),
      'student',
      u.created_at,
      NOW()
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    WHERE p.id IS NULL
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Created % profiles', missing_count;
  ELSE
    RAISE NOTICE 'All users have profiles';
  END IF;
END $$;

-- ============================================================================
-- 6. Verification
-- ============================================================================

DO $$
DECLARE
  user_count INTEGER;
  profile_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;
  SELECT COUNT(*) INTO profile_count FROM public.profiles;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Auth Signup Fix Applied Successfully';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total users: %', user_count;
  RAISE NOTICE 'Total profiles: %', profile_count;
  
  IF user_count = profile_count THEN
    RAISE NOTICE 'SUCCESS: All users have profiles';
  ELSE
    RAISE WARNING 'WARNING: Mismatch - % users, % profiles', user_count, profile_count;
  END IF;
  
  RAISE NOTICE '========================================';
END $$;
