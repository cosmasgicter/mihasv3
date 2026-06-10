"""Settlement CSV export tests (task 18, R7.4).

The settlement summary endpoint (``GET /api/v1/payments/settlements/``) gains an
optional ``?format=csv`` download variant that reuses the exact same
``AccessScopeService`` scope + grouping path as the JSON response. These tests
prove the CSV download is identically tenant-scoped:

- School_Staff of school A never see school B's rows in the CSV.
- A payment with missing settlement metadata lands in an "Unassigned" row.
- A super-admin sees every school's rows.
- No-scope staff get a header-only CSV (never global totals).

Run (sqlite-in-memory, since the default ``DATABASE_URL`` points at Neon)::

    cd backend && DATABASE_URL="sqlite://:memory:" TESTING=1 \
      .venv/bin/python -m pytest tests/unit/test_settlement_csv_export.py -v

**Validates: Requirements R7.4**
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


def _staff_client(world) -> APIClient:
    return _client_for(world.staff)


def _parse_csv(response):
    """Return (header, data_rows) parsed from a text/csv download response."""
    assert response["Content-Type"].startswith("text/csv"), response["Content-Type"]
    assert "attachment;" in response["Content-Disposition"], response["Content-Disposition"]
    text = response.content.decode("utf-8")
    rows = list(csv.reader(io.StringIO(text)))
    assert rows, "CSV must always carry at least a header row"
    return rows[0], rows[1:]


EXPECTED_HEADER = [
    "institution_id",
    "institution_name",
    "program_offering_id",
    "program_name",
    "currency",
    "payment_count",
    "gross_amount",
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

    def test_no_scope_staff_csv_is_header_only(self, two_tenant_worlds, monkeypatch):
        """No-scope staff get a header-only CSV — never global totals (R7.4/R4.9)."""
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
        assert response.status_code == 200, response.content
        header, data_rows = _parse_csv(response)
        assert header == EXPECTED_HEADER
        assert data_rows == []


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
        """The CSV and JSON variants must surface the same scoped rows (no drift)."""
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

        json_rows = json_resp.json()["data"]["results"]
        _header, data_rows = _parse_csv(csv_resp)
        assert len(data_rows) == len(json_rows)
