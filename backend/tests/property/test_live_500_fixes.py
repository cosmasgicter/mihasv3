"""Property-based tests for live-500-fixes spec.

# Feature: live-500-fixes

Property 3: Timestamp auto-population on model creation
Property 4: SHA-256 hash values fit in model CharField max_length
"""

import hashlib
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import uuid  # noqa: E402

import pytest  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.models import ApplicationStatusHistory  # noqa: E402
from apps.common.models import AuditLog  # noqa: E402


# =========================================================================
# Property 3: Timestamp auto-population on model creation
# =========================================================================


class TestTimestampAutoPopulation(SimpleTestCase):
    """Property 3: Timestamp auto-population on model creation.

    Test that AuditLog and ApplicationStatusHistory models have
    auto_now_add=True on their created_at fields, ensuring Django
    auto-populates the timestamp on creation.

    **Validates: Requirements 3.2, 4.1, 4.3, 4.4, 6.2**
    """

    @given(action=st.sampled_from(["create", "update", "delete", "login", "logout"]))
    @settings(max_examples=5, deadline=None)
    def test_audit_log_created_at_has_auto_now_add(self, action):
        """AuditLog.created_at field has auto_now_add=True."""
        field = AuditLog._meta.get_field("created_at")
        assert field.has_default() or field.auto_now_add, (
            "AuditLog.created_at must have auto_now_add=True"
        )
        assert field.auto_now_add is True, (
            f"AuditLog.created_at.auto_now_add is {field.auto_now_add}, expected True"
        )

    @given(status=st.sampled_from(["draft", "submitted", "approved", "rejected"]))
    @settings(max_examples=5, deadline=None)
    def test_application_status_history_created_at_has_auto_now_add(self, status):
        """ApplicationStatusHistory.created_at field has auto_now_add=True."""
        field = ApplicationStatusHistory._meta.get_field("created_at")
        assert field.has_default() or field.auto_now_add, (
            "ApplicationStatusHistory.created_at must have auto_now_add=True"
        )
        assert field.auto_now_add is True, (
            f"ApplicationStatusHistory.created_at.auto_now_add is {field.auto_now_add}, expected True"
        )


# =========================================================================
# Property 4: SHA-256 hash values fit in model CharField max_length
# =========================================================================


class TestSHA256HashFieldLength(SimpleTestCase):
    """Property 4: SHA-256 hash values fit in model CharField max_length.

    For any string input, hashlib.sha256(input).hexdigest() produces a
    64-character hex string. All model CharField fields that store SHA-256
    hashes must have max_length >= 64.

    **Validates: Requirements 5.2, 5.3, 6.4**
    """

    @given(raw_input=st.text(min_size=0, max_size=500))
    @settings(max_examples=5, deadline=None)
    def test_sha256_fits_in_audit_log_ip_address(self, raw_input):
        """SHA-256 hex digest fits in AuditLog.ip_address max_length."""
        digest = hashlib.sha256(raw_input.encode("utf-8")).hexdigest()
        field = AuditLog._meta.get_field("ip_address")
        assert len(digest) <= field.max_length, (
            f"SHA-256 digest length {len(digest)} exceeds "
            f"AuditLog.ip_address max_length {field.max_length}"
        )

    @given(raw_input=st.text(min_size=0, max_size=500))
    @settings(max_examples=5, deadline=None)
    def test_sha256_fits_in_status_history_ip_address(self, raw_input):
        """SHA-256 hex digest fits in ApplicationStatusHistory.ip_address max_length."""
        digest = hashlib.sha256(raw_input.encode("utf-8")).hexdigest()
        field = ApplicationStatusHistory._meta.get_field("ip_address")
        assert len(digest) <= field.max_length, (
            f"SHA-256 digest length {len(digest)} exceeds "
            f"ApplicationStatusHistory.ip_address max_length {field.max_length}"
        )


# =========================================================================
# Property 5: AuditMiddleware error resilience
# =========================================================================


class TestAuditMiddlewareErrorResilience(SimpleTestCase):
    """Property 5: AuditMiddleware error resilience.

    For any HTTP request that produces a successful (2xx) response,
    if _create_audit_entry() raises an exception, the middleware
    should catch it and return the original response unmodified.

    **Validates: Requirements 6.3**
    """

    @given(
        status_code=st.sampled_from([200, 201, 202, 204]),
        method=st.sampled_from(["POST", "PUT", "PATCH", "DELETE"]),
        path=st.sampled_from([
            "/api/v1/applications/",
            "/api/v1/auth/login/",
            "/api/v1/admin/users/",
            "/api/v1/notifications/",
        ]),
        error_type=st.sampled_from([
            RuntimeError,
            ValueError,
            TypeError,
            OSError,
            Exception,
        ]),
    )
    @settings(max_examples=5, deadline=None)
    def test_original_response_passes_through_on_audit_failure(
        self, status_code, method, path, error_type
    ):
        """When _create_audit_entry raises, the original response is returned unmodified."""
        from unittest.mock import MagicMock, patch

        from django.http import JsonResponse

        from apps.common.middleware import AuditMiddleware

        # Build a mock response with the given status code
        original_body = {"success": True, "data": "test"}
        original_response = JsonResponse(original_body, status=status_code)

        # Build a mock get_response that returns our original response
        get_response = MagicMock(return_value=original_response)
        middleware = AuditMiddleware(get_response)

        # Build a mock request
        request = MagicMock()
        request.method = method
        request.path = path
        request.META = {
            "REMOTE_ADDR": "127.0.0.1",
            "HTTP_USER_AGENT": "TestAgent",
        }
        request.user = MagicMock()
        request.user.is_authenticated = True
        request.user.pk = str(uuid.uuid4())

        # Patch _create_audit_entry to raise the given error type
        with patch.object(
            middleware, "_create_audit_entry", side_effect=error_type("simulated failure")
        ):
            response = middleware(request)

        # The response must be the original, unmodified
        assert response is original_response
        assert response.status_code == status_code


# =========================================================================
# Property 7: No traceback strings in error responses
# =========================================================================


class TestNoTracebackInErrorResponses(SimpleTestCase):
    """Property 7: No traceback strings in error responses.

    For any DRF exception processed by envelope_exception_handler,
    the response body should never contain Python traceback patterns.

    **Validates: Requirements 7.3, 9.6**
    """

    @given(
        error_message=st.text(min_size=1, max_size=200).filter(
            lambda s: s.strip() and "\x00" not in s
        ),
        status_code=st.sampled_from([400, 401, 403, 404, 405, 429]),
    )
    @settings(max_examples=5, deadline=None)
    def test_exception_handler_responses_have_no_traceback_patterns(
        self, error_message, status_code
    ):
        """envelope_exception_handler responses must not contain traceback strings."""
        import json

        from rest_framework.exceptions import (
            AuthenticationFailed,
            MethodNotAllowed,
            NotFound,
            PermissionDenied,
            Throttled,
            ValidationError,
        )

        from apps.common.exceptions import envelope_exception_handler

        # Map status codes to DRF exception classes
        exc_map = {
            400: ValidationError(error_message),
            401: AuthenticationFailed(error_message),
            403: PermissionDenied(error_message),
            404: NotFound(error_message),
            405: MethodNotAllowed("GET"),
            429: Throttled(wait=60),
        }

        exc = exc_map[status_code]

        # Build a minimal context with a mock request
        from unittest.mock import MagicMock

        mock_request = MagicMock()
        mock_request.request_id = None
        context = {"request": mock_request, "view": MagicMock()}

        response = envelope_exception_handler(exc, context)
        assert response is not None

        # Serialize the response body to a string
        body = json.dumps(response.data)

        # Must not contain traceback patterns
        assert "Traceback (most recent call last)" not in body, (
            f"Response contains traceback header: {body[:200]}"
        )
        assert 'File "' not in body, (
            f"Response contains file reference: {body[:200]}"
        )
        # Must not contain line number patterns like 'line 42'
        import re

        assert not re.search(r"line \d+", body), (
            f"Response contains line number reference: {body[:200]}"
        )
