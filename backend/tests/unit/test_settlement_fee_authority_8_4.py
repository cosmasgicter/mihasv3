"""Tenant A/B settlement + fee authority and export tests (task 8.4).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 8.4 —
              "Make fee administration and settlement server-scoped/
              capability-gated". This file is the task's ``_Evidence:`` line:
              *tenant A/B settlement/fee authority and export tests*.
Requirements: R3 (one authorization model; capability service is the sole
              authority; cross-tenant substitution is an indistinguishable 404),
              R6.5 (export is a backend command with explicit capability, audit,
              redaction, and size limits), R8.3-R8.4 (one scoped query contract;
              every command records the actor), R12.5-R12.7 (tenant-scoped,
              auditable payment reads; server amounts only).
Findings:     **ADM-06** (settlement rows fetched broadly and filtered
              client-side; fee/settlement authority role-based),
              **AUTH-02** (fee/settlement/export endpoints used raw roles).
Design:       §10.2 — "Settlement queries filter institution in SQL and expose
              backend aggregates, never a client-filtered global list."

The claim this file makes
-------------------------
A tenant admin scoped to institution **A** cannot observe, fetch, mutate, or
infer institution **B**'s fee configuration, settlement records, or aggregates
through **list, detail, search, aggregate, or export** — and the difference
between "B's id is out of your scope" and "that id does not exist" is not
observable.

Every test runs with ``production_scope`` active, so the test-settings
legacy-admin all-access shortcut is disabled and what is measured is the real
membership/grant-derived capability model.
"""

from __future__ import annotations

import csv
import io
import json
import uuid
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.services import AccessScopeService
from apps.common.models import AuditLog
from apps.documents.models import ProgramFee
from apps.documents.payment_helpers import _build_tenant_payment_metadata
from apps.documents.settlement_service import (
    EXPORT_ROW_LIMIT,
    RECONCILIATION_ATTENTION,
    RECONCILIATION_SETTLED,
    RECONCILIATION_STALE_HOURS,
)
from tests.tenant_fixtures import build_membership, build_payment, build_profile

SETTLEMENT_URL = "/api/v1/payments/settlements/"
FEE_ADMIN_URL = "/api/v1/admin/fees/"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
            }
        )
    )
    return client


def _grant_export(world):
    """Give a world's staff the explicit tenant export grant (R6.5)."""
    memberships = world.staff.userinstitutionmembership_set.all() if hasattr(world.staff, "userinstitutionmembership_set") else []
    for membership in memberships:
        membership.permissions = ["export"]
        membership.save(update_fields=["permissions"])
    if not memberships:  # pragma: no cover - fixture shape guard
        build_membership(
            user=world.staff,
            institution=world.institution,
            role=world.staff.role,
            permissions=["export"],
        )
    return world.staff


def _seed_fee(world, *, fee_type="application", residency="local", amount="153.00", currency="ZMW"):
    from django.utils import timezone

    now = timezone.now()
    return ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=world.offering,
        fee_type=fee_type,
        residency_category=residency,
        amount=Decimal(amount),
        currency=currency,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _settled_payment(world, **overrides):
    return build_payment(
        application=world.application,
        status=overrides.pop("status", "successful"),
        metadata=overrides.pop("metadata", _build_tenant_payment_metadata(world.application)),
        **overrides,
    )


def _csv_rows(response) -> list[dict[str, str]]:
    body = response.content.decode()
    return list(csv.DictReader(io.StringIO(body)))


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# Authority: the capability service decides, not a role string (AUTH-02, R3.1)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSettlementAuthorityIsCapabilityDerived:
    """The settlement report is gated by ``tenant.payment.read``, not a role.

    **Validates: Requirements R3.1, R3.2, R12.5**
    """

    def test_scoped_reviewer_can_read_settlement(self, tenant_world):
        """A reviewer with an active membership holds the tenant payment read
        capability, so the report is theirs — the old ``IsAdmin`` role gate
        denied them (AUTH-02: "legitimate reviewers are denied").
        """
        reviewer = build_profile(role="reviewer")
        build_membership(
            user=reviewer, institution=tenant_world.institution, role="reviewer"
        )
        response = _client_for(reviewer).get(SETTLEMENT_URL)
        assert response.status_code == 200, response.content

    def test_student_is_masked_as_not_found(self, tenant_world):
        """A student has no tenant scope, so the staff surface is not confirmed
        to exist: a masked 404, never a distinguishable 403.
        """
        response = _client_for(tenant_world.student).get(SETTLEMENT_URL)
        assert response.status_code == 404, response.content
        body = json.dumps(response.json())
        assert tenant_world.institution.name not in body
        assert str(tenant_world.institution_id) not in body

    def test_no_scope_admin_is_masked_as_not_found(self, tenant_world):
        """An ``admin`` role string with no membership has zero authority.

        Before 8.4 this actor received ``200`` with an empty result set, which
        confirmed the surface exists and that they had *no* rows — a
        distinguishable answer. The capability contract masks it (R3.2).
        """
        stranger = build_profile(role="admin")
        response = _client_for(stranger).get(SETTLEMENT_URL)
        assert response.status_code == 404, response.content
        assert "results" not in json.dumps(response.json())

    def test_anonymous_is_denied(self):
        response = APIClient().get(SETTLEMENT_URL)
        assert response.status_code in (401, 403), response.content


@pytest.mark.django_db
class TestFeeAdministrationAuthorityIsCapabilityDerived:
    """Fee reads are gated by ``tenant.program.read``; writes by the platform
    offering-configuration capability.

    **Validates: Requirements R3.1, R3.2, R7.3, R7.4**
    """

    def test_scoped_staff_can_read_fee_report(self, tenant_world):
        _seed_fee(tenant_world)
        response = _client_for(tenant_world.staff).get(FEE_ADMIN_URL)
        assert response.status_code == 200, response.content
        assert response.json()["data"]["totalCount"] == 1

    def test_student_fee_report_is_masked(self, tenant_world):
        _seed_fee(tenant_world)
        response = _client_for(tenant_world.student).get(FEE_ADMIN_URL)
        assert response.status_code == 404, response.content

    def test_read_only_tenant_admin_cannot_write_a_fee(self, tenant_world):
        """AUTH-02's headline: a read-only tenant admin could mutate.

        Fee writes now require the platform offering-configuration capability,
        which a tenant admin never holds — they may only *request* a change.
        """
        response = _client_for(tenant_world.staff).post(
            f"/api/v1/programs/{tenant_world.offering.id}/fees/",
            data={
                "fee_type": "application",
                "residency_category": "local",
                "amount": "999.00",
                "currency": "ZMW",
            },
            format="json",
        )
        assert response.status_code == 403, response.content
        assert not ProgramFee.objects.filter(program_id=tenant_world.offering.id).exists()

    def test_super_admin_can_write_a_fee_and_it_is_audited(self, tenant_world):
        """The platform actor writes, and the write leaves a tenant Audit_Event
        carrying the institution scope (R8.4).
        """
        super_admin = build_profile(role="super_admin")
        response = _client_for(super_admin).post(
            f"/api/v1/programs/{tenant_world.offering.id}/fees/",
            data={
                "fee_type": "application",
                "residency_category": "local",
                "amount": "153.00",
                "currency": "ZMW",
            },
            format="json",
        )
        assert response.status_code == 201, response.content
        event = AuditLog.objects.filter(action="tenant.fee.created").order_by("-created_at").first()
        assert event is not None, "a fee write must emit tenant.fee.created"
        assert event.changes.get("institution_id") == str(tenant_world.institution_id)
        assert event.changes.get("amount") == "153.00"
        # No raw network context: IP / user-agent are SHA-256 digests or absent.
        for value in (event.ip_address, event.user_agent):
            assert value is None or (len(value) == 64 and "." not in value)


# ---------------------------------------------------------------------------
# Tenant A/B isolation across list, detail, search, aggregate, export
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSettlementTenantABIsolation:
    """Institution A's operator can observe nothing of institution B.

    **Validates: Requirements R3.2, R8.3, R12.5, R12.7**
    """

    def test_list_and_aggregates_exclude_the_other_tenant(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        _settled_payment(world_a)
        _settled_payment(world_b)
        _settled_payment(world_b)

        response = _client_for(world_a.staff).get(SETTLEMENT_URL)
        assert response.status_code == 200, response.content
        data = response.json()["data"]

        # The paginated envelope shape (R14.1).
        assert set(["page", "pageSize", "totalCount", "results"]).issubset(data)

        institution_ids = {row["institution_id"] for row in data["results"]}
        assert world_a.institution_id in institution_ids
        assert world_b.institution_id not in institution_ids

        # The aggregate is the server's, over the whole filtered set, and it
        # counts only A's payment — an aggregate that leaked B's count would be
        # an inference channel even with B's rows hidden.
        assert data["aggregates"]["payment_count"] == 1
        assert data["aggregates"]["institution_count"] == 1

        blob = json.dumps(response.json())
        assert world_b.institution_id not in blob
        assert world_b.institution.name not in blob
        assert world_b.offering.name not in blob

    def test_other_tenant_institution_filter_is_masked_not_empty(self, two_tenant_worlds):
        """Substituting B's institution id must be indistinguishable from an id
        that does not exist — same status, same body (R3.2).
        """
        world_a, world_b = two_tenant_worlds
        _settled_payment(world_a)
        _settled_payment(world_b)
        client = _client_for(world_a.staff)

        cross = client.get(SETTLEMENT_URL, {"institution_id": world_b.institution_id})
        missing = client.get(SETTLEMENT_URL, {"institution_id": str(uuid.uuid4())})

        assert cross.status_code == 404, cross.content
        assert missing.status_code == 404, missing.content
        assert cross.json() == missing.json()
        assert world_b.institution.name not in json.dumps(cross.json())

    def test_other_tenant_offering_filter_is_masked(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        client = _client_for(world_a.staff)
        cross = client.get(
            SETTLEMENT_URL, {"program_offering_id": str(world_b.offering.id)}
        )
        missing = client.get(
            SETTLEMENT_URL, {"program_offering_id": str(uuid.uuid4())}
        )
        assert cross.status_code == 404, cross.content
        assert missing.status_code == 404, missing.content
        assert cross.json() == missing.json()

    def test_search_cannot_probe_the_other_tenant(self, two_tenant_worlds):
        """Searching for B's exact name returns nothing and says nothing.

        A search that answered "0 rows for that name" differently from "0 rows
        for a nonsense name" would confirm the name exists somewhere.
        """
        world_a, world_b = two_tenant_worlds
        _settled_payment(world_a)
        _settled_payment(world_b)
        client = _client_for(world_a.staff)

        probe = client.get(SETTLEMENT_URL, {"search": world_b.institution.name})
        nonsense = client.get(SETTLEMENT_URL, {"search": "zzz-no-such-school"})

        assert probe.status_code == 200
        assert nonsense.status_code == 200
        assert probe.json()["data"]["results"] == []
        assert probe.json()["data"]["totalCount"] == 0
        assert probe.json()["data"]["aggregates"]["payment_count"] == (
            nonsense.json()["data"]["aggregates"]["payment_count"]
        )

    def test_pagination_is_server_side_and_scoped(self, two_tenant_worlds):
        """Page 2 is the server's, and it never reaches into the other tenant."""
        world_a, world_b = two_tenant_worlds
        for currency in ("ZMW", "USD"):
            _settled_payment(world_a, currency=currency)
        _settled_payment(world_b)

        client = _client_for(world_a.staff)
        first = client.get(SETTLEMENT_URL, {"pageSize": 1, "page": 1})
        second = client.get(SETTLEMENT_URL, {"pageSize": 1, "page": 2})

        assert first.status_code == 200 and second.status_code == 200
        assert first.json()["data"]["totalCount"] == 2
        assert len(first.json()["data"]["results"]) == 1
        assert len(second.json()["data"]["results"]) == 1
        assert first.json()["data"]["results"] != second.json()["data"]["results"]
        # The aggregate does not change with the page — the ADM-06 defect was a
        # total derived from the loaded page.
        assert (
            first.json()["data"]["aggregates"]["payment_count"]
            == second.json()["data"]["aggregates"]["payment_count"]
            == 2
        )
        assert world_b.institution_id not in json.dumps(second.json())

    def test_super_admin_sees_both_tenants(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        _settled_payment(world_a)
        _settled_payment(world_b)
        super_admin = build_profile(role="super_admin")
        response = _client_for(super_admin).get(SETTLEMENT_URL)
        assert response.status_code == 200, response.content
        institution_ids = {row["institution_id"] for row in response.json()["data"]["results"]}
        assert {world_a.institution_id, world_b.institution_id} <= institution_ids


@pytest.mark.django_db
class TestFeeTenantABIsolation:
    """Institution A's operator can observe no fee configuration of B's.

    **Validates: Requirements R3.2, R7.3, R7.4**
    """

    def test_fee_list_and_aggregates_exclude_the_other_tenant(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        _seed_fee(world_a, amount="153.00")
        _seed_fee(world_b, amount="777.00")

        response = _client_for(world_a.staff).get(FEE_ADMIN_URL)
        assert response.status_code == 200, response.content
        data = response.json()["data"]
        assert data["totalCount"] == 1
        assert data["aggregates"]["fee_count"] == 1
        assert data["aggregates"]["institution_count"] == 1
        blob = json.dumps(response.json())
        assert "777.00" not in blob
        assert world_b.institution.name not in blob
        assert str(world_b.offering.id) not in blob

    def test_other_tenant_fee_detail_is_masked(self, two_tenant_worlds):
        """Reading B's fee list through B's offering id is one masked 404."""
        world_a, world_b = two_tenant_worlds
        _seed_fee(world_b)
        client = _client_for(world_a.staff)
        cross = client.get(f"/api/v1/programs/{world_b.offering.id}/fees/")
        missing = client.get(f"/api/v1/programs/{uuid.uuid4()}/fees/")
        assert cross.status_code == 404, cross.content
        assert missing.status_code == 404, missing.content
        assert world_b.institution.name not in json.dumps(cross.json())

    def test_cross_tenant_fee_mutation_is_refused_without_mutating(self, two_tenant_worlds):
        """A write carrying B's offering id mutates nothing and discloses nothing."""
        world_a, world_b = two_tenant_worlds
        response = _client_for(world_a.staff).post(
            f"/api/v1/programs/{world_b.offering.id}/fees/",
            data={
                "fee_type": "application",
                "residency_category": "local",
                "amount": "1.00",
                "currency": "ZMW",
            },
            format="json",
        )
        assert response.status_code in (403, 404), response.content
        assert not ProgramFee.objects.filter(program_id=world_b.offering.id).exists()
        assert world_b.institution.name not in json.dumps(response.json())

    def test_fee_search_cannot_probe_the_other_tenant(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        _seed_fee(world_b)
        client = _client_for(world_a.staff)
        probe = client.get(FEE_ADMIN_URL, {"search": world_b.offering.name})
        nonsense = client.get(FEE_ADMIN_URL, {"search": "zzz-no-such-offering"})
        assert probe.status_code == 200 and nonsense.status_code == 200
        assert probe.json()["data"]["results"] == []
        assert probe.json()["data"] == nonsense.json()["data"] or (
            probe.json()["data"]["totalCount"] == nonsense.json()["data"]["totalCount"] == 0
        )

    def test_coverage_aggregate_counts_only_the_actors_offerings(self, two_tenant_worlds):
        """The coverage numbers the page used to compute in the browser now come
        from the server, and they describe only the actor's own catalogue.
        """
        world_a, world_b = two_tenant_worlds
        _seed_fee(world_a)
        _seed_fee(world_b)
        data = _client_for(world_a.staff).get(FEE_ADMIN_URL).json()["data"]
        assert data["aggregates"]["offerings_in_scope"] == 1
        assert data["aggregates"]["configured_offering_count"] == 1
        assert data["aggregates"]["unconfigured_offering_count"] == 0

    def test_peer_offering_count_is_platform_only(self, two_tenant_worlds):
        """Cross-tenant context is redacted for a tenant actor (R6.5).

        Both worlds offer the *same* canonical program, so the peer count is a
        real cross-tenant fact — which is exactly why a tenant operator must not
        receive it and a platform operator may.
        """
        world_a, world_b = two_tenant_worlds
        _seed_fee(world_a)
        _seed_fee(world_b)

        tenant_data = _client_for(world_a.staff).get(FEE_ADMIN_URL).json()["data"]
        assert tenant_data["redaction"]["applied"] is True
        assert "peer_offering_count" in tenant_data["redaction"]["withheld_fields"]
        assert all("peer_offering_count" not in row for row in tenant_data["results"])

        super_admin = build_profile(role="super_admin")
        platform_data = _client_for(super_admin).get(FEE_ADMIN_URL).json()["data"]
        assert platform_data["redaction"]["applied"] is False
        peer_counts = {row["peer_offering_count"] for row in platform_data["results"]}
        assert peer_counts == {2}


# ---------------------------------------------------------------------------
# Reconciliation state (R12.5)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestReconciliationState:
    """Reconciliation state is derived from the one payment state machine.

    **Validates: Requirements R12.4, R12.5**
    """

    def test_settled_group_reports_settled(self, tenant_world):
        _settled_payment(tenant_world)
        data = _client_for(tenant_world.staff).get(SETTLEMENT_URL).json()["data"]
        row = data["results"][0]
        assert row["reconciliation_state"] == RECONCILIATION_SETTLED
        assert row["settled_count"] == 1
        assert row["settled_amount"] == "153.00"

    def test_stale_pending_demands_attention(self, tenant_world):
        """A ``pending`` row older than the reconciliation sweep's own cutoff is
        an operational signal, not a normal wait — and the cutoff is read from
        the sweep rather than restated.
        """
        from datetime import timedelta

        from django.utils import timezone

        from apps.documents.models import Payment

        payment = _settled_payment(tenant_world, status="pending")
        Payment.objects.filter(id=payment.id).update(
            created_at=timezone.now() - timedelta(hours=RECONCILIATION_STALE_HOURS + 1)
        )
        data = _client_for(tenant_world.staff).get(SETTLEMENT_URL).json()["data"]
        row = data["results"][0]
        assert row["stale_pending_count"] == 1
        assert row["reconciliation_state"] == RECONCILIATION_ATTENTION
        assert data["aggregates"]["reconciliation_stale_hours"] == RECONCILIATION_STALE_HOURS

    def test_reconciliation_filter_narrows_rows_and_aggregates_together(self, tenant_world):
        """A filtered page and its aggregates describe the same set."""
        _settled_payment(tenant_world)
        _settled_payment(tenant_world, status="failed")
        client = _client_for(tenant_world.staff)
        failed = client.get(SETTLEMENT_URL, {"reconciliation": "failed"}).json()["data"]
        assert failed["aggregates"]["payment_count"] == 1
        assert failed["aggregates"]["failed_count"] == 1
        assert sum(row["payment_count"] for row in failed["results"]) == 1

    def test_quarantined_count_is_platform_only(self, tenant_world):
        """Platform data-repair state is redacted for a tenant actor (R6.5)."""
        _settled_payment(tenant_world)
        tenant_data = _client_for(tenant_world.staff).get(SETTLEMENT_URL).json()["data"]
        assert "quarantined_count" in tenant_data["redaction"]["withheld_fields"]
        assert all("quarantined_count" not in row for row in tenant_data["results"])
        assert all("collector" not in row for row in tenant_data["results"])

        super_admin = build_profile(role="super_admin")
        platform_data = _client_for(super_admin).get(SETTLEMENT_URL).json()["data"]
        assert platform_data["results"][0]["collector"] == "beanola"
        assert platform_data["results"][0]["quarantined_count"] == 0


# ---------------------------------------------------------------------------
# Export: explicit capability, page-independent, redacted, audited (R6.5)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSettlementExport:
    """**Validates: Requirements R6.5, R8.4, R12.7**"""

    def test_read_only_tenant_admin_cannot_export(self, tenant_world):
        """Reading the report and bulk-exporting it are different authorities."""
        _settled_payment(tenant_world)
        response = _client_for(tenant_world.staff).get(SETTLEMENT_URL, {"export": "csv"})
        assert response.status_code == 403, response.content
        assert response.json()["code"] == "INSUFFICIENT_PERMISSIONS"
        # The refusal is audited as a failed authorization (R10.6).
        assert AuditLog.objects.filter(action="auth.denied", entity_type="settlement").exists()

    def test_granted_tenant_admin_export_is_scoped_and_audited(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        _settled_payment(world_a)
        _settled_payment(world_b)
        _grant_export(world_a)

        response = _client_for(world_a.staff).get(SETTLEMENT_URL, {"export": "csv"})
        assert response.status_code == 200, response.content
        assert response["Content-Type"] == "text/csv"
        assert "attachment;" in response["Content-Disposition"]

        rows = _csv_rows(response)
        assert [row["institution_id"] for row in rows] == [world_a.institution_id]
        body = response.content.decode()
        assert world_b.institution_id not in body
        assert world_b.institution.name not in body

        # Redaction follows the actor: the platform-only columns are not even
        # column headers in a tenant's file.
        header = body.splitlines()[0]
        assert "quarantined_count" not in header
        assert "collector" not in header

        event = (
            AuditLog.objects.filter(action="settlement.exported")
            .order_by("-created_at")
            .first()
        )
        assert event is not None, "an export must be audited"
        assert event.changes["row_count"] == 1
        assert event.changes["page_independent"] is True
        assert event.changes["row_limit"] == EXPORT_ROW_LIMIT
        assert event.retention_category == "security"
        blob = json.dumps(event.changes)
        assert world_b.institution_id not in blob
        assert world_a.student.email not in blob

    def test_export_is_page_independent(self, tenant_world):
        """An export ignores the page: it is the whole filtered set (R6.5)."""
        _grant_export(tenant_world)
        for currency in ("ZMW", "USD"):
            _settled_payment(tenant_world, currency=currency)
        client = _client_for(tenant_world.staff)

        page_one = client.get(SETTLEMENT_URL, {"pageSize": 1, "page": 1}).json()["data"]
        assert len(page_one["results"]) == 1

        export = client.get(
            SETTLEMENT_URL, {"export": "csv", "pageSize": 1, "page": 2}
        )
        assert export.status_code == 200, export.content
        assert len(_csv_rows(export)) == 2

    def test_export_respects_the_applied_filters(self, tenant_world):
        _grant_export(tenant_world)
        _settled_payment(tenant_world)
        _settled_payment(tenant_world, status="failed")
        response = _client_for(tenant_world.staff).get(
            SETTLEMENT_URL, {"export": "csv", "reconciliation": "failed"}
        )
        rows = _csv_rows(response)
        assert len(rows) == 1
        assert rows[0]["failed_count"] == "1"

    def test_super_admin_export_carries_the_platform_columns(self, tenant_world):
        _settled_payment(tenant_world)
        super_admin = build_profile(role="super_admin")
        response = _client_for(super_admin).get(SETTLEMENT_URL, {"export": "csv"})
        assert response.status_code == 200, response.content
        header = response.content.decode().splitlines()[0]
        assert "quarantined_count" in header


@pytest.mark.django_db
class TestFeeExport:
    """**Validates: Requirements R6.5, R7.3, R8.4**"""

    def test_read_only_tenant_admin_cannot_export_fees(self, tenant_world):
        _seed_fee(tenant_world)
        response = _client_for(tenant_world.staff).get(FEE_ADMIN_URL, {"export": "csv"})
        assert response.status_code == 403, response.content
        assert AuditLog.objects.filter(action="auth.denied", entity_type="program_fee").exists()

    def test_granted_export_is_scoped_redacted_and_audited(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        _seed_fee(world_a, amount="153.00")
        _seed_fee(world_b, amount="777.00")
        _grant_export(world_a)

        response = _client_for(world_a.staff).get(FEE_ADMIN_URL, {"export": "csv"})
        assert response.status_code == 200, response.content
        body = response.content.decode()
        rows = _csv_rows(response)
        assert [row["amount"] for row in rows] == ["153.00"]
        assert "777.00" not in body
        assert world_b.institution.name not in body
        assert "peer_offering_count" not in body.splitlines()[0]

        event = AuditLog.objects.filter(action="fee.exported").order_by("-created_at").first()
        assert event is not None
        assert event.changes["row_count"] == 1
        assert event.changes["page_independent"] is True
        assert event.retention_category == "security"

    def test_fee_export_is_page_independent(self, tenant_world):
        _grant_export(tenant_world)
        _seed_fee(tenant_world, residency="local")
        _seed_fee(tenant_world, residency="international", amount="300.00")
        client = _client_for(tenant_world.staff)
        assert len(client.get(FEE_ADMIN_URL, {"pageSize": 1}).json()["data"]["results"]) == 1
        export = client.get(FEE_ADMIN_URL, {"export": "csv", "pageSize": 1, "page": 2})
        assert len(_csv_rows(export)) == 2


# ---------------------------------------------------------------------------
# Server is the money authority (R12.1) + no broad fetch (ADM-06)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestServerOwnsTheNumbers:
    """**Validates: Requirements R12.1, R12.6, R8.3**"""

    def test_amounts_are_quantised_decimal_strings(self, tenant_world):
        """Amounts leave the server already decided, as strings — so the browser
        has nothing to add up and cannot re-round a total.
        """
        _settled_payment(tenant_world, amount=Decimal("100.10"))
        _settled_payment(tenant_world, amount=Decimal("53.20"))
        data = _client_for(tenant_world.staff).get(SETTLEMENT_URL).json()["data"]
        row = data["results"][0]
        assert row["gross_amount"] == "153.30"
        assert isinstance(row["gross_amount"], str)
        assert data["aggregates"]["totals_by_currency"][0]["gross_amount"] == "153.30"

    def test_grouping_and_counting_happen_in_sql(self, tenant_world):
        """Every payment read is an aggregate, and the cost does not follow the
        ledger's size.

        The pre-8.4 implementation materialised **every** payment the actor could
        reach into Python objects and grouped them in a loop — the "broad fetch"
        half of ADM-06. Two claims replace it: no query selects payment rows
        without aggregating them, and doubling the ledger does not change the
        number of queries.
        """
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        client = _client_for(tenant_world.staff)

        def capture():
            with CaptureQueriesContext(connection) as captured:
                response = client.get(SETTLEMENT_URL)
            assert response.status_code == 200, response.content
            return [
                query["sql"]
                for query in captured.captured_queries
                if '"payments"' in query["sql"]
            ]

        for index in range(12):
            _settled_payment(tenant_world, amount=Decimal("10.00") + index)
        first = capture()
        for index in range(12):
            _settled_payment(tenant_world, amount=Decimal("30.00") + index)
        second = capture()

        # Every payment query aggregates; none is a row-by-row read.
        non_aggregates = [
            sql
            for sql in first + second
            if not any(marker in sql for marker in ("GROUP BY", "COUNT(", "SUM("))
        ]
        assert non_aggregates == [], non_aggregates
        # Doubling the ledger changes nothing about the query plan count.
        assert len(first) == len(second)

    def test_default_status_filter_keeps_reconciliation_complete(self, tenant_world):
        """The report defaults to every status.

        The old default silently narrowed to the four settled statuses, so a
        failed or expired attempt was invisible on the surface whose job is to
        show what has *not* settled.
        """
        _settled_payment(tenant_world, status="failed")
        data = _client_for(tenant_world.staff).get(SETTLEMENT_URL).json()["data"]
        assert data["aggregates"]["payment_count"] == 1
        assert data["aggregates"]["failed_count"] == 1
        assert data["filters"]["status"] == []
