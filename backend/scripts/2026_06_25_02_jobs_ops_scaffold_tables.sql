-- Materialize the optional jobs/ops scaffold tables so the backend's
-- managed=False models never drift from the production schema. The routes
-- remain feature-gated by ENABLE_JOBS_OPS_ROUTES; creating these empty tables
-- is additive and does not expose the domain.

CREATE TABLE IF NOT EXISTS jobs_companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    name varchar(255) NOT NULL,
    website_url varchar(200) NOT NULL DEFAULT '',
    headquarters varchar(255) NOT NULL DEFAULT '',
    reputation_score numeric(5, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jobs_company_research_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    company_id uuid NOT NULL REFERENCES jobs_companies(id) ON DELETE CASCADE,
    summary text NOT NULL DEFAULT '',
    risk_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
    growth_signals jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS jobs_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    name varchar(255) NOT NULL,
    slug varchar(120) NOT NULL UNIQUE,
    base_url varchar(200) NOT NULL,
    adapter_key varchar(120) NOT NULL,
    trust_score numeric(5, 2) NOT NULL DEFAULT 0,
    health_status varchar(50) NOT NULL DEFAULT 'planned'
);

CREATE TABLE IF NOT EXISTS jobs_discovery_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    source_id uuid NOT NULL REFERENCES jobs_sources(id) ON DELETE CASCADE,
    status varchar(50) NOT NULL DEFAULT 'queued',
    jobs_discovered integer NOT NULL DEFAULT 0,
    notes text NOT NULL DEFAULT '',
    started_at timestamptz NULL,
    completed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS jobs_postings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    company_id uuid NOT NULL REFERENCES jobs_companies(id) ON DELETE CASCADE,
    source_id uuid NOT NULL REFERENCES jobs_sources(id) ON DELETE CASCADE,
    canonical_key varchar(255) NOT NULL UNIQUE,
    title varchar(255) NOT NULL,
    location varchar(255) NOT NULL DEFAULT '',
    work_mode varchar(50) NOT NULL DEFAULT 'hybrid',
    application_url varchar(200) NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    salary_text varchar(255) NOT NULL DEFAULT '',
    status varchar(50) NOT NULL DEFAULT 'discovered'
);

CREATE TABLE IF NOT EXISTS jobs_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    job_posting_id uuid NOT NULL REFERENCES jobs_postings(id) ON DELETE CASCADE,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS jobs_match_scores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    job_posting_id uuid NOT NULL REFERENCES jobs_postings(id) ON DELETE CASCADE,
    candidate_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    match_score numeric(5, 2) NOT NULL DEFAULT 0,
    shortlist_probability numeric(5, 2) NOT NULL DEFAULT 0,
    recommendation varchar(50) NOT NULL DEFAULT 'review',
    explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
    missing_signals jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS jobs_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    job_posting_id uuid NOT NULL REFERENCES jobs_postings(id) ON DELETE CASCADE,
    candidate_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    decision varchar(50) NOT NULL DEFAULT 'review',
    reason text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS job_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    job_posting_id uuid NOT NULL REFERENCES jobs_postings(id) ON DELETE CASCADE,
    candidate_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    automation_mode varchar(50) NOT NULL DEFAULT 'draft_only',
    status varchar(50) NOT NULL DEFAULT 'draft',
    evidence_count integer NOT NULL DEFAULT 0,
    external_reference varchar(255) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS job_application_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    job_application_id uuid NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
    step_type varchar(50) NOT NULL,
    status varchar(50) NOT NULL DEFAULT 'queued',
    notes text NOT NULL DEFAULT '',
    occurred_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS outreach_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    full_name varchar(255) NOT NULL,
    email varchar(254) NOT NULL DEFAULT '',
    company varchar(255) NOT NULL DEFAULT '',
    role varchar(255) NOT NULL DEFAULT '',
    relationship_status varchar(50) NOT NULL DEFAULT 'new',
    tags jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    name varchar(255) NOT NULL,
    campaign_type varchar(100) NOT NULL DEFAULT 'follow_up',
    status varchar(50) NOT NULL DEFAULT 'draft',
    target_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS outreach_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    contact_id uuid NOT NULL REFERENCES outreach_contacts(id) ON DELETE CASCADE,
    campaign_id uuid NULL REFERENCES outreach_campaigns(id) ON DELETE SET NULL,
    message_type varchar(100) NOT NULL DEFAULT 'introduction',
    subject varchar(255) NOT NULL DEFAULT '',
    body text NOT NULL DEFAULT '',
    status varchar(50) NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS outreach_opportunities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    contact_id uuid NOT NULL REFERENCES outreach_contacts(id) ON DELETE CASCADE,
    title varchar(255) NOT NULL,
    stage varchar(50) NOT NULL DEFAULT 'new',
    notes text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS automation_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    name varchar(255) NOT NULL,
    rule_type varchar(100) NOT NULL,
    is_enabled boolean NOT NULL DEFAULT true,
    config jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS automation_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    run_type varchar(100) NOT NULL,
    status varchar(50) NOT NULL DEFAULT 'queued',
    trigger_source varchar(100) NOT NULL DEFAULT '',
    summary text NOT NULL DEFAULT '',
    blocked_reason text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS automation_artifacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    automation_run_id uuid NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
    artifact_type varchar(100) NOT NULL,
    artifact_url varchar(200) NOT NULL DEFAULT '',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS review_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    automation_run_id uuid NULL REFERENCES automation_runs(id) ON DELETE SET NULL,
    task_type varchar(100) NOT NULL,
    status varchar(50) NOT NULL DEFAULT 'pending',
    reason text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS integration_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    provider varchar(100) NOT NULL,
    display_name varchar(255) NOT NULL,
    status varchar(50) NOT NULL DEFAULT 'planned',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS telegram_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    chat_id varchar(255) NOT NULL,
    status varchar(50) NOT NULL DEFAULT 'planned',
    scope varchar(100) NOT NULL DEFAULT 'operator'
);

CREATE TABLE IF NOT EXISTS provider_credential_audits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    provider varchar(100) NOT NULL,
    action varchar(100) NOT NULL,
    actor_id uuid NULL
);

CREATE TABLE IF NOT EXISTS email_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    provider varchar(100) NOT NULL DEFAULT 'zoho',
    email varchar(254) NOT NULL,
    status varchar(50) NOT NULL DEFAULT 'planned'
);

CREATE TABLE IF NOT EXISTS email_threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    subject varchar(255) NOT NULL,
    thread_key varchar(255) NOT NULL UNIQUE,
    status varchar(50) NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS email_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    thread_id uuid NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
    direction varchar(20) NOT NULL DEFAULT 'outbound',
    sender varchar(254) NOT NULL,
    recipient varchar(254) NOT NULL,
    subject varchar(255) NOT NULL,
    body_preview text NOT NULL DEFAULT '',
    classification varchar(50) NOT NULL DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS delivery_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    message_id uuid NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
    event_type varchar(50) NOT NULL,
    provider_reference varchar(255) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    snapshot_type varchar(100) NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS analytics_source_performance_summaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    source_key varchar(120) NOT NULL,
    freshness_hours integer NOT NULL DEFAULT 0,
    duplicate_ratio numeric(5, 2) NOT NULL DEFAULT 0,
    success_rate numeric(5, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_digest_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    headline varchar(255) NOT NULL,
    summary text NOT NULL DEFAULT '',
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_company_research_snapshots_company_id
    ON jobs_company_research_snapshots(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_discovery_runs_source_id
    ON jobs_discovery_runs(source_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_postings_company_id
    ON jobs_postings(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_postings_source_id
    ON jobs_postings(source_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_snapshots_job_posting_id
    ON jobs_snapshots(job_posting_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_match_scores_job_posting_id
    ON jobs_match_scores(job_posting_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_match_scores_candidate_id
    ON jobs_match_scores(candidate_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_decisions_job_posting_id
    ON jobs_decisions(job_posting_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_decisions_candidate_id
    ON jobs_decisions(candidate_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_applications_job_posting_id
    ON job_applications(job_posting_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_applications_candidate_id
    ON job_applications(candidate_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_application_steps_job_application_id
    ON job_application_steps(job_application_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outreach_messages_contact_id
    ON outreach_messages(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outreach_messages_campaign_id
    ON outreach_messages(campaign_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outreach_opportunities_contact_id
    ON outreach_opportunities(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_automation_artifacts_automation_run_id
    ON automation_artifacts(automation_run_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_review_tasks_automation_run_id
    ON review_tasks(automation_run_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_messages_thread_id
    ON email_messages(thread_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_events_message_id
    ON delivery_events(message_id);
