-- Add missing columns
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS additional_subjects JSONB;
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255);
ALTER TABLE applications_new ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);

-- Create missing function with proper syntax
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