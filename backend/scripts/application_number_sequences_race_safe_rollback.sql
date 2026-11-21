-- Rollback of application_number_sequences_race_safe.sql (bookkeeping only).
--
-- The forward script only redefines next_application_number() with a body
-- that also survives concurrent first use of a new sequence; it creates and
-- changes no table, column, index, sequence or row. This rollback therefore
-- removes the tracking row and nothing else:
--
-- * The function is NOT dropped. The live application-number generator calls
--   it, and DROP FUNCTION is not in the inverse-additive set (Requirement 9.2).
-- * The previous body is NOT restored. CREATE is not allowed in a rollback
--   script (tests/property/test_rollback_safe_operations.py), and the previous
--   body is the one that fails under concurrent first use. If an operator does
--   want it back, it is the CREATE OR REPLACE FUNCTION block of
--   application_number_sequences.sql, applied by hand.
--
-- Application notes (Requirement 9.5): apply manually with autocommit. Never
-- invoke via apply_sql_migrations.

DELETE FROM migration_history WHERE migration_name = 'application_number_sequences_race_safe.sql';
