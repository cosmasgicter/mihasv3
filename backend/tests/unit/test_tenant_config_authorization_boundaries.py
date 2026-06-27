"""Focused tenant-config authorization regressions.

These tests pin the surfaces most likely to regress during the Beanola
multi-tenant migration: a tenant admin scoped to one institution must never
mutate another institution's document configuration or assets.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import InstitutionAsset, InstitutionDocumentProfile
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import build_institution, build_membership, build_profile

pytestmark = pytest.mark.tenant


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


def _tenant_admin_for(institution):
    actor = build_profile(role="admin")
    build_membership(
        user=actor,
        institution=institution,
        role="admin",
        permissions=["manage"],
    )
    return actor


def _make_document_profile(institution, *, sections=None):
    now = timezone.now()
    return InstitutionDocumentProfile.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        document_type="acceptance_letter",
        layout_key="fee_chart_letter",
        sections=sections or {"body": "Original body."},
        fee_chart=[],
        bank_accounts=[],
        requirements=[],
        signatory={"name": "Registrar", "role": "Admissions"},
        version=1,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


@pytest.fixture()
def production_scope(monkeypatch):
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.mark.django_db
def test_tenant_admin_cannot_mutate_foreign_document_profile(production_scope):
    own = build_institution()
    foreign = build_institution()
    actor = _tenant_admin_for(own)
    profile = _make_document_profile(foreign)

    response = _client_for(actor).patch(
        f"/api/v1/admin/institutions/{foreign.id}/document-profiles/{profile.id}/",
        {"sections": {"body": "Changed by foreign tenant admin."}},
        format="json",
    )

    profile.refresh_from_db()
    assert response.status_code in (403, 404), (response.status_code, response.data)
    assert profile.sections == {"body": "Original body."}


@pytest.mark.django_db
def test_tenant_admin_cannot_upload_asset_for_foreign_tenant(production_scope):
    own = build_institution()
    foreign = build_institution()
    actor = _tenant_admin_for(own)
    upload = SimpleUploadedFile(
        "logo.png",
        b"\x89PNG\r\n\x1a\nnot-a-real-logo-but-valid-header",
        content_type="image/png",
    )

    with patch("apps.common.storage.MediaStorage") as storage_cls:
        storage_cls.return_value = MagicMock()
        response = _client_for(actor).post(
            f"/api/v1/admin/institutions/{foreign.id}/assets/upload/",
            data={"file": upload, "asset_type": "logo"},
            format="multipart",
        )

    assert response.status_code == 403, (response.status_code, response.data)
    assert InstitutionAsset.objects.filter(institution_id=foreign.id).count() == 0
    assert not storage_cls.return_value.save.called
