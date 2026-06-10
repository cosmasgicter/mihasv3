"""Shared multi-tenant fixture factory for the Beanola admissions test suite.

Phase 0 scaffolding for spec ``multi-tenant-beanola-admissions`` (task 1.1).

This module builds a complete tenant object graph against the **test DB**:

    Institution
      └─ CanonicalProgram
           └─ Program (school offering, linked via canonical_program_id)
                └─ Intake
                     └─ ProgramIntake (availability / capacity / priority)
                          └─ Application (with all four canonical IDs)
      └─ Profile (school staff)
           └─ UserInstitutionMembership (institution scope)
           └─ AccessGrant (institution / offering / application scope)

It is intentionally framework-light so it can be imported directly
(``from tests.tenant_fixtures import build_tenant_world``) or consumed via the
pytest fixtures registered in ``backend/tests/conftest.py``
(``tenant_world`` / ``tenant_world_factory``).

The tables backing these models are ``managed = False`` (SQL-script schema in
production). The session-scoped ``unmanaged_schema`` fixture in
``conftest.py`` creates them in the ephemeral test database via
``schema_editor.create_model`` before any of these helpers run, so callers
only need the pytest-django ``db`` fixture (or ``@pytest.mark.django_db``).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.accounts.models import Profile
from apps.applications.models import Application
from apps.catalog.models import (
    AccessGrant,
    CanonicalProgram,
    Institution,
    InstitutionDomain,
    Intake,
    Program,
    ProgramIntake,
    UserInstitutionMembership,
)


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------


@dataclass
class TenantWorld:
    """A fully-linked single-tenant object graph for isolation/assignment tests."""

    institution: Institution
    canonical_program: CanonicalProgram
    offering: Program
    intake: Intake
    program_intake: ProgramIntake
    student: Profile
    application: Application | None
    staff: Profile
    membership: UserInstitutionMembership
    access_grant: AccessGrant

    @property
    def institution_id(self) -> str:
        return str(self.institution.id)

    @property
    def offering_id(self) -> str:
        return str(self.offering.id)

    @property
    def canonical_program_id(self) -> str:
        return str(self.canonical_program.id)

    @property
    def intake_id(self) -> str:
        return str(self.intake.id)

    @property
    def application_id(self) -> str | None:
        return str(self.application.id) if self.application is not None else None


# ---------------------------------------------------------------------------
# Low-level builders (each persists one row)
# ---------------------------------------------------------------------------


def _suffix() -> str:
    return uuid.uuid4().hex[:8]


def build_profile(*, role: str = "student", suffix: str | None = None, **overrides: Any) -> Profile:
    """Persist a Profile row. ``role`` is ``student`` / ``admin`` / ``reviewer`` / ``super_admin``."""
    sfx = suffix or _suffix()
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "email": f"{role}-{sfx}@example.com",
        "role": role,
        "first_name": role.title(),
        "last_name": f"User-{sfx}",
        "phone": "+260970000000",
        "nationality": "Zambian",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return Profile.objects.create(**defaults)


def build_institution(*, suffix: str | None = None, is_active: bool = True, **overrides: Any) -> Institution:
    sfx = suffix or _suffix()
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "name": f"Test School {sfx}",
        "code": f"SCH-{sfx.upper()}",
        "full_name": f"Test School {sfx} of Health Sciences",
        "slug": f"test-school-{sfx}",
        "brand_name": f"Test School {sfx}",
        "primary_color": "#0F766E",
        "secondary_color": "#334155",
        "support_email": f"support-{sfx}@example.com",
        "admissions_email": f"admissions-{sfx}@example.com",
        "is_active": is_active,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return Institution.objects.create(**defaults)


def build_institution_domain(
    *,
    institution: Institution,
    hostname: str | None = None,
    is_primary: bool = True,
    is_active: bool = True,
    **overrides: Any,
) -> InstitutionDomain:
    """Persist an ``institution_domains`` row (a white-label hostname).

    Used by the host-resolution exploration tests (P10) to wire an active or
    inactive white-label domain to an institution. ``hostname`` defaults to a
    fresh unique host so callers can build several without collisions; pass an
    explicit ``hostname`` (and a second row with the same value) to model the
    duplicate-active-hostname collision case.
    """
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "institution": institution,
        "hostname": hostname if hostname is not None else f"apply-{_suffix()}.example",
        "is_primary": is_primary,
        "is_active": is_active,
        "created_at": now,
    }
    defaults.update(overrides)
    return InstitutionDomain.objects.create(**defaults)


def build_canonical_program(*, suffix: str | None = None, is_active: bool = True, **overrides: Any) -> CanonicalProgram:
    sfx = suffix or _suffix()
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "name": f"Diploma in Nursing {sfx}",
        "code": f"CANON-{sfx.upper()}",
        "description": "Canonical program definition shared across schools.",
        "duration_months": 36,
        "regulatory_body": "NMCZ",
        "is_active": is_active,
        "metadata": {},
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return CanonicalProgram.objects.create(**defaults)


def build_offering(
    *,
    institution: Institution,
    canonical_program: CanonicalProgram,
    suffix: str | None = None,
    is_active: bool = True,
    offering_status: str = "active",
    assignment_priority: int = 100,
    assignment_rules: dict[str, Any] | None = None,
    **overrides: Any,
) -> Program:
    """Persist a ``programs`` row (a school offering) linked to a canonical program."""
    sfx = suffix or _suffix()
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "name": f"Offering {sfx}",
        "code": f"OFFER-{sfx.upper()}",
        "description": "School-specific offering of the canonical program.",
        "institution": institution,
        "canonical_program": canonical_program,
        "duration_months": 36,
        "application_fee": Decimal("153.00"),
        "requirements": {},
        "is_active": is_active,
        "offering_status": offering_status,
        "assignment_priority": assignment_priority,
        "assignment_rules": assignment_rules,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return Program.objects.create(**defaults)


def build_intake(*, suffix: str | None = None, is_active: bool = True, max_capacity: int = 100, **overrides: Any) -> Intake:
    sfx = suffix or _suffix()
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "name": f"Intake {sfx}",
        "year": now.year,
        "max_capacity": max_capacity,
        "current_enrollment": 0,
        "application_deadline": (now + timedelta(days=90)).date(),
        "is_active": is_active,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return Intake.objects.create(**defaults)


def build_program_intake(
    *,
    offering: Program,
    intake: Intake,
    is_active: bool = True,
    max_capacity: int | None = 100,
    current_enrollment: int = 0,
    assignment_priority: int | None = None,
    residency_rules: dict[str, Any] | None = None,
    **overrides: Any,
) -> ProgramIntake:
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "program": offering,
        "intake": intake,
        "max_capacity": max_capacity,
        "current_enrollment": current_enrollment,
        "is_active": is_active,
        "assignment_priority": assignment_priority,
        "residency_rules": residency_rules,
        "created_at": now,
    }
    defaults.update(overrides)
    return ProgramIntake.objects.create(**defaults)


def build_application(
    *,
    student: Profile,
    institution: Institution,
    canonical_program: CanonicalProgram,
    offering: Program,
    intake: Intake,
    suffix: str | None = None,
    status: str = "draft",
    with_canonical_ids: bool = True,
    **overrides: Any,
) -> Application:
    """Persist an ``applications`` row.

    When ``with_canonical_ids`` is True (the default), the four canonical FK
    columns are populated; the legacy string snapshots are always written so
    legacy-fallback read paths can be exercised too. Set
    ``with_canonical_ids=False`` to model a pre-migration legacy row.
    """
    sfx = suffix or _suffix()
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "application_number": f"APP-{now.strftime('%Y%m%d')}-{sfx.upper()}",
        "public_tracking_code": f"TRK-{uuid.uuid4().hex[:12].upper()}",
        "user": student,
        "full_name": f"Applicant {sfx}",
        "nrc_number": "123456/78/9",
        "passport_number": "",
        "date_of_birth": date(2000, 1, 1),
        "sex": "Female",
        "phone": "+260970000001",
        "email": f"applicant-{sfx}@example.com",
        "residence_town": "Lusaka",
        "nationality": "Zambian",
        "country": "Zambia",
        # Legacy string snapshots (immutable display fields).
        "program": canonical_program.name,
        "intake": intake.name,
        "institution": institution.name,
        "status": status,
        "version": 1,
        "created_at": now,
        "updated_at": now,
    }
    if with_canonical_ids:
        defaults.update(
            {
                "institution_ref": institution,
                "canonical_program": canonical_program,
                "program_offering": offering,
                "intake_ref": intake,
            }
        )
    defaults.update(overrides)
    return Application.objects.create(**defaults)


def build_membership(
    *,
    user: Profile,
    institution: Institution,
    role: str = "admin",
    is_active: bool = True,
    **overrides: Any,
) -> UserInstitutionMembership:
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "user": user,
        "institution": institution,
        "role": role,
        "permissions": [],
        "is_active": is_active,
        "created_at": now,
    }
    defaults.update(overrides)
    return UserInstitutionMembership.objects.create(**defaults)


def build_access_grant(
    *,
    user: Profile,
    scope_type: str = "institution",
    institution: Institution | None = None,
    program: Program | None = None,
    application_id: str | uuid.UUID | None = None,
    expires_at: Any = None,
    is_active: bool = True,
    **overrides: Any,
) -> AccessGrant:
    """Persist an ``access_grants`` row.

    ``scope_type`` is one of ``institution`` / ``offering`` / ``application``.
    Only the column matching the scope is set unless explicitly overridden.
    """
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "user": user,
        "scope_type": scope_type,
        "institution": institution if scope_type == "institution" else overrides.pop("institution_override", None),
        "program": program if scope_type == "offering" else None,
        "application_id": application_id if scope_type == "application" else None,
        "permissions": [],
        "expires_at": expires_at,
        "is_active": is_active,
        "created_at": now,
    }
    # Allow explicit institution attachment for offering/application grants
    # only when the caller passes it directly via overrides.
    defaults.update(overrides)
    return AccessGrant.objects.create(**defaults)


# ---------------------------------------------------------------------------
# High-level factory
# ---------------------------------------------------------------------------


def build_tenant_world(
    *,
    suffix: str | None = None,
    is_active: bool = True,
    offering_status: str = "active",
    assignment_priority: int = 100,
    program_intake_priority: int | None = None,
    residency_rules: dict[str, Any] | None = None,
    assignment_rules: dict[str, Any] | None = None,
    max_capacity: int | None = 100,
    current_enrollment: int = 0,
    with_application: bool = True,
    application_status: str = "draft",
    with_canonical_ids: bool = True,
    staff_role: str = "admin",
    grant_scope: str = "institution",
    grant_expires_at: Any = None,
    canonical_program: CanonicalProgram | None = None,
) -> TenantWorld:
    """Build and persist a complete single-tenant object graph.

    Pass an existing ``canonical_program`` to model two schools offering the
    *same* canonical program (used by duplicate-by-canonical and cross-tenant
    isolation tests). All other rows are created fresh per call so worlds are
    independent by default.
    """
    sfx = suffix or _suffix()

    institution = build_institution(suffix=sfx, is_active=is_active)
    canonical = canonical_program or build_canonical_program(suffix=sfx, is_active=is_active)
    offering = build_offering(
        institution=institution,
        canonical_program=canonical,
        suffix=sfx,
        is_active=is_active,
        offering_status=offering_status,
        assignment_priority=assignment_priority,
        assignment_rules=assignment_rules,
    )
    intake = build_intake(suffix=sfx, is_active=is_active, max_capacity=max_capacity or 100)
    program_intake = build_program_intake(
        offering=offering,
        intake=intake,
        is_active=is_active,
        max_capacity=max_capacity,
        current_enrollment=current_enrollment,
        assignment_priority=program_intake_priority,
        residency_rules=residency_rules,
    )

    student = build_profile(role="student", suffix=f"stu-{sfx}")
    application = None
    if with_application:
        application = build_application(
            student=student,
            institution=institution,
            canonical_program=canonical,
            offering=offering,
            intake=intake,
            suffix=sfx,
            status=application_status,
            with_canonical_ids=with_canonical_ids,
        )

    staff = build_profile(role=staff_role, suffix=f"staff-{sfx}")
    membership = build_membership(user=staff, institution=institution, role=staff_role)

    grant_kwargs: dict[str, Any] = {"user": staff, "scope_type": grant_scope, "expires_at": grant_expires_at}
    if grant_scope == "institution":
        grant_kwargs["institution"] = institution
    elif grant_scope == "offering":
        grant_kwargs["program"] = offering
    elif grant_scope == "application" and application is not None:
        grant_kwargs["application_id"] = application.id
    access_grant = build_access_grant(**grant_kwargs)

    return TenantWorld(
        institution=institution,
        canonical_program=canonical,
        offering=offering,
        intake=intake,
        program_intake=program_intake,
        student=student,
        application=application,
        staff=staff,
        membership=membership,
        access_grant=access_grant,
    )


def build_two_tenant_worlds(**kwargs: Any) -> tuple[TenantWorld, TenantWorld]:
    """Build two independent tenant worlds that share one canonical program.

    Useful for cross-tenant isolation (P6/P9) and duplicate-by-canonical
    (P11) exploration: both schools offer the same canonical program, but
    staff/memberships/applications belong to different institutions.
    """
    shared_canonical = build_canonical_program()
    world_a = build_tenant_world(canonical_program=shared_canonical, **kwargs)
    world_b = build_tenant_world(canonical_program=shared_canonical, **kwargs)
    return world_a, world_b


# ---------------------------------------------------------------------------
# Multi-offering assignment scenarios (P1/P2 — task 1.3)
# ---------------------------------------------------------------------------


@dataclass
class AssignmentCandidate:
    """One offering + its program-intake link for a shared canonical program + intake."""

    offering: Program
    program_intake: ProgramIntake

    @property
    def offering_priority(self) -> int | None:
        return self.offering.assignment_priority

    @property
    def program_intake_priority(self) -> int | None:
        return self.program_intake.assignment_priority


@dataclass
class AssignmentScenario:
    """A canonical program + intake offered by several candidate offerings.

    Used by the P1/P2 assignment exploration tests: every candidate competes
    for the same ``(canonical_program, intake)`` so ``OfferingAssignmentService``
    must pick exactly one deterministically.
    """

    institution: Institution
    canonical_program: CanonicalProgram
    intake: Intake
    candidates: list[AssignmentCandidate]

    @property
    def canonical_program_id(self) -> str:
        return str(self.canonical_program.id)

    @property
    def intake_id(self) -> str:
        return str(self.intake.id)

    @property
    def institution_id(self) -> str:
        return str(self.institution.id)

    @property
    def offerings(self) -> list[Program]:
        return [c.offering for c in self.candidates]


@dataclass
class CandidateSpec:
    """Declarative spec for one candidate offering in an assignment scenario.

    ``offering_priority`` maps to ``programs.assignment_priority`` and
    ``program_intake_priority`` maps to ``program_intakes.assignment_priority``
    (``None`` models a legacy-null priority). ``code`` lets a test pin the
    deterministic tie-break key explicitly.
    """

    offering_priority: int | None = 100
    program_intake_priority: int | None = None
    code: str | None = None
    offering_status: str = "active"
    is_active: bool = True
    assignment_rules: dict[str, Any] | None = None
    residency_rules: dict[str, Any] | None = None
    max_capacity: int | None = 100
    current_enrollment: int = 0
    program_intake_is_active: bool = True


def build_assignment_scenario(
    specs: list[CandidateSpec],
    *,
    suffix: str | None = None,
    institution: Institution | None = None,
    canonical_program: CanonicalProgram | None = None,
    intake: Intake | None = None,
    intake_max_capacity: int = 1000,
) -> AssignmentScenario:
    """Build N candidate offerings for one shared canonical program + intake.

    Each :class:`CandidateSpec` becomes one ``programs`` row (offering) plus a
    ``program_intakes`` row linking it to the single shared intake, with the
    requested offering / program-intake priorities, rules, status, and
    capacity. All candidates belong to ``institution`` (created if omitted) so
    they genuinely compete for the same assignment.
    """
    sfx = suffix or _suffix()
    inst = institution or build_institution(suffix=sfx)
    canonical = canonical_program or build_canonical_program(suffix=sfx)
    shared_intake = intake or build_intake(suffix=sfx, max_capacity=intake_max_capacity)

    candidates: list[AssignmentCandidate] = []
    for index, spec in enumerate(specs):
        candidate_sfx = f"{sfx}-{index:02d}"
        offering_kwargs: dict[str, Any] = {
            "institution": inst,
            "canonical_program": canonical,
            "suffix": candidate_sfx,
            "is_active": spec.is_active,
            "offering_status": spec.offering_status,
            "assignment_priority": spec.offering_priority,
            "assignment_rules": spec.assignment_rules,
        }
        if spec.code is not None:
            offering_kwargs["code"] = spec.code
        offering = build_offering(**offering_kwargs)
        program_intake = build_program_intake(
            offering=offering,
            intake=shared_intake,
            is_active=spec.program_intake_is_active,
            max_capacity=spec.max_capacity,
            current_enrollment=spec.current_enrollment,
            assignment_priority=spec.program_intake_priority,
            residency_rules=spec.residency_rules,
        )
        candidates.append(AssignmentCandidate(offering=offering, program_intake=program_intake))

    return AssignmentScenario(
        institution=inst,
        canonical_program=canonical,
        intake=shared_intake,
        candidates=candidates,
    )


@dataclass
class WhiteLabelScenario:
    """Several institutions each offering the *same* canonical program + intake.

    Models the white-label assignment case (R2.2): a single canonical program +
    intake is offered by ≥2 distinct institutions, each with one or more
    candidate offerings. ``OfferingAssignmentService.assign(institution_id=...)``
    must restrict candidates to exactly that institution and never fall back to
    another institution's offerings.
    """

    canonical_program: CanonicalProgram
    intake: Intake
    scenarios: list[AssignmentScenario]

    @property
    def canonical_program_id(self) -> str:
        return str(self.canonical_program.id)

    @property
    def intake_id(self) -> str:
        return str(self.intake.id)

    @property
    def institutions(self) -> list[Institution]:
        return [s.institution for s in self.scenarios]

    @property
    def all_candidates(self) -> list[AssignmentCandidate]:
        return [c for s in self.scenarios for c in s.candidates]


def build_white_label_scenario(
    per_institution_specs: list[list[CandidateSpec]],
    *,
    suffix: str | None = None,
    intake_max_capacity: int = 10_000,
) -> WhiteLabelScenario:
    """Build N institutions sharing one canonical program + intake.

    ``per_institution_specs`` is a list of :class:`CandidateSpec` lists — one
    list per institution. Every institution is created fresh (distinct
    ``institutions.id``) but all candidates link to the **same** canonical
    program and intake so they genuinely compete for the same assignment, with
    the white-label ``institution_id`` filter as the only discriminator.
    """
    sfx = suffix or _suffix()
    canonical = build_canonical_program(suffix=sfx)
    intake = build_intake(suffix=sfx, max_capacity=intake_max_capacity)
    scenarios: list[AssignmentScenario] = []
    for index, specs in enumerate(per_institution_specs):
        scenarios.append(
            build_assignment_scenario(
                specs,
                suffix=f"{sfx}-wl{index:02d}",
                canonical_program=canonical,
                intake=intake,
            )
        )
    return WhiteLabelScenario(
        canonical_program=canonical,
        intake=intake,
        scenarios=scenarios,
    )


# ---------------------------------------------------------------------------
# Access-scope helpers (P6 / P7 / P8 — task 1.5)
# ---------------------------------------------------------------------------

# Imported lazily-friendly: Payment / ApplicationDocument live in the documents
# app. They are imported at module level here because tenant_fixtures is only
# ever imported inside a configured-Django test process.
from apps.documents.models import ApplicationDocument, Payment  # noqa: E402


def build_payment(
    *,
    application: Application,
    user: Profile | None = None,
    amount: Decimal | str = Decimal("153.00"),
    status: str = "successful",
    **overrides: Any,
) -> Payment:
    """Persist a ``payments`` row for an application.

    Used by the cross-tenant isolation tests (P6) to prove
    ``AccessScopeService.filter_payments`` never leaks another school's
    payment. ``user`` defaults to the application's owner.
    """
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "application": application,
        "user": user or application.user,
        "amount": Decimal(amount) if not isinstance(amount, Decimal) else amount,
        "currency": "ZMW",
        "status": status,
        "metadata": {},
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return Payment.objects.create(**defaults)


def build_document(
    *,
    application: Application,
    document_type: str = "nrc",
    document_name: str | None = None,
    **overrides: Any,
) -> ApplicationDocument:
    """Persist an ``application_documents`` row for an application.

    Used by the cross-tenant isolation tests (P6) to prove
    ``AccessScopeService.filter_documents`` never leaks another school's
    document.
    """
    now = timezone.now()
    defaults: dict[str, Any] = {
        "id": uuid.uuid4(),
        "application": application,
        "document_type": document_type,
        "document_name": document_name or f"{document_type}-{_suffix()}.pdf",
        "verification_status": "pending",
        "uploaded_at": now,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return ApplicationDocument.objects.create(**defaults)


def build_offering_with_application(
    *,
    institution: Institution,
    canonical_program: CanonicalProgram,
    intake: Intake,
    student: Profile,
    suffix: str | None = None,
    offering_status: str = "active",
    assignment_priority: int = 100,
    application_status: str = "draft",
) -> tuple[Program, Application]:
    """Build one extra offering (+ program-intake + application) inside an
    existing institution.

    Reused by the grant-width tests (P8) to populate a single institution with
    several offerings/applications so we can prove that an offering- or
    application-scoped grant never widens to the rest of the institution.
    """
    sfx = suffix or _suffix()
    offering = build_offering(
        institution=institution,
        canonical_program=canonical_program,
        suffix=sfx,
        offering_status=offering_status,
        assignment_priority=assignment_priority,
    )
    build_program_intake(offering=offering, intake=intake)
    application = build_application(
        student=student,
        institution=institution,
        canonical_program=canonical_program,
        offering=offering,
        intake=intake,
        suffix=sfx,
        status=application_status,
    )
    return offering, application


def attach_scope(
    staff: Profile,
    world: "TenantWorld",
    kind: str,
    *,
    expires_at: Any = None,
):
    """Attach exactly one scope of ``kind`` to ``staff`` targeting ``world``.

    ``kind`` is one of:

    - ``"membership"`` — an active ``UserInstitutionMembership`` to the world's
      institution.
    - ``"institution_grant"`` — an institution-scoped ``AccessGrant``.
    - ``"offering_grant"`` — an offering-scoped ``AccessGrant`` to the world's
      single offering.
    - ``"application_grant"`` — an application-scoped ``AccessGrant`` to the
      world's application.

    Returns the created membership/grant row. ``expires_at`` only applies to
    grant kinds (memberships have no expiry column in this model).
    """
    if kind == "membership":
        return build_membership(
            user=staff, institution=world.institution, role=getattr(staff, "role", "admin")
        )
    if kind == "institution_grant":
        return build_access_grant(
            user=staff,
            scope_type="institution",
            institution=world.institution,
            expires_at=expires_at,
        )
    if kind == "offering_grant":
        return build_access_grant(
            user=staff,
            scope_type="offering",
            program=world.offering,
            expires_at=expires_at,
        )
    if kind == "application_grant":
        if world.application is None:
            raise ValueError("world has no application to grant access to")
        return build_access_grant(
            user=staff,
            scope_type="application",
            application_id=world.application.id,
            expires_at=expires_at,
        )
    raise ValueError(f"unknown scope kind: {kind!r}")


def build_tenant_worlds(
    count: int,
    *,
    share_canonical: bool = True,
    **kwargs: Any,
) -> list["TenantWorld"]:
    """Build ``count`` independent tenant worlds (distinct institutions).

    When ``share_canonical`` is True (the default) every world offers the same
    canonical program (the realistic multi-school case used by cross-tenant
    isolation tests); the institutions, offerings, intakes, applications, and
    staff are always distinct. Returns a list of :class:`TenantWorld`.
    """
    shared = build_canonical_program() if share_canonical else None
    worlds: list[TenantWorld] = []
    for _ in range(count):
        worlds.append(build_tenant_world(canonical_program=shared, **kwargs))
    return worlds
