"""Legacy catalog-write freeze + deprecation telemetry + canonical intake home.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 5.1
Requirements: **R7.1** (offering writes require a Canonical_Program link; no
display-string bare-program write), **R7.3** (canonical admin endpoints; legacy
catalog write routes frozen), **R14.7** (deprecation/usage telemetry).
Findings: **TEN-03**, **DATA-01**.

Covers:

* :mod:`apps.catalog.legacy_write_telemetry` unit behaviour (counter selection,
  bounded tags, deprecation headers, the stable ``CANONICAL_PROGRAM_REQUIRED``
  response) — no DB.
* The R7.1 freeze on ``POST /api/v1/catalog/programs/`` — an offering create
  without ``canonical_program_id`` is rejected (400 ``CANONICAL_PROGRAM_REQUIRED``,
  no row), while a canonical create (with the link) still succeeds (201).
* Deprecation headers on the frozen legacy institution/intake create routes.
* The canonical ``/api/v1/admin/intakes/`` home: super-admin CRUD works; a
  student is denied ``platform.intake.manage`` (403).
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from rest_framework.response import Response
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.catalog.legacy_write_telemetry import (
    CANONICAL_PROGRAM_REQUIRED_CODE,
    canonical_program_required_response,
    mark_deprecated,
    record_catalog_write,
)
from apps.catalog.models import Institution, Intake, Program
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_intake,
    build_profile,
)

PROGRAMS_URL = "/api/v1/catalog/programs/"
INSTITUTIONS_URL = "/api/v1/catalog/institutions/"
INTAKES_LEGACY_URL = "/api/v1/catalog/intakes/"
ADMIN_INTAKES_URL = "/api/v1/admin/intakes/"


def _client_for(profile: Profile) -> APIClient:
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


@pytest.fixture()
def production_scope(monkeypatch):
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# Pure-unit: telemetry module (no DB)
# ---------------------------------------------------------------------------


class TestLegacyWriteTelemetryUnit:
    def _request(self, *, role="super_admin", origin=None):
        user = SimpleNamespace(is_authenticated=True, role=role, id=uuid.uuid4())
        headers = {}
        if origin is not None:
            headers["Origin"] = origin
        return SimpleNamespace(headers=headers, user=user, path="/api/v1/catalog/programs/")

    def test_legacy_write_selects_legacy_counter_and_bounds_tags(self):
        tags = record_catalog_write(
            self._request(), resource="institution", method="POST", legacy=True
        )
        assert tags["resource"] == "institution"
        assert tags["method"] == "POST"
        assert tags["outcome"] == "served"
        assert tags["user_role"] == "super_admin"
        assert tags["caller"] in {"first_party", "external", "unknown"}

    def test_rejected_outcome_is_recorded(self):
        tags = record_catalog_write(
            self._request(), resource="program", method="POST", legacy=True, outcome="rejected"
        )
        assert tags["outcome"] == "rejected"

    def test_unknown_resource_method_role_collapse_to_bounded_values(self):
        req = self._request(role="wizard-role")
        tags = record_catalog_write(req, resource="banana", method="TRACE", legacy=False)
        assert tags["resource"] == "unknown"
        assert tags["method"] == "unknown"
        assert tags["user_role"] == "unknown"

    def test_anonymous_request_role_is_anonymous(self):
        req = SimpleNamespace(headers={}, user=None, path="/x")
        tags = record_catalog_write(req, resource="intake", method="POST", legacy=True)
        assert tags["user_role"] == "anonymous"

    def test_mark_deprecated_sets_rfc8594_headers(self):
        response = Response({"success": True, "data": {}})
        mark_deprecated(response, resource="intake", successor="/api/v1/admin/intakes/")
        assert response["Deprecation"] == "true"
        assert response["X-Legacy-Catalog-Write"] == "intake"
        assert 'rel="successor-version"' in response["Link"]
        assert "/api/v1/admin/intakes/" in response["Link"]

    def test_canonical_program_required_response_shape(self):
        response = canonical_program_required_response()
        assert response.status_code == 400
        assert response.data["success"] is False
        assert response.data["code"] == CANONICAL_PROGRAM_REQUIRED_CODE


# ---------------------------------------------------------------------------
# DB-backed: R7.1 freeze on the offering-create route
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestProgramOfferingWriteFreeze:
    def test_offering_create_without_canonical_program_is_rejected(self, production_scope):
        institution = build_institution()
        client = _client_for(build_profile(role="super_admin"))

        response = client.post(
            PROGRAMS_URL,
            {
                "name": "Legacy Free-Text Program",
                "code": f"LEGACY-{uuid.uuid4().hex[:8].upper()}",
                "institution_id": str(institution.id),
                "duration_months": 36,
            },
            format="json",
        )

        assert response.status_code == 400, response.data
        assert response.json()["code"] == CANONICAL_PROGRAM_REQUIRED_CODE
        # R7.1: no bare/legacy offering row is created.
        assert not Program.objects.filter(institution_id=institution.id).exists()

    def test_canonical_offering_create_succeeds(self, production_scope):
        institution = build_institution()
        canonical = build_canonical_program()
        client = _client_for(build_profile(role="super_admin"))

        response = client.post(
            PROGRAMS_URL,
            {
                "name": "Canonical Offering",
                "code": f"OFFER-{uuid.uuid4().hex[:8].upper()}",
                "institution_id": str(institution.id),
                "canonical_program_id": str(canonical.id),
                "duration_months": 36,
            },
            format="json",
        )

        assert response.status_code == 201, response.data
        created = Program.objects.get(institution_id=institution.id)
        assert str(created.canonical_program_id) == str(canonical.id)
        # A canonical write is NOT deprecation-signalled (it is the successor).
        assert response.get("Deprecation") is None


# ---------------------------------------------------------------------------
# DB-backed: deprecation headers on the frozen legacy institution/intake writes
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLegacyCatalogWriteDeprecationHeaders:
    def test_legacy_institution_create_is_deprecation_signalled(self, production_scope):
        client = _client_for(build_profile(role="super_admin"))
        response = client.post(
            INSTITUTIONS_URL,
            {"name": "Legacy Tenant", "code": f"LEG-{uuid.uuid4().hex[:6].upper()}"},
            format="json",
        )
        assert response.status_code == 201, response.data
        assert response["Deprecation"] == "true"
        assert response["X-Legacy-Catalog-Write"] == "institution"
        assert "/api/v1/admin/institutions/" in response["Link"]

    def test_legacy_intake_create_is_deprecation_signalled(self, production_scope):
        client = _client_for(build_profile(role="super_admin"))
        response = client.post(
            INTAKES_LEGACY_URL,
            {
                "name": "Legacy Intake",
                "year": 2027,
                "application_deadline": "2027-01-01",
                "max_capacity": 100,
            },
            format="json",
        )
        assert response.status_code == 201, response.data
        assert response["Deprecation"] == "true"
        assert response["X-Legacy-Catalog-Write"] == "intake"
        assert "/api/v1/admin/intakes/" in response["Link"]


# ---------------------------------------------------------------------------
# DB-backed: canonical /admin/intakes/ home
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAdminIntakeCanonicalHome:
    def test_super_admin_can_create_list_update_deactivate(self, production_scope):
        client = _client_for(build_profile(role="super_admin"))

        # create
        create = client.post(
            ADMIN_INTAKES_URL,
            {
                "name": "Canonical Intake",
                "year": 2027,
                "application_deadline": "2027-02-01",
                "max_capacity": 80,
            },
            format="json",
        )
        assert create.status_code == 201, create.data
        intake_id = create.json()["data"]["id"]
        # The canonical home is NOT deprecation-signalled.
        assert create.get("Deprecation") is None

        # list
        listing = client.get(ADMIN_INTAKES_URL)
        assert listing.status_code == 200, listing.data
        ids = [row["id"] for row in listing.json()["data"]]
        assert intake_id in ids

        # update
        patch = client.patch(
            f"{ADMIN_INTAKES_URL}{intake_id}/", {"max_capacity": 120}, format="json"
        )
        assert patch.status_code == 200, patch.data
        assert Intake.objects.get(id=intake_id).max_capacity == 120

        # deactivate
        delete = client.delete(f"{ADMIN_INTAKES_URL}{intake_id}/")
        assert delete.status_code == 200, delete.data
        assert Intake.objects.get(id=intake_id).is_active is False

    def test_student_is_denied_intake_management(self, production_scope):
        client = _client_for(build_profile(role="student"))
        response = client.post(
            ADMIN_INTAKES_URL,
            {"name": "Nope", "year": 2027, "application_deadline": "2027-02-01", "max_capacity": 10},
            format="json",
        )
        assert response.status_code == 403, response.data
        assert not Intake.objects.filter(name="Nope").exists()
