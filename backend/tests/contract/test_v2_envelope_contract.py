"""Contract tests for the V2 response/error envelope — Task 1.3.

Proves that:
1. Every success response matches the canonical shape.
2. Every error response matches the canonical shape.
3. Every registered error code produces a valid envelope.
4. Validation errors produce per-field ``fields`` map.
5. Pagination produces the V2 envelope with meta.
6. Domain exceptions produce the correct status and code.
7. The renderer does not double-wrap already-enveloped responses.

Requirements: R14.1-R14.2, R17.2
Finding: API-01
"""

from __future__ import annotations

import os
import uuid
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import pytest
from django.test import SimpleTestCase, override_settings, RequestFactory
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.exceptions import (
    AuthenticationFailed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.common.v2 import (
    API_VERSION,
    V2_ERROR_CODES,
    V2APIView,
    V2ConflictError,
    V2ConfigurationUnavailable,
    V2DomainError,
    V2EnvelopeRenderer,
    V2FeeNotConfigured,
    V2Pagination,
    V2ProviderUnavailable,
    V2VersionConflictError,
    build_error,
    build_success,
    get_error_code,
    register_error_code,
    v2_exception_handler,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

factory = APIRequestFactory()


def _make_request(method="GET", path="/api/v2/test/"):
    """Build a minimal DRF request with request_id."""
    request = factory.get(path) if method == "GET" else factory.post(path)
    request.request_id = str(uuid.uuid4())
    return request


# ---------------------------------------------------------------------------
# 1. Success envelope shape tests
# ---------------------------------------------------------------------------


class TestSuccessEnvelope(SimpleTestCase):
    """The V2 success envelope has exactly {success, data, meta}."""

    def test_build_success_shape(self):
        req_id = str(uuid.uuid4())
        result = build_success({"id": 1, "name": "Test"}, request_id=req_id)

        assert result["success"] is True
        assert result["data"] == {"id": 1, "name": "Test"}
        assert result["meta"]["request_id"] == req_id
        assert result["meta"]["api_version"] == "v2"

    def test_build_success_with_none_request_id(self):
        result = build_success([], request_id=None)

        assert result["success"] is True
        assert result["data"] == []
        assert result["meta"]["request_id"] is None
        assert result["meta"]["api_version"] == "v2"

    def test_build_success_with_primitive_data(self):
        result = build_success("ok", request_id="abc-123")
        assert result["data"] == "ok"

    def test_build_success_keys_are_exactly_three(self):
        result = build_success({})
        assert set(result.keys()) == {"success", "data", "meta"}

    def test_meta_keys_are_exactly_two(self):
        result = build_success({})
        assert set(result["meta"].keys()) == {"request_id", "api_version"}


# ---------------------------------------------------------------------------
# 2. Error envelope shape tests
# ---------------------------------------------------------------------------


class TestErrorEnvelope(SimpleTestCase):
    """The V2 error envelope has exactly {success, error, meta}."""

    def test_build_error_shape(self):
        req_id = str(uuid.uuid4())
        result = build_error(
            code="VALIDATION_ERROR",
            message="The submitted data is invalid.",
            fields={"email": ["Enter a valid email address."]},
            retryable=False,
            request_id=req_id,
        )

        assert result["success"] is False
        assert result["error"]["code"] == "VALIDATION_ERROR"
        assert result["error"]["message"] == "The submitted data is invalid."
        assert result["error"]["fields"] == {"email": ["Enter a valid email address."]}
        assert result["error"]["retryable"] is False
        assert result["meta"]["request_id"] == req_id
        assert result["meta"]["api_version"] == "v2"

    def test_build_error_keys_are_exactly_three(self):
        result = build_error(code="X", message="Y")
        assert set(result.keys()) == {"success", "error", "meta"}

    def test_error_object_keys(self):
        result = build_error(code="X", message="Y", retryable=True)
        assert set(result["error"].keys()) == {"code", "message", "fields", "retryable"}

    def test_build_error_defaults_fields_to_empty_dict(self):
        result = build_error(code="NOT_FOUND", message="Gone.")
        assert result["error"]["fields"] == {}

    def test_build_error_defaults_retryable_to_false(self):
        result = build_error(code="NOT_FOUND", message="Gone.")
        assert result["error"]["retryable"] is False


# ---------------------------------------------------------------------------
# 3. Every registered error code produces a valid envelope
# ---------------------------------------------------------------------------


class TestRegisteredErrorCodes(SimpleTestCase):
    """Every code in V2_ERROR_CODES produces a structurally valid envelope."""

    def test_all_codes_produce_valid_envelope(self):
        for code, entry in V2_ERROR_CODES.items():
            with self.subTest(code=code):
                result = build_error(
                    code=entry.code,
                    message=entry.message,
                    retryable=entry.retryable,
                    request_id="test-req-id",
                )
                assert result["success"] is False
                assert result["error"]["code"] == code
                assert isinstance(result["error"]["message"], str)
                assert len(result["error"]["message"]) > 0
                assert isinstance(result["error"]["retryable"], bool)
                assert result["meta"]["request_id"] == "test-req-id"
                assert result["meta"]["api_version"] == "v2"

    def test_all_codes_have_valid_http_status(self):
        for code, entry in V2_ERROR_CODES.items():
            with self.subTest(code=code):
                assert 400 <= entry.http_status <= 599, (
                    f"{code} has invalid status {entry.http_status}"
                )

    def test_codes_are_screaming_snake_case(self):
        import re

        pattern = re.compile(r"^[A-Z][A-Z0-9_]+$")
        for code in V2_ERROR_CODES:
            with self.subTest(code=code):
                assert pattern.match(code), f"{code} is not SCREAMING_SNAKE_CASE"

    def test_get_error_code_unknown_degrades_to_internal(self):
        result = get_error_code("NONEXISTENT_CODE_XYZ")
        assert result.code == "INTERNAL_ERROR"
        assert result.http_status == 500


# ---------------------------------------------------------------------------
# 4. Exception handler tests
# ---------------------------------------------------------------------------


class TestV2ExceptionHandler(SimpleTestCase):
    """v2_exception_handler produces the V2 error envelope for DRF exceptions."""

    def _context(self, request=None):
        return {"request": request or _make_request(), "view": None}

    def test_validation_error_produces_field_map(self):
        exc = ValidationError({"email": ["Invalid."], "name": ["Required."]})
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 400
        assert response.data["success"] is False
        assert response.data["error"]["code"] == "VALIDATION_ERROR"
        assert "email" in response.data["error"]["fields"]
        assert "name" in response.data["error"]["fields"]
        assert response.data["meta"]["api_version"] == "v2"

    def test_authentication_failed_produces_401(self):
        exc = AuthenticationFailed("Token expired")
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 401
        assert response.data["error"]["code"] == "AUTHENTICATION_REQUIRED"

    def test_not_authenticated_produces_401(self):
        exc = NotAuthenticated()
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 401
        assert response.data["error"]["code"] == "AUTHENTICATION_REQUIRED"

    def test_permission_denied_produces_403(self):
        exc = PermissionDenied()
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 403
        assert response.data["error"]["code"] == "INSUFFICIENT_PERMISSIONS"

    def test_not_found_produces_404(self):
        exc = NotFound()
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 404
        assert response.data["error"]["code"] == "NOT_FOUND"

    def test_throttled_produces_429_retryable(self):
        exc = Throttled(wait=30)
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 429
        assert response.data["error"]["code"] == "RATE_LIMITED"
        assert response.data["error"]["retryable"] is True

    def test_unhandled_exception_produces_500(self):
        exc = RuntimeError("database exploded")
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 500
        assert response.data["error"]["code"] == "INTERNAL_ERROR"
        # Must not leak internal detail.
        assert "database exploded" not in response.data["error"]["message"]

    def test_request_id_propagated(self):
        request = _make_request()
        exc = NotFound()
        ctx = {"request": request, "view": None}
        response = v2_exception_handler(exc, ctx)

        assert response.data["meta"]["request_id"] == request.request_id

    def test_v2_domain_error_produces_correct_envelope(self):
        exc = V2FeeNotConfigured()
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 422
        assert response.data["error"]["code"] == "FEE_NOT_CONFIGURED"
        assert response.data["error"]["retryable"] is False

    def test_v2_conflict_error(self):
        exc = V2ConflictError("Item already exists.")
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 409
        assert response.data["error"]["code"] == "CONFLICT"
        assert response.data["error"]["message"] == "Item already exists."

    def test_v2_version_conflict(self):
        exc = V2VersionConflictError()
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 409
        assert response.data["error"]["code"] == "VERSION_CONFLICT"

    def test_v2_provider_unavailable(self):
        exc = V2ProviderUnavailable("Payment gateway is down.")
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 503
        assert response.data["error"]["code"] == "PROVIDER_UNAVAILABLE"
        assert response.data["error"]["retryable"] is True

    def test_v2_configuration_unavailable(self):
        exc = V2ConfigurationUnavailable()
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 503
        assert response.data["error"]["code"] == "CONFIGURATION_UNAVAILABLE"
        assert response.data["error"]["retryable"] is True

    def test_domain_error_with_custom_fields(self):
        exc = V2DomainError(
            "VALIDATION_ERROR",
            fields={"phone": ["Invalid format."]},
        )
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 400
        assert response.data["error"]["fields"] == {"phone": ["Invalid format."]}

    def test_nested_validation_errors_flattened(self):
        exc = ValidationError({
            "address": {"street": ["Required."], "city": ["Required."]},
        })
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        fields = response.data["error"]["fields"]
        assert "address.street" in fields
        assert "address.city" in fields

    def test_list_validation_errors_as_non_field(self):
        exc = ValidationError(["Something is wrong."])
        ctx = self._context()
        response = v2_exception_handler(exc, ctx)

        fields = response.data["error"]["fields"]
        assert "non_field_errors" in fields


# ---------------------------------------------------------------------------
# 5. Renderer tests
# ---------------------------------------------------------------------------


class TestV2EnvelopeRenderer(SimpleTestCase):
    """V2EnvelopeRenderer wraps success and passes through errors."""

    def _render(self, data, status_code=200, request=None):
        renderer = V2EnvelopeRenderer()
        request = request or _make_request()
        response = MagicMock()
        response.status_code = status_code
        context = {"response": response, "request": request}
        import json as _json

        raw = renderer.render(data, renderer_context=context)
        return _json.loads(raw)

    def test_success_wrapping(self):
        result = self._render({"name": "Test"})
        assert result["success"] is True
        assert result["data"] == {"name": "Test"}
        assert "meta" in result
        assert result["meta"]["api_version"] == "v2"

    def test_list_data_wrapped(self):
        result = self._render([1, 2, 3])
        assert result["success"] is True
        assert result["data"] == [1, 2, 3]

    def test_error_pass_through(self):
        error_envelope = build_error(code="NOT_FOUND", message="Gone.", request_id="x")
        result = self._render(error_envelope, status_code=404)
        assert result["success"] is False
        assert result["error"]["code"] == "NOT_FOUND"

    def test_no_double_wrapping_of_success_envelope(self):
        already_wrapped = build_success({"x": 1}, request_id="y")
        result = self._render(already_wrapped, status_code=200)
        # Should not nest another success envelope inside data.
        assert result["data"] == {"x": 1}
        assert result["meta"]["request_id"] == "y"

    def test_pagination_envelope_passes_through(self):
        paginated = {
            "success": True,
            "data": {"page": 1, "page_size": 20, "total_count": 5, "results": []},
            "meta": {"request_id": "z", "api_version": "v2"},
        }
        result = self._render(paginated, status_code=200)
        assert result == paginated


# ---------------------------------------------------------------------------
# 6. Pagination tests
# ---------------------------------------------------------------------------


class TestV2Pagination(SimpleTestCase):
    """V2Pagination produces the canonical paginated envelope."""

    def test_paginated_response_shape(self):
        from django.core.paginator import Paginator
        from rest_framework.request import Request

        paginator = V2Pagination()
        paginator.page_size = 2
        # Build a proper DRF Request (has query_params).
        wsgi_request = factory.get("/api/v2/test/")
        wsgi_request.request_id = str(uuid.uuid4())
        drf_request = Request(wsgi_request)
        drf_request.request_id = wsgi_request.request_id
        paginator.request = drf_request

        # Manually set up the page.
        items = list(range(5))
        django_paginator = Paginator(items, 2)
        paginator.page = django_paginator.page(1)

        response = paginator.get_paginated_response(items[:2])

        assert response.data["success"] is True
        assert response.data["data"]["page"] == 1
        assert response.data["data"]["page_size"] == 2
        assert response.data["data"]["total_count"] == 5
        assert response.data["data"]["results"] == [0, 1]
        assert response.data["meta"]["api_version"] == "v2"
        assert response.data["meta"]["request_id"] == drf_request.request_id


# ---------------------------------------------------------------------------
# 7. Error code registry tests
# ---------------------------------------------------------------------------


class TestErrorCodeRegistry(SimpleTestCase):
    """The error code registry is immutable once defined."""

    def test_register_new_code(self):
        from apps.common.v2.error_codes import V2ErrorCode

        code = V2ErrorCode("TEST_UNIQUE_CODE_XYZ", 418, "I'm a teapot.", retryable=False)
        register_error_code(code)
        assert get_error_code("TEST_UNIQUE_CODE_XYZ") == code
        # Cleanup.
        del V2_ERROR_CODES["TEST_UNIQUE_CODE_XYZ"]

    def test_register_duplicate_same_attributes_is_ok(self):
        from apps.common.v2.error_codes import V2ErrorCode

        code = V2ErrorCode("NOT_FOUND", 404, "The requested resource was not found.", retryable=False)
        # Should not raise.
        register_error_code(code)

    def test_register_duplicate_different_attributes_raises(self):
        from apps.common.v2.error_codes import V2ErrorCode

        code = V2ErrorCode("NOT_FOUND", 500, "Changed message.", retryable=True)
        with self.assertRaises(ValueError):
            register_error_code(code)

    def test_minimum_registered_codes(self):
        # At least the core transport/auth/conflict/provider/fallback codes.
        expected_minimum = {
            "VALIDATION_ERROR",
            "AUTHENTICATION_REQUIRED",
            "INSUFFICIENT_PERMISSIONS",
            "NOT_FOUND",
            "METHOD_NOT_ALLOWED",
            "RATE_LIMITED",
            "CONFLICT",
            "VERSION_CONFLICT",
            "IDEMPOTENCY_KEY_CONFLICT",
            "FEE_NOT_CONFIGURED",
            "CONFIGURATION_UNAVAILABLE",
            "PROVIDER_UNAVAILABLE",
            "SERVICE_UNAVAILABLE",
            "INTERNAL_ERROR",
            "INSTITUTION_OVERRIDE_NOT_PERMITTED",
        }
        assert expected_minimum.issubset(set(V2_ERROR_CODES.keys()))
