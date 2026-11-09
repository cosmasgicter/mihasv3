"""R4-c key resolution rules (student-journey-repair task 3.13, clause 2.20)."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.test import override_settings

from apps.common import storage

SETTINGS = dict(
    AWS_S3_ENDPOINT_URL="https://acct.r2.cloudflarestorage.com",
    AWS_S3_PUBLIC_ENDPOINT_URL="",
    AWS_STORAGE_BUCKET_NAME="mihas-bucket",
)


@override_settings(**SETTINGS)
@pytest.mark.parametrize(
    ("value", "expected"),
    [
        # rule 0: a bare UUID is a presence marker, never a key
        ("0b8f2c1e-1d3a-4c5b-9e7f-0123456789ab", None),
        ("0B8F2C1E-1D3A-4C5B-9E7F-0123456789AB", None),
        # rule 1: relative values are keys, prefixes stripped
        ("documents/a/result_slip/x.pdf", "documents/a/result_slip/x.pdf"),
        ("/media/documents/a/x.pdf", "documents/a/x.pdf"),
        ("mihas-bucket/media/documents/a/x.pdf", "documents/a/x.pdf"),
        # rule 2: presigned anywhere, or our endpoint host
        ("https://other.example/media/doc%20a.pdf?X-Amz-Signature=s", "doc a.pdf"),
        ("https://acct.r2.cloudflarestorage.com/mihas-bucket/media/doc.pdf", "doc.pdf"),
        ("https://mihas-bucket.acct.r2.cloudflarestorage.com/media/doc.pdf", "doc.pdf"),
        # rule 3: a foreign https URL is a legacy-provider URL, not a key
        ("https://legacy.example.org/uploads/old.pdf", None),
        # rule 4: anything else
        ("", None),
        ("ftp://x/y", None),
        (None, None),
    ],
)
def test_key_from_persisted_value(value, expected):
    assert storage._key_from_persisted_value(value) == expected


@override_settings(**SETTINGS)
def test_storage_key_wins_over_file_url():
    doc = SimpleNamespace(id="d", storage_key="documents/a/k.pdf", file_url="https://x/old?X-Amz-Date=1")
    assert storage.resolve_document_object_key(doc) == "documents/a/k.pdf"


@override_settings(**SETTINGS)
def test_open_url_signs_the_key_and_passes_legacy_urls_through():
    keyed = SimpleNamespace(id="d", storage_key="documents/a/k.pdf", file_url="documents/a/k.pdf")
    legacy = SimpleNamespace(id="e", storage_key=None, file_url="https://legacy.example.org/u/old.pdf")
    marker = SimpleNamespace(id="f", storage_key=None, file_url="0b8f2c1e-1d3a-4c5b-9e7f-0123456789ab")
    with patch.object(storage, "generate_signed_url", side_effect=lambda key, *a, **k: f"signed:{key}") as sign:
        assert storage.resolve_document_open_url(keyed) == "signed:documents/a/k.pdf"
        assert storage.resolve_document_open_url(legacy) == "https://legacy.example.org/u/old.pdf"
        assert storage.resolve_document_open_url(marker) is None
    sign.assert_called_once_with("documents/a/k.pdf")
