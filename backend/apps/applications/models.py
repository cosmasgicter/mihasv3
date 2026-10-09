"""Application models - maps to existing Neon Postgres tables."""

import uuid

from django.db import models


class Application(models.Model):
    """Maps to 'applications' table.

    Legacy unmapped columns (AUDIT-1.3-003):
    The database ``applications`` table contains 7 payment columns from the
    pre-Lenco manual/mobile-money payment flow that are intentionally NOT
    mapped in this Django model: ``payment_method``, ``payer_name``,
    ``payer_phone``, ``amount``, ``paid_at``, ``momo_ref``, ``pop_url``.
    These columns are deprecated since the Lenco payment integration.
    All payment data now lives in the ``payments`` table (see
    ``backend/apps/documents/models.py``).

    Legacy payment-status orphans (AUDIT-2.3-001):
    Approximately 20 legacy applications have a ``payment_status`` value
    (e.g. 'verified') but no corresponding record in the ``payments`` table.
    These predate the Lenco integration and used the manual proof-of-payment
    flow.  No remediation is needed for their payment records.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application_number = models.CharField(max_length=50, unique=True)
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE, db_index=True)
    full_name = models.CharField(max_length=255)
    nrc_number = models.CharField(max_length=20, null=True, blank=True)
    passport_number = models.CharField(max_length=50, null=True, blank=True)
    date_of_birth = models.DateField()
    sex = models.CharField(max_length=10)
    phone = models.CharField(max_length=20)
    email = models.CharField(max_length=255)
    residence_town = models.CharField(max_length=100)
    nationality = models.CharField(max_length=100, null=True, blank=True)
    address_line_1 = models.CharField(max_length=255, null=True, blank=True)
    address_line_2 = models.CharField(max_length=255, null=True, blank=True)
    postal_code = models.CharField(max_length=20, null=True, blank=True)
    next_of_kin_name = models.CharField(max_length=255, null=True, blank=True)
    next_of_kin_phone = models.CharField(max_length=20, null=True, blank=True)
    institution_ref = models.ForeignKey(
        'catalog.Institution',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='institution_id',
        related_name='applications',
    )
    canonical_program = models.ForeignKey(
        'catalog.CanonicalProgram',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='program_id',
        related_name='applications',
    )
    program_offering = models.ForeignKey(
        'catalog.Program',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='program_offering_id',
        related_name='offering_applications',
    )
    intake_ref = models.ForeignKey(
        'catalog.Intake',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='intake_id',
        related_name='applications',
    )
    # The three legacy display snapshots. Each mirrors its canonical source's own
    # width, so a name the catalogue accepts can always be snapshotted:
    #   program     <- programs.name      varchar(255)
    #   intake      <- intakes.name       varchar(255)
    #   institution <- institutions.name  varchar(255)
    # ``intake`` was ``max_length=100`` until task 13.6 remediation M1. That was
    # the last surviving half of GATE-13.3-13: a 101-255 character intake name is
    # legal in the catalogue, Django does not validate ``max_length`` on
    # ``.save()``, and the write reached Postgres whole and raised an unhandled
    # ``DataError`` -> HTTP 500 on EVERY application create for that intake.
    # Widening the model alone would only have moved the failure; the matching
    # column widen ships as ``backend/scripts/2026_08_15_01_widen_application_intake_snapshot.sql``.
    # Do not narrow any of the three below its source column again.
    program = models.CharField(max_length=255)
    intake = models.CharField(max_length=255, db_index=True)
    institution = models.CharField(max_length=255)
    result_slip_url = models.CharField(max_length=500, null=True, blank=True)
    extra_kyc_url = models.CharField(max_length=500, null=True, blank=True)
    application_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    payment_status = models.CharField(max_length=20, null=True, blank=True)
    payment_verified_at = models.DateTimeField(null=True, blank=True)  # DEPRECATED - use payments table
    payment_verified_by = models.ForeignKey(  # DEPRECATED - use payments table
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_applications',
        db_column='payment_verified_by',
    )
    status = models.CharField(max_length=32, default='draft', db_index=True)
    eligibility_status = models.CharField(max_length=20, null=True, blank=True)
    eligibility_score = models.IntegerField(null=True, blank=True)
    eligibility_notes = models.TextField(null=True, blank=True)
    admin_feedback = models.TextField(null=True, blank=True)
    admin_feedback_date = models.DateTimeField(null=True, blank=True)
    admin_feedback_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedback_applications',
        db_column='admin_feedback_by',
    )
    review_started_at = models.DateTimeField(null=True, blank=True)
    decision_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_applications',
        db_column='reviewed_by',
    )
    additional_subjects = models.JSONField(null=True, blank=True)
    public_tracking_code = models.CharField(max_length=50, null=True, blank=True, unique=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    version = models.IntegerField(default=1)
    country = models.CharField(max_length=100, null=True, blank=True)

    # Business logic densification columns
    waitlist_position = models.IntegerField(null=True, blank=True)
    is_late_submission = models.BooleanField(default=False)
    assigned_reviewer_id = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_applications',
        db_column='assigned_reviewer_id',
    )
    enrollment_confirmation_deadline = models.DateTimeField(null=True, blank=True)

    # Assigned on full acceptance (status -> 'enrolled'). Format:
    # "{INSTCODE}/{YY}/{SEQ5}" e.g. "MIHAS/26/00001". See
    # backend/scripts/2026_06_08_student_number.sql.
    student_number = models.CharField(max_length=30, null=True, blank=True, unique=True)

    # Canonical assignment snapshot (admissions-v2 task 5.2, design §7.2/§8.3/§9.3).
    # Populated by the canonical assignment resolution when a draft is created
    # from canonical offering + intake IDs. Legacy rows keep NULL and fall back
    # to live resolution. See backend/scripts/2026_07_23_01_application_assignment_snapshot.sql.
    #
    #  * configuration_version — deterministic content version of the resolved
    #    offering configuration captured under one transactionally consistent
    #    read (R7.2). Readiness recomputes + compares to detect drift.
    #  * requirements_snapshot — the versioned dynamic Required_Documents resolved
    #    for the assigned scope (R11.6, §9.3).
    #  * eligibility_snapshot — the eligibility rules resolved for the offering.
    #  * assignment_version — optimistic-concurrency version (starts at 1; the
    #    reroute command bumps it).
    configuration_version = models.CharField(max_length=64, null=True, blank=True)
    requirements_snapshot = models.JSONField(null=True, blank=True)
    eligibility_snapshot = models.JSONField(null=True, blank=True)
    assignment_version = models.IntegerField(default=1)

    # Optional student-facing label for an online draft (admissions-v2 task 6.2,
    # R10.9). NULL for legacy rows and for drafts created without a label; the
    # client falls back to the program display snapshot when NULL. Written by
    # the canonical draft-start create and the dedicated rename command only —
    # never a routing/authority field. See
    # backend/scripts/2026_07_24_01_application_draft_name.sql.
    draft_name = models.CharField(max_length=255, null=True, blank=True)
    # Public-tracking credential (admissions-v2 task 10.5, R13.12 / STU-22).
    # A split token: ``tracking_selector`` is the non-secret indexed lookup half,
    # ``tracking_secret_hash`` is the SHA-256 of the secret half. The plaintext is
    # returned to the owner once at issue time and is never stored, so a database
    # reader cannot track an application. Issuing a new link revokes the previous
    # one (``tracking_secret_revoked_at``); a revoked secret resolves to the same
    # masked 404 an unknown one does.
    #
    # All four are NULL on legacy rows, which means exactly "no tracking secret
    # issued yet" — ``application_number`` and ``public_tracking_code`` remain in
    # the table and keep every non-authority use they had, but neither is a
    # credential any more. See
    # backend/scripts/2026_08_09_01_application_tracking_secret.sql and
    # apps/applications/tracking_secret.py.
    # Deliberately not ``unique=True``: uniqueness is the **partial** unique index
    # from the SQL script (``WHERE tracking_selector IS NOT NULL``), so the index
    # holds only issued secrets rather than every legacy NULL row. Declaring
    # ``unique=True`` here would emit a second, different column-level constraint
    # on the test database and make the two schemas disagree.
    tracking_selector = models.CharField(max_length=16, null=True, blank=True)
    tracking_secret_hash = models.CharField(max_length=64, null=True, blank=True)
    tracking_secret_issued_at = models.DateTimeField(null=True, blank=True)
    tracking_secret_revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'applications'

    def __str__(self):
        return f"{self.application_number} — {self.full_name}"


class ApplicationStatusHistory(models.Model):
    """Maps to 'application_status_history' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    status = models.CharField(max_length=32)
    changed_by = models.ForeignKey(
        'accounts.Profile', on_delete=models.SET_NULL, null=True, blank=True,
        db_column='changed_by',
    )
    notes = models.TextField(null=True, blank=True)
    changes = models.JSONField(null=True, blank=True)
    ip_address = models.CharField(max_length=64, null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    old_status = models.TextField(null=True, blank=True)
    new_status = models.TextField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'application_status_history'

    def __str__(self):
        return f"{self.application_id}: {self.old_status} → {self.new_status}"


class ApplicationDraft(models.Model):
    """Deprecated compatibility cache for wizard payloads.

    Canonical online drafts are ``Application`` rows with ``status='draft'``.
    This unmanaged table may store a recoverable wizard snapshot linked to an
    application, but it must not drive multi-draft routing or business logic.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    draft_data = models.JSONField()
    draft_name = models.TextField(null=True, blank=True)
    step_completed = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'application_drafts'

    def __str__(self):
        return f"Draft {self.id} for user {self.user_id}"


class ApplicationInterview(models.Model):
    """Maps to 'application_interviews' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    scheduled_at = models.DateTimeField()
    mode = models.TextField()
    location = models.TextField(null=True, blank=True)
    status = models.TextField()
    notes = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_interviews',
        db_column='created_by',
    )
    updated_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_interviews',
        db_column='updated_by',
    )
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'application_interviews'

    def __str__(self):
        return f"Interview {self.id} for {self.application_id} ({self.status})"


class ApplicationCondition(models.Model):
    """Maps to 'application_conditions' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    description = models.TextField()
    condition_type = models.CharField(max_length=20, default='other')
    deadline = models.DateField()
    status = models.CharField(max_length=20, default='pending')
    met_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_conditions',
        db_column='verified_by',
    )
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'application_conditions'

    def __str__(self):
        return f"Condition {self.id} for {self.application_id} ({self.status})"


class ApplicationAmendment(models.Model):
    """Maps to 'application_amendments' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    field_name = models.CharField(max_length=50)
    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField()
    reason = models.TextField()
    status = models.CharField(max_length=20, default='pending')
    reviewed_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_amendments',
        db_column='reviewed_by',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'application_amendments'

    def __str__(self):
        return f"Amendment {self.id} on {self.field_name} for {self.application_id} ({self.status})"


class AdminSavedFilter(models.Model):
    """Maps to 'admin_saved_filters' — a named applications query (task 9.1).

    Requirements: R8.1. Findings: ADM-01 ("saved filters" were one
    ``sessionStorage`` slot, so a saved view did not survive a cleared session, a
    second device, or a colleague, and carried no tenant binding).

    A saved filter is an actor-owned, optionally institution-bound name for a set
    of *registered* applications query parameters. ``query`` is validated against
    ``ApplicationQueryService.REGISTERED_PARAMETERS`` on write, so a saved view
    can never persist a parameter the contract does not implement. The read path
    scopes by ``user_id`` before any lookup — saved filters are private to their
    owner — and re-resolves ``institution_id`` through the capability service, so
    a saved filter cannot outlive the membership that justified it.

    See ``backend/scripts/2026_08_06_01_admin_saved_filters.sql``.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        'accounts.Profile', on_delete=models.CASCADE, db_column='user_id'
    )
    institution = models.ForeignKey(
        'catalog.Institution',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        db_column='institution_id',
        related_name='admin_saved_filters',
    )
    name = models.CharField(max_length=120)
    query = models.JSONField(default=dict)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'admin_saved_filters'

    def __str__(self):
        return f"SavedFilter {self.name} ({self.user_id})"
