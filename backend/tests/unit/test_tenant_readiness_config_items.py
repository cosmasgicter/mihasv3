"""Tenant readiness — intake-offering + application-fee items (task 4.3).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.3
Requirements: R4.2 (workflow collects offering/intake/fee), R4.5 (machine-
readable readiness from live canonical data).
Findings: TEN-02, TEN-03.
Design: design.md §6.2 (readiness invariants).

Task 4.3 makes the onboarding wizard able to create every launch-config record
(offering, intake+capacity, fee) as real canonical mutations. This surfaces the
new state in the readiness aggregate so the wizard can show it. The two new
items are intentionally **non-blocking** here — activation-gating for capacity
and fee invariants is owned by tasks 5.3/5.4 — so adding them must NOT change
``launch_ready`` for a tenant that already satisfies the blocking set.

Run (sqlite test DB, never production/Neon)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test TESTING=1 SECRET_KEY=x \
      .venv/bin/python -m pytest tests/unit/test_tenant_readiness_config_items.py -q

**Validates: Requirements 4.2, 4.5**
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.catalog.models import (
    InstitutionAsset,
    InstitutionDocumentProfile,
)
from apps.catalog.tenant_readiness import build_tenant_readiness, launch_blockers
from apps.documents.models import ProgramFee
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_intake,
    build_membership,
    build_offering,
    build_profile,
    build_program_intake,
)

pytestmark = [pytest.mark.django_db, pytest.mark.tenant]


def _make_blocking_ready(institution, *, suffix):
    """Satisfy exactly the BLOCKING readiness set (logo/signature/profile/offering/admin)."""
    now = timezone.now()
    for asset_type in ("logo", "signature"):
        InstitutionAsset.objects.create(
            id=uuid.uuid4(),
            institution=institution,
            asset_type=asset_type,
            storage_key=f"institution-assets/{institution.id}/{asset_type}.png",
            mime_type="image/png",
            checksum_sha256="0" * 64,
            version=1,
            is_active=True,
            created_at=now,
        )
    InstitutionDocumentProfile.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        document_type="acceptance_letter",
        layout_key="simple_letter",
        sections={},
        fee_chart=[],
        bank_accounts=[],
        requirements=[],
        signatory={},
        version=1,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    canonical = build_canonical_program(suffix=suffix)
    offering = build_offering(
        institution=institution,
        canonical_program=canonical,
        suffix=suffix,
        offering_status="active",
        is_active=True,
    )
    admin = build_profile(role="admin", suffix=f"ta-{suffix}")
    build_membership(user=admin, institution=institution, role="admin", is_active=True)
    return offering


def test_new_config_items_present_and_non_blocking():
    sfx = uuid.uuid4().hex[:8]
    institution = build_institution(suffix=sfx)
    readiness = build_tenant_readiness(institution.id)
    items = {item["key"]: item for item in readiness["items"]}
    # The two task-4.3 config items are present…
    assert "intake_offering" in items
    assert "application_fee" in items
    # …and are non-blocking (activation-gating is tasks 5.3/5.4).
    assert items["intake_offering"]["blocking"] is False
    assert items["application_fee"]["blocking"] is False


def test_blocking_ready_tenant_is_launch_ready_without_intake_or_fee():
    """A tenant satisfying the blocking set is launch_ready even with no intake/fee.

    Proves the new items do not change activation gating (they are non-blocking),
    so the existing launch-ready fixtures across the suite remain valid.
    """
    sfx = uuid.uuid4().hex[:8]
    institution = build_institution(suffix=sfx)
    _make_blocking_ready(institution, suffix=sfx)
    readiness = build_tenant_readiness(institution.id)
    items = {item["key"]: item for item in readiness["items"]}
    assert readiness["launch_ready"] is True
    # Intake/fee are not yet configured, but they never block activation here.
    assert items["intake_offering"]["ready"] is False
    assert items["application_fee"]["ready"] is False
    assert launch_blockers(institution.id) == []


def test_config_items_become_ready_when_offering_has_intake_and_fee():
    sfx = uuid.uuid4().hex[:8]
    institution = build_institution(suffix=sfx)
    offering = _make_blocking_ready(institution, suffix=sfx)
    intake = build_intake(suffix=sfx)
    build_program_intake(offering=offering, intake=intake, max_capacity=100, is_active=True)
    ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=offering,
        fee_type="application",
        residency_category="local",
        amount=Decimal("150.00"),
        currency="ZMW",
        is_active=True,
        created_at=timezone.now(),
        updated_at=timezone.now(),
    )
    readiness = build_tenant_readiness(institution.id)
    items = {item["key"]: item for item in readiness["items"]}
    assert items["intake_offering"]["ready"] is True
    assert items["intake_offering"]["count"] == 1
    assert items["application_fee"]["ready"] is True
    assert items["application_fee"]["count"] == 1


def test_fee_for_inactive_offering_does_not_count():
    """An application fee on a non-active offering must not satisfy readiness."""
    sfx = uuid.uuid4().hex[:8]
    institution = build_institution(suffix=sfx)
    canonical = build_canonical_program(suffix=sfx)
    inactive_offering = build_offering(
        institution=institution,
        canonical_program=canonical,
        suffix=f"inact-{sfx}",
        offering_status="archived",
        is_active=False,
    )
    ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=inactive_offering,
        fee_type="application",
        residency_category="local",
        amount=Decimal("150.00"),
        currency="ZMW",
        is_active=True,
        created_at=timezone.now(),
        updated_at=timezone.now(),
    )
    readiness = build_tenant_readiness(institution.id)
    items = {item["key"]: item for item in readiness["items"]}
    assert items["application_fee"]["ready"] is False
    assert items["application_fee"]["count"] == 0
