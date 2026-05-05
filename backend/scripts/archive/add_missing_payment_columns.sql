-- Add missing columns to payments table
-- These were added to the Django model during Lenco integration but not migrated to production

ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS lenco_reference VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fee NUMERIC(10, 2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS bearer VARCHAR(20);
