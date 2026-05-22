-- Expand application lifecycle status columns to fit canonical values such as
-- `conditionally_approved` and `enrollment_expired`.
--
-- Safe to run repeatedly: widening varchar is non-destructive.

ALTER TABLE applications
    ALTER COLUMN status TYPE varchar(32);

ALTER TABLE application_status_history
    ALTER COLUMN status TYPE varchar(32);
