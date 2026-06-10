"""Tenant asset upload integrity tests (task 15.2).

Spec: ``multi-tenant-beanola-admissions`` — Phase 4 task 15.2
("Asset upload integrity"). These cover the multipart upload endpoint
``POST /api/v1/admin/institutions/{institution_id}/assets/upload/``
(``backend/apps/catalog/admin_views.py:AdminTenantAssetUploadView``) — the
*endpoint* integrity surface, distinct from the pure-validator per-type
property coverage in ``tests/unit/test_official_documents.py`` (P14).

Acceptance criteria:

- **R5.3** the upload endpoint SHALL validate MIME + magic bytes for
  PNG/JPEG/WebP/SVG, capture a SHA-256 checksum, store a versioned
  R2/S3-backed row, and reject mismatched or oversized files with a clear
  error.
- **R5.4** a new logo/signature/seal version SHALL create a new versioned
  ``InstitutionAsset`` row and SHALL NOT alter assets already referenced by
  previously generated ``Official_Documents``.
- **R6.6** when template/assets change after an ``Official_Document`` was
  generated, the system SHALL NOT silently regenerate or alter the previously
  generated document.
- **R14.5** test coverage for asset MIME/magic-byte validation per allowed
  type.

Auth follows the Super_Admin ``JWTUser`` ``force_authenticate`` pattern from
``test_tenant_admin_endpoints.py``. ``MediaStorage`` (R2/S3) is unavailable in
the test environment, so it is mocked minimally at its import site
(``apps.common.storage.MediaStorage``) — the integrity assertions (checksum,
detected MIME, version increment, provenance immutability) all run against
real ``InstitutionAsset`` / ``ApplicationDocument`` rows in the test DB.

**Validates: Requirements R5.3, R5.4, R6.6, R14.5**
"""

from __future__ import annotations

import hashlib
import json
import uuid
from unittest.mock import MagicMock, patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import InstitutionAsset
from tests.tenant_fixtures import (
    build_document,
    build_institution,
    build_profile,
    build_tenant_world,
)

# Tagged ``tenant`` so the Phase 0 ``-k "... or tenant"`` selector picks it up.
pytestmark = pytest.mark.tenant


# ---------------------------------------------------------------------------
# Honest magic-byte payloads per allowed asset type (mirror P14 fixtures)
# ---------------------------------------------------------------------------

_PNG_HEADER = b"\x89PNG\r\n\x1a\n"
_JPEG_HEADER = b"\xff\xd8\xff\xe0\x00\x10JFIF"
_WEBP_HEADER = b"RIFF\x00\x00\x00\x00WEBPVP8 "
_SVG_BODY = b"<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>"

# Declared MIME → an honest body of that type. Each binary header gets a short
# tail so the upload is a plausible file, not a bare signature.
_HONEST_PAYLOADS: dict[str, bytes] = {
    "image/png": _PNG_HEADER + b"honest-png-body-0001",
    "image/jpeg": _JPEG_HEADER + b"\x00\x01honest-jpeg-body",
    "image/webp": _WEBP_HEADER + b"honest-webp-body-0001",
    "image/svg+xml": _SVG_BODY,
}

_UPLOAD_URL = "/api/v1/admin/institutions/{institution_id}/assets/upload/"


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
    """APIClient authenticated as ``profile`` via the JWTUser pattern.

    ``force_authenticate`` bypasses the authentication classes (and therefore
    CSRF), matching ``test_tenant_admin_endpoints.py``. The acting profile is a
    real ``Profile`` row so the ``created_by`` FK written on create resolves.
    """
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


def _super_admin():
    return build_profile(role="super_admin")


def _upload(client, institution_id, *, content, content_type, asset_type="logo", filename="asset.bin"):
    upload = SimpleUploadedFile(filename, content, content_type=content_type)
    return client.post(
        _UPLOAD_URL.format(institution_id=institution_id),
        data={"file": upload, "asset_type": asset_type},
        format="multipart",
    )


@pytest.fixture()
def mock_media_storage():
    """Minimal in-memory stand-in for the R2/S3 ``MediaStorage`` backend.

    ``save(key, file)`` echoes the key back as the stored name and ``url(name)``
    returns a deterministic public URL — enough for the endpoint to persist a
    versioned row without touching real object storage. Patched at the import
    site used inside ``AdminTenantAssetUploadView.post``.
    """
    with patch("apps.common.storage.MediaStorage") as storage_cls:
        instance = MagicMock()
        instance.save.side_effect = lambda key, file_obj: key
        instance.url.side_effect = lambda name: f"https://r2.test/{name}"
        storage_cls.return_value = instance
        yield instance


def _build_asset(institution, *, asset_type="logo", version=1, **overrides):
    """Persist one ``InstitutionAsset`` row directly (no endpoint)."""
    now = timezone.now()
    defaults = {
        "id": uuid.uuid4(),
        "institution": institution,
        "asset_type": asset_type,
        "storage_key": f"institution-assets/{institution.id}/{asset_type}-v{version}.png",
        "public_url": f"https://r2.test/{asset_type}-v{version}.png",
        "mime_type": "image/png",
        "checksum_sha256": hashlib.sha256(f"v{version}".encode()).hexdigest(),
        "version": version,
        "is_active": True,
        "metadata": {"original_name": f"{asset_type}-v{version}.png"},
        "created_at": now,
    }
    defaults.update(overrides)
    return InstitutionAsset.objects.create(**defaults)


# ---------------------------------------------------------------------------
# R5.3 — per-type honest upload succeeds with versioned row + checksum + MIME
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestHonestUploadPerType:
    """An honest PNG/JPEG/WebP/SVG upload is stored with a captured checksum,
    the correct detected MIME, and version 1 (R5.3, R14.5).

    **Validates: Requirements R5.3, R14.5**
    """

    @pytest.mark.parametrize("content_type", sorted(_HONEST_PAYLOADS))
    def test_honest_upload_creates_versioned_row(self, content_type, mock_media_storage):
        institution = build_institution()
        content = _HONEST_PAYLOADS[content_type]
        client = _client_for(_super_admin())

        response = _upload(
            client, institution.id, content=content, content_type=content_type, asset_type="logo"
        )

        assert response.status_code == 201, response.content
        body = response.json()
        assert body["success"] is True
        data = body["data"]

        # Detected MIME matches the honest declared type.
        assert data["mime_type"] == content_type
        # SHA-256 checksum is captured over the full file content.
        assert data["checksum_sha256"] == hashlib.sha256(content).hexdigest()
        # First version of this (institution, asset_type) pair.
        assert data["version"] == 1
        assert data["asset_type"] == "logo"
        assert data["is_active"] is True

        # A real, versioned row was persisted (R2/S3-backed key + checksum).
        row = InstitutionAsset.objects.get(id=data["id"])
        assert row.version == 1
        assert row.mime_type == content_type
        assert row.checksum_sha256 == hashlib.sha256(content).hexdigest()
        assert row.storage_key  # a storage key was recorded
        # The storage backend was actually exercised.
        assert mock_media_storage.save.called

    def test_checksum_differs_for_different_content(self, mock_media_storage):
        """Two distinct payloads of the same type yield distinct checksums."""
        institution = build_institution()
        client = _client_for(_super_admin())

        first = _upload(
            client, institution.id, content=_PNG_HEADER + b"AAAA", content_type="image/png", asset_type="seal"
        )
        second = _upload(
            client, institution.id, content=_PNG_HEADER + b"BBBB", content_type="image/png", asset_type="seal"
        )

        assert first.status_code == 201, first.content
        assert second.status_code == 201, second.content
        assert first.json()["data"]["checksum_sha256"] != second.json()["data"]["checksum_sha256"]


# ---------------------------------------------------------------------------
# R5.3 — mismatched / oversized / disallowed uploads are rejected
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestUploadRejection:
    """Mismatched, oversized, and disallowed uploads are rejected with a clear
    error and never persist a row (R5.3).

    **Validates: Requirements R5.3**
    """

    def test_declared_vs_content_mismatch_is_rejected(self, mock_media_storage):
        """PNG bytes declared as JPEG → 400 ASSET_INVALID, no row written."""
        institution = build_institution()
        client = _client_for(_super_admin())

        response = _upload(
            client, institution.id, content=_PNG_HEADER + b"x", content_type="image/jpeg", asset_type="logo"
        )

        assert response.status_code == 400, response.content
        body = response.json()
        assert body["success"] is False
        assert body["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    @pytest.mark.parametrize(
        "honest_mime,spoof_as",
        [
            ("image/png", "image/jpeg"),
            ("image/jpeg", "image/png"),
            ("image/webp", "image/png"),
            ("image/svg+xml", "image/png"),
            ("image/png", "image/webp"),
            ("image/png", "image/svg+xml"),
        ],
    )
    def test_per_type_content_type_spoof_is_rejected(self, honest_mime, spoof_as, mock_media_storage):
        """For every allowed type, honest content declared as a *different*
        allowed type → 400 ASSET_INVALID, no row written (R5.3, R14.5).

        **Validates: Requirements R5.3, R14.5**
        """
        institution = build_institution()
        client = _client_for(_super_admin())

        response = _upload(
            client,
            institution.id,
            content=_HONEST_PAYLOADS[honest_mime],
            content_type=spoof_as,
            asset_type="logo",
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    def test_oversized_file_is_rejected(self):
        """A file larger than the 2MB limit → 400 ASSET_INVALID, no row.

        The size guard runs before magic-byte validation and before storage, so
        no ``MediaStorage`` mock is needed here.
        """
        institution = build_institution()
        client = _client_for(_super_admin())
        oversized = _PNG_HEADER + b"\x00" * (2 * 1024 * 1024 + 1)

        response = _upload(
            client, institution.id, content=oversized, content_type="image/png", asset_type="logo"
        )

        assert response.status_code == 400, response.content
        body = response.json()
        assert body["success"] is False
        assert body["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    def test_disallowed_declared_mime_is_rejected(self, mock_media_storage):
        """A GIF (not in the asset allowlist) → 400 ASSET_INVALID, no row."""
        institution = build_institution()
        client = _client_for(_super_admin())

        response = _upload(
            client, institution.id, content=b"GIF89a\x00\x00", content_type="image/gif", asset_type="logo"
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    def test_empty_file_is_rejected(self, mock_media_storage):
        """An empty file declared as PNG → 400 ASSET_INVALID, no row."""
        institution = build_institution()
        client = _client_for(_super_admin())

        response = _upload(
            client, institution.id, content=b"", content_type="image/png", asset_type="logo"
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    def test_unsafe_svg_without_svg_tag_is_rejected(self, mock_media_storage):
        """HTML content declared as SVG (no ``<svg`` root) → 400 ASSET_INVALID."""
        institution = build_institution()
        client = _client_for(_super_admin())

        response = _upload(
            client,
            institution.id,
            content=b"<html><body>not an svg</body></html>",
            content_type="image/svg+xml",
            asset_type="seal",
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    @pytest.mark.parametrize(
        "unsafe_svg",
        [
            b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
            b"<svg xmlns='http://www.w3.org/2000/svg' onload='steal()'></svg>",
            b"<svg xmlns='http://www.w3.org/2000/svg'><a href='javascript:alert(1)'>x</a></svg>",
            b"<?xml version='1.0'?><!DOCTYPE svg [<!ENTITY x 'y'>]><svg xmlns='http://www.w3.org/2000/svg'/>",
        ],
    )
    def test_active_svg_upload_is_rejected(self, unsafe_svg, mock_media_storage):
        """A valid-rooted SVG carrying active content (script / event handler /
        ``javascript:`` URI / DOCTYPE) → 400 ASSET_INVALID, no row written,
        storage never touched (R5.3, R6.7).

        A stored SVG is reachable via its ``public_url`` where a browser would
        execute embedded active content, so the upload endpoint must refuse it.

        **Validates: Requirements R5.3, R6.7, R14.5**
        """
        institution = build_institution()
        client = _client_for(_super_admin())

        response = _upload(
            client, institution.id, content=unsafe_svg, content_type="image/svg+xml", asset_type="logo"
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0
        assert not mock_media_storage.save.called

    def test_safe_static_svg_upload_is_accepted(self, mock_media_storage):
        """A static SVG with no active content is stored as a versioned row
        (R6.7 does not over-block legitimate brand SVGs)."""
        institution = build_institution()
        client = _client_for(_super_admin())
        svg = b"<svg xmlns='http://www.w3.org/2000/svg'><rect width='8' height='8'/></svg>"

        response = _upload(
            client, institution.id, content=svg, content_type="image/svg+xml", asset_type="logo"
        )

        assert response.status_code == 201, response.content
        data = response.json()["data"]
        assert data["mime_type"] == "image/svg+xml"
        assert data["checksum_sha256"] == hashlib.sha256(svg).hexdigest()
        assert data["version"] == 1

    def test_disallowed_asset_type_is_rejected(self, mock_media_storage):
        """An asset_type outside {logo, signature, seal} → 400 VALIDATION_ERROR."""
        institution = build_institution()
        client = _client_for(_super_admin())

        response = _upload(
            client, institution.id, content=_PNG_HEADER + b"x", content_type="image/png", asset_type="banner"
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "VALIDATION_ERROR"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    def test_missing_file_is_rejected(self, mock_media_storage):
        """No file part → 400 VALIDATION_ERROR."""
        institution = build_institution()
        client = _client_for(_super_admin())

        response = client.post(
            _UPLOAD_URL.format(institution_id=institution.id),
            data={"asset_type": "logo"},
            format="multipart",
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "VALIDATION_ERROR"

    def test_non_super_admin_cannot_upload(self, mock_media_storage):
        """A school admin (non-super-admin) is denied with 403 FORBIDDEN."""
        institution = build_institution()
        client = _client_for(build_profile(role="admin"))

        response = _upload(
            client, institution.id, content=_PNG_HEADER + b"x", content_type="image/png", asset_type="logo"
        )

        assert response.status_code == 403, response.content
        assert response.json()["code"] == "FORBIDDEN"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0


# ---------------------------------------------------------------------------
# R5.4 — a new version increments and never mutates the prior row
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAssetVersioning:
    """A second upload of the same asset_type creates version=2 while the
    version=1 row is left unchanged (R5.4).

    **Validates: Requirements R5.4**
    """

    def test_second_upload_creates_version_2_and_leaves_v1_unchanged(self, mock_media_storage):
        institution = build_institution()
        client = _client_for(_super_admin())

        first = _upload(
            client, institution.id, content=_PNG_HEADER + b"v1", content_type="image/png", asset_type="logo"
        )
        assert first.status_code == 201, first.content
        v1_id = first.json()["data"]["id"]
        v1_before = InstitutionAsset.objects.get(id=v1_id)
        v1_snapshot = {
            "storage_key": v1_before.storage_key,
            "checksum_sha256": v1_before.checksum_sha256,
            "version": v1_before.version,
            "mime_type": v1_before.mime_type,
            "is_active": v1_before.is_active,
        }

        second = _upload(
            client, institution.id, content=_PNG_HEADER + b"v2-different", content_type="image/png", asset_type="logo"
        )
        assert second.status_code == 201, second.content
        v2 = second.json()["data"]

        # New row is version 2 and is a distinct row.
        assert v2["version"] == 2
        assert v2["id"] != v1_id

        # The version=1 row is byte-for-byte unchanged.
        v1_after = InstitutionAsset.objects.get(id=v1_id)
        assert v1_after.storage_key == v1_snapshot["storage_key"]
        assert v1_after.checksum_sha256 == v1_snapshot["checksum_sha256"]
        assert v1_after.version == v1_snapshot["version"] == 1
        assert v1_after.mime_type == v1_snapshot["mime_type"]
        assert v1_after.is_active == v1_snapshot["is_active"]

        # Both versions coexist for this (institution, asset_type) pair.
        versions = set(
            InstitutionAsset.objects.filter(
                institution_id=institution.id, asset_type="logo"
            ).values_list("version", flat=True)
        )
        assert versions == {1, 2}

    def test_versions_are_independent_per_asset_type(self, mock_media_storage):
        """Versioning is scoped per asset_type — a new signature is version 1
        even when a logo version 1 already exists."""
        institution = build_institution()
        client = _client_for(_super_admin())

        logo = _upload(
            client, institution.id, content=_PNG_HEADER + b"logo", content_type="image/png", asset_type="logo"
        )
        signature = _upload(
            client, institution.id, content=_JPEG_HEADER + b"sig", content_type="image/jpeg", asset_type="signature"
        )

        assert logo.status_code == 201, logo.content
        assert signature.status_code == 201, signature.content
        assert logo.json()["data"]["version"] == 1
        assert signature.json()["data"]["version"] == 1


# ---------------------------------------------------------------------------
# R5.4 / R6.6 — a new version never alters an already-generated document
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestProvenanceImmutability:
    """Uploading a new asset version never mutates an ``InstitutionAsset`` whose
    id is already snapshotted into an existing ``ApplicationDocument``'s
    ``verification_notes.official_document`` provenance (R5.4, R6.6).

    **Validates: Requirements R5.4, R6.6**
    """

    def test_new_version_does_not_alter_referenced_asset_or_document(self, mock_media_storage):
        world = build_tenant_world(application_status="approved")
        institution = world.institution

        # A prior logo (version 1) that an Official_Document already referenced.
        prior_logo = _build_asset(institution, asset_type="logo", version=1)
        prior_snapshot = {
            "storage_key": prior_logo.storage_key,
            "checksum_sha256": prior_logo.checksum_sha256,
            "mime_type": prior_logo.mime_type,
            "version": prior_logo.version,
            "is_active": prior_logo.is_active,
        }

        # An already-generated official document snapshots the asset id into
        # verification_notes.official_document (mirrors pdf_generation.py).
        provenance = {
            "official_document": {
                "document_type": "acceptance_letter",
                "institution_id": str(institution.id),
                "template_id": None,
                "template_version": None,
                "logo_asset_id": str(prior_logo.id),
                "signature_asset_id": None,
            }
        }
        doc = build_document(
            application=world.application,
            document_type="acceptance_letter",
            system_generated=True,
            verification_status="verified",
            verification_notes=json.dumps(provenance),
        )
        doc_notes_before = doc.verification_notes

        # Upload a brand-new logo version through the endpoint.
        client = _client_for(_super_admin())
        response = _upload(
            client,
            institution.id,
            content=_PNG_HEADER + b"a-newer-logo",
            content_type="image/png",
            asset_type="logo",
        )
        assert response.status_code == 201, response.content
        new_asset = response.json()["data"]
        assert new_asset["version"] == 2
        assert new_asset["id"] != str(prior_logo.id)

        # The previously-referenced asset row is completely unchanged.
        prior_after = InstitutionAsset.objects.get(id=prior_logo.id)
        assert prior_after.storage_key == prior_snapshot["storage_key"]
        assert prior_after.checksum_sha256 == prior_snapshot["checksum_sha256"]
        assert prior_after.mime_type == prior_snapshot["mime_type"]
        assert prior_after.version == prior_snapshot["version"] == 1
        assert prior_after.is_active == prior_snapshot["is_active"]

        # The already-generated document's provenance still points at the
        # original asset id and was not silently regenerated/rewritten (R6.6).
        doc_after = type(doc).objects.get(id=doc.id)
        assert doc_after.verification_notes == doc_notes_before
        snapshot = json.loads(doc_after.verification_notes)["official_document"]
        assert snapshot["logo_asset_id"] == str(prior_logo.id)


# ---------------------------------------------------------------------------
# R6.7 — the renderer never executes/draws an SVG asset
# ---------------------------------------------------------------------------


class TestSvgRenderSafety:
    """The official-document renderer never opens, reads, or draws an SVG
    asset: ``_draw_asset`` returns early for ``image/svg+xml`` so untrusted SVG
    content is never executed or rasterised into a document (R6.7).

    Pure unit test — no DB and no storage needed; the renderer helper is called
    with a lightweight fake asset and a sentinel canvas that would record any
    draw attempt.

    **Validates: Requirements R6.7**
    """

    def test_draw_asset_skips_svg_without_touching_storage_or_canvas(self):
        from types import SimpleNamespace

        from apps.applications.tasks.pdf_generation import _draw_asset

        canvas = MagicMock()
        svg_asset = SimpleNamespace(
            id=uuid.uuid4(),
            mime_type="image/svg+xml",
            storage_key="institution-assets/x/logo.svg",
        )

        with patch("apps.common.storage.MediaStorage") as storage_cls:
            _draw_asset(canvas, svg_asset, 0, 0, max_width=10, max_height=10)
            # The SVG branch must short-circuit before constructing storage …
            assert not storage_cls.called

        # … and before any draw call on the canvas.
        assert not canvas.drawImage.called

    def test_draw_asset_skips_when_asset_is_none(self):
        from apps.applications.tasks.pdf_generation import _draw_asset

        canvas = MagicMock()
        with patch("apps.common.storage.MediaStorage") as storage_cls:
            _draw_asset(canvas, None, 0, 0, max_width=10, max_height=10)
            assert not storage_cls.called
        assert not canvas.drawImage.called
