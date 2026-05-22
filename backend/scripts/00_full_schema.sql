-- =============================================================================
-- Authoritative production DDL for MIHAS Admissions System
-- Generated dynamically from Django model definitions (django.db.backends.postgresql)
-- Last regenerated: 2026-05-22
-- =============================================================================

CREATE TABLE "academic_calendar_events" ("id" uuid NOT NULL PRIMARY KEY, "intake_id" uuid NOT NULL, "event_type" varchar(50) NOT NULL, "event_date" date NOT NULL, "description" text NULL, "created_at" timestamp with time zone NOT NULL);

CREATE TABLE "analytics_snapshots" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "snapshot_type" varchar(100) NOT NULL, "payload" jsonb NOT NULL);

CREATE TABLE "analytics_source_performance_summaries" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "source_key" varchar(120) NOT NULL, "freshness_hours" integer NOT NULL, "duplicate_ratio" numeric(5, 2) NOT NULL, "success_rate" numeric(5, 2) NOT NULL);

CREATE TABLE "application_amendments" ("id" uuid NOT NULL PRIMARY KEY, "application_id" uuid NOT NULL, "field_name" varchar(50) NOT NULL, "old_value" text NULL, "new_value" text NOT NULL, "reason" text NOT NULL, "status" varchar(20) NOT NULL, "reviewed_by" uuid NULL, "reviewed_at" timestamp with time zone NULL, "created_at" timestamp with time zone NOT NULL);

CREATE TABLE "application_conditions" ("id" uuid NOT NULL PRIMARY KEY, "application_id" uuid NOT NULL, "description" text NOT NULL, "condition_type" varchar(20) NOT NULL, "deadline" date NOT NULL, "status" varchar(20) NOT NULL, "met_at" timestamp with time zone NULL, "verified_by" uuid NULL, "notes" text NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);

CREATE TABLE "application_documents" ("id" uuid NOT NULL PRIMARY KEY, "application_id" uuid NOT NULL, "document_type" varchar(100) NOT NULL, "document_name" varchar(255) NOT NULL, "file_url" text NULL, "file_size" integer NULL, "mime_type" varchar(100) NULL, "verification_status" varchar(50) NULL, "verified_by" uuid NULL, "verified_at" timestamp with time zone NULL, "verification_notes" text NULL, "system_generated" boolean NULL, "uploaded_at" timestamp with time zone NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL, "extracted_text" text NULL, "ecz_exam_number" varchar(20) NULL, "ecz_exam_year" integer NULL);

CREATE TABLE "application_drafts" ("id" uuid NOT NULL PRIMARY KEY, "user_id" uuid NOT NULL, "draft_data" jsonb NOT NULL, "draft_name" text NULL, "step_completed" integer NULL, "is_active" boolean NULL, "last_accessed_at" timestamp with time zone NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL, "application_id" uuid NULL);

CREATE TABLE "application_grades" ("id" uuid NOT NULL PRIMARY KEY, "application_id" uuid NOT NULL, "subject_id" uuid NOT NULL, "grade" integer NOT NULL, "created_at" timestamp with time zone NULL);

CREATE TABLE "application_interviews" ("id" uuid NOT NULL PRIMARY KEY, "application_id" uuid NOT NULL, "scheduled_at" timestamp with time zone NOT NULL, "mode" text NOT NULL, "location" text NULL, "status" text NOT NULL, "notes" text NULL, "created_by" uuid NULL, "updated_by" uuid NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL);

CREATE TABLE "application_status_history" ("id" uuid NOT NULL PRIMARY KEY, "application_id" uuid NOT NULL, "status" varchar(32) NOT NULL, "changed_by" uuid NULL, "notes" text NULL, "changes" jsonb NULL, "ip_address" varchar(64) NULL, "user_agent" text NULL, "created_at" timestamp with time zone NULL, "old_status" text NULL, "new_status" text NULL);

CREATE TABLE "applications" ("id" uuid NOT NULL PRIMARY KEY, "application_number" varchar(50) NOT NULL UNIQUE, "user_id" uuid NOT NULL, "full_name" varchar(255) NOT NULL, "nrc_number" varchar(20) NULL, "passport_number" varchar(50) NULL, "date_of_birth" date NOT NULL, "sex" varchar(10) NOT NULL, "phone" varchar(20) NOT NULL, "email" varchar(255) NOT NULL, "residence_town" varchar(100) NOT NULL, "nationality" varchar(100) NULL, "address_line_1" varchar(255) NULL, "address_line_2" varchar(255) NULL, "postal_code" varchar(20) NULL, "next_of_kin_name" varchar(255) NULL, "next_of_kin_phone" varchar(20) NULL, "program" varchar(255) NOT NULL, "intake" varchar(100) NOT NULL, "institution" varchar(255) NOT NULL, "result_slip_url" varchar(500) NULL, "extra_kyc_url" varchar(500) NULL, "application_fee" numeric(10, 2) NULL, "payment_status" varchar(20) NULL, "payment_verified_at" timestamp with time zone NULL, "payment_verified_by" uuid NULL, "status" varchar(32) NOT NULL, "eligibility_status" varchar(20) NULL, "eligibility_score" integer NULL, "eligibility_notes" text NULL, "admin_feedback" text NULL, "admin_feedback_date" timestamp with time zone NULL, "admin_feedback_by" uuid NULL, "review_started_at" timestamp with time zone NULL, "decision_date" timestamp with time zone NULL, "reviewed_by" uuid NULL, "additional_subjects" jsonb NULL, "public_tracking_code" varchar(50) NULL UNIQUE, "submitted_at" timestamp with time zone NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL, "version" integer NOT NULL, "country" varchar(100) NULL, "waitlist_position" integer NULL, "is_late_submission" boolean NOT NULL, "assigned_reviewer_id" uuid NULL, "enrollment_confirmation_deadline" timestamp with time zone NULL);

CREATE TABLE "audit_logs" ("id" uuid NOT NULL PRIMARY KEY, "actor_id" uuid NULL, "action" varchar(50) NOT NULL, "entity_type" varchar(50) NOT NULL, "entity_id" uuid NULL, "changes" jsonb NULL, "ip_address" varchar(64) NULL, "user_agent" text NULL, "ip_address_encrypted" text NULL, "user_agent_encrypted" text NULL, "retention_category" varchar(20) NOT NULL, "created_at" timestamp with time zone NOT NULL);

CREATE TABLE "auth_group" ("id" integer NOT NULL PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, "name" varchar(150) NOT NULL UNIQUE);

CREATE TABLE "auth_group_permissions" ("id" integer NOT NULL PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, "group_id" integer NOT NULL, "permission_id" integer NOT NULL);

CREATE TABLE "auth_permission" ("id" integer NOT NULL PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, "name" varchar(255) NOT NULL, "content_type_id" integer NOT NULL, "codename" varchar(100) NOT NULL);

CREATE TABLE "auth_user" ("id" integer NOT NULL PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, "password" varchar(128) NOT NULL, "last_login" timestamp with time zone NULL, "is_superuser" boolean NOT NULL, "username" varchar(150) NOT NULL UNIQUE, "first_name" varchar(150) NOT NULL, "last_name" varchar(150) NOT NULL, "email" varchar(254) NOT NULL, "is_staff" boolean NOT NULL, "is_active" boolean NOT NULL, "date_joined" timestamp with time zone NOT NULL);

CREATE TABLE "auth_user_groups" ("id" integer NOT NULL PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, "user_id" integer NOT NULL, "group_id" integer NOT NULL);

CREATE TABLE "auth_user_user_permissions" ("id" integer NOT NULL PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, "user_id" integer NOT NULL, "permission_id" integer NOT NULL);

CREATE TABLE "automation_artifacts" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "automation_run_id" uuid NOT NULL, "artifact_type" varchar(100) NOT NULL, "artifact_url" varchar(200) NOT NULL, "metadata" jsonb NOT NULL);

CREATE TABLE "automation_rules" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "name" varchar(255) NOT NULL, "rule_type" varchar(100) NOT NULL, "is_enabled" boolean NOT NULL, "config" jsonb NOT NULL);

CREATE TABLE "automation_runs" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "run_type" varchar(100) NOT NULL, "status" varchar(50) NOT NULL, "trigger_source" varchar(100) NOT NULL, "summary" text NOT NULL, "blocked_reason" text NOT NULL);

CREATE TABLE "communication_templates" ("id" uuid NOT NULL PRIMARY KEY, "template_key" varchar(100) NOT NULL UNIQUE, "subject_template" text NOT NULL, "body_template" text NOT NULL, "channel" varchar(20) NOT NULL, "is_active" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);

CREATE TABLE "course_requirements" ("id" uuid NOT NULL PRIMARY KEY, "program_id" uuid NULL, "subject_id" uuid NULL, "is_mandatory" boolean NULL, "minimum_grade" integer NOT NULL, "weight" numeric(10, 2) NULL, "requirement_type" varchar(50) NULL, "created_at" timestamp with time zone NULL);

CREATE TABLE "csrf_tokens" ("id" uuid NOT NULL PRIMARY KEY, "user_id" uuid NOT NULL, "token_hash" varchar(64) NOT NULL, "expires_at" timestamp with time zone NOT NULL, "created_at" timestamp with time zone NOT NULL);

CREATE TABLE "daily_digest_reports" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "headline" varchar(255) NOT NULL, "summary" text NOT NULL, "payload" jsonb NOT NULL);

CREATE TABLE "delivery_events" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "message_id" uuid NOT NULL, "event_type" varchar(50) NOT NULL, "provider_reference" varchar(255) NOT NULL);

CREATE TABLE "device_sessions" ("id" uuid NOT NULL PRIMARY KEY, "user_id" uuid NOT NULL, "device_id" text NOT NULL, "device_info" text NULL, "session_token" text NOT NULL, "ip_address" varchar(64) NULL, "user_agent" text NULL, "last_activity" timestamp with time zone NULL, "is_active" boolean NULL, "expires_at" timestamp with time zone NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL);

CREATE TABLE "django_admin_log" ("id" integer NOT NULL PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, "action_time" timestamp with time zone NOT NULL, "user_id" integer NOT NULL, "content_type_id" integer NULL, "object_id" text NULL, "object_repr" varchar(200) NOT NULL, "action_flag" smallint NOT NULL CHECK ("action_flag" >= 0), "change_message" text NOT NULL);

CREATE TABLE "django_content_type" ("id" integer NOT NULL PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, "app_label" varchar(100) NOT NULL, "model" varchar(100) NOT NULL);

CREATE TABLE "django_session" ("session_key" varchar(40) NOT NULL PRIMARY KEY, "session_data" text NOT NULL, "expire_date" timestamp with time zone NOT NULL);

CREATE TABLE "email_accounts" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "provider" varchar(100) NOT NULL, "email" varchar(254) NOT NULL, "status" varchar(50) NOT NULL);

CREATE TABLE "email_messages" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "thread_id" uuid NOT NULL, "direction" varchar(20) NOT NULL, "sender" varchar(254) NOT NULL, "recipient" varchar(254) NOT NULL, "subject" varchar(255) NOT NULL, "body_preview" text NOT NULL, "classification" varchar(50) NOT NULL);

CREATE TABLE "email_queue" ("id" uuid NOT NULL PRIMARY KEY, "recipient_email" varchar(255) NOT NULL, "recipient_name" varchar(255) NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "html_body" text NULL, "template_name" varchar(100) NULL, "template_data" jsonb NULL, "status" varchar(20) NULL, "priority" integer NULL, "retry_count" integer NULL, "max_retries" integer NULL, "error_message" text NULL, "sent_at" timestamp with time zone NULL, "created_at" timestamp with time zone NULL);

CREATE TABLE "email_threads" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "subject" varchar(255) NOT NULL, "thread_key" varchar(255) NOT NULL UNIQUE, "status" varchar(50) NOT NULL);

CREATE TABLE "error_logs" ("id" uuid NOT NULL PRIMARY KEY, "source" varchar(20) NOT NULL, "level" varchar(20) NOT NULL, "message" text NOT NULL, "stack_trace" text NULL, "context" jsonb NULL, "request_path" text NULL, "user_id" uuid NULL, "ip_hash" varchar(64) NULL, "created_at" timestamp with time zone NOT NULL);

CREATE TABLE "fee_waivers" ("id" uuid NOT NULL PRIMARY KEY, "application_id" uuid NOT NULL, "waiver_type" varchar(20) NOT NULL, "reason_code" varchar(30) NOT NULL, "discount_percentage" integer NOT NULL, "approved_by" uuid NOT NULL, "notes" text NULL, "created_at" timestamp with time zone NOT NULL);

CREATE TABLE "idempotency_keys" ("id" uuid NOT NULL PRIMARY KEY, "idempotency_key" text NOT NULL, "actor_id" uuid NOT NULL, "method" varchar(10) NOT NULL, "path" text NOT NULL, "request_hash" varchar(64) NOT NULL, "status" varchar(10) NOT NULL, "response_status" smallint NULL, "response_body" jsonb NULL, "created_at" timestamp with time zone NOT NULL, "completed_at" timestamp with time zone NULL, CONSTRAINT "uq_idempotency_actor_method_path" UNIQUE ("idempotency_key", "actor_id", "method", "path"));

CREATE TABLE "institutions" ("id" uuid NOT NULL PRIMARY KEY, "name" varchar(255) NOT NULL, "code" varchar(50) NOT NULL UNIQUE, "type" varchar(100) NULL, "address" text NULL, "phone" varchar(20) NULL, "email" varchar(255) NULL, "website" varchar(255) NULL, "accreditation_status" varchar(50) NULL, "is_active" boolean NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL, "full_name" varchar(500) NULL, "description" text NULL);

CREATE TABLE "intakes" ("id" uuid NOT NULL PRIMARY KEY, "name" varchar(255) NOT NULL, "year" integer NULL, "semester" varchar(50) NULL, "start_date" date NULL, "end_date" date NULL, "application_start_date" date NULL, "application_deadline" date NULL, "max_capacity" integer NULL, "current_enrollment" integer NULL, "is_active" boolean NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL, "grace_period_days" integer NULL);

CREATE TABLE "integration_accounts" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "provider" varchar(100) NOT NULL, "display_name" varchar(255) NOT NULL, "status" varchar(50) NOT NULL, "metadata" jsonb NOT NULL);

CREATE TABLE "job_application_steps" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "job_application_id" uuid NOT NULL, "step_type" varchar(50) NOT NULL, "status" varchar(50) NOT NULL, "notes" text NOT NULL, "occurred_at" timestamp with time zone NULL);

CREATE TABLE "job_applications" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "job_posting_id" uuid NOT NULL, "candidate_id" uuid NOT NULL, "automation_mode" varchar(50) NOT NULL, "status" varchar(50) NOT NULL, "evidence_count" integer NOT NULL, "external_reference" varchar(255) NOT NULL);

CREATE TABLE "jobs_companies" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "name" varchar(255) NOT NULL, "website_url" varchar(200) NOT NULL, "headquarters" varchar(255) NOT NULL, "reputation_score" numeric(5, 2) NOT NULL);

CREATE TABLE "jobs_company_research_snapshots" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "company_id" uuid NOT NULL, "summary" text NOT NULL, "risk_signals" jsonb NOT NULL, "growth_signals" jsonb NOT NULL);

CREATE TABLE "jobs_decisions" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "job_posting_id" uuid NOT NULL, "candidate_id" uuid NOT NULL, "decision" varchar(50) NOT NULL, "reason" text NOT NULL);

CREATE TABLE "jobs_discovery_runs" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "source_id" uuid NOT NULL, "status" varchar(50) NOT NULL, "jobs_discovered" integer NOT NULL, "notes" text NOT NULL, "started_at" timestamp with time zone NULL, "completed_at" timestamp with time zone NULL);

CREATE TABLE "jobs_match_scores" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "job_posting_id" uuid NOT NULL, "candidate_id" uuid NOT NULL, "match_score" numeric(5, 2) NOT NULL, "shortlist_probability" numeric(5, 2) NOT NULL, "recommendation" varchar(50) NOT NULL, "explanation" jsonb NOT NULL, "missing_signals" jsonb NOT NULL);

CREATE TABLE "jobs_postings" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "company_id" uuid NOT NULL, "source_id" uuid NOT NULL, "canonical_key" varchar(255) NOT NULL UNIQUE, "title" varchar(255) NOT NULL, "location" varchar(255) NOT NULL, "work_mode" varchar(50) NOT NULL, "application_url" varchar(200) NOT NULL, "description" text NOT NULL, "salary_text" varchar(255) NOT NULL, "status" varchar(50) NOT NULL);

CREATE TABLE "jobs_snapshots" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "job_posting_id" uuid NOT NULL, "raw_payload" jsonb NOT NULL, "extracted_fields" jsonb NOT NULL);

CREATE TABLE "jobs_sources" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "name" varchar(255) NOT NULL, "slug" varchar(120) NOT NULL UNIQUE, "base_url" varchar(200) NOT NULL, "adapter_key" varchar(120) NOT NULL, "trust_score" numeric(5, 2) NOT NULL, "health_status" varchar(50) NOT NULL);

CREATE TABLE "login_attempts" ("id" uuid NOT NULL PRIMARY KEY, "email_hash" varchar(64) NOT NULL, "ip_hash" varchar(64) NOT NULL, "success" boolean NOT NULL, "attempted_at" timestamp with time zone NOT NULL);

CREATE TABLE "migration_history" ("id" integer NOT NULL PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, "migration_name" text NOT NULL, "applied_at" timestamp with time zone NULL);

CREATE TABLE "notifications" ("id" uuid NOT NULL PRIMARY KEY, "user_id" uuid NOT NULL, "title" varchar(255) NOT NULL, "message" text NOT NULL, "type" varchar(50) NULL, "priority" varchar(20) NULL, "action_url" text NULL, "metadata" jsonb NULL, "is_read" boolean NULL, "read_at" timestamp with time zone NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL, "idempotency_key" text NULL UNIQUE);

CREATE TABLE "outbox_events" ("id" uuid NOT NULL PRIMARY KEY, "event_type" varchar(100) NOT NULL, "channel" varchar(50) NOT NULL, "aggregate_type" varchar(100) NULL, "aggregate_id" uuid NULL, "payload" jsonb NOT NULL, "status" varchar(20) NOT NULL, "target_table" varchar(100) NULL, "target_id" uuid NULL, "idempotency_key" text NULL UNIQUE, "error_message" text NULL, "retry_count" integer NULL, "created_at" timestamp with time zone NULL, "processed_at" timestamp with time zone NULL);

CREATE TABLE "outreach_campaigns" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "name" varchar(255) NOT NULL, "campaign_type" varchar(100) NOT NULL, "status" varchar(50) NOT NULL, "target_count" integer NOT NULL);

CREATE TABLE "outreach_contacts" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "full_name" varchar(255) NOT NULL, "email" varchar(254) NOT NULL, "company" varchar(255) NOT NULL, "role" varchar(255) NOT NULL, "relationship_status" varchar(50) NOT NULL, "tags" jsonb NOT NULL);

CREATE TABLE "outreach_messages" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "contact_id" uuid NOT NULL, "campaign_id" uuid NULL, "message_type" varchar(100) NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "status" varchar(50) NOT NULL);

CREATE TABLE "outreach_opportunities" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "contact_id" uuid NOT NULL, "title" varchar(255) NOT NULL, "stage" varchar(50) NOT NULL, "notes" text NOT NULL);

CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL PRIMARY KEY, "user_id" uuid NOT NULL, "token_hash" varchar(64) NOT NULL, "expires_at" timestamp with time zone NOT NULL, "used_at" timestamp with time zone NULL, "created_at" timestamp with time zone NOT NULL);

CREATE TABLE "payments" ("id" uuid NOT NULL PRIMARY KEY, "application_id" uuid NULL, "user_id" uuid NOT NULL, "amount" numeric(10, 2) NOT NULL, "currency" varchar(3) NULL, "payment_method" varchar(50) NULL, "transaction_reference" varchar(100) NULL, "status" varchar(20) NOT NULL, "verified_by" uuid NULL, "verified_at" timestamp with time zone NULL, "receipt_number" varchar(50) NULL UNIQUE, "receipt_url" text NULL, "metadata" jsonb NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL, "notes" text NULL, "lenco_reference" varchar(100) NULL, "fee" numeric(10, 2) NULL, "bearer" varchar(20) NULL);

CREATE TABLE "profiles" ("id" uuid NOT NULL PRIMARY KEY, "email" varchar(255) NOT NULL UNIQUE, "role" varchar(50) NOT NULL, "first_name" varchar(255) NULL, "last_name" varchar(255) NULL, "phone" varchar(20) NULL, "is_active" boolean NULL, "password_hash" text NULL, "refresh_token_hash" text NULL, "failed_login_attempts" integer NULL, "locked_until" timestamp with time zone NULL, "password_changed_at" timestamp with time zone NULL, "email_verified" boolean NULL, "avatar_url" text NULL, "date_of_birth" date NULL, "nrc_number" varchar(20) NULL, "nationality" varchar(100) NULL, "address" text NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL, "sex" varchar(10) NULL, "residence_town" varchar(255) NULL, "next_of_kin_name" varchar(255) NULL, "next_of_kin_phone" varchar(50) NULL, "full_name" varchar(255) NULL, "country" varchar(255) NULL);

CREATE TABLE "program_fees" ("id" uuid NOT NULL PRIMARY KEY, "program_id" uuid NOT NULL, "fee_type" varchar(20) NOT NULL, "residency_category" varchar(20) NOT NULL, "amount" numeric(10, 2) NOT NULL, "currency" varchar(3) NOT NULL, "is_active" boolean NOT NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL);

CREATE TABLE "program_intakes" ("id" uuid NOT NULL PRIMARY KEY, "program_id" uuid NOT NULL, "intake_id" uuid NOT NULL, "max_capacity" integer NULL, "current_enrollment" integer NULL, "created_at" timestamp with time zone NULL);

CREATE TABLE "programs" ("id" uuid NOT NULL PRIMARY KEY, "name" varchar(255) NOT NULL, "code" varchar(50) NOT NULL UNIQUE, "description" text NULL, "duration_months" integer NULL, "application_fee" numeric(10, 2) NULL, "tuition_fee" numeric(10, 2) NULL, "requirements" jsonb NULL, "regulatory_body" varchar(100) NULL, "accreditation_status" varchar(50) NULL, "is_active" boolean NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL, "institution_id" uuid NULL);

CREATE TABLE "provider_credential_audits" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "provider" varchar(100) NOT NULL, "action" varchar(100) NOT NULL, "actor_id" uuid NULL);

CREATE TABLE "review_tasks" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "automation_run_id" uuid NULL, "task_type" varchar(100) NOT NULL, "status" varchar(50) NOT NULL, "reason" text NOT NULL);

CREATE TABLE "settings" ("id" uuid NOT NULL PRIMARY KEY, "key" varchar(100) NOT NULL UNIQUE, "value" jsonb NOT NULL, "description" text NULL, "category" varchar(50) NULL, "is_public" boolean NULL, "updated_by" uuid NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL);

CREATE TABLE "subjects" ("id" uuid NOT NULL PRIMARY KEY, "name" varchar(255) NOT NULL, "code" varchar(50) NULL UNIQUE, "category" varchar(100) NULL, "is_core" boolean NULL, "is_active" boolean NULL, "curriculum_type" varchar(20) NULL, "created_at" timestamp with time zone NULL);

CREATE TABLE "telegram_subscriptions" ("id" uuid NOT NULL PRIMARY KEY, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "chat_id" varchar(255) NOT NULL, "status" varchar(50) NOT NULL, "scope" varchar(100) NOT NULL);

CREATE TABLE "user_notification_preferences" ("id" uuid NOT NULL PRIMARY KEY, "user_id" uuid NOT NULL UNIQUE, "email_enabled" boolean NULL, "sms_enabled" boolean NULL, "application_updates" boolean NULL, "payment_reminders" boolean NULL, "interview_reminders" boolean NULL, "marketing_emails" boolean NULL, "quiet_hours_start" time NULL, "quiet_hours_end" time NULL, "timezone" varchar(50) NULL, "created_at" timestamp with time zone NULL, "updated_at" timestamp with time zone NULL);

CREATE TABLE "user_permission_overrides" ("user_id" uuid NOT NULL PRIMARY KEY, "permissions" jsonb NOT NULL, "updated_by" uuid NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);

CREATE TABLE "webhook_event_logs" ("id" uuid NOT NULL PRIMARY KEY, "event_type" varchar(50) NOT NULL, "reference" varchar(100) NOT NULL, "payload" jsonb NOT NULL, "signature_valid" boolean NOT NULL, "processed" boolean NOT NULL, "processing_error" text NULL, "created_at" timestamp with time zone NULL);

ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_intake_id_bd2b36be_fk_intakes_id" FOREIGN KEY ("intake_id") REFERENCES "intakes" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "academic_calendar_events_intake_id_bd2b36be" ON "academic_calendar_events" ("intake_id");

ALTER TABLE "application_amendments" ADD CONSTRAINT "application_amendmen_application_id_9ff77a93_fk_applicati" FOREIGN KEY ("application_id") REFERENCES "applications" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "application_amendments" ADD CONSTRAINT "application_amendments_reviewed_by_108e135a_fk_profiles_id" FOREIGN KEY ("reviewed_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "application_amendments_application_id_9ff77a93" ON "application_amendments" ("application_id");

CREATE INDEX "application_amendments_reviewed_by_108e135a" ON "application_amendments" ("reviewed_by");

ALTER TABLE "application_conditions" ADD CONSTRAINT "application_conditio_application_id_ee3ffb39_fk_applicati" FOREIGN KEY ("application_id") REFERENCES "applications" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "application_conditions" ADD CONSTRAINT "application_conditions_verified_by_ed95f8a7_fk_profiles_id" FOREIGN KEY ("verified_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "application_conditions_application_id_ee3ffb39" ON "application_conditions" ("application_id");

CREATE INDEX "application_conditions_verified_by_ed95f8a7" ON "application_conditions" ("verified_by");

ALTER TABLE "application_documents" ADD CONSTRAINT "application_document_application_id_fe7e9522_fk_applicati" FOREIGN KEY ("application_id") REFERENCES "applications" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_verified_by_e41e6867_fk_profiles_id" FOREIGN KEY ("verified_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "application_documents_application_id_fe7e9522" ON "application_documents" ("application_id");

CREATE INDEX "application_documents_verified_by_e41e6867" ON "application_documents" ("verified_by");

ALTER TABLE "application_drafts" ADD CONSTRAINT "application_drafts_user_id_f1ad0db7_fk_profiles_id" FOREIGN KEY ("user_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "application_drafts" ADD CONSTRAINT "application_drafts_application_id_389455c3_fk_applications_id" FOREIGN KEY ("application_id") REFERENCES "applications" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "application_drafts_user_id_f1ad0db7" ON "application_drafts" ("user_id");

CREATE INDEX "application_drafts_application_id_389455c3" ON "application_drafts" ("application_id");

ALTER TABLE "application_grades" ADD CONSTRAINT "application_grades_application_id_149331ac_fk_applications_id" FOREIGN KEY ("application_id") REFERENCES "applications" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "application_grades" ADD CONSTRAINT "application_grades_subject_id_0c5019de_fk_subjects_id" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "application_grades_application_id_149331ac" ON "application_grades" ("application_id");

CREATE INDEX "application_grades_subject_id_0c5019de" ON "application_grades" ("subject_id");

ALTER TABLE "application_interviews" ADD CONSTRAINT "application_intervie_application_id_78fea563_fk_applicati" FOREIGN KEY ("application_id") REFERENCES "applications" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "application_interviews" ADD CONSTRAINT "application_interviews_created_by_98635509_fk_profiles_id" FOREIGN KEY ("created_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "application_interviews" ADD CONSTRAINT "application_interviews_updated_by_4f34b797_fk_profiles_id" FOREIGN KEY ("updated_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "application_interviews_application_id_78fea563" ON "application_interviews" ("application_id");

CREATE INDEX "application_interviews_created_by_98635509" ON "application_interviews" ("created_by");

CREATE INDEX "application_interviews_updated_by_4f34b797" ON "application_interviews" ("updated_by");

ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_h_application_id_12aa88d4_fk_applicati" FOREIGN KEY ("application_id") REFERENCES "applications" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_changed_by_ad501401_fk_profiles_id" FOREIGN KEY ("changed_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "application_status_history_application_id_12aa88d4" ON "application_status_history" ("application_id");

CREATE INDEX "application_status_history_changed_by_ad501401" ON "application_status_history" ("changed_by");

ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_ccbebfe7_fk_profiles_id" FOREIGN KEY ("user_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "applications" ADD CONSTRAINT "applications_payment_verified_by_11277426_fk_profiles_id" FOREIGN KEY ("payment_verified_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "applications" ADD CONSTRAINT "applications_admin_feedback_by_9999662c_fk_profiles_id" FOREIGN KEY ("admin_feedback_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewed_by_24e44e13_fk_profiles_id" FOREIGN KEY ("reviewed_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "applications" ADD CONSTRAINT "applications_assigned_reviewer_id_70d43327_fk_profiles_id" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "applications_application_number_9d5f81fb_like" ON "applications" ("application_number" varchar_pattern_ops);

CREATE INDEX "applications_user_id_ccbebfe7" ON "applications" ("user_id");

CREATE INDEX "applications_intake_5b7fa111" ON "applications" ("intake");

CREATE INDEX "applications_intake_5b7fa111_like" ON "applications" ("intake" varchar_pattern_ops);

CREATE INDEX "applications_payment_verified_by_11277426" ON "applications" ("payment_verified_by");

CREATE INDEX "applications_status_cbf6eacc" ON "applications" ("status");

CREATE INDEX "applications_status_cbf6eacc_like" ON "applications" ("status" varchar_pattern_ops);

CREATE INDEX "applications_admin_feedback_by_9999662c" ON "applications" ("admin_feedback_by");

CREATE INDEX "applications_reviewed_by_24e44e13" ON "applications" ("reviewed_by");

CREATE INDEX "applications_public_tracking_code_e1f39ae4_like" ON "applications" ("public_tracking_code" varchar_pattern_ops);

CREATE INDEX "applications_assigned_reviewer_id_70d43327" ON "applications" ("assigned_reviewer_id");

CREATE INDEX "audit_logs_actor_id_303d1495" ON "audit_logs" ("actor_id");

CREATE INDEX "audit_logs_entity_id_ce27893f" ON "audit_logs" ("entity_id");

CREATE INDEX "auth_group_name_a6ea08ec_like" ON "auth_group" ("name" varchar_pattern_ops);

ALTER TABLE "auth_group_permissions" ADD CONSTRAINT "auth_group_permissions_group_id_permission_id_0cd325b0_uniq" UNIQUE ("group_id", "permission_id");

ALTER TABLE "auth_group_permissions" ADD CONSTRAINT "auth_group_permissions_group_id_b120cbf9_fk_auth_group_id" FOREIGN KEY ("group_id") REFERENCES "auth_group" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "auth_group_permissions" ADD CONSTRAINT "auth_group_permissio_permission_id_84c5c92e_fk_auth_perm" FOREIGN KEY ("permission_id") REFERENCES "auth_permission" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "auth_group_permissions_group_id_b120cbf9" ON "auth_group_permissions" ("group_id");

CREATE INDEX "auth_group_permissions_permission_id_84c5c92e" ON "auth_group_permissions" ("permission_id");

ALTER TABLE "auth_permission" ADD CONSTRAINT "auth_permission_content_type_id_codename_01ab375a_uniq" UNIQUE ("content_type_id", "codename");

ALTER TABLE "auth_permission" ADD CONSTRAINT "auth_permission_content_type_id_2f476e4b_fk_django_co" FOREIGN KEY ("content_type_id") REFERENCES "django_content_type" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "auth_permission_content_type_id_2f476e4b" ON "auth_permission" ("content_type_id");

CREATE INDEX "auth_user_username_6821ab7c_like" ON "auth_user" ("username" varchar_pattern_ops);

ALTER TABLE "auth_user_groups" ADD CONSTRAINT "auth_user_groups_user_id_group_id_94350c0c_uniq" UNIQUE ("user_id", "group_id");

ALTER TABLE "auth_user_groups" ADD CONSTRAINT "auth_user_groups_user_id_6a12ed8b_fk_auth_user_id" FOREIGN KEY ("user_id") REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "auth_user_groups" ADD CONSTRAINT "auth_user_groups_group_id_97559544_fk_auth_group_id" FOREIGN KEY ("group_id") REFERENCES "auth_group" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "auth_user_groups_user_id_6a12ed8b" ON "auth_user_groups" ("user_id");

CREATE INDEX "auth_user_groups_group_id_97559544" ON "auth_user_groups" ("group_id");

ALTER TABLE "auth_user_user_permissions" ADD CONSTRAINT "auth_user_user_permissions_user_id_permission_id_14a6b632_uniq" UNIQUE ("user_id", "permission_id");

ALTER TABLE "auth_user_user_permissions" ADD CONSTRAINT "auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id" FOREIGN KEY ("user_id") REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "auth_user_user_permissions" ADD CONSTRAINT "auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm" FOREIGN KEY ("permission_id") REFERENCES "auth_permission" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "auth_user_user_permissions_user_id_a95ead1b" ON "auth_user_user_permissions" ("user_id");

CREATE INDEX "auth_user_user_permissions_permission_id_1fbb5f2c" ON "auth_user_user_permissions" ("permission_id");

ALTER TABLE "automation_artifacts" ADD CONSTRAINT "automation_artifacts_automation_run_id_0a67e2ba_fk_automatio" FOREIGN KEY ("automation_run_id") REFERENCES "automation_runs" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "automation_artifacts_automation_run_id_0a67e2ba" ON "automation_artifacts" ("automation_run_id");

CREATE INDEX "communication_templates_template_key_127461b6_like" ON "communication_templates" ("template_key" varchar_pattern_ops);

ALTER TABLE "course_requirements" ADD CONSTRAINT "course_requirements_program_id_180082c9_fk_programs_id" FOREIGN KEY ("program_id") REFERENCES "programs" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "course_requirements" ADD CONSTRAINT "course_requirements_subject_id_bdd29fe6_fk_subjects_id" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "course_requirements_program_id_180082c9" ON "course_requirements" ("program_id");

CREATE INDEX "course_requirements_subject_id_bdd29fe6" ON "course_requirements" ("subject_id");

ALTER TABLE "csrf_tokens" ADD CONSTRAINT "csrf_tokens_user_id_1b76f308_fk_profiles_id" FOREIGN KEY ("user_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "csrf_tokens_user_id_1b76f308" ON "csrf_tokens" ("user_id");

ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_message_id_6bd507aa_fk_email_messages_id" FOREIGN KEY ("message_id") REFERENCES "email_messages" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "delivery_events_message_id_6bd507aa" ON "delivery_events" ("message_id");

ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_0b4f3fc8_fk_profiles_id" FOREIGN KEY ("user_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "device_sessions_user_id_0b4f3fc8" ON "device_sessions" ("user_id");

ALTER TABLE "django_admin_log" ADD CONSTRAINT "django_admin_log_user_id_c564eba6_fk_auth_user_id" FOREIGN KEY ("user_id") REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "django_admin_log" ADD CONSTRAINT "django_admin_log_content_type_id_c4bce8eb_fk_django_co" FOREIGN KEY ("content_type_id") REFERENCES "django_content_type" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "django_admin_log_user_id_c564eba6" ON "django_admin_log" ("user_id");

CREATE INDEX "django_admin_log_content_type_id_c4bce8eb" ON "django_admin_log" ("content_type_id");

ALTER TABLE "django_content_type" ADD CONSTRAINT "django_content_type_app_label_model_76bd3d3b_uniq" UNIQUE ("app_label", "model");

CREATE INDEX "django_session_session_key_c0390e0f_like" ON "django_session" ("session_key" varchar_pattern_ops);

CREATE INDEX "django_session_expire_date_a5c62663" ON "django_session" ("expire_date");

ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_48ed9c7d_fk_email_threads_id" FOREIGN KEY ("thread_id") REFERENCES "email_threads" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "email_messages_thread_id_48ed9c7d" ON "email_messages" ("thread_id");

CREATE INDEX "email_threads_thread_key_aecc0fb5_like" ON "email_threads" ("thread_key" varchar_pattern_ops);

ALTER TABLE "fee_waivers" ADD CONSTRAINT "fee_waivers_application_id_a9c34598_fk_applications_id" FOREIGN KEY ("application_id") REFERENCES "applications" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "fee_waivers" ADD CONSTRAINT "fee_waivers_approved_by_feaab711_fk_profiles_id" FOREIGN KEY ("approved_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "fee_waivers_application_id_a9c34598" ON "fee_waivers" ("application_id");

CREATE INDEX "fee_waivers_approved_by_feaab711" ON "fee_waivers" ("approved_by");

CREATE INDEX "institutions_code_ad3ed63e_like" ON "institutions" ("code" varchar_pattern_ops);

ALTER TABLE "job_application_steps" ADD CONSTRAINT "job_application_step_job_application_id_a930a579_fk_job_appli" FOREIGN KEY ("job_application_id") REFERENCES "job_applications" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "job_application_steps_job_application_id_a930a579" ON "job_application_steps" ("job_application_id");

ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_posting_id_05abe56e_fk_jobs_postings_id" FOREIGN KEY ("job_posting_id") REFERENCES "jobs_postings" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_candidate_id_82926a5a_fk_profiles_id" FOREIGN KEY ("candidate_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "job_applications_job_posting_id_05abe56e" ON "job_applications" ("job_posting_id");

CREATE INDEX "job_applications_candidate_id_82926a5a" ON "job_applications" ("candidate_id");

ALTER TABLE "jobs_company_research_snapshots" ADD CONSTRAINT "jobs_company_researc_company_id_ef2441a9_fk_jobs_comp" FOREIGN KEY ("company_id") REFERENCES "jobs_companies" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "jobs_company_research_snapshots_company_id_ef2441a9" ON "jobs_company_research_snapshots" ("company_id");

ALTER TABLE "jobs_decisions" ADD CONSTRAINT "jobs_decisions_job_posting_id_5d53957e_fk_jobs_postings_id" FOREIGN KEY ("job_posting_id") REFERENCES "jobs_postings" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "jobs_decisions" ADD CONSTRAINT "jobs_decisions_candidate_id_61e9eb94_fk_profiles_id" FOREIGN KEY ("candidate_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "jobs_decisions_job_posting_id_5d53957e" ON "jobs_decisions" ("job_posting_id");

CREATE INDEX "jobs_decisions_candidate_id_61e9eb94" ON "jobs_decisions" ("candidate_id");

ALTER TABLE "jobs_discovery_runs" ADD CONSTRAINT "jobs_discovery_runs_source_id_0e8889c5_fk_jobs_sources_id" FOREIGN KEY ("source_id") REFERENCES "jobs_sources" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "jobs_discovery_runs_source_id_0e8889c5" ON "jobs_discovery_runs" ("source_id");

ALTER TABLE "jobs_match_scores" ADD CONSTRAINT "jobs_match_scores_job_posting_id_8704ed3d_fk_jobs_postings_id" FOREIGN KEY ("job_posting_id") REFERENCES "jobs_postings" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "jobs_match_scores" ADD CONSTRAINT "jobs_match_scores_candidate_id_4283d2ed_fk_profiles_id" FOREIGN KEY ("candidate_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "jobs_match_scores_job_posting_id_8704ed3d" ON "jobs_match_scores" ("job_posting_id");

CREATE INDEX "jobs_match_scores_candidate_id_4283d2ed" ON "jobs_match_scores" ("candidate_id");

ALTER TABLE "jobs_postings" ADD CONSTRAINT "jobs_postings_company_id_cca539dc_fk_jobs_companies_id" FOREIGN KEY ("company_id") REFERENCES "jobs_companies" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "jobs_postings" ADD CONSTRAINT "jobs_postings_source_id_6fec2a7d_fk_jobs_sources_id" FOREIGN KEY ("source_id") REFERENCES "jobs_sources" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "jobs_postings_company_id_cca539dc" ON "jobs_postings" ("company_id");

CREATE INDEX "jobs_postings_source_id_6fec2a7d" ON "jobs_postings" ("source_id");

CREATE INDEX "jobs_postings_canonical_key_019bb300_like" ON "jobs_postings" ("canonical_key" varchar_pattern_ops);

ALTER TABLE "jobs_snapshots" ADD CONSTRAINT "jobs_snapshots_job_posting_id_279779c4_fk_jobs_postings_id" FOREIGN KEY ("job_posting_id") REFERENCES "jobs_postings" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "jobs_snapshots_job_posting_id_279779c4" ON "jobs_snapshots" ("job_posting_id");

CREATE INDEX "jobs_sources_slug_33b151c1_like" ON "jobs_sources" ("slug" varchar_pattern_ops);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_468e288d_fk_profiles_id" FOREIGN KEY ("user_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "notifications_user_id_468e288d" ON "notifications" ("user_id");

CREATE INDEX "notifications_idempotency_key_42df4db7_like" ON "notifications" ("idempotency_key" text_pattern_ops);

CREATE INDEX "outbox_events_idempotency_key_116e2feb_like" ON "outbox_events" ("idempotency_key" text_pattern_ops);

ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_contact_id_e12c130a_fk_outreach_contacts_id" FOREIGN KEY ("contact_id") REFERENCES "outreach_contacts" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_campaign_id_71eb5afc_fk_outreach_campaigns_id" FOREIGN KEY ("campaign_id") REFERENCES "outreach_campaigns" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "outreach_messages_contact_id_e12c130a" ON "outreach_messages" ("contact_id");

CREATE INDEX "outreach_messages_campaign_id_71eb5afc" ON "outreach_messages" ("campaign_id");

ALTER TABLE "outreach_opportunities" ADD CONSTRAINT "outreach_opportuniti_contact_id_975acb50_fk_outreach_" FOREIGN KEY ("contact_id") REFERENCES "outreach_contacts" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "outreach_opportunities_contact_id_975acb50" ON "outreach_opportunities" ("contact_id");

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_0aeaaad3_fk_profiles_id" FOREIGN KEY ("user_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "password_reset_tokens_user_id_0aeaaad3" ON "password_reset_tokens" ("user_id");

ALTER TABLE "payments" ADD CONSTRAINT "payments_application_id_49ae344b_fk_applications_id" FOREIGN KEY ("application_id") REFERENCES "applications" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_189b9948_fk_profiles_id" FOREIGN KEY ("user_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_a200c1f3_fk_profiles_id" FOREIGN KEY ("verified_by") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "payments_application_id_49ae344b" ON "payments" ("application_id");

CREATE INDEX "payments_user_id_189b9948" ON "payments" ("user_id");

CREATE INDEX "payments_status_760e149d" ON "payments" ("status");

CREATE INDEX "payments_status_760e149d_like" ON "payments" ("status" varchar_pattern_ops);

CREATE INDEX "payments_verified_by_a200c1f3" ON "payments" ("verified_by");

CREATE INDEX "payments_receipt_number_16f9c14c_like" ON "payments" ("receipt_number" varchar_pattern_ops);

CREATE INDEX "profiles_email_91cb4f40_like" ON "profiles" ("email" varchar_pattern_ops);

ALTER TABLE "program_fees" ADD CONSTRAINT "program_fees_program_id_fbdd2ffc_fk_programs_id" FOREIGN KEY ("program_id") REFERENCES "programs" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "program_fees_program_id_fbdd2ffc" ON "program_fees" ("program_id");

ALTER TABLE "program_intakes" ADD CONSTRAINT "program_intakes_program_id_ecd1162d_fk_programs_id" FOREIGN KEY ("program_id") REFERENCES "programs" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "program_intakes" ADD CONSTRAINT "program_intakes_intake_id_f85dc60b_fk_intakes_id" FOREIGN KEY ("intake_id") REFERENCES "intakes" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "program_intakes_program_id_ecd1162d" ON "program_intakes" ("program_id");

CREATE INDEX "program_intakes_intake_id_f85dc60b" ON "program_intakes" ("intake_id");

ALTER TABLE "programs" ADD CONSTRAINT "programs_institution_id_0f35d8eb_fk_institutions_id" FOREIGN KEY ("institution_id") REFERENCES "institutions" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "programs_code_9cde2c07_like" ON "programs" ("code" varchar_pattern_ops);

CREATE INDEX "programs_institution_id_0f35d8eb" ON "programs" ("institution_id");

ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_automation_run_id_c9388bb1_fk_automation_runs_id" FOREIGN KEY ("automation_run_id") REFERENCES "automation_runs" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "review_tasks_automation_run_id_c9388bb1" ON "review_tasks" ("automation_run_id");

CREATE INDEX "settings_key_f16b5bae_like" ON "settings" ("key" varchar_pattern_ops);

CREATE INDEX "subjects_code_b9143b00_like" ON "subjects" ("code" varchar_pattern_ops);

ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_9dccc056_fk_profiles_id" FOREIGN KEY ("user_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_0b433e0c_fk_profiles_id" FOREIGN KEY ("user_id") REFERENCES "profiles" ("id") DEFERRABLE INITIALLY DEFERRED;

-- =============================================================================
-- Custom Production-Hardening Partial & Unique Indexes
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_transaction_reference_present
ON payments (transaction_reference)
WHERE transaction_reference IS NOT NULL AND transaction_reference <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_active_per_application
ON payments (application_id)
WHERE application_id IS NOT NULL AND status IN ('pending', 'deferred');

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_receipt_number
ON payments (receipt_number)
WHERE receipt_number IS NOT NULL AND receipt_number <> '';

CREATE INDEX IF NOT EXISTS idx_payments_application_status
ON payments (application_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_user_status
ON payments (user_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_status_created_at
ON payments (status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_processed_reference_event
ON webhook_event_logs (reference, event_type)
WHERE processed IS TRUE;
