"""Official-document envelope returns a SIGNED download URL, never the raw one.

Regression for the production "downloads not working" bug: the stored
``ApplicationDocument.file_url`` is a permanent, **unsigned** R2/S3 object URL
and the bucket is private (``AWS_DEFAULT_ACL = None``), so handing the raw URL
to the browser yields ``403 AccessDenied``. ``_build_envelope`` must presign the
URL (mirroring ``DocumentDownloadView``) before exposing it as ``download_url``.

These tests target the pure ``_build_envelope`` seam directly so they need no
DB, broker, or live storage — the signer is mocked.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from apps.applications import official_document_views as odv


class _Doc:
    """Minimal stand-in for an ApplicationDocument row."""

    def __init__(self, file_url, doc_id="11111111-1111-1111-1111-111111111111"):
        self.id = doc_id
        self.file_url = file_url
        self.uploaded_at = None
        self.verification_notes = None


_APP = SimpleNamespace(institution_ref_id="22222222-2222-2222-2222-222222222222")
_RAW_URL = (
    "https://acct.r2.cloudflarestorage.com/mihasapplication/media/"
    "application-slips/abc/def.pdf"
)
_SIGNED_URL = _RAW_URL + "?X-Amz-Signature=deadbeef&X-Amz-Expires=900"


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
    """``_signed_download_url`` derives the key and calls the shared signer."""
    doc = _Doc(_RAW_URL)
    with patch("apps.common.storage.get_document_storage_key", return_value="application-slips/abc/def.pdf") as key_fn, patch(
        "apps.common.storage.generate_signed_url", return_value=_SIGNED_URL
    ) as sign_fn:
        result = odv._signed_download_url(doc)
    key_fn.assert_called_once_with(doc)
    sign_fn.assert_called_once_with("application-slips/abc/def.pdf")
    assert result == _SIGNED_URL


def test_signer_helper_returns_none_on_failure():
    """Signer failure degrades to None rather than raising (no 500 on status read)."""
    doc = _Doc(_RAW_URL)
    with patch("apps.common.storage.get_document_storage_key", side_effect=RuntimeError("boom")):
        assert odv._signed_download_url(doc) is None


def test_signer_helper_returns_none_for_fileless_document():
    assert odv._signed_download_url(_Doc("")) is None
    assert odv._signed_download_url(None) is None
