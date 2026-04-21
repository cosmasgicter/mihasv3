# Schema Ownership Manifest

All Django models use `managed = False`. The database schema is owned by SQL migration scripts, not Django migrations.

## Schema Change Workflow

1. **Author**: Write SQL in `backend/scripts/<descriptive-name>.sql`
2. **Review**: PR review of the SQL script
3. **Apply**: Run against Neon Postgres (production branch or preview branch)
4. **Update model**: Update the Django model in `backend/apps/` to match
5. **Verify**: `python3 manage.py check` must pass
6. **Rollback**: Write a reverse SQL script or use Neon branch restore

## Table Inventory

### Core Platform (apps/common)

| Table | Model | Purpose |
|-------|-------|---------|
| `profiles` | Profile | User profiles |
| `settings` | SystemSetting | System configuration |
| `audit_logs` | AuditLog | Audit trail |
| `csrf_tokens` | CsrfToken | Custom CSRF tokens |
| `email_queue` | EmailQueue | Outbox for email delivery |
| `notifications` | Notification | User notifications |
| `communication_templates` | CommunicationTemplate | Email/notification templates |
| `user_notification_preferences` | UserNotificationPreference | Per-user notification settings |
| `error_logs` | ErrorLog | Deprecated (GlitchTip replaced) |

### Admissions (apps/applications)

| Table | Model | Purpose |
|-------|-------|---------|
| `applications` | Application | Student applications |
| `application_status_history` | ApplicationStatusHistory | Status change audit |
| `application_conditions` | ApplicationCondition | Conditional admission |
| `application_amendments` | ApplicationAmendment | Student amendment requests |
| `academic_calendar_events` | AcademicCalendarEvent | Calendar for enrollment deadlines |
| `fee_waivers` | FeeWaiver | Fee waiver records |

### Documents & Payments (apps/documents)

| Table | Model | Purpose |
|-------|-------|---------|
| `payments` | Payment | Payment records |
| `program_fees` | ProgramFee | Fee configuration per program |
| `webhook_event_logs` | WebhookEventLog | Lenco webhook audit |
| `documents` | Document | Uploaded documents |

### Catalog (apps/catalog)

| Table | Model | Purpose |
|-------|-------|---------|
| `programs` | Program | Academic programs |
| `intakes` | Intake | Admission intakes |
| `subjects` | Subject | ECZ subjects |
| `institutions` | Institution | Partner institutions |

### Jobs/Ops (scaffold — apps/jobs, apps/automation, apps/integrations)

| Table | Model | Purpose |
|-------|-------|---------|
| `jobs` | Job | Job listings |
| `job_applications` | JobApplication | Job application tracking |
| `job_scores` | JobScore | Job match scores |
| `job_sources` | JobSource | Discovery sources |
| `automation_rules` | AutomationRule | Automation config |
| `automation_runs` | AutomationRun | Automation execution log |
| `automation_actions` | AutomationAction | Action definitions |
| `automation_conditions` | AutomationCondition | Condition definitions |
| `integration_providers` | IntegrationProvider | External service config |
| + 6 more integration tables | Various | Provider credentials, logs |

## SQL Migration Scripts

| Script | Purpose |
|--------|---------|
| `lenco_payment_integration.sql` | Payment tables, program_fees, webhook_event_logs |
| `business_logic_densification.sql` | Conditions, amendments, calendar, fee waivers, templates |
| `create_error_logs_table.sql` | Error logs (deprecated) |
| `idempotency_redesign.sql` | Idempotency keys table |
| `add_payments_app_status_index.sql` | Performance indexes |
| `add_performance_indexes.sql` | General performance indexes |
| `seed_program_fees.sql` | Initial fee data |
| `unify_application_numbers.sql` | Application number format migration |
| `remediate_integrity.sql` | Data integrity fixes |

## Rules

- Never use `makemigrations` / `migrate` for schema changes
- All schema changes go through SQL scripts in `backend/scripts/`
- Every model must have `managed = False` and explicit `db_table`
- Test schema compatibility: `python3 manage.py check` after any model change
