"""Manual asset registration + SVG render-safety tests (task 24.3).

Spec: ``multi-tenant-beanola-remediation`` — task 24.3 ("Asset registration
tests"). These lock down the **generic, caller-metadata** asset-create path and
the backend PDF renderer's SVG handling, covering the lockdown shipped in tasks
24.1/24.2:

- ``backend/apps/catalog/admin_views.py``:
  - ``AdminTenantAssetListCreateView.post`` — the generic create path that
    accepts a caller-supplied ``storage_key`` / ``public_url`` / ``mime_type`` /
    ``checksum_sha256``.
  - helpers ``_asset_invalid_response`` and ``_validate_stored_asset_object``.
- ``backend/apps/applications/tasks/pdf_generation.py::_draw_asset`` — returns
  ``unsupported`` for ``image/svg+xml`` and never opens/rasterises it.

Acceptance criteria:

- **R13.1** the generic asset-create path that accepts a caller-supplied
  ``storage_key`` / ``public_url`` / ``mime_type`` / ``checksum_sha256`` SHALL be
  disabled for non-super-admin actors.
- **R13.2** where manual asset registration remains enabled, it SHALL be
  restricted to Super_Admin, SHALL require ``storage_key`` under
  ``institution-assets/{institution_id}/``, and SHALL validate the stored
  object's bytes + checksum from storage rather than trusting the caller-supplied
  checksum/mime/public_url.
- **R13.5** when the backend PDF renderer encounters an SVG asset it cannot
  render, it SHALL record an ``unsupported`` render status and SHALL NOT execute
  untrusted SVG content.

The multipart upload path (R13.3) is covered by ``test_tenant_asset_upload.py``;
this file is the generic-create + renderer-status companion. Auth follows the
Super_Admin ``JWTUser`` ``force_authenticate`` pattern and ``MediaStorage``
(R2/S3) is mocked at its import site, mirroring ``test_tenant_asset_upload.py``.

**Validates: Requirements R13.1, R13.2, R13.5**
"""

from __future__ import annotations

import hashlib
import uuid
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import InstitutionAsset
from tests.tenant_fixtures import build_institution, build_profile

# Tagged ``tenant`` so the Phase 0 ``-k "... or tenant"`` selector picks it up.
pytestmark = pytest.mark.tenant


_CREATE_URL = "/api/v1/admin/institutions/{institution_id}/assets/"

# Honest magic-byte payloads (mirror the upload-path fixtures).
_PNG_HEADER = b"\x89PNG\r\n\x1a\n"
_HONEST_PNG = _PNG_HEADER + b"honest-png-body-0001"
# 2 MiB cap mirrored from ``admin_views._MAX_ASSET_BYTES``.
_MAX_ASSET_BYTES = 2 * 1024 * 1024


def _client_for(profile) -> APIClient:
    """APIClient authenticated as ``profile`` via the JWTUser pattern.

    ``force_authenticate`` bypasses the authentication classes (and therefore
    CSRF), matching ``test_tenant_asset_upload.py``.
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


def _mock_storage_returning(content: bytes):
    """Return a ``patch`` ctx on ``MediaStorage`` whose ``open`` yields ``content``.

    ``_validate_stored_asset_object`` calls ``storage.open(storage_key)`` then
    ``fh.read(n)`` / ``fh.close()`` and ``storage.url(storage_key)``. A fresh
    ``BytesIO`` per ``open`` call satisfies all three.
    """
    patcher = patch("apps.common.storage.MediaStorage")
    storage_cls = patcher.start()
    instance = MagicMock()
    instance.open.side_effect = lambda key, *a, **k: BytesIO(content)
    instance.url.side_effect = lambda key: f"https://r2.test/{key}"
    storage_cls.return_value = instance
    return patcher, instance


# ---------------------------------------------------------------------------
# R13.1 — the generic caller-metadata create path is super-admin only
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGenericCreateRequiresSuperAdmin:
    """A non-super-admin calling the generic create path is rejected with 403
    FORBIDDEN and no asset row is created (R13.1).

    **Validates: Requirements R13.1**
    """

    @pytest.mark.parametrize("role", ["admin", "reviewer", "student"])
    def test_non_super_admin_generic_create_is_forbidden(self, role):
        institution = build_institution()
        client = _client_for(build_profile(role=role))

        payload = {
            "asset_type": "logo",
            "storage_key": f"institution-assets/{institution.id}/logo.png",
            "public_url": "https://attacker.example/evil.png",
            "mime_type": "image/png",
            "checksum_sha256": "0" * 64,
        }
        response = client.post(
            _CREATE_URL.format(institution_id=institution.id), data=payload, format="json"
        )

        assert response.status_code == 403, response.content
        body = response.json()
        assert body["success"] is False
        # ``admin`` hits the view's ``_write_allowed`` super-admin gate
        # (``FORBIDDEN``); ``reviewer``/``student`` are blocked earlier by the
        # ``IsAdmin`` permission class (``INSUFFICIENT_PERMISSIONS``). Both are
        # the correct R13.1 rejection — the generic path is closed to them.
        assert body["code"] in {"FORBIDDEN", "INSUFFICIENT_PERMISSIONS"}
        # Permission is checked before any storage access or row write.
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    def test_non_super_admin_create_never_touches_storage(self):
        """The forbidden response short-circuits before the stored-object
        validation, so ``MediaStorage`` is never constructed (R13.1)."""
        institution = build_institution()
        client = _client_for(build_profile(role="admin"))

        with patch("apps.common.storage.MediaStorage") as storage_cls:
            response = client.post(
                _CREATE_URL.format(institution_id=institution.id),
                data={
                    "asset_type": "logo",
                    "storage_key": f"institution-assets/{institution.id}/logo.png",
                    "mime_type": "image/png",
                    "checksum_sha256": "0" * 64,
                },
                format="json",
            )

        assert response.status_code == 403, response.content
        assert not storage_cls.called


# ---------------------------------------------------------------------------
# R13.2 — storage_key prefix constraint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStorageKeyConstraint:
    """A super-admin generic create requires ``storage_key`` under
    ``institution-assets/{institution_id}/`` and rejects empty / prefix-only /
    traversal / wrong-prefix keys with 400 ASSET_INVALID, no row written (R13.2).

    **Validates: Requirements R13.2**
    """

    def _bad_keys(self, institution_id):
        prefix = f"institution-assets/{institution_id}/"
        other = uuid.uuid4()
        return {
            "empty": "",
            "prefix_only": prefix,
            "traversal": f"{prefix}../evil.png",
            "wrong_prefix": f"other-assets/{institution_id}/logo.png",
            "other_institution": f"institution-assets/{other}/logo.png",
            "absolute_escape": "/etc/passwd",
        }

    @pytest.mark.parametrize(
        "case",
        ["empty", "prefix_only", "traversal", "wrong_prefix", "other_institution", "absolute_escape"],
    )
    def test_invalid_storage_key_is_rejected(self, case):
        institution = build_institution()
        client = _client_for(_super_admin())
        storage_key = self._bad_keys(institution.id)[case]

        # The prefix check runs before storage is touched; patch defensively so
        # a regression that reaches storage still fails loudly here.
        with patch("apps.common.storage.MediaStorage") as storage_cls:
            response = client.post(
                _CREATE_URL.format(institution_id=institution.id),
                data={
                    "asset_type": "logo",
                    "storage_key": storage_key,
                    "mime_type": "image/png",
                    "checksum_sha256": "0" * 64,
                },
                format="json",
            )

        assert response.status_code == 400, response.content
        body = response.json()
        assert body["success"] is False
        assert body["code"] == "ASSET_INVALID"
        assert not storage_cls.called
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0


# ---------------------------------------------------------------------------
# R13.2 — stored-object bytes + checksum validation (caller values overwritten)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStoredObjectValidation:
    """The generic create validates the *stored object's* bytes + checksum from
    storage and overwrites the caller-supplied checksum / mime / public_url with
    server-validated values; a missing / empty / oversized / MIME-mismatched
    stored object is rejected with 400 ASSET_INVALID (R13.2).

    **Validates: Requirements R13.2**
    """

    def _post(self, client, institution_id, **payload):
        body = {
            "asset_type": "logo",
            "storage_key": f"institution-assets/{institution_id}/logo.png",
        }
        body.update(payload)
        return client.post(
            _CREATE_URL.format(institution_id=institution_id), data=body, format="json"
        )

    def test_valid_stored_object_overwrites_caller_metadata(self):
        institution = build_institution()
        client = _client_for(_super_admin())
        content = _HONEST_PNG
        server_checksum = hashlib.sha256(content).hexdigest()
        storage_key = f"institution-assets/{institution.id}/logo.png"

        patcher, instance = _mock_storage_returning(content)
        try:
            response = self._post(
                client,
                institution.id,
                mime_type="image/png",
                # Deliberately bogus caller-supplied values that MUST be ignored.
                checksum_sha256="deadbeef" * 8,
                public_url="https://attacker.example/evil.png",
            )
        finally:
            patcher.stop()

        assert response.status_code == 201, response.content
        data = response.json()["data"]

        # Server-validated checksum + MIME, not the caller-supplied ones.
        assert data["checksum_sha256"] == server_checksum
        assert data["checksum_sha256"] != "deadbeef" * 8
        assert data["mime_type"] == "image/png"
        # public_url is derived from storage, not the attacker-controlled value.
        assert data["public_url"] == f"https://r2.test/{storage_key}"
        assert "attacker.example" not in (data["public_url"] or "")

        # The persisted row carries the server-validated values.
        row = InstitutionAsset.objects.get(id=data["id"])
        assert row.checksum_sha256 == server_checksum
        assert row.mime_type == "image/png"
        assert row.storage_key == storage_key
        assert row.version == 1
        # The stored object's bytes were actually read from storage.
        assert instance.open.called

    def test_missing_stored_object_is_rejected(self):
        institution = build_institution()
        client = _client_for(_super_admin())

        patcher = patch("apps.common.storage.MediaStorage")
        storage_cls = patcher.start()
        instance = MagicMock()
        instance.open.side_effect = FileNotFoundError("no such object")
        storage_cls.return_value = instance
        try:
            response = self._post(client, institution.id, mime_type="image/png")
        finally:
            patcher.stop()

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    def test_empty_stored_object_is_rejected(self):
        institution = build_institution()
        client = _client_for(_super_admin())

        patcher, _instance = _mock_storage_returning(b"")
        try:
            response = self._post(client, institution.id, mime_type="image/png")
        finally:
            patcher.stop()

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    def test_oversized_stored_object_is_rejected(self):
        institution = build_institution()
        client = _client_for(_super_admin())
        oversized = _PNG_HEADER + b"\x00" * (_MAX_ASSET_BYTES + 1)

        patcher, _instance = _mock_storage_returning(oversized)
        try:
            response = self._post(client, institution.id, mime_type="image/png")
        finally:
            patcher.stop()

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0

    def test_mime_mismatch_stored_object_is_rejected(self):
        """Honest PNG bytes declared as JPEG → magic-byte mismatch → ASSET_INVALID,
        no row, caller checksum never persisted."""
        institution = build_institution()
        client = _client_for(_super_admin())

        patcher, _instance = _mock_storage_returning(_HONEST_PNG)
        try:
            response = self._post(
                client, institution.id, mime_type="image/jpeg", checksum_sha256="0" * 64
            )
        finally:
            patcher.stop()

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "ASSET_INVALID"
        assert InstitutionAsset.objects.filter(institution_id=institution.id).count() == 0


# ---------------------------------------------------------------------------
# R13.5 — the renderer never executes/draws an SVG; status matrix is correct
# ---------------------------------------------------------------------------


class TestDrawAssetRenderStatus:
    """``_draw_asset`` returns the correct provenance status for each case and
    never opens / rasterises an SVG asset (R13.5).

    Pure unit tests — no DB and no real storage; the renderer helper is called
    with a lightweight fake asset and a sentinel canvas / mocked image reader.

    **Validates: Requirements R13.5**
    """

    def _svg_asset(self):
        return SimpleNamespace(
            id=uuid.uuid4(),
            mime_type="image/svg+xml",
            storage_key="institution-assets/x/logo.svg",
        )

    def _raster_asset(self, mime_type="image/png"):
        return SimpleNamespace(
            id=uuid.uuid4(),
            mime_type=mime_type,
            storage_key="institution-assets/x/logo.png",
        )

    def test_svg_returns_unsupported_without_touching_storage_or_canvas(self):
        from apps.applications.tasks.pdf_generation import _draw_asset

        canvas = MagicMock()
        with patch("apps.common.storage.MediaStorage") as storage_cls:
            status = _draw_asset(canvas, self._svg_asset(), 0, 0, max_width=10, max_height=10)
            # The SVG branch short-circuits before constructing storage …
            assert not storage_cls.called

        # … and before any draw call on the canvas.
        assert status == "unsupported"
        assert not canvas.drawImage.called

    def test_none_asset_returns_none(self):
        from apps.applications.tasks.pdf_generation import _draw_asset

        canvas = MagicMock()
        with patch("apps.common.storage.MediaStorage") as storage_cls:
            status = _draw_asset(canvas, None, 0, 0, max_width=10, max_height=10)
            assert not storage_cls.called

        assert status == "none"
        assert not canvas.drawImage.called

    def test_raster_asset_is_drawn(self):
        """A configured raster (PNG) asset loads from storage and is embedded,
        returning ``drawn``."""
        from apps.applications.tasks.pdf_generation import _draw_asset

        canvas = MagicMock()

        handle = MagicMock()
        handle.read.return_value = _HONEST_PNG
        cm = MagicMock()
        cm.__enter__.return_value = handle
        storage_instance = MagicMock()
        storage_instance.open.return_value = cm

        image = MagicMock()
        image.getSize.return_value = (100, 50)

        with patch("apps.common.storage.MediaStorage", return_value=storage_instance), patch(
            "reportlab.lib.utils.ImageReader", return_value=image
        ):
            status = _draw_asset(canvas, self._raster_asset(), 0, 0, max_width=10, max_height=10)

        assert status == "drawn"
        assert storage_instance.open.called
        assert canvas.drawImage.called

    def test_unreadable_raster_asset_returns_error(self):
        """A configured raster asset that fails to load from storage returns
        ``error`` (never ``drawn`` and never an exception)."""
        from apps.applications.tasks.pdf_generation import _draw_asset

        canvas = MagicMock()
        storage_instance = MagicMock()
        storage_instance.open.side_effect = OSError("storage unreachable")

        with patch("apps.common.storage.MediaStorage", return_value=storage_instance):
            status = _draw_asset(canvas, self._raster_asset(), 0, 0, max_width=10, max_height=10)

        assert status == "error"
        assert not canvas.drawImage.called
