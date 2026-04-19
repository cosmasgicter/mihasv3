"""Property-based tests for error monitoring (GlitchTip migration).

Tests that:
- Unhandled DRF exceptions call sentry_sdk.capture_exception
- Frontend error reports forward to sentry_sdk.capture_message
- Frontend error reports hash client IP (SHA-256)
- Malformed payloads are rejected with 400
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import hashlib  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.test import APIRequestFactory  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_error_messages = st.text(min_size=1, max_size=500).filter(lambda s: s.strip())

_exception_types = st.sampled_from([
    RuntimeError,
    ValueError,
    TypeError,
    KeyError,
    AttributeError,
    IOError,
    ZeroDivisionError,
    OverflowError,
    NotImplementedError,
    PermissionError,
])


def _make_mock_request():
    """Build a minimal mock Django request for the exception handler."""
    request = MagicMock()
    request.get_full_path.return_value = "/api/v1/test/"
    request.user = MagicMock()
    request.user.is_authenticated = False
    request.request_id = None
    return request


# =========================================================================
# Property: Unhandled DRF exceptions call sentry_sdk.capture_exception
# =========================================================================


class TestUnhandledExceptionCallsSentry(SimpleTestCase):
    """For any unhandled exception in a DRF view that results in a 500
    response, the exception handler should call sentry_sdk.capture_exception."""

    @given(exc_type=_exception_types, error_msg=_error_messages)
    @settings(max_examples=5, deadline=None)
    def test_capture_exception_called_for_unhandled(self, exc_type, error_msg):
        from apps.common.exceptions import envelope_exception_handler

        exc = exc_type(error_msg)
        request = _make_mock_request()
        context = {"request": request, "view": MagicMock()}

        with patch("apps.common.exceptions.sentry_sdk.capture_exception") as mock_capture:
            response = envelope_exception_handler(exc, context)

        self.assertEqual(response.status_code, 500)
        mock_capture.assert_called_once_with(exc)


# =========================================================================
# Property: Frontend error reports forward to sentry_sdk.capture_message
# =========================================================================


class TestFrontendReportForwardsToSentry(SimpleTestCase):
    """For any valid frontend error report, the endpoint should call
    sentry_sdk.capture_message with the error message."""

    @given(error_msg=_error_messages)
    @settings(max_examples=5, deadline=None)
    def test_capture_message_called(self, error_msg):
        from apps.common.error_views import ErrorReportView

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/errors/report/",
            {"message": error_msg},
            format="json",
        )

        with patch("apps.common.error_views.sentry_sdk.capture_message") as mock_capture:
            view = ErrorReportView.as_view()
            # Disable throttling for property tests
            view.cls.throttle_classes = []
            response = view(request)

        self.assertEqual(response.status_code, 200)
        mock_capture.assert_called_once()
        call_args = mock_capture.call_args
        self.assertEqual(call_args[0][0], error_msg[:2000])
        self.assertEqual(call_args[1]["level"], "error")


# =========================================================================
# Property: Frontend error reports hash client IP
# =========================================================================

_ipv4_addresses = st.tuples(
    st.integers(min_value=0, max_value=255),
    st.integers(min_value=0, max_value=255),
    st.integers(min_value=0, max_value=255),
    st.integers(min_value=0, max_value=255),
).map(lambda t: f"{t[0]}.{t[1]}.{t[2]}.{t[3]}")


class TestErrorReportHashesClientIP(SimpleTestCase):
    """For any error report, the ip_hash sent to GlitchTip should equal
    SHA-256 of the client IP, and the raw IP should not appear in extras."""

    @given(ip_addr=_ipv4_addresses, error_msg=_error_messages)
    @settings(max_examples=5, deadline=None)
    def test_ip_is_hashed_in_sentry_extras(self, ip_addr, error_msg):
        from apps.common.error_views import ErrorReportView

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/errors/report/",
            {"message": error_msg},
            format="json",
            REMOTE_ADDR=ip_addr,
        )

        with patch("apps.common.error_views.sentry_sdk.capture_message") as mock_capture:
            view = ErrorReportView.as_view()
            # Disable throttling for property tests
            view.cls.throttle_classes = []
            response = view(request)

        self.assertEqual(response.status_code, 200)
        mock_capture.assert_called_once()

        call_kwargs = mock_capture.call_args[1]
        extras = call_kwargs["extras"]
        expected_hash = hashlib.sha256(ip_addr.encode("utf-8")).hexdigest()
        self.assertEqual(extras["ip_hash"], expected_hash)

        # Raw IP must not appear in any extras value
        for key, value in extras.items():
            if value is not None:
                self.assertNotIn(ip_addr, str(value),
                    f"Raw IP '{ip_addr}' found in extras['{key}']")


# =========================================================================
# Property: Malformed payloads are rejected with 400
# =========================================================================

_arbitrary_json_values = st.recursive(
    st.none() | st.booleans() | st.integers() | st.floats(allow_nan=False, allow_infinity=False) | st.text(max_size=100),
    lambda children: st.lists(children, max_size=5) | st.dictionaries(st.text(max_size=20), children, max_size=5),
    max_leaves=10,
)

_malformed_payloads = st.one_of(
    st.dictionaries(
        st.text(min_size=1, max_size=30).filter(lambda k: k != "message"),
        _arbitrary_json_values,
        max_size=5,
    ),
    st.dictionaries(
        st.text(min_size=1, max_size=30).filter(lambda k: k != "message"),
        _arbitrary_json_values,
        max_size=5,
    ).map(lambda d: {**d, "message": None}),
    st.dictionaries(
        st.text(min_size=1, max_size=30).filter(lambda k: k != "message"),
        _arbitrary_json_values,
        max_size=5,
    ).map(lambda d: {**d, "message": ""}),
)


class TestFrontendErrorReportRejectsMalformed(SimpleTestCase):
    """Payloads missing a valid `message` field return 400 and do not
    call sentry_sdk.capture_message."""

    @given(payload=_malformed_payloads)
    @settings(max_examples=5, deadline=None)
    def test_malformed_payload_returns_400_no_sentry(self, payload):
        from apps.common.error_views import ErrorReportView

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/errors/report/",
            payload,
            format="json",
        )

        with patch("apps.common.error_views.sentry_sdk.capture_message") as mock_capture:
            view = ErrorReportView.as_view()
            # Disable throttling for property tests
            view.cls.throttle_classes = []
            response = view(request)

        self.assertEqual(
            response.status_code,
            400,
            f"Expected 400 for payload {payload!r}, got {response.status_code}",
        )
        self.assertEqual(response.data["code"], "VALIDATION_ERROR")
        self.assertFalse(response.data["success"])
        mock_capture.assert_not_called()
