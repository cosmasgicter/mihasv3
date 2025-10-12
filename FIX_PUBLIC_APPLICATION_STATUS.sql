-- Fix for public_application_status view and query issue
-- Run this SQL in Supabase SQL Editor

-- Drop existing view first
DROP VIEW IF EXISTS public_application_status;

-- Create the public_application_status view
CREATE OR REPLACE VIEW public_application_status AS
SELECT 
    a.public_tracking_code,
    a.application_number,
    a.status,
    a.payment_status,
    a.submitted_at,
    a.updated_at,
    a.program as program_name,
    a.intake as intake_name,
    a.institution,
    a.full_name,
    a.email,
    a.phone,
    a.admin_feedback,
    a.admin_feedback_date
FROM applications_new a
WHERE a.status IN ('submitted', 'under_review', 'approved', 'rejected');

-- Grant access to the view
GRANT SELECT ON public_application_status TO anon;
GRANT SELECT ON public_application_status TO authenticated;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_applications_tracking_search 
ON applications_new (application_number, public_tracking_code);