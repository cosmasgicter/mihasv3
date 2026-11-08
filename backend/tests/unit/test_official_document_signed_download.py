"""Official-document envelope returns a SIGNED download URL, never the raw one.

Regression for the production "downloads not working" bug: the stored
``ApplicationDocument.file_url`` / ``storage_key`` is an object key (rows written
before SJR task 3.13 hold a presigned URL that expires after 15 minutes) and the
bucket is private (``AWS_DEFAULT_ACL = None``), so the raw value is never a
usable link. ``_build_envelope`` must presign the
URL (mirroring ``DocumentDownloadView``) before exposing it as ``download_url``.

These tests target the pure ``_build_envelope`` seam directly so they need no
DB, broker, or live storage — the signer is mocked.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications import document_views as legacy_document_views
from apps.applications import official_document_views as odv
from apps.applications.official_document_jobs import OfficialDocumentJob
from tests.tenant_fixtures import build_profile, build_tenant_world


class _Doc:
    """Minimal stand-in for an ApplicationDocument row."""

    def __init__(
        self,
        file_url,
        doc_id="11111111-1111-1111-1111-111111111111",
        storage_key=None,
        document_name="Application Slip.pdf",
    ):
        self.id = doc_id
        self.file_url = file_url
        self.storage_key = storage_key
        self.document_name = document_name
        self.uploaded_at = None
        self.verification_notes = None


_APP = SimpleNamespace(institution_ref_id="22222222-2222-2222-2222-222222222222")
# What official-document generation persists since SJR task 3.13: the key.
# (The old fixture was an unsigned bucket URL, which no writer ever stored: the
# writer persisted ``storage.url()``, a presigned URL, which hid defect B-01.)
_RAW_URL = "application-slips/abc/def.pdf"
_SIGNED_URL = (
    "https://acct.r2.cloudflarestorage.com/mihasapplication/media/"
    "application-slips/abc/def.pdf?X-Amz-Signature=deadbeef&X-Amz-Expires=900"
)


def _open_job(document_type: str = "application_slip"):
    """A committed, open durable generation job (admissions-v2 task 10.4).

    ``_request_generation`` returns one of these after the row commits; these
    DB-free cases stand one in so they exercise the view rather than the outbox.
    """
    return OfficialDocumentJob(
        id=str(uuid.uuid4()),
        application_id=str(uuid.uuid4()),
        document_type=document_type,
        state="pending",
        attempts=0,
    )


def _super_admin():
    user_id = uuid.uuid4()
    return JWTUser(
        {
            "user_id": str(user_id),
            "email": "super@example.com",
            "role": "super_admin",
            "first_name": "Super",
            "last_name": "Admin",
        }
    )


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


def test_download_url_is_signed_not_raw():
    """A ready document exposes the *signed* URL, never the stored raw one."""
    doc = _Doc(_RAW_URL)
    with patch.object(odv, "_signed_download_url", return_value=_SIGNED_URL) as signer:
        data = odv._build_envelope(_APP, "application_slip", document=doc, status_value="ready")
    signer.assert_called_once_with(doc)
    assert data["download_url"] == _SIGNED_URL
    assert data["download_url"] != _RAW_URL
    assert "X-Amz-Signature" in data["download_url"]


def test_download_url_omitted_when_signing_unavailable():
    """If signing fails/returns None, omit download_url (UI keeps non-ready)."""
    doc = _Doc(_RAW_URL)
    with patch.object(odv, "_signed_download_url", return_value=None):
        data = odv._build_envelope(_APP, "application_slip", document=doc, status_value="ready")
    assert "download_url" not in data


def test_no_document_has_no_download_url():
    """A queued (no document) envelope never carries a download URL."""
    data = odv._build_envelope(_APP, "application_slip", document=None, status_value="queued")
    assert "download_url" not in data
    assert data["document_id"] is None


def test_signer_helper_presigns_storage_key():
    """``_signed_download_url`` resolves the key and signs it at read time."""
    doc = _Doc(_RAW_URL, storage_key=_RAW_URL)
    with patch("apps.common.storage.generate_signed_url", return_value=_SIGNED_URL) as sign_fn:
        result = odv._signed_download_url(doc)
    sign_fn.assert_called_once_with("application-slips/abc/def.pdf")
    assert result == _SIGNED_URL


def test_signer_helper_returns_none_on_failure():
    """Signer failure degrades to None rather than raising (no 500 on status read)."""
    doc = _Doc(_RAW_URL, storage_key=_RAW_URL)
    with patch("apps.common.storage.resolve_document_open_url", side_effect=RuntimeError("boom")):
        assert odv._signed_download_url(doc) is None


def test_signer_helper_returns_none_for_fileless_document():
    assert odv._signed_download_url(_Doc("")) is None
    assert odv._signed_download_url(None) is None


def test_generate_requeues_when_current_document_is_stale():
    """POST must not return a ready/downloadable stale current version."""
    factory = APIRequestFactory()
    application = SimpleNamespace(
        id=uuid.uuid4(),
        institution_ref_id=uuid.uuid4(),
        status="submitted",
    )
    doc = _Doc(_RAW_URL)
    request = factory.post(
        f"/api/v1/applications/{application.id}/official-documents/application_slip/"
    )
    force_authenticate(request, user=_super_admin())

    with patch.object(odv, "_get_authorized_application", return_value=(application, None)), patch.object(
        odv, "_current_official_version", return_value=doc
    ), patch.object(
        odv, "official_document_matches_current_inputs", return_value=False
    ) as freshness, patch.object(
        # admissions-v2 task 10.4: the POST path commits a durable job before it
        # answers 202, so the seam this case fakes is the request command rather
        # than the broker dispatch it now wraps. The claim is unchanged — a stale
        # current version is re-requested, never served.
        odv, "_request_generation", return_value=(_open_job(), "task-stale")
    ) as enqueue, patch.object(
        odv, "_audit_official_document_queued"
    ) as audit:
        response = odv.OfficialDocumentDetailView.as_view()(
            request,
            application_id=application.id,
            document_type="application_slip",
        )

    assert response.status_code == 202
    assert response.data["success"] is True
    assert response.data["data"]["status"] == "queued"
    assert response.data["data"]["document_id"] is None
    assert "download_url" not in response.data["data"]
    freshness.assert_called_once_with(application, "application_slip", doc)
    enqueue.assert_called_once_with(application, "application_slip", request.user and enqueue.call_args[0][2])
    audit.assert_called_once()


def test_status_reports_no_queue_when_current_document_is_stale_and_unrequested():
    """GET must not expose a signed URL for a stale current version.

    admissions-v2 task 10.4 (R13.11, STU-18): it must not report ``queued``
    either. Nothing has been requested since the document went stale, so there is
    no committed job, nobody is rendering anything, and a poll would never end.
    The honest answer is ``not_requested`` — which is what tells the client to
    POST rather than to keep asking.
    """
    factory = APIRequestFactory()
    application = SimpleNamespace(
        id=uuid.uuid4(),
        institution_ref_id=uuid.uuid4(),
        status="submitted",
    )
    doc = _Doc(_RAW_URL)
    request = factory.get(
        f"/api/v1/applications/{application.id}/official-documents/application_slip/"
    )
    force_authenticate(request, user=_super_admin())

    with patch.object(odv, "_get_authorized_application", return_value=(application, None)), patch.object(
        odv, "_current_official_version", return_value=doc
    ), patch.object(
        odv, "official_document_matches_current_inputs", return_value=False
    ) as freshness, patch.object(
        odv, "_latest_render_failure", return_value=None
    ) as failure, patch.object(
        odv, "_signed_download_url", return_value=_SIGNED_URL
    ) as signer:
        response = odv.OfficialDocumentDetailView.as_view()(
            request,
            application_id=application.id,
            document_type="application_slip",
        )

    assert response.status_code == 200
    assert response.data["success"] is True
    assert response.data["data"]["status"] == "not_requested"
    assert response.data["data"]["job"]["state"] == "none"
    assert response.data["data"]["document_id"] is None
    assert "download_url" not in response.data["data"]
    freshness.assert_called_once_with(application, "application_slip", doc)
    failure.assert_called_once_with(application, "application_slip", current_document=doc)
    signer.assert_not_called()


def test_status_reports_setup_required_after_profile_failure():
    """GET surfaces terminal tenant setup failures instead of endless queued."""
    factory = APIRequestFactory()
    application = SimpleNamespace(
        id=uuid.uuid4(),
        institution_ref_id=uuid.uuid4(),
        status="approved",
    )
    request = factory.get(
        f"/api/v1/applications/{application.id}/official-documents/acceptance_letter/"
    )
    force_authenticate(request, user=_super_admin())

    with patch.object(odv, "_get_authorized_application", return_value=(application, None)), patch.object(
        odv, "_current_official_version", return_value=None
    ), patch.object(
        odv, "_latest_render_failure",
        return_value=("setup_required", "DOCUMENT_PROFILE_NOT_CONFIGURED"),
    ):
        response = odv.OfficialDocumentDetailView.as_view()(
            request,
            application_id=application.id,
            document_type="acceptance_letter",
        )

    assert response.status_code == 200
    assert response.data["success"] is True
    data = response.data["data"]
    assert data["status"] == "setup_required"
    assert data["document_id"] is None
    assert data["error_code"] == "DOCUMENT_PROFILE_NOT_CONFIGURED"
    assert data["setup_required"] is True
    assert "download_url" not in data


def test_list_includes_latest_setup_required_failure():
    """The list endpoint includes latest terminal failures per type."""
    factory = APIRequestFactory()
    application = SimpleNamespace(
        id=uuid.uuid4(),
        institution_ref_id=uuid.uuid4(),
        status="approved",
    )
    request = factory.get(f"/api/v1/applications/{application.id}/official-documents/")
    force_authenticate(request, user=_super_admin())

    def failure_for(_application, document_type, *, current_document=None):
        if document_type == "acceptance_letter":
            return ("setup_required", "DOCUMENT_PROFILE_NOT_CONFIGURED")
        return None

    with patch.object(odv, "_get_authorized_application", return_value=(application, None)), patch.object(
        odv, "_current_official_version", return_value=None
    ), patch.object(odv, "_latest_render_failure", side_effect=failure_for):
        response = odv.OfficialDocumentListView.as_view()(
            request,
            application_id=application.id,
        )

    assert response.status_code == 200
    assert response.data["success"] is True
    assert response.data["data"] == [
        {
            "document_id": None,
            "document_type": "acceptance_letter",
            "status": "setup_required",
            "generated_at": None,
            "template_version": None,
            "institution_id": str(application.institution_ref_id),
            # admissions-v2 task 10.4: the durable job, the read-existing marker
            # and the retry affordance travel with every entry.
            "historical": False,
            "job": {
                "state": "none",
                "attempts": 0,
                "requested_at": None,
                "settled_at": None,
                "error_code": None,
                "terminal": False,
                "can_retry": False,
            },
            "can_retry": False,
            "error_code": "DOCUMENT_PROFILE_NOT_CONFIGURED",
            "setup_required": True,
        }
    ]


def test_legacy_application_slip_endpoint_delegates_to_official_document_route():
    """Legacy generation endpoints are deprecated wrappers over official docs."""
    factory = APIRequestFactory()
    application = SimpleNamespace(
        id=uuid.uuid4(),
        institution_ref_id=uuid.uuid4(),
        status="submitted",
    )
    request = factory.post(f"/api/v1/applications/{application.id}/application-slip/")
    force_authenticate(request, user=_super_admin())

    with patch.object(
        legacy_document_views, "_get_scoped_application", return_value=application
    ), patch.object(
        odv, "_get_authorized_application", return_value=(application, None)
    ), patch.object(
        odv, "_current_official_version", return_value=None
    ), patch.object(
        odv, "_request_generation", return_value=(_open_job(), "task-legacy")
    ), patch.object(
        odv, "_audit_official_document_queued"
    ):
        response = legacy_document_views.ApplicationSlipView.as_view()(
            request,
            application_id=application.id,
        )

    assert response.status_code == 202
    assert response.data["success"] is True
    assert response.data["data"]["status"] == "queued"
    assert response.data["data"]["document_type"] == "application_slip"
    assert response["Deprecation"] == "true"
    assert "official-documents/application_slip" in response["Link"]


@pytest.mark.django_db
def test_tenant_admin_cannot_generate_out_of_scope_official_document():
    world = build_tenant_world(application_status="submitted")
    tenant_admin = build_profile(role="admin")
    client = _client_for(tenant_admin)

    response = client.post(
        f"/api/v1/applications/{world.application.id}/official-documents/application_slip/"
    )

    assert response.status_code == 404
    assert response.json() == {
        "success": False,
        "error": "Document not found",
        "code": "NOT_FOUND",
    }


@pytest.mark.django_db
def test_super_admin_can_generate_official_document_for_any_tenant():
    world = build_tenant_world(application_status="submitted")
    super_admin = build_profile(role="super_admin")
    client = _client_for(super_admin)

    with patch.object(
        odv, "_request_generation", return_value=(_open_job(), "task-super")
    ), patch.object(odv, "_audit_official_document_queued"):
        response = client.post(
            f"/api/v1/applications/{world.application.id}/official-documents/application_slip/"
        )

    assert response.status_code == 202
    body = response.json()
    assert body["success"] is True
    assert body["data"]["document_type"] == "application_slip"
    assert body["data"]["status"] == "queued"
