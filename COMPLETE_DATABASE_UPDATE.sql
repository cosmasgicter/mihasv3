-- MIHAS Application System - Complete Database Update
-- Run this SQL in Supabase SQL Editor

-- Add missing columns to applications_new table
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS additional_subjects JSONB;
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- Create application number generation function
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

-- Update check constraint to allow submitted_at when status is submitted
ALTER TABLE applications_new DROP CONSTRAINT IF EXISTS check_submitted_at_when_submitted;
ALTER TABLE applications_new ADD CONSTRAINT check_submitted_at_when_submitted 
CHECK (
    (status = 'submitted' AND submitted_at IS NOT NULL) OR 
    (status != 'submitted')
);