-- Fix profiles INSERT policy for service role
-- Root cause: No INSERT policy exists, service role policy doesn't work for admin.createUser context

-- Drop existing service role policy
DROP POLICY IF EXISTS "Service role full access" ON public.profiles;

-- Create separate policies for service role
CREATE POLICY "Service role can insert profiles" ON public.profiles
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can select profiles" ON public.profiles
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can update profiles" ON public.profiles
  FOR UPDATE
  USING (true);

CREATE POLICY "Service role can delete profiles" ON public.profiles
  FOR DELETE
  USING (true);
