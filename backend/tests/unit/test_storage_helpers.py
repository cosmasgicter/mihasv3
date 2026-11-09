"""Unit tests for apps.common.storage helpers."""

import pytest
from unittest.mock import patch

from apps.common.storage import (
    get_document_storage_key,
    get_s3_client,
    reset_s3_client,
    _get_document_storage_key,
)


class _FakeDoc:
    def __init__(self, file_url):
        self.file_url = file_url


class TestGetDocumentStorageKey:
    def test_full_https_url(self):
        doc = _FakeDoc("https://bucket.r2.cloudflarestorage.com/media/docs/file.pdf")
        assert get_document_storage_key(doc) == "docs/file.pdf"

    def test_relative_path_with_leading_slash(self):
        doc = _FakeDoc("/media/docs/file.pdf")
        assert get_document_storage_key(doc) == "docs/file.pdf"

    def test_media_storage_relative_key(self):
        doc = _FakeDoc("docs/file.pdf")
        assert get_document_storage_key(doc) == "docs/file.pdf"

    @patch("apps.common.storage.settings")
    def test_bucket_prefixed_key(self, mock_settings):
        mock_settings.AWS_STORAGE_BUCKET_NAME = "mybucket"
        doc = _FakeDoc("mybucket/media/docs/file.pdf")
        assert get_document_storage_key(doc) == "docs/file.pdf"

    def test_double_media_prefix(self):
        doc = _FakeDoc("media/media/docs/file.pdf")
        # Only the first media/ prefix is stripped (single pass)
        assert get_document_storage_key(doc) == "media/docs/file.pdf"

    def test_empty_file_url(self):
        doc = _FakeDoc("")
        assert get_document_storage_key(doc) == ""

    def test_none_file_url(self):
        doc = _FakeDoc(None)
        assert get_document_storage_key(doc) == ""

    def test_none_document(self):
        # Object without file_url attribute
        doc = object()
        assert get_document_storage_key(doc) == ""


class TestGetS3ClientCaching:
    def setup_method(self):
        reset_s3_client()

    def teardown_method(self):
        reset_s3_client()

    @patch("apps.common.storage._build_s3_client")
    def test_returns_same_instance(self, mock_build):
        mock_build.return_value = object()
        first = get_s3_client()
        second = get_s3_client()
        assert first is second
        assert mock_build.call_count == 1

    @patch("apps.common.storage._build_s3_client")
    def test_reset_drops_cache(self, mock_build):
        mock_build.return_value = object()
        first = get_s3_client()
        reset_s3_client()
        mock_build.return_value = object()
        second = get_s3_client()
        assert first is not second
        assert mock_build.call_count == 2


class TestLegacyAlias:
    def test_legacy_alias_works(self):
        assert _get_document_storage_key is get_document_storage_key


class TestSignedUrlHost:
    """SJR task 3.1 (clause 2.1): signed URLs are signed against the browser-reachable
    public endpoint, not the internal one. Signing is local, so no network is used."""

    def _sign(self, settings, internal, public):
        from apps.common.storage import generate_signed_url

        settings.AWS_S3_ENDPOINT_URL = internal
        settings.AWS_S3_PUBLIC_ENDPOINT_URL = public
        settings.AWS_S3_ACCESS_KEY_ID = "testkey"
        settings.AWS_S3_SECRET_ACCESS_KEY = "testsecret"
        settings.AWS_STORAGE_BUCKET_NAME = "bucket"
        reset_s3_client()
        try:
            return generate_signed_url("docs/file.pdf", expiry=300)
        finally:
            reset_s3_client()

    def test_signs_against_public_endpoint(self, settings):
        from urllib.parse import urlparse

        url = self._sign(settings, "http://minio:9000", "http://127.0.0.1:59000")
        assert urlparse(url).netloc == "127.0.0.1:59000"

    def test_defaults_to_internal_endpoint(self, settings):
        from urllib.parse import urlparse

        url = self._sign(settings, "http://minio:9000", "")
        assert urlparse(url).netloc == "minio:9000"
