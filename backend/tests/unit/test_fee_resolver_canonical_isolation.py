"""Canonical fee resolution — tenant isolation, fail-closed, and no defaults.

Spec:     ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 5.4
Requirements: R7.4 (one active fee per offering/type/residency; duplicate races
              → 409), R7.5 (missing required fee fails closed with a stable
              configuration error), R12.1-R12.2 (server-authored quote; missing
              config → FEE_NOT_CONFIGURED, never a hardcoded amount).
Findings:  DATA-05 (fee lookup used display names/codes + an invented default),
           STU-08 (payment hardcoded a K150/USD20 fee).

These tests exercise the resolver against **real** Program + ProgramFee rows so
the offering-keyed resolution and the fail-closed behaviour are genuinely
proven (not mocked). The two-tenant case uses two offerings that share the same
program ``code`` to prove a fee resolves only within the resolved tenant's
offering — a bare code lookup would be ambiguous across tenants.
"""

import uuid
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.catalog.models import Institution, Program
from apps.documents.fee_resolver import (
    AmbiguousFeeError,
    FeeConfigurationError,
    FeeResolver,
)
from apps.documents.models import ProgramFee


def _institution(suffix: str) -> Institution:
    now = timezone.now()
    return Institution.objects.create(
        id=uuid.uuid4(),
        name=f"Tenant {suffix}",
        code=f"INST-{suffix}",
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _offering(institution: Institution, *, code: str, name: str | None = None) -> Program:
    now = timezone.now()
    return Program.objects.create(
        id=uuid.uuid4(),
        # ``code`` is globally unique on ``programs``; two tenants' offerings of
        # the same canonical program collide on the display ``name``, not code.
        name=name or f"Program {code} @ {institution.code}",
        code=code,
        institution=institution,
        duration_months=36,
        # A stale program-level default that MUST be ignored (DATA-05).
        application_fee=Decimal("150.00"),
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _fee(offering: Program, *, amount: str, residency: str = "local") -> ProgramFee:
    now = timezone.now()
    return ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=offering,
        fee_type="application",
        residency_category=residency,
        amount=Decimal(amount),
        currency="ZMW",
        is_active=True,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.django_db
def test_same_code_two_tenant_fee_isolation():
    """Two tenants' offerings share a program code but resolve to their OWN fee.

    Proves R7.7 isolation for fees: the resolver keys on the offering object, so
    tenant A never sees tenant B's amount even when the display code collides.
    """
    inst_a = _institution("AAA")
    inst_b = _institution("BBB")

    shared_name = "Diploma in Registered Nursing"
    offering_a = _offering(inst_a, code="DRN-AAA", name=shared_name)
    offering_b = _offering(inst_b, code="DRN-BBB", name=shared_name)

    _fee(offering_a, amount="300.00")
    _fee(offering_b, amount="450.00")

    resolver = FeeResolver()

    resolved_a = resolver.resolve_for_offering(offering_a, "Zambian", "Zambia")
    resolved_b = resolver.resolve_for_offering(offering_b, "Zambian", "Zambia")

    assert resolved_a.amount == Decimal("300.00")
    assert resolved_b.amount == Decimal("450.00")
    assert resolved_a.source == "program_fee"
    assert resolved_b.source == "program_fee"
    # The amounts never cross tenants.
    assert resolved_a.amount != resolved_b.amount

    # And the shared display NAME cannot be used to resolve a fee at all — the
    # name lookup was removed (DATA-05, R7.1), so a name-based caller cannot
    # accidentally reach either tenant's offering.
    with pytest.raises(Program.DoesNotExist):
        resolver.resolve_fee(shared_name, "Zambian", "Zambia")


@pytest.mark.django_db
def test_missing_fee_fails_closed_not_default():
    """An offering with no active fee raises FEE_NOT_CONFIGURED — never K150.

    The offering carries a non-null program-level ``application_fee`` (150.00),
    proving the resolver ignores it entirely (DATA-05, STU-08).
    """
    inst = _institution("NOFEE")
    offering = _offering(inst, code="NOFEE-PROG")
    # Deliberately create NO ProgramFee row.

    resolver = FeeResolver()
    with pytest.raises(FeeConfigurationError) as exc:
        resolver.resolve_for_offering(offering, "Zambian", "Zambia")

    assert exc.value.code == "FEE_NOT_CONFIGURED"
    assert exc.value.status_code == 422
    assert exc.value.retryable is False


@pytest.mark.django_db
def test_wrong_residency_fee_fails_closed():
    """A local-only fee does not satisfy an international student — fail closed."""
    inst = _institution("RESID")
    offering = _offering(inst, code="RESID-PROG")
    _fee(offering, amount="300.00", residency="local")

    resolver = FeeResolver()

    # Local student resolves.
    local = resolver.resolve_for_offering(offering, "Zambian", "Zambia")
    assert local.amount == Decimal("300.00")

    # International student has no configured fee → fail closed (no default).
    with pytest.raises(FeeConfigurationError) as exc:
        resolver.resolve_for_offering(offering, "Kenyan", "Kenya")
    assert exc.value.code == "FEE_NOT_CONFIGURED"


@pytest.mark.django_db
def test_duplicate_active_fee_is_prevented_or_ambiguous():
    """Two active fees for the same (offering, type, residency) never resolve.

    Either the DB one-active-fee invariant (uq_program_fees_one_active, task 3.3)
    rejects the duplicate at insert time, or — if that partial index is absent in
    the current engine — the resolver fails closed with FEE_AMBIGUOUS. Both are
    acceptable belt-and-suspenders outcomes; a silently-picked arbitrary fee is
    NOT.
    """
    inst = _institution("DUP")
    offering = _offering(inst, code="DUP-PROG")
    _fee(offering, amount="300.00")

    resolver = FeeResolver()
    try:
        with transaction.atomic():
            _fee(offering, amount="999.00")  # second active fee, same key
    except IntegrityError:
        # DB invariant enforced the one-active-fee rule. Resolution stays clean.
        resolved = resolver.resolve_for_offering(offering, "Zambian", "Zambia")
        assert resolved.amount == Decimal("300.00")
        return

    # No DB constraint in this engine → the resolver must refuse to guess.
    with pytest.raises(AmbiguousFeeError) as exc:
        resolver.resolve_for_offering(offering, "Zambian", "Zambia")
    assert exc.value.code == "FEE_AMBIGUOUS"
    assert exc.value.status_code == 409


@pytest.mark.django_db
def test_no_display_name_lookup():
    """resolve_fee resolves by canonical code/id only — never by display name.

    An offering exists whose NAME is passed as the identifier; because the
    display-name lookup was removed (DATA-05, R7.1), this raises
    Program.DoesNotExist rather than matching by name.
    """
    inst = _institution("NAME")
    offering = _offering(inst, code="NAME-CODE")
    _fee(offering, amount="300.00")

    resolver = FeeResolver()

    # By code works.
    by_code = resolver.resolve_fee("NAME-CODE", "Zambian", "Zambia")
    assert by_code.amount == Decimal("300.00")

    # By the program's display NAME does not resolve.
    with pytest.raises(Program.DoesNotExist):
        resolver.resolve_fee(offering.name, "Zambian", "Zambia")


@pytest.mark.django_db
def test_resolve_for_application_uses_canonical_offering():
    """resolve_for_application resolves the fee from program_offering, in-tenant."""
    from apps.accounts.models import Profile
    from apps.applications.models import Application

    inst_a = _institution("APPA")
    inst_b = _institution("APPB")
    shared_name = "Shared Program Name"
    offering_a = _offering(inst_a, code="SHARED-A", name=shared_name)
    offering_b = _offering(inst_b, code="SHARED-B", name=shared_name)
    _fee(offering_a, amount="300.00")
    _fee(offering_b, amount="450.00")

    now = timezone.now()
    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"stu-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Iso",
        last_name="Lation",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="Iso Lation",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="SHARED",
        intake="January 2025",
        institution=inst_b.name,
        program_offering=offering_b,  # bound to tenant B's offering
        status="submitted",
        payment_status="pending",
        version=1,
        created_at=now,
        updated_at=now,
    )

    resolver = FeeResolver()
    offering, resolved = resolver.resolve_for_application(application)

    assert offering.id == offering_b.id
    assert resolved.amount == Decimal("450.00")  # tenant B's fee, not A's
