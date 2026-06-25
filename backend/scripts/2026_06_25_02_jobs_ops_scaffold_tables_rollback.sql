-- Reversible inverse of 2026_06_25_02_jobs_ops_scaffold_tables.sql.
-- Apply only if the optional jobs/ops scaffold is being fully reverted.
--
-- The forward script creates empty managed=False scaffold tables for the
-- feature-gated jobs/ops apps. This rollback drops those scaffold tables in
-- dependency order. These statements intentionally remove any data in those
-- optional domains; do not run after enabling jobs/ops routes unless that data
-- loss is intended.

DROP TABLE IF EXISTS daily_digest_reports CASCADE;
DROP TABLE IF EXISTS analytics_source_performance_summaries CASCADE;
DROP TABLE IF EXISTS analytics_snapshots CASCADE;

DROP TABLE IF EXISTS delivery_events CASCADE;
DROP TABLE IF EXISTS email_messages CASCADE;
DROP TABLE IF EXISTS email_threads CASCADE;
DROP TABLE IF EXISTS email_accounts CASCADE;
DROP TABLE IF EXISTS provider_credential_audits CASCADE;
DROP TABLE IF EXISTS telegram_subscriptions CASCADE;
DROP TABLE IF EXISTS integration_accounts CASCADE;

DROP TABLE IF EXISTS review_tasks CASCADE;
DROP TABLE IF EXISTS automation_artifacts CASCADE;
DROP TABLE IF EXISTS automation_runs CASCADE;
DROP TABLE IF EXISTS automation_rules CASCADE;

DROP TABLE IF EXISTS outreach_opportunities CASCADE;
DROP TABLE IF EXISTS outreach_messages CASCADE;
DROP TABLE IF EXISTS outreach_campaigns CASCADE;
DROP TABLE IF EXISTS outreach_contacts CASCADE;

DROP TABLE IF EXISTS job_application_steps CASCADE;
DROP TABLE IF EXISTS job_applications CASCADE;
DROP TABLE IF EXISTS jobs_decisions CASCADE;
DROP TABLE IF EXISTS jobs_match_scores CASCADE;
DROP TABLE IF EXISTS jobs_snapshots CASCADE;
DROP TABLE IF EXISTS jobs_postings CASCADE;
DROP TABLE IF EXISTS jobs_discovery_runs CASCADE;
DROP TABLE IF EXISTS jobs_company_research_snapshots CASCADE;
DROP TABLE IF EXISTS jobs_sources CASCADE;
DROP TABLE IF EXISTS jobs_companies CASCADE;
