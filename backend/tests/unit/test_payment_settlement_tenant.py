"""Payment settlement tenant-tagging exploration tests (P15).

Spec: ``multi-tenant-beanola-admissions`` — Phase 0 exploration baseline
(task 1.9). Pins settlement durability against the **current**
implementation. No production code is changed in this task: each property
either PASSES against the current code, or is recorded as a durable
``@pytest.mark.xfail(strict=True)`` triaged to the Phase 4 task that fixes it.

    P15 Every payment initiation path (card initiate, mobile money, defer)
        writes the Beanola collector marker plus the
        institution/canonical/offering/intake snapshot into
        ``payments.metadata``; the settlement summary is tenant-scoped, derives
        labels from the snapshot, and buckets missing metadata as "Unassigned"
        without leaking other schools' data.

Run (sqlite-in-memory, since the default ``DATABASE_URL`` points at the
production Neon branch)::

    cd backend && DATABASE_URL="sqlite://:memory:" TESTING=1 \
      .venv/bin/python -m pytest tests/unit/test_payment_settlement_tenant.py \
      --hypothesis-seed=0 -v

**Validates: Requirements R7.1, R7.4, R14.6**
"""

from __future__ import annotations

import json

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.documents.models import Payment
from apps.documents.payment_helpers import _build_tenant_payment_metadata
from apps.documents.payment_service import PaymentService
from tests.tenant_fixtures import build_payment


# The Beanola central-collection marker confirmed against the payment-service
# implementation (``_build_tenant_payment_metadata`` in
# ``apps/documents/payment_helpers.py``): the snapshot writes
# ``metadata["collector"] == "beanola"`` on every initiation path. (The
# task-1.1 scaffold guessed ``"beanola_collector"``; the real contract is the
# ``collector`` key with value ``beanola``.)
COLLECTOR_KEY = "collector"
COLLECTOR_VALUE = "beanola"

# The four canonical-ID snapshot keys every initiation path must populate.
SNAPSHOT_ID_KEYS = ("institution_id", "program_id", "program_offering_id", "intake_id")

SETTLEMENT_URL = "/api/v1/payments/settlements/"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolvable_application(world):
    """Point the world's application at a program the fee resolver can resolve.

    ``PaymentService.initiate*`` resolves the fee via
    ``IdentifierResolver.resolve_program(application.program)``; pointing the
    legacy ``program`` string at the offering's ``code`` makes that resolve to
    the world's offering. The four canonical FK columns (already populated by
    ``build_tenant_world``) drive the settlement snapshot.
    """
    application = world.application
    application.program = world.offering.code
    application.save(update_fields=["program"])
    return application


def _staff_client(world) -> APIClient:
    staff = world.staff
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(staff.id),
                "email": staff.email,
                "role": staff.role,
                "first_name": staff.first_name,
                "last_name": staff.last_name,
            }
        )
    )
    return client


def _assert_settlement_snapshot(metadata: dict, world) -> None:
    """Every initiation path must stamp the collector marker + the four IDs."""
    assert metadata.get(COLLECTOR_KEY) == COLLECTOR_VALUE, metadata
    for key in SNAPSHOT_ID_KEYS:
        assert metadata.get(key), (key, metadata)
    # The snapshot must carry the world's real canonical IDs, not blanks.
    assert metadata["institution_id"] == world.institution_id
    assert metadata["program_id"] == world.canonical_program_id
    assert metadata["program_offering_id"] == world.offering_id
    assert metadata["intake_id"] == world.intake_id


# ---------------------------------------------------------------------------
# P15 — settlement metadata present on every initiation path
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSettlementMetadataTagging:
    """P15: settlement metadata present on every initiation path.

    **Validates: Requirements R7.1, R7.4, R14.6**
    """

    def test_tenant_world_provides_settlement_inputs(self, tenant_world):
        """The tenant world exposes the IDs that settlement metadata must
        snapshot (institution / canonical / offering / intake)."""
        assert tenant_world.institution_id
        assert tenant_world.canonical_program_id
        assert tenant_world.offering_id
        assert tenant_world.intake_id

    # -- R7.1 / R14.6: collector marker + snapshot on every initiation path -

    def test_card_initiate_writes_collector_marker_and_snapshot(self, tenant_world):
        """The card-initiate path (`PaymentService.initiate_payment`) stamps the
        Beanola collector marker + the four-ID snapshot (R7.1).

        **Validates: Requirements R7.1, R14.6**
        """
        application = _resolvable_application(tenant_world)
        result = PaymentService().initiate_payment(application.id, tenant_world.student.id)
        assert result.payment_id is not None
        payment = Payment.objects.get(id=result.payment_id)
        _assert_settlement_snapshot(payment.metadata or {}, tenant_world)

    def test_defer_writes_collector_marker_and_snapshot(self, tenant_world):
        """The defer path (`PaymentService.defer_payment`) stamps the Beanola
        collector marker + the four-ID snapshot (R7.1).

        **Validates: Requirements R7.1, R14.6**
        """
        application = _resolvable_application(tenant_world)
        result = PaymentService().defer_payment(application.id, tenant_world.student.id)
        assert result.payment_id is not None
        payment = Payment.objects.get(id=result.payment_id)
        assert payment.status == "deferred"
        _assert_settlement_snapshot(payment.metadata or {}, tenant_world)

    def test_mobile_money_writes_collector_marker_and_snapshot(self, tenant_world):
        """The mobile-money path (`PaymentService.initiate_mobile_money`) stamps
        the Beanola collector marker + the four-ID snapshot (R7.1).

        Lenco credentials are absent under test settings, so the provider call
        degrades gracefully and the payment stays ``pending`` — but the tenant
        snapshot is written when the underlying Payment row is created.

        **Validates: Requirements R7.1, R14.6**
        """
        application = _resolvable_application(tenant_world)
        result = PaymentService().initiate_mobile_money(
            application.id, tenant_world.student.id, "+260970000000"
        )
        assert result.payment_id is not None
        payment = Payment.objects.get(id=result.payment_id)
        _assert_settlement_snapshot(payment.metadata or {}, tenant_world)

    def test_no_raw_phone_persisted_on_mobile_money_metadata(self, tenant_world):
        """The mobile-money snapshot must not persist the raw phone number;
        only ``phone_hash`` / ``phone_last4`` are permitted (R7.7).

        **Validates: Requirements R7.7**
        """
        application = _resolvable_application(tenant_world)
        raw_phone = "+260970000000"
        result = PaymentService().initiate_mobile_money(
            application.id, tenant_world.student.id, raw_phone
        )
        payment = Payment.objects.get(id=result.payment_id)
        blob = json.dumps(payment.metadata or {})
        assert raw_phone not in blob
        assert "0970000000" not in blob


# ---------------------------------------------------------------------------
# P15 — settlement summary scoping + "Unassigned" bucket safety
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSettlementSummaryScoping:
    """P15: tenant-scoped settlement grouping; "Unassigned" bucket leaks nothing.

    **Validates: Requirements R7.4, R14.6**
    """

    def test_settlement_summary_excludes_other_school(self, two_tenant_worlds):
        """School-A staff's settlement summary contains school A's payment and
        never names or counts school B's (R7.4).

        **Validates: Requirements R7.4**
        """
        world_a, world_b = two_tenant_worlds
        build_payment(
            application=world_a.application,
            status="successful",
            metadata=_build_tenant_payment_metadata(world_a.application),
        )
        build_payment(
            application=world_b.application,
            status="successful",
            metadata=_build_tenant_payment_metadata(world_b.application),
        )

        response = _staff_client(world_a).get(SETTLEMENT_URL)
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["success"] is True
        results = body["data"]["results"]

        institution_ids = {row["institution_id"] for row in results}
        assert world_a.institution_id in institution_ids
        assert world_b.institution_id not in institution_ids

        # Hard leak check: nothing about school B appears anywhere in the body.
        blob = json.dumps(body)
        assert world_b.institution_id not in blob
        assert world_b.institution.name not in blob

    def test_missing_metadata_buckets_as_unassigned(self, tenant_world):
        """A payment whose application carries no institution linkage and whose
        metadata lacks the snapshot is bucketed as "Unassigned" rather than
        failing or being mis-attributed (R7.4, R7.5).

        Viewed as a super-admin so the row is in scope; the point is the bucket
        label, not the scoping.

        **Validates: Requirements R7.4**
        """
        from apps.applications.models import Application
        from tests.tenant_fixtures import (
            build_application,
            build_profile,
        )

        # An application with no canonical IDs and blanked legacy strings.
        orphan_app = build_application(
            student=tenant_world.student,
            institution=tenant_world.institution,
            canonical_program=tenant_world.canonical_program,
            offering=tenant_world.offering,
            intake=tenant_world.intake,
            with_canonical_ids=False,
        )
        Application.objects.filter(id=orphan_app.id).update(institution="", program="")
        orphan_app.refresh_from_db()
        build_payment(application=orphan_app, status="successful", metadata={})

        super_admin = build_profile(role="super_admin")
        client = APIClient()
        client.force_authenticate(
            user=JWTUser(
                {
                    "user_id": str(super_admin.id),
                    "email": super_admin.email,
                    "role": "super_admin",
                    "first_name": super_admin.first_name,
                    "last_name": super_admin.last_name,
                }
            )
        )

        response = client.get(SETTLEMENT_URL)
        assert response.status_code == 200, response.content
        results = response.json()["data"]["results"]
        unassigned = [
            row
            for row in results
            if row["institution_id"] is None
            and row["institution_name"] == "Unassigned"
        ]
        assert unassigned, results
        # The Unassigned bucket carries the orphan payment without crashing.
        assert sum(row["payment_count"] for row in unassigned) >= 1

    def test_no_scope_staff_settlement_summary_is_empty(self, two_tenant_worlds, monkeypatch):
        """A staff actor with no scope to a school sees no settlement rows from
        that school — never a global total (R7.4).

        Builds a fresh no-scope staff actor and confirms their summary contains
        none of either world's payments. The test-settings-only legacy-admin
        all-access compatibility path is disabled here so the production
        membership/grant-driven scope is what is asserted (R4.9).
        """
        from tests.tenant_fixtures import build_profile

        monkeypatch.setattr(
            "apps.catalog.services.AccessScopeService._test_settings_active",
            staticmethod(lambda: False),
        )

        world_a, world_b = two_tenant_worlds
        build_payment(
            application=world_a.application,
            status="successful",
            metadata=_build_tenant_payment_metadata(world_a.application),
        )
        build_payment(
            application=world_b.application,
            status="successful",
            metadata=_build_tenant_payment_metadata(world_b.application),
        )

        no_scope_staff = build_profile(role="admin")
        client = APIClient()
        client.force_authenticate(
            user=JWTUser(
                {
                    "user_id": str(no_scope_staff.id),
                    "email": no_scope_staff.email,
                    "role": "admin",
                    "first_name": no_scope_staff.first_name,
                    "last_name": no_scope_staff.last_name,
                }
            )
        )

        response = client.get(SETTLEMENT_URL)
        assert response.status_code == 200, response.content
        results = response.json()["data"]["results"]
        institution_ids = {row["institution_id"] for row in results}
        assert world_a.institution_id not in institution_ids
        assert world_b.institution_id not in institution_ids
