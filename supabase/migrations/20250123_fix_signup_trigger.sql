-- Fix Signup Trigger - Handle New User Profile Creation
-- Issue: 500 error on signup due to missing profile creation

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    first_name,
    last_name,
    phone,
    date_of_birth,
    sex,
    residence_town,
    nationality,
    next_of_kin_name,
    next_of_kin_phone,
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE((NEW.raw_user_meta_data->>'date_of_birth')::date, NULL),
    COALESCE(NEW.raw_user_meta_data->>'sex', ''),
    COALESCE(NEW.raw_user_meta_data->>'residence_town', ''),
    COALESCE(NEW.raw_user_meta_data->>'nationality', ''),
    COALESCE(NEW.raw_user_meta_data->>'next_of_kin_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'next_of_kin_phone', ''),
    'student',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, anon;
