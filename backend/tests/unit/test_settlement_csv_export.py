"""Settlement CSV export tests (task 18, R7.4; extended by admissions-v2 8.4).

The settlement summary endpoint (``GET /api/v1/payments/settlements/``) carries an
``?export=csv`` download variant that reuses the exact same scope + grouping path
as the JSON response. These tests prove the CSV download is identically
tenant-scoped:

- School_Staff of school A never see school B's rows in the CSV.
- A payment with missing settlement metadata lands in an "Unassigned" row.
- A super-admin sees every school's rows.
- A staff actor with no scope cannot obtain a file at all (never global totals).

**Two contract changes landed with admissions-v2 task 8.4** (findings ADM-06 /
AUTH-02, R6.5). Every scoping claim above is preserved; the authority around them
is stricter:

1. **An export requires the explicit ``tenant.application.export`` capability.**
   R6.5 makes a bulk export a backend command with its own capability, audit,
   redaction, and size limit, so reading the settlement report and downloading it
   are no longer the same authority. The scoped staff in these tests therefore
   hold the ``export`` grant; a read-only tenant admin's refusal is proven in
   ``tests/unit/test_settlement_fee_authority_8_4.py``.
2. **A no-scope actor is masked (404) instead of receiving a header-only file.**
   A header-only CSV confirmed both that the surface exists and that the actor
   had zero rows — a distinguishable answer. R3.2 collapses "out of scope" and
   "does not exist" into one response. The original claim ("never global totals")
   holds strictly more strongly: there is no file at all.

The CSV also gained the reconciliation columns and the platform-only columns that
task 8.4 added, so ``EXPECTED_HEADER`` is now the redacted tenant header.

Run against the isolated local Postgres::

    cd backend && DATABASE_URL=<localtest 5433> TESTING=1 \
      python3 -m pytest tests/unit/test_settlement_csv_export.py -v

**Validates: Requirements R7.4, R3.2, R6.5**
"""

from __future__ import annotations

import csv
import io

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.documents.payment_helpers import _build_tenant_payment_metadata
from tests.tenant_fixtures import build_payment, build_profile

SETTLEMENT_URL = "/api/v1/payments/settlements/"
CSV_URL = f"{SETTLEMENT_URL}?export=csv"


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
    """Give the world's staff the explicit tenant export grant (8.4 / R6.5)."""
    from apps.catalog.models import UserInstitutionMembership

    UserInstitutionMembership.objects.filter(user_id=world.staff.id).update(
        permissions=["export"]
    )
    return world


def _staff_client(world) -> APIClient:
    """A scoped staff client that is allowed to export (8.4 / R6.5)."""
    _grant_export(world)
    return _client_for(world.staff)


def _parse_csv(response):
    """Return (header, data_rows) parsed from a text/csv download response."""
    assert response["Content-Type"].startswith("text/csv"), response["Content-Type"]
    assert "attachment;" in response["Content-Disposition"], response["Content-Disposition"]
    text = response.content.decode("utf-8")
    rows = list(csv.reader(io.StringIO(text)))
    assert rows, "CSV must always carry at least a header row"
    return rows[0], rows[1:]


# The tenant (redacted) export header. Task 8.4 added the reconciliation columns
# and the activity window; the platform-only columns (``collector``,
# ``quarantined_count``) are withheld from a non-all-access actor, which is why
# they are absent here and asserted present for a super-admin in
# ``tests/unit/test_settlement_fee_authority_8_4.py``.
EXPECTED_HEADER = [
    "institution_id",
    "institution_name",
    "program_offering_id",
    "program_name",
    "currency",
    "payment_count",
    "gross_amount",
    "settled_count",
    "settled_amount",
    "pending_count",
    "stale_pending_count",
    "failed_count",
    "expired_count",
    "deferred_count",
    "reconciliation_state",
    "first_payment_at",
    "last_payment_at",
]


# ---------------------------------------------------------------------------
# Tenant scoping
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSettlementCsvTenantScoping:
    """The CSV download is identically tenant-scoped to the JSON grouping (R7.4)."""

    def test_csv_download_has_header_and_attachment(self, tenant_world):
        build_payment(
            application=tenant_world.application,
            status="successful",
            metadata=_build_tenant_payment_metadata(tenant_world.application),
        )
        response = _staff_client(tenant_world).get(CSV_URL)
        assert response.status_code == 200, response.content
        header, data_rows = _parse_csv(response)
        assert header == EXPECTED_HEADER
        assert len(data_rows) == 1

    def test_csv_excludes_other_school_rows(self, two_tenant_worlds):
        """School-A staff's CSV contains school A's row and never school B's (R7.4)."""
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

        response = _staff_client(world_a).get(CSV_URL)
        assert response.status_code == 200, response.content
        text = response.content.decode("utf-8")

        # School A appears; school B leaks nothing into the file.
        assert world_a.institution_id in text
        assert world_b.institution_id not in text
        assert world_b.institution.name not in text

    def test_no_scope_staff_gets_no_file_at_all(self, two_tenant_worlds, monkeypatch):
        """A no-scope actor cannot obtain a settlement file — never global totals.

        Task 8.4 strengthened this (R3.2): the response used to be a header-only
        CSV, which confirmed the surface exists and that this actor had zero rows.
        It is now the same masked 404 an unknown surface would give, so neither
        fact is observable. The original claim — no global totals ever reach a
        no-scope actor — holds strictly more strongly.
        """
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
        response = _client_for(no_scope_staff).get(CSV_URL)
        assert response.status_code == 404, response.content
        body = response.content.decode("utf-8")
        for leak in (
            world_a.institution_id,
            world_b.institution_id,
            world_a.institution.name,
            world_b.institution.name,
        ):
            assert leak not in body


# ---------------------------------------------------------------------------
# Unassigned bucket + super-admin global view
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSettlementCsvBucketingAndGlobal:
    """Missing-metadata rows bucket as "Unassigned"; super-admin sees all (R7.4)."""

    def test_missing_metadata_lands_in_unassigned_row(self, tenant_world):
        from apps.applications.models import Application
        from tests.tenant_fixtures import build_application

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
        response = _client_for(super_admin).get(CSV_URL)
        assert response.status_code == 200, response.content
        header, data_rows = _parse_csv(response)

        name_idx = header.index("institution_name")
        unassigned = [row for row in data_rows if row[name_idx] == "Unassigned"]
        assert unassigned, data_rows
        # institution_id column is empty for the Unassigned bucket.
        id_idx = header.index("institution_id")
        assert unassigned[0][id_idx] == ""

    def test_super_admin_csv_sees_every_school(self, two_tenant_worlds):
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

        super_admin = build_profile(role="super_admin")
        response = _client_for(super_admin).get(CSV_URL)
        assert response.status_code == 200, response.content
        text = response.content.decode("utf-8")
        assert world_a.institution_id in text
        assert world_b.institution_id in text

    def test_csv_rows_match_json_grouping(self, two_tenant_worlds):
        """The CSV and JSON variants must surface the same scoped rows (no drift).

        Both come from the one 8.4 query service, so this now also pins that the
        export's row set matches the *unpaginated* filtered set the aggregates
        describe — not the page the operator happened to be on.
        """
        world_a, _world_b = two_tenant_worlds
        build_payment(
            application=world_a.application,
            status="successful",
            metadata=_build_tenant_payment_metadata(world_a.application),
        )

        client = _staff_client(world_a)
        json_resp = client.get(SETTLEMENT_URL)
        csv_resp = client.get(CSV_URL)
        assert json_resp.status_code == 200
        assert csv_resp.status_code == 200

        payload = json_resp.json()["data"]
        json_rows = payload["results"]
        header, data_rows = _parse_csv(csv_resp)
        assert len(data_rows) == len(json_rows) == payload["totalCount"]

        # Same institution, same money, in both representations.
        gross_idx = header.index("gross_amount")
        assert [row[gross_idx] for row in data_rows] == [
            row["gross_amount"] for row in json_rows
        ]
