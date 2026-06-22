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
    program = models.ForeignKey(Program, on_delete=models.CASCADE)
    intake = models.ForeignKey(Intake, on_delete=models.CASCADE)
    max_capacity = models.IntegerField(null=True, blank=True)
    current_enrollment = models.IntegerField(null=True, blank=True, default=0)
    created_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    assignment_priority = models.IntegerField(null=True, blank=True)
    residency_rules = models.JSONField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'program_intakes'

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
    # Domain verification lifecycle states (R7.2). Only ``active`` resolves a
    # tenant; the DomainStatusMachine (services.py, Task 7.1) governs which
    # transitions between these are permitted.
    STATUS_PENDING_DNS = "pending_dns"
    STATUS_PENDING_REVIEW = "pending_review"
    STATUS_VERIFIED = "verified"
    STATUS_ACTIVE = "active"
    STATUS_DISABLED = "disabled"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = (
        (STATUS_PENDING_DNS, "Pending DNS"),
        (STATUS_PENDING_REVIEW, "Pending review"),
        (STATUS_VERIFIED, "Verified"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_DISABLED, "Disabled"),
        (STATUS_FAILED, "Failed"),
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
