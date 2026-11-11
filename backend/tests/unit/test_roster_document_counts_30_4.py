"""Queue rows carry plain-text document state (platform-simplification task 30.4, R17.5).

``current_document_count`` and ``verified_document_count`` use the review
workspace's definition (current versions; of those, ``verified``), are counted
inside the already-scoped window so another tenant's evidence never contributes,
and stay out of the CSV export.
"""
import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.query_service import ApplicationQueryService
from apps.catalog.services import AccessScopeService
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import build_application, build_two_tenant_worlds

QUERY_URL = "/api/v1/admin/applications/"


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


def _app(world, **overrides):
    return build_application(
        student=world.student,
        institution=world.institution,
        canonical_program=world.canonical_program,
        offering=world.offering,
        intake=world.intake,
        **overrides,
    )


def _doc(app, document_type, status, *, version=1, is_current=True):
    return ApplicationDocument.objects.create(
        application=app,
        document_type=document_type,
        document_name=f"{document_type}.pdf",
        verification_status=status,
        version=version,
        is_current=is_current,
    )


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.fixture()
def worlds(db):
    return build_two_tenant_worlds(with_application=False)


@pytest.mark.django_db
class TestRosterDocumentCounts:
    def test_counts_current_versions_and_verified_ones(self, worlds):
        world_a, _ = worlds
        app = _app(world_a, status="submitted")
        _doc(app, "nrc", "verified")
        _doc(app, "result_slip", "pending")
        _doc(app, "photo", "verified", version=1, is_current=False)  # superseded
        _doc(app, "photo", "uploaded", version=2)

        data = _client_for(world_a.staff).get(QUERY_URL).json()["data"]
        row = next(r for r in data["results"] if r["id"] == str(app.id))
        assert row["current_document_count"] == 3
        assert row["verified_document_count"] == 1

    def test_no_documents_reads_zero_of_zero(self, worlds):
        world_a, _ = worlds
        app = _app(world_a, status="submitted")
        data = _client_for(world_a.staff).get(QUERY_URL).json()["data"]
        row = next(r for r in data["results"] if r["id"] == str(app.id))
        assert (row["current_document_count"], row["verified_document_count"]) == (0, 0)

    def test_another_tenants_evidence_never_counts(self, worlds):
        world_a, world_b = worlds
        mine = _app(world_a, status="submitted")
        theirs = _app(world_b, status="submitted")
        _doc(theirs, "nrc", "verified")
        _doc(theirs, "result_slip", "verified")

        data = _client_for(world_a.staff).get(QUERY_URL).json()["data"]
        ids = {r["id"] for r in data["results"]}
        assert str(theirs.id) not in ids
        row = next(r for r in data["results"] if r["id"] == str(mine.id))
        assert row["current_document_count"] == 0

    def test_counts_stay_out_of_the_export_columns(self):
        assert "current_document_count" not in ApplicationQueryService.ROW_COLUMNS
        assert "verified_document_count" not in ApplicationQueryService.ROW_COLUMNS
