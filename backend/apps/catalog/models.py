"""Catalog models - maps to existing Neon Postgres tables."""

import uuid

from django.db import models


class Institution(models.Model):
    """Maps to 'institutions' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    type = models.CharField(max_length=100, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    email = models.CharField(max_length=255, null=True, blank=True)
    website = models.CharField(max_length=255, null=True, blank=True)
    accreditation_status = models.CharField(max_length=50, null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    full_name = models.CharField(max_length=500, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    slug = models.CharField(max_length=80, null=True, blank=True)
    brand_name = models.CharField(max_length=255, null=True, blank=True)
    primary_color = models.CharField(max_length=20, null=True, blank=True)
    secondary_color = models.CharField(max_length=20, null=True, blank=True)
    support_email = models.CharField(max_length=255, null=True, blank=True)
    admissions_email = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'institutions'

    def __str__(self):
        return f"{self.name} ({self.code})"


class Program(models.Model):
    """The **Institution_Program_Offering** concept (R8.2).

    Maps to the ``programs`` table. A ``Program`` row is a single tenant's
    offering of a :class:`CanonicalProgram` (``canonical_program_id``) under a
    given ``institution``. ``offering_status`` gates whether the offering is
    listed in a portal. Students apply against a ``Program`` (the offering), not
    against the global :class:`CanonicalProgram` (R8.5). Assigning a canonical
    program to a tenant — i.e. creating/owning a ``Program`` offering — is a
    Super_Admin action (R8.8); a Tenant_Admin may only request offering changes
    (``tenant.program.request_change``).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(null=True, blank=True)
    duration_months = models.IntegerField(null=True, blank=True)
    application_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    tuition_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    requirements = models.JSONField(null=True, blank=True)
    regulatory_body = models.CharField(max_length=100, null=True, blank=True)
    accreditation_status = models.CharField(max_length=50, null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE, null=True, blank=True)
    canonical_program = models.ForeignKey(
        "CanonicalProgram", on_delete=models.SET_NULL, null=True, blank=True,
        db_column="canonical_program_id",
    )
    assignment_priority = models.IntegerField(null=True, blank=True, default=100)
    offering_status = models.CharField(max_length=32, null=True, blank=True, default="active")
    assignment_rules = models.JSONField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'programs'

    def __str__(self):
        return f"{self.name} ({self.code})"


class CanonicalProgram(models.Model):
    """The **Canonical_Program** concept (R8.1).

    A global, Beanola-owned program definition (``canonical_programs`` table).
    Each tenant's participation is a :class:`Program` offering that points back
    here via ``canonical_program_id``. Only a Super_Admin may alter canonical
    programs or assign them to tenants (R8.8)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=80, unique=True)
    description = models.TextField(null=True, blank=True)
    duration_months = models.IntegerField(null=True, blank=True)
    regulatory_body = models.CharField(max_length=100, null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    metadata = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "canonical_programs"

    def __str__(self):
        return f"{self.name} ({self.code})"


class Intake(models.Model):
    """Maps to 'intakes' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    year = models.IntegerField(null=True, blank=True)
    semester = models.CharField(max_length=50, null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    application_start_date = models.DateField(null=True, blank=True)
    application_deadline = models.DateField(null=True, blank=True)
    max_capacity = models.IntegerField(null=True, blank=True)
    current_enrollment = models.IntegerField(null=True, blank=True, default=0)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    grace_period_days = models.IntegerField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'intakes'

    def __str__(self):
        return f"{self.name} ({self.year})"


class ProgramIntake(models.Model):
    """The **Intake_Offering** concept (R8.4).

    Maps to the ``program_intakes`` table. Links a tenant's :class:`Program`
    offering to a global :class:`Intake` period (plus residency/availability
    rules), expressing that the offering is available in that intake."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, db_constraint=False)
    intake = models.ForeignKey(Intake, on_delete=models.CASCADE, db_constraint=False)
    max_capacity = models.IntegerField(null=True, blank=True)
    current_enrollment = models.IntegerField(null=True, blank=True, default=0)
    created_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    assignment_priority = models.IntegerField(null=True, blank=True)
    residency_rules = models.JSONField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'program_intakes'
        unique_together = [('program', 'intake')]

    def __str__(self):
        return f"{self.program_id} × {self.intake_id}"


class Subject(models.Model):
    """Maps to 'subjects' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, null=True, blank=True, unique=True)
    category = models.CharField(max_length=100, null=True, blank=True)
    is_core = models.BooleanField(null=True, blank=True, default=False)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    curriculum_type = models.CharField(max_length=20, null=True, blank=True, default='ecz')
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'subjects'

    def __str__(self):
        return f"{self.name} ({self.code})"


class CourseRequirement(models.Model):
    """Maps to 'course_requirements' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, null=True, blank=True)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, null=True, blank=True)
    is_mandatory = models.BooleanField(null=True, blank=True)
    minimum_grade = models.IntegerField()  # 1-9 ECZ scale
    weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    requirement_type = models.CharField(max_length=50, null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'course_requirements'

    def __str__(self):
        return f"{self.program_id} requires {self.subject_id} ≤ grade {self.minimum_grade}"


class AcademicCalendarEvent(models.Model):
    """Maps to 'academic_calendar_events' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    intake = models.ForeignKey(Intake, on_delete=models.CASCADE)
    event_type = models.CharField(max_length=50)
    event_date = models.DateField()
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'academic_calendar_events'

    def __str__(self):
        return f"{self.event_type} for intake {self.intake_id} on {self.event_date}"


class InstitutionAsset(models.Model):
    """Versioned school-owned image assets used by official documents."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    asset_type = models.CharField(max_length=40)
    storage_key = models.CharField(max_length=500)
    public_url = models.CharField(max_length=500, null=True, blank=True)
    mime_type = models.CharField(max_length=100)
    checksum_sha256 = models.CharField(max_length=64)
    version = models.IntegerField(default=1)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey("accounts.Profile", on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        managed = False
        db_table = "institution_assets"


class InstitutionDocumentTemplate(models.Model):
    """Safe configurable official document template, not arbitrary file merge."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    document_type = models.CharField(max_length=60)
    name = models.CharField(max_length=255)
    version = models.IntegerField(default=1)
    sections = models.JSONField(default=dict)
    tokens = models.JSONField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey("accounts.Profile", on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        managed = False
        db_table = "institution_document_templates"


class InstitutionRequiredDocument(models.Model):
    """Part of the **Offering_Requirement** concept (R8.3).

    Tenant-specific required documents attached to a :class:`Program` offering
    (and/or a :class:`CanonicalProgram`). Together with
    :class:`InstitutionDocumentProfile` (fees, payment rules, eligibility,
    templates) this models the per-offering requirements a Student must satisfy.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, null=True, blank=True)
    canonical_program = models.ForeignKey(CanonicalProgram, on_delete=models.CASCADE, null=True, blank=True)
    document_type = models.CharField(max_length=80)
    label = models.CharField(max_length=255)
    is_required = models.BooleanField(default=True)
    rules = models.JSONField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "institution_required_documents"


class InstitutionDocumentProfile(models.Model):
    """Rich tenant document profile (fee charts, bank accounts, requirements).

    Together with :class:`InstitutionRequiredDocument` this is the
    **Offering_Requirement** concept (R8.3) — the tenant-specific documents,
    payment rules, eligibility, and templates attached to a :class:`Program`
    offering (an Institution_Program_Offering). This model carries the rich
    side (fees, bank accounts, signatory, layout); the required-document side
    lives on :class:`InstitutionRequiredDocument`.

    Resolved most-specific-first per (institution, document_type) scope:
    offering+intake -> offering -> canonical+intake -> canonical -> default.
    Backed by the additive ``institution_document_profiles`` SQL migration
    (``backend/scripts/2026_06_08_03_institution_document_profiles.sql``);
    ``managed = False`` so the test ``unmanaged_schema`` fixture mirrors it.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    document_type = models.CharField(max_length=60)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, null=True, blank=True)
    canonical_program = models.ForeignKey(
        CanonicalProgram, on_delete=models.CASCADE, null=True, blank=True
    )
    intake = models.ForeignKey(Intake, on_delete=models.CASCADE, null=True, blank=True)
    layout_key = models.CharField(max_length=80, default="simple_letter")
    sections = models.JSONField(default=dict)
    fee_chart = models.JSONField(default=list)
    bank_accounts = models.JSONField(default=list)
    requirements = models.JSONField(default=list)
    signatory = models.JSONField(default=dict)
    rules = models.JSONField(null=True, blank=True)
    version = models.IntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        "accounts.Profile", on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "institution_document_profiles"


class InstitutionDomain(models.Model):
    # Domain verification lifecycle states (R5.1 / R7.2). Only ``active``
    # resolves a tenant; the DomainStatusMachine (services.py) governs which
    # transitions between these are permitted.
    #
    # Names map 1:1 onto the admissions-v2 design §6.3 state machine, which uses
    # the conceptual aliases ``pending_verification`` (== ``pending_dns``, the
    # verification-pending entry state) and ``verification_failed`` (==
    # ``failed``). The DB values keep the ``pending_dns``/``failed`` spelling the
    # ``institution_domains.status`` column and enterprise-tenancy steering
    # already use, so no rename/schema change is needed to add ``rejected``
    # (the column is ``varchar(20)`` with no CHECK constraint).
    STATUS_PENDING_DNS = "pending_dns"
    STATUS_PENDING_REVIEW = "pending_review"
    STATUS_VERIFIED = "verified"
    STATUS_ACTIVE = "active"
    STATUS_DISABLED = "disabled"
    STATUS_FAILED = "failed"
    # Task 4.4 (R5.1): an operator can reject a domain that has passed DNS
    # verification but should not be approved. A rejected domain never routes a
    # tenant and can only re-enter the lifecycle via a retry (rejected ->
    # pending_dns), per design §6.3 ``pending_review -> rejected ->
    # pending_verification``.
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = (
        (STATUS_PENDING_DNS, "Pending DNS"),
        (STATUS_PENDING_REVIEW, "Pending review"),
        (STATUS_VERIFIED, "Verified"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_DISABLED, "Disabled"),
        (STATUS_FAILED, "Failed"),
        (STATUS_REJECTED, "Rejected"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    hostname = models.CharField(max_length=255, unique=True)
    is_primary = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE
    )
    verification_token = models.CharField(max_length=128, null=True, blank=True)
    dns_target = models.CharField(max_length=255, null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=1000, null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.Profile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_institution_domains",
    )
    approved_by = models.ForeignKey(
        "accounts.Profile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_institution_domains",
    )

    class Meta:
        managed = False
        db_table = "institution_domains"


class TenantOnboarding(models.Model):
    """Durable, resumable tenant onboarding workflow aggregate (R4.1-R4.6).

    Maps to the ``tenant_onboarding`` table (additive SQL migration
    ``backend/scripts/2026_07_20_01_tenant_onboarding.sql``; ``managed = False``
    so the test ``unmanaged_schema`` fixture mirrors it). One row per
    institution tracks the design §6.1 workflow: ``state`` walks
    ``draft -> in_review -> active`` (with ``rejected`` / ``cancelled`` /
    ``suspended`` branches), ``current_step`` powers resume UX, ``steps`` is the
    per-step completion snapshot, ``blockers`` caches the last computed
    launch-readiness blockers, and ``idempotency_key`` makes the ``begin``
    command replay-safe.

    The institution is created **inactive** by the ``begin`` command; only the
    audited activation command (``TenantOnboardingService.activate``) flips
    ``institutions.is_active`` true, and only when live-recomputed blockers are
    empty (R4.1, R4.6). The :class:`OnboardingStateMachine` in
    ``onboarding_service.py`` is the single authority for permitted transitions.
    """

    STATE_DRAFT = "draft"
    STATE_IN_REVIEW = "in_review"
    STATE_ACTIVE = "active"
    STATE_REJECTED = "rejected"
    STATE_CANCELLED = "cancelled"
    STATE_SUSPENDED = "suspended"
    STATE_CHOICES = (
        (STATE_DRAFT, "Draft"),
        (STATE_IN_REVIEW, "In review"),
        (STATE_ACTIVE, "Active"),
        (STATE_REJECTED, "Rejected"),
        (STATE_CANCELLED, "Cancelled"),
        (STATE_SUSPENDED, "Suspended"),
    )
    #: Terminal states with no outbound transition.
    TERMINAL_STATES = frozenset({STATE_REJECTED, STATE_CANCELLED})

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    state = models.CharField(max_length=20, choices=STATE_CHOICES, default=STATE_DRAFT)
    current_step = models.CharField(max_length=50, null=True, blank=True)
    configuration_version = models.IntegerField(default=1)
    steps = models.JSONField(default=dict)
    blockers = models.JSONField(default=list)
    last_error = models.TextField(null=True, blank=True)
    idempotency_key = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.Profile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_tenant_onboardings",
    )
    activated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "tenant_onboarding"

    def __str__(self):
        return f"Onboarding[{self.state}] for institution {self.institution_id}"


class TenantChangeRequest(models.Model):
    """Durable tenant change request for a protected profile/program/domain edit (R5.4, R5.5).

    Maps to the ``tenant_change_requests`` table (additive SQL migration
    ``backend/scripts/2026_07_22_01_tenant_change_requests.sql``;
    ``managed = False`` so the test ``unmanaged_schema`` fixture materialises it
    via ``create_model``). One row is the durable artefact behind finding
    TEN-06: a Tenant_Admin who cannot directly mutate protected configuration
    SUBMITS a typed request; a Platform_Admin reviews it and, on approval, the
    backend applies it transactionally through the **same** canonical
    configuration command a Platform_Admin uses directly (design §6.4), recording
    redacted ``before_data`` / ``after_data`` snapshots (no secrets / unnecessary
    PII, R5.5).

    ``status`` walks the design §6.4 machine ``draft -> submitted -> approved ->
    applied`` with ``submitted -> rejected`` and ``draft/submitted -> cancelled``
    branches; :class:`~apps.catalog.change_request_service.TenantChangeRequestStateMachine`
    is the single authority for permitted transitions. ``change_kind`` selects
    the typed payload shape and the canonical apply command; the ``payload`` is
    re-validated at apply time (design §6.4).
    """

    KIND_PROFILE = "profile"
    KIND_PROGRAM = "program"
    KIND_DOMAIN = "domain"
    KIND_CHOICES = (
        (KIND_PROFILE, "Profile"),
        (KIND_PROGRAM, "Program"),
        (KIND_DOMAIN, "Domain"),
    )

    STATUS_DRAFT = "draft"
    STATUS_SUBMITTED = "submitted"
    STATUS_APPROVED = "approved"
    STATUS_APPLIED = "applied"
    STATUS_REJECTED = "rejected"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = (
        (STATUS_DRAFT, "Draft"),
        (STATUS_SUBMITTED, "Submitted"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_APPLIED, "Applied"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_CANCELLED, "Cancelled"),
    )
    #: Terminal states with no outbound transition.
    TERMINAL_STATUSES = frozenset({STATUS_APPLIED, STATUS_REJECTED, STATUS_CANCELLED})

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    change_kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    payload = models.JSONField(default=dict)
    target_object_id = models.UUIDField(null=True, blank=True)
    configuration_version = models.IntegerField(default=1)
    before_data = models.JSONField(null=True, blank=True)
    after_data = models.JSONField(null=True, blank=True)
    review_note = models.TextField(null=True, blank=True)
    last_error = models.TextField(null=True, blank=True)
    idempotency_key = models.TextField(null=True, blank=True)
    requested_by = models.ForeignKey(
        "accounts.Profile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_tenant_change_requests",
    )
    reviewed_by = models.ForeignKey(
        "accounts.Profile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_tenant_change_requests",
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "tenant_change_requests"

    def __str__(self):
        return f"ChangeRequest[{self.change_kind}/{self.status}] for institution {self.institution_id}"


class UserInstitutionMembership(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.Profile", on_delete=models.CASCADE)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    role = models.CharField(max_length=50)
    permissions = models.JSONField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.Profile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_institution_memberships",
    )

    class Meta:
        managed = False
        db_table = "user_institution_memberships"


class TenantStaffInvitation(models.Model):
    """Durable tenant staff invitation + membership-handoff record (R4.3-R4.4, R6.3).

    Maps to the ``tenant_staff_invitations`` table (additive SQL migration
    ``backend/scripts/2026_07_21_01_tenant_staff_invitations.sql``;
    ``managed = False`` so the test ``unmanaged_schema`` fixture mirrors it).

    This is the handoff artefact that replaces the fragile client multi-call
    invite (TEN-01). ``StaffInvitationService.invite`` creates the identity
    (:class:`~apps.accounts.models.Profile`), this invitation, and the
    :class:`UserInstitutionMembership` in **one transaction** (R4.3), storing
    only the SHA-256 ``token_hash`` of a single-use token — never a plaintext
    password (R4.3). The invitee sets their own password by consuming the token
    (the accept "handoff"); ``token_hash`` is cleared once accepted/revoked so a
    used token cannot be replayed. A failed invite is a transaction rollback, so
    no orphan identity/membership remains (R4.4). Invitations are searched and
    created by email (R6.3), never by pasting a raw profile UUID (TEN-05).
    """

    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_REVOKED = "revoked"
    STATUS_EXPIRED = "expired"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_REVOKED, "Revoked"),
        (STATUS_EXPIRED, "Expired"),
    )
    #: Terminal statuses with no live token.
    TERMINAL_STATUSES = frozenset({STATUS_ACCEPTED, STATUS_REVOKED})

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    email = models.EmailField(max_length=255)
    invited_role = models.CharField(max_length=50, default="admin")
    permissions = models.JSONField(null=True, blank=True, default=list)
    token_hash = models.CharField(max_length=64, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    profile = models.ForeignKey(
        "accounts.Profile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_invitations",
    )
    membership = models.ForeignKey(
        "UserInstitutionMembership",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_invitations",
    )
    invited_by = models.ForeignKey(
        "accounts.Profile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issued_staff_invitations",
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    resend_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "tenant_staff_invitations"

    def __str__(self):
        return f"Invitation[{self.status}] {self.email} -> institution {self.institution_id}"


class AccessGrant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.Profile", on_delete=models.CASCADE)
    scope_type = models.CharField(max_length=40)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE, null=True, blank=True)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, null=True, blank=True)
    application_id = models.UUIDField(null=True, blank=True)
    permissions = models.JSONField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.Profile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_access_grants",
    )

    class Meta:
        managed = False
        db_table = "access_grants"
