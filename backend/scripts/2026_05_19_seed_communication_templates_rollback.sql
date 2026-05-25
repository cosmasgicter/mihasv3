-- Reversible inverse of 2026_05_19_seed_communication_templates.sql. Apply only after confirming no application code depends on the structures being dropped.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 3 (Migration directory layout — every forward script ships with a sibling rollback)
-- Requirements: 9.1, 9.2, 9.3, 9.4
--
-- Forward script effect: seeds 19 rows in communication_templates, one per
-- canonical template_key used by CommunicationService. Each INSERT uses
-- gen_random_uuid() for id and ON CONFLICT (template_key) DO UPDATE for
-- idempotence, so template_key is the deterministic seeded primary key for
-- rollback purposes (the surrogate id changes on every fresh insert).
--
-- Inverse-additive scope (Requirement 9.2):
-- DELETE FROM <table> WHERE <pk> = '<seeded-id>' is the only allowed
-- mutating statement here. We scope each DELETE by template_key — the
-- natural seeded identifier — so a manually-edited or operator-curated row
-- with a different template_key cannot be removed by accident.
--
-- communication_templates is not a payments / applications / student-data
-- table, so the Requirement 9.4 RAISE NOTICE block is not required for
-- this rollback. Counts are still surfaced by the trailing verification
-- query an operator can run manually.
--
-- Application notes (Requirement 9.5):
-- Apply manually with autocommit. Never invoke via apply_sql_migrations.
-- Pass --allow-non-additive when running through tooling that lints SQL,
-- because DROP COLUMN / DROP TABLE family operations are flagged as
-- non-additive by the apply_sql_migrations lint even when this file only
-- performs scoped DELETEs.

DELETE FROM communication_templates WHERE template_key = 'application_submitted';
DELETE FROM communication_templates WHERE template_key = 'application_under_review';
DELETE FROM communication_templates WHERE template_key = 'application_approved';
DELETE FROM communication_templates WHERE template_key = 'application_rejected';
DELETE FROM communication_templates WHERE template_key = 'condition_assigned';
DELETE FROM communication_templates WHERE template_key = 'condition_verified';
DELETE FROM communication_templates WHERE template_key = 'waitlist_position_assigned';
DELETE FROM communication_templates WHERE template_key = 'enrollment_confirmed';
DELETE FROM communication_templates WHERE template_key = 'enrollment_expired';
DELETE FROM communication_templates WHERE template_key = 'enrollment_confirmation_reminder';
DELETE FROM communication_templates WHERE template_key = 'payment_expired';
DELETE FROM communication_templates WHERE template_key = 'deferred_payment_reminder';
DELETE FROM communication_templates WHERE template_key = 'document_verified';
DELETE FROM communication_templates WHERE template_key = 'document_rejected';
DELETE FROM communication_templates WHERE template_key = 'payment_verified';
DELETE FROM communication_templates WHERE template_key = 'payment_rejected';
DELETE FROM communication_templates WHERE template_key = 'reviewer_assigned';
DELETE FROM communication_templates WHERE template_key = 'amendment_reviewed';
DELETE FROM communication_templates WHERE template_key = 'fee_waiver_granted';

DELETE FROM migration_history WHERE migration_name = '2026_05_19_seed_communication_templates.sql';
