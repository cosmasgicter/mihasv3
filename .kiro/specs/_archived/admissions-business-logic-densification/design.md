# Design: Admissions Business Logic Densification

## Overview

This design implements 15 new business logic domains across the admissions system. The architecture follows the existing pattern: thin domain service modules in `backend/apps/applications/`, Celery periodic tasks for time-based automation, and frontend changes only where user-facing flows require them.

All new database columns and tables use the existing `managed = False` pattern with SQL migration scripts in `backend/scripts/`.

## Architecture Decisions

### AD-1: Status Values as Flat Strings (Not a Separate Table)

Application statuses remain flat string values in the `applications.status` column. The `ALLOWED_TRANSITIONS` map in `services.py` is the single source of truth for valid transitions. Adding a `statuses` reference table would add complexity without benefit — the transition map already enforces validity.

New statuses added: `withdrawn`, `expired`, `conditionally_approved`, `enrolled`, `enrollment_expired`.

### AD-2: Conditions as a Separate Table (Not JSON)

Conditional admission conditions are stored in a dedicated `application_conditions` table rather than a JSON column on `applications`. This allows individual condition tracking, per-condition deadlines, and independent status transitions. The table is small (typically 1–3 conditions per application) and benefits from relational integrity.

### AD-3: Communication Templates as Database Records

Email/notification templates are stored in a `communication_templates` table rather than file-based templates. This allows admin editing without deployment, and the template key lookup is a single indexed query. Mustache-style `{{variable}}` substitution is implemented with Python `str.replace()` — no template engine dependency needed.

### AD-4: Reviewer Assignment on Application Record

The `assigned_reviewer_id` column lives directly on the `applications` table rather than a separate assignment table. This keeps the query simple (one JOIN) and matches the existing pattern of `reviewed_by` on the same table. Assignment history is tracked via `ApplicationStatusHistory`.

### AD-5: Fee Waivers as a Separate Table

Fee waivers get their own table rather than a column on `applications` because waivers have their own lifecycle (creation, audit trail, reason codes) and a single application could theoretically have a waiver revoked and re-granted. The table also enables analytics by reason code.

### AD-6: Amendments as a Separate Table

Application amendments are stored in `application_amendments` rather than using the PATCH endpoint because amendments require an approval workflow (pending → approved/rejected) that the PATCH endpoint doesn't support. Each amendment is a discrete auditable record.

## Extended State Machine

```
                                    ┌─────────────────────────────────────────────┐
                                    │                                             │
                                    ▼                                             │
  ┌───────┐    ┌───────────┐    ┌──────────────┐    ┌────────────┐    ┌──────────┐
  │ draft │───▶│ submitted │───▶│ under_review │───▶│  approved  │───▶│ enrolled │
  └───┬───┘    └─────┬─────┘    └──────┬───────┘    └─────┬──────┘    └──────────┘
      │              │                 │                   │
      │              │                 ├───▶ rejected      ├───▶ enrollment_expired ──▶ (triggers waitlist)
      │              │                 │                   │
      │              │                 ├───▶ waitlisted ───┤
      │              │                 │        │          │
      │              │                 │        ▼          │
      │              │                 ├───▶ conditionally_approved ──▶ approved (auto, when conditions met)
      │              │                 │        │                          │
      │              │                 │        ├───▶ rejected             │
      │              │                 │        ├───▶ withdrawn            │
      │              │                 │        └───▶ enrolled             │
      │              │                 │                                   │
      │              ├───▶ withdrawn   ├───▶ withdrawn                    │
      │              │                 │                                   │
      ▼              │                 │                                   │
   expired           │                 │                                   │
                     │                 │                                   │
                     └─────────────────┴───────────────────────────────────┘
```

### Updated ALLOWED_TRANSITIONS

```python
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"submitted", "expired"},
    "submitted": {"under_review", "approved", "rejected", "withdrawn"},
    "under_review": {"approved", "rejected", "waitlisted", "conditionally_approved", "withdrawn"},
    "waitlisted": {"approved", "rejected", "conditionally_approved", "withdrawn"},
    "conditionally_approved": {"approved", "rejected", "enrolled", "enrollment_expired", "withdrawn"},
    "approved": {"enrolled", "enrollment_expired"},
}
```

Terminal statuses (no outbound transitions): `rejected`, `withdrawn`, `expired`, `enrolled`, `enrollment_expired`.

## Database Changes

### SQL Migration Script: `backend/scripts/business_logic_densification.sql`

```sql
-- 1. New columns on applications table
ALTER TABLE applications ADD COLUMN IF NOT EXISTS waitlist_position INTEGER NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS is_late_submission BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID NULL REFERENCES profiles(id);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS enrollment_confirmation_deadline TIMESTAMP NULL;

-- 2. Grace period on intakes table
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NULL;

-- 3. Application conditions table
CREATE TABLE IF NOT EXISTS application_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    condition_type VARCHAR(20) NOT NULL DEFAULT 'other',
    deadline DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    met_at TIMESTAMP NULL,
    verified_by UUID NULL REFERENCES profiles(id),
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conditions_application ON application_conditions(application_id);
CREATE INDEX IF NOT EXISTS idx_conditions_status ON application_conditions(status);

-- 4. Communication templates table
CREATE TABLE IF NOT EXISTS communication_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key VARCHAR(100) UNIQUE NOT NULL,
    subject_template TEXT NOT NULL DEFAULT '',
    body_template TEXT NOT NULL DEFAULT '',
    channel VARCHAR(20) NOT NULL DEFAULT 'both',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 5. Academic calendar events table
CREATE TABLE IF NOT EXISTS academic_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intake_id UUID NOT NULL REFERENCES intakes(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_date DATE NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calendar_intake ON academic_calendar_events(intake_id);

-- 6. Fee waivers table
CREATE TABLE IF NOT EXISTS fee_waivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    waiver_type VARCHAR(20) NOT NULL,
    reason_code VARCHAR(30) NOT NULL,
    discount_percentage INTEGER NOT NULL DEFAULT 100,
    approved_by UUID NOT NULL REFERENCES profiles(id),
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_waivers_application ON fee_waivers(application_id);

-- 7. Application amendments table
CREATE TABLE IF NOT EXISTS application_amendments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    field_name VARCHAR(50) NOT NULL,
    old_value TEXT NULL,
    new_value TEXT NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_by UUID NULL REFERENCES profiles(id),
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_amendments_application ON application_amendments(application_id);
CREATE INDEX IF NOT EXISTS idx_amendments_status ON application_amendments(status);

-- 8. Seed communication templates
INSERT INTO communication_templates (template_key, subject_template, body_template, channel) VALUES
('application_approved', 'Your MIHAS Application Has Been Approved', '<p>Dear {{student_name}},</p><p>Congratulations! Your application for <strong>{{program_name}}</strong> ({{intake_name}}) has been <strong>approved</strong>.</p><p>Please log in to confirm your enrollment before {{deadline_date}}.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('application_rejected', 'Update on Your MIHAS Application', '<p>Dear {{student_name}},</p><p>Your application for <strong>{{program_name}}</strong> ({{intake_name}}) has been reviewed.</p><p>{{admin_feedback}}</p><p>Please log in to your account for details.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('application_withdrawn_confirmation', 'Application Withdrawal Confirmed', '<p>Dear {{student_name}},</p><p>Your application {{application_number}} for {{program_name}} ({{intake_name}}) has been withdrawn as requested.</p><p>You may submit a new application at any time.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('interview_scheduled', 'Interview Scheduled — {{program_name}}', '<p>Dear {{student_name}},</p><p>An interview has been scheduled for your application to {{program_name}}.</p><p><strong>Date:</strong> {{interview_date}}<br><strong>Mode:</strong> {{interview_mode}}<br><strong>Location:</strong> {{interview_location}}</p><p>Please log in for details.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('interview_rescheduled', 'Interview Rescheduled — {{program_name}}', '<p>Dear {{student_name}},</p><p>Your interview for {{program_name}} has been rescheduled.</p><p><strong>New Date:</strong> {{interview_date}}<br><strong>Mode:</strong> {{interview_mode}}</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('interview_cancelled', 'Interview Cancelled — {{program_name}}', '<p>Dear {{student_name}},</p><p>Your interview for {{program_name}} has been cancelled.</p><p>{{admin_feedback}}</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('interview_reminder', 'Reminder: Interview Tomorrow — {{program_name}}', '<p>Dear {{student_name}},</p><p>This is a reminder that your interview for {{program_name}} is scheduled for tomorrow.</p><p><strong>Date:</strong> {{interview_date}}<br><strong>Mode:</strong> {{interview_mode}}</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('payment_failed', 'Payment Issue — Action Required', '<p>Dear {{student_name}},</p><p>Your payment for application {{application_number}} was not successful.</p><p>Please log in and retry your payment. You have {{remaining_attempts}} attempts remaining.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('payment_expired', 'Payment Expired — New Payment Required', '<p>Dear {{student_name}},</p><p>Your pending payment for application {{application_number}} has expired after 24 hours.</p><p>Please log in and initiate a new payment.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('draft_expiry_reminder', 'Your Application Draft Will Expire Soon', '<p>Dear {{student_name}},</p><p>Your draft application for {{program_name}} ({{intake_name}}) has not been updated in 7 days.</p><p>Please log in to complete and submit your application. Your draft will expire in {{days_until_expiry}} days.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('draft_expired', 'Application Draft Expired', '<p>Dear {{student_name}},</p><p>Your draft application for {{program_name}} ({{intake_name}}) has expired after 30 days of inactivity.</p><p>You may start a new application at any time.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('waitlist_promoted', 'Great News — You Have Been Accepted!', '<p>Dear {{student_name}},</p><p>A spot has opened up and your application for <strong>{{program_name}}</strong> ({{intake_name}}) has been <strong>approved</strong>!</p><p>Please log in to confirm your enrollment before {{deadline_date}}.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('condition_assigned', 'Conditional Admission — Action Required', '<p>Dear {{student_name}},</p><p>Your application for {{program_name}} has been conditionally approved. You must meet the following conditions:</p><p>{{conditions_list}}</p><p>Please log in for details and deadlines.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('condition_expiry_warning', 'Condition Deadline Approaching', '<p>Dear {{student_name}},</p><p>A condition for your application to {{program_name}} is due in {{days_until_expiry}} days:</p><p>{{condition_description}}</p><p>Please take action before the deadline.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('condition_expired', 'Condition Deadline Passed', '<p>Dear {{student_name}},</p><p>A condition for your application to {{program_name}} has expired:</p><p>{{condition_description}}</p><p>Please log in to check your application status.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('late_application_accepted', 'Late Application Received', '<p>Dear {{student_name}},</p><p>Your late application for {{program_name}} ({{intake_name}}) has been received. A late fee of {{late_fee_amount}} applies.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('enrollment_confirmation_reminder', 'Confirm Your Enrollment — Deadline Approaching', '<p>Dear {{student_name}},</p><p>Please confirm your enrollment for {{program_name}} ({{intake_name}}) before {{deadline_date}}. Your spot will be released if not confirmed.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('enrollment_expired', 'Enrollment Confirmation Expired', '<p>Dear {{student_name}},</p><p>Your enrollment confirmation deadline for {{program_name}} ({{intake_name}}) has passed. Your spot has been released.</p><p>Best regards,<br>MIHAS Admissions</p>', 'both'),
('review_sla_breach', 'ALERT: Applications Pending Review Beyond SLA', '<p>The following applications have exceeded the review SLA threshold:</p><p>{{application_list}}</p><p>Please prioritize these reviews.</p>', 'email'),
('document_verification_needed', 'ALERT: Documents Pending Verification', '<p>The following documents have been pending verification beyond the SLA threshold:</p><p>{{document_list}}</p>', 'email')
ON CONFLICT (template_key) DO NOTHING;
```

## New Backend Modules

### 1. Withdrawal Service: `backend/apps/applications/withdrawal_service.py`

```python
class WithdrawalService:
    def withdraw(application_id, user_id, reason, ip_address, user_agent) -> Application
    # Validates status, records reason, decrements enrollment, triggers waitlist promotion
```

### 2. Waitlist Manager: `backend/apps/applications/waitlist_manager.py`

```python
class WaitlistManager:
    def assign_position(application, program, intake) -> int
    def promote_next(program, intake) -> Application | None
    def reindex_positions(program, intake) -> None
    def get_position(application_id) -> dict  # {position, total}
```

### 3. Condition Manager: `backend/apps/applications/condition_manager.py`

```python
class ConditionManager:
    def assign_conditions(application_id, conditions, admin_id) -> list[ApplicationCondition]
    def verify_condition(condition_id, status, admin_id) -> ApplicationCondition
    def check_all_conditions_resolved(application_id) -> bool
    def auto_promote_if_all_met(application_id) -> bool
```

### 4. Communication Service: `backend/apps/common/communication_service.py`

```python
class CommunicationService:
    def send(template_key, application, extra_context=None) -> None
    def render_template(template_key, context) -> tuple[str, str]  # (subject, body)
    # Looks up template, substitutes variables, creates Notification + EmailQueue
```

### 5. Amendment Service: `backend/apps/applications/amendment_service.py`

```python
class AmendmentService:
    def request_amendment(application_id, field_name, new_value, reason, user_id) -> ApplicationAmendment
    def review_amendment(amendment_id, status, admin_id) -> ApplicationAmendment
    # Validates field is amendable, checks pending count limit, applies on approval
```

### 6. Fee Waiver Service: `backend/apps/documents/fee_waiver_service.py`

```python
class FeeWaiverService:
    def grant_waiver(application_id, waiver_type, reason_code, discount_pct, admin_id, notes) -> FeeWaiver
    def get_effective_fee(application_id, base_fee) -> Decimal
    # Checks for existing waiver, computes discounted fee
```

### 7. Enrollment Service: `backend/apps/applications/enrollment_service.py`

```python
class EnrollmentService:
    def confirm_enrollment(application_id, user_id) -> Application
    def compute_deadline(application) -> date
    # Validates status, transitions to enrolled
```

## New Celery Tasks

All tasks are registered in `CELERY_BEAT_SCHEDULE`:

| Task | Schedule | Module |
|------|----------|--------|
| `draft_expiry_reminder_task` | Daily 06:00 UTC | `backend/apps/applications/tasks.py` |
| `review_sla_reminder_task` | Daily 07:00 UTC | `backend/apps/applications/tasks.py` |
| `document_verification_sla_task` | Daily 08:00 UTC | `backend/apps/documents/tasks.py` |
| `condition_expiry_task` | Daily 05:00 UTC | `backend/apps/applications/tasks.py` |
| `enrollment_confirmation_expiry_task` | Daily 09:00 UTC | `backend/apps/applications/tasks.py` |
| `interview_auto_complete_task` | Every 2 hours | `backend/apps/applications/tasks.py` |
| `interview_reminder_task` | Every hour | `backend/apps/applications/tasks.py` |
| `waitlist_cascade_task` | Daily 10:00 UTC | `backend/apps/applications/tasks.py` |

## New API Endpoints

| Method | Path | Permission | Requirement |
|--------|------|------------|-------------|
| POST | `/api/v1/applications/{id}/withdraw/` | Owner | Req 1 |
| GET | `/api/v1/applications/{id}/waitlist-position/` | Owner/Admin | Req 3 |
| GET | `/api/v1/applications/{id}/conditions/` | Owner/Admin | Req 5 |
| POST | `/api/v1/applications/{id}/conditions/{cid}/verify/` | Admin | Req 5 |
| POST | `/api/v1/applications/{id}/confirm-enrollment/` | Owner | Req 10 |
| POST | `/api/v1/applications/{id}/assign/` | SuperAdmin | Req 11 |
| POST | `/api/v1/applications/auto-assign/` | SuperAdmin | Req 11 |
| POST | `/api/v1/applications/{id}/fee-waiver/` | SuperAdmin | Req 12 |
| POST | `/api/v1/applications/{id}/amendments/` | Owner | Req 14 |
| POST | `/api/v1/applications/{id}/amendments/{aid}/review/` | Admin | Req 14 |
| GET | `/api/v1/admin/templates/` | Admin | Req 9 |
| PUT | `/api/v1/admin/templates/{key}/` | Admin | Req 9 |

## New Django Models (all `managed = False`)

```python
class ApplicationCondition(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    description = models.TextField()
    condition_type = models.CharField(max_length=20, default='other')
    deadline = models.DateField()
    status = models.CharField(max_length=20, default='pending')
    met_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey('accounts.Profile', null=True, blank=True, on_delete=models.SET_NULL)
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        managed = False
        db_table = 'application_conditions'

class CommunicationTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    template_key = models.CharField(max_length=100, unique=True)
    subject_template = models.TextField(default='')
    body_template = models.TextField(default='')
    channel = models.CharField(max_length=20, default='both')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        managed = False
        db_table = 'communication_templates'

class AcademicCalendarEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    intake = models.ForeignKey('catalog.Intake', on_delete=models.CASCADE)
    event_type = models.CharField(max_length=50)
    event_date = models.DateField()
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        managed = False
        db_table = 'academic_calendar_events'

class FeeWaiver(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    waiver_type = models.CharField(max_length=20)
    reason_code = models.CharField(max_length=30)
    discount_percentage = models.IntegerField(default=100)
    approved_by = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        managed = False
        db_table = 'fee_waivers'

class ApplicationAmendment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    field_name = models.CharField(max_length=50)
    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField()
    reason = models.TextField()
    status = models.CharField(max_length=20, default='pending')
    reviewed_by = models.ForeignKey('accounts.Profile', null=True, blank=True, on_delete=models.SET_NULL)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        managed = False
        db_table = 'application_amendments'
```

## Frontend Changes (Minimal)

Frontend changes are limited to consuming new API data — no new pages unless specified:

1. **Student Dashboard**: Show waitlist position badge, enrollment confirmation button + deadline, pending conditions list.
2. **Application Status Page**: Add withdrawal button (with confirmation dialog + reason textarea), amendment request form, conditions timeline.
3. **Payment Step**: Show remaining payment attempts when < 3.
4. **Admin Application Detail**: Show assigned reviewer, fee waiver badge, document verification age badges, late submission badge, amendment requests panel.
5. **Admin Application List**: Add filters for `assigned_reviewer_id`, `is_late_submission`, `has_pending_amendments`.

## Testing Strategy

- Each new service module gets a corresponding unit test file in `backend/tests/unit/`.
- State machine extensions get property tests in `backend/tests/property/` using hypothesis.
- Celery tasks get unit tests with mocked `timezone.now()` for time-dependent logic.
- New endpoints get integration tests verifying permission, validation, and response format.
- Frontend changes get Vitest unit tests for new components/hooks.
