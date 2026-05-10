"""Tests for security fixes: debug permission removal, AuditMiddleware entity ID
extraction, ReadOnlyMiddleware fast path, and idempotency task discoverability.

Implements task 9.5.
Requirements: 8.3, 9.2, 10.2, 11.1
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import importlib
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase


# ---------------------------------------------------------------------------
# 1. IsAuthenticatedOrDebug no longer exists
# ---------------------------------------------------------------------------


class TestDebugPermissionRemoved(SimpleTestCase):
    """Requirement 8.3 — IsAuthenticatedOrDebug must not exist in the codebase."""

    def test_no_is_authenticated_or_debug_in_permissions(self):
        """The debug auth bypass class must be removed from apps.common.permissions."""
        import apps.common.permissions as perms_module

        self.assertFalse(
            hasattr(perms_module, "IsAuthenticatedOrDebug"),
            "IsAuthenticatedOrDebug should have been removed from apps.common.permissions",
        )

    def test_is_authenticated_importable(self):
        """Standard IsAuthenticated from DRF should still be importable."""
        from rest_framework.permissions import IsAuthenticated

        self.assertIsNotNone(IsAuthenticated)


# ---------------------------------------------------------------------------
# 2. AuditMiddleware entity ID extraction
# ---------------------------------------------------------------------------


class TestAuditMiddlewareEntityIdExtraction(SimpleTestCase):
    """Requirement 10.2 — AuditMiddleware._extract_entity_id() extracts UUIDs from paths."""

    def setUp(self):
        from apps.common.middleware import AuditMiddleware

        self.middleware = AuditMiddleware(get_response=lambda r: None)

    def test_extracts_uuid_from_applications_path(self):
        path = "/api/v1/applications/550e8400-e29b-41d4-a716-446655440000/"
        result = self.middleware._extract_entity_id(path)
        self.assertEqual(result, "550e8400-e29b-41d4-a716-446655440000")

    def test_extracts_uuid_from_jobs_path(self):
        path = "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/"
        result = self.middleware._extract_entity_id(path)
        self.assertEqual(result, "a1b2c3d4-e5f6-7890-abcd-ef1234567890")

    def test_extracts_uuid_from_documents_path(self):
        path = "/api/v1/documents/12345678-abcd-ef01-2345-6789abcdef01/"
        result = self.middleware._extract_entity_id(path)
        self.assertEqual(result, "12345678-abcd-ef01-2345-6789abcdef01")

    def test_returns_none_for_path_without_id(self):
        path = "/api/v1/auth/login/"
        result = self.middleware._extract_entity_id(path)
        self.assertIsNone(result)

    def test_returns_none_for_resource_list_path(self):
        path = "/api/v1/applications/"
        result = self.middleware._extract_entity_id(path)
        self.assertIsNone(result)

    def test_returns_none_for_non_api_path(self):
        path = "/health/ready/"
        result = self.middleware._extract_entity_id(path)
        self.assertIsNone(result)

    def test_extracts_from_nested_resource_path(self):
        """Extracts the first UUID-like segment after the resource name."""
        path = "/api/v1/applications/550e8400-e29b-41d4-a716-446655440000/documents/"
        result = self.middleware._extract_entity_id(path)
        self.assertEqual(result, "550e8400-e29b-41d4-a716-446655440000")


# ---------------------------------------------------------------------------
# 3. ReadOnlyMiddleware fast path when env var unset
# ---------------------------------------------------------------------------


class TestReadOnlyMiddlewareFastPath(SimpleTestCase):
    """Requirement 11.1 — ReadOnlyMiddleware passes through when READ_ONLY_MODE is unset."""

    def test_fast_path_when_env_var_unset(self):
        """When READ_ONLY_MODE is not set, middleware passes through immediately."""
        from apps.common.readonly import ReadOnlyMiddleware

        sentinel = object()
        get_response = MagicMock(return_value=sentinel)

        with patch.dict(os.environ, {}, clear=False):
            # Ensure READ_ONLY_MODE is not in the environment
            os.environ.pop("READ_ONLY_MODE", None)
            mw = ReadOnlyMiddleware(get_response)

        self.assertFalse(mw.is_read_only)

        request = MagicMock(method="POST")
        result = mw(request)

        # The middleware should pass through to get_response, not block
        get_response.assert_called_once_with(request)
        self.assertIs(result, sentinel)

    def test_fast_path_when_env_var_empty(self):
        """When READ_ONLY_MODE is empty string, middleware passes through."""
        from apps.common.readonly import ReadOnlyMiddleware

        sentinel = object()
        get_response = MagicMock(return_value=sentinel)

        with patch.dict(os.environ, {"READ_ONLY_MODE": ""}):
            mw = ReadOnlyMiddleware(get_response)

        self.assertFalse(mw.is_read_only)

        request = MagicMock(method="DELETE")
        result = mw(request)

        get_response.assert_called_once_with(request)
        self.assertIs(result, sentinel)

    def test_blocks_writes_when_enabled(self):
        """When READ_ONLY_MODE=true, write requests are blocked with 503."""
        from apps.common.readonly import ReadOnlyMiddleware

        get_response = MagicMock()

        with patch.dict(os.environ, {"READ_ONLY_MODE": "true"}):
            mw = ReadOnlyMiddleware(get_response)

        self.assertTrue(mw.is_read_only)

        request = MagicMock(method="POST")
        result = mw(request)

        get_response.assert_not_called()
        self.assertEqual(result.status_code, 503)

    def test_allows_reads_when_enabled(self):
        """When READ_ONLY_MODE=true, GET requests still pass through."""
        from apps.common.readonly import ReadOnlyMiddleware

        sentinel = object()
        get_response = MagicMock(return_value=sentinel)

        with patch.dict(os.environ, {"READ_ONLY_MODE": "true"}):
            mw = ReadOnlyMiddleware(get_response)

        request = MagicMock(method="GET")
        result = mw(request)

        get_response.assert_called_once_with(request)
        self.assertIs(result, sentinel)


# ---------------------------------------------------------------------------
# 4. Idempotency task uses full dotted path in CELERY_BEAT_SCHEDULE
# ---------------------------------------------------------------------------


class TestIdempotencyTaskDiscoverability(SimpleTestCase):
    """Requirement 9.2 — cleanup-idempotency-keys uses full dotted module path."""

    def test_task_uses_dotted_path(self):
        """The CELERY_BEAT_SCHEDULE entry must use the full dotted path."""
        from django.conf import settings

        schedule = settings.CELERY_BEAT_SCHEDULE
        entry = schedule.get("cleanup-idempotency-keys")
        self.assertIsNotNone(entry, "cleanup-idempotency-keys not found in CELERY_BEAT_SCHEDULE")

        task_name = entry["task"]
        self.assertEqual(
            task_name,
            "apps.common.tasks.cleanup_idempotency_keys",
            f"Expected full dotted path, got: {task_name}",
        )

    def test_task_has_dot_in_name(self):
        """The task name must contain dots (not a bare function name)."""
        from django.conf import settings

        entry = settings.CELERY_BEAT_SCHEDULE["cleanup-idempotency-keys"]
        self.assertIn(".", entry["task"], "Task name should be a dotted module path")

    def test_task_schedule_is_daily_at_0300(self):
        """The task should still run daily at 03:00 UTC."""
        from django.conf import settings

        entry = settings.CELERY_BEAT_SCHEDULE["cleanup-idempotency-keys"]
        schedule = entry["schedule"]
        # crontab objects have hour and minute as set-like attributes
        self.assertEqual(schedule.hour, {3})
        self.assertEqual(schedule.minute, {0})


class TestDjangoFiveStorageSettings(SimpleTestCase):
    """BUG-004 — storage backends use Django's STORAGES setting."""

    def test_deprecated_storage_settings_removed(self):
        import config.settings.base as base_settings

        self.assertFalse(hasattr(base_settings, "STATICFILES_STORAGE"))
        self.assertFalse(hasattr(base_settings, "DEFAULT_FILE_STORAGE"))

    def test_storages_backends_configured(self):
        from django.conf import settings

        self.assertEqual(
            settings.STORAGES["default"]["BACKEND"],
            "storages.backends.s3boto3.S3Boto3Storage",
        )
        self.assertEqual(
            settings.STORAGES["staticfiles"]["BACKEND"],
            "whitenoise.storage.CompressedManifestStaticFilesStorage",
        )


class TestProductionDebugGuard(SimpleTestCase):
    """ZDR-007 — DEBUG must not serve the production API hostname."""

    def test_debug_with_production_host_raises(self):
        from django.core.exceptions import ImproperlyConfigured

        import config.settings.base as base_settings

        with patch.object(base_settings, "DEBUG", True), patch.object(
            base_settings, "ALLOWED_HOSTS", ["api.mihas.edu.zm"]
        ):
            with self.assertRaises(ImproperlyConfigured):
                base_settings.validate_debug_not_serving_production_hosts()
