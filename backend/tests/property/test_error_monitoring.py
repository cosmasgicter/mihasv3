"""Property-based tests for error monitoring.

# Feature: cto-assessment-remediation, Property 5: Unhandled DRF exceptions produce ErrorLog records

Tests that for any unhandled exception raised in a DRF view that results in
a 500 response, the exception handler creates an ErrorLog record with
source='backend', level='error', and a non-empty message field.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

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
# Property 5: Unhandled DRF exceptions produce ErrorLog records
# =========================================================================


class TestUnhandledExceptionCreatesErrorLog(SimpleTestCase):
    """Property 5: Unhandled DRF exceptions produce ErrorLog records.

    For any unhandled exception raised in a DRF view that results in a 500
    response, the exception handler should create an ErrorLog record with
    source='backend', level='error', and a non-empty message field.

    **Validates: Requirements 3.2**
    """

    @given(exc_type=_exception_types, error_msg=_error_messages)
    @settings(max_examples=5, deadline=None)
    def test_log_error_and_alert_creates_error_log(self, exc_type, error_msg):
        """_log_error_and_alert creates an ErrorLog record with
        source='backend', level='error', and a non-empty message."""
        from apps.common.exceptions import _log_error_and_alert

        request = _make_mock_request()
        captured_create_kwargs = {}

        def mock_create(**kwargs):
            captured_create_kwargs.update(kwargs)
            return MagicMock()

        with patch(
            "apps.common.models.ErrorLog.objects.create",
            side_effect=mock_create,
        ), patch(
            "apps.common.tasks.send_email_task.delay",
        ), patch(
            "django.core.cache.cache.add",
            return_value=True,
        ), patch(
            "apps.common.models.EmailQueue.objects.create",
            return_value=MagicMock(id="fake-email-id"),
        ):
            _log_error_and_alert(error_msg, request)

        # Verify ErrorLog.objects.create was called with correct fields
        self.assertEqual(captured_create_kwargs["source"], "backend")
        self.assertEqual(captured_create_kwargs["level"], "error")
        self.assertTrue(len(captured_create_kwargs["message"]) > 0)
        self.assertIn(error_msg[:2000], captured_create_kwargs["message"])


# =========================================================================
# Property 6: Error-level ErrorLog triggers throttled alert email
# Feature: cto-assessment-remediation, Property 6: Error-level ErrorLog triggers throttled alert email
# =========================================================================

# Strategy: generate a sequence of error messages (mix of repeated and unique),
# call _log_error_and_alert for each, and verify that send_email_task.delay is
# called exactly once per unique message (the first occurrence) while duplicates
# within the throttle window are suppressed.

_error_message_pool = st.text(min_size=1, max_size=200).filter(lambda s: s.strip())

_error_sequences = st.lists(
    _error_message_pool,
    min_size=1,
    max_size=20,
)


class TestErrorAlertThrottling(SimpleTestCase):
    """Property 6: Error-level ErrorLog triggers throttled alert email.

    For any sequence of error messages, the first occurrence of each unique
    message triggers an alert email via send_email_task.delay(). Subsequent
    occurrences of the same message within the 15-minute throttle window do
    NOT trigger additional alerts.

    **Validates: Requirements 3.3, 3.11**
    """

    @given(error_messages=_error_sequences)
    @settings(max_examples=5, deadline=None)
    def test_alert_throttling_one_per_unique_message(self, error_messages):
        """Each unique error message triggers exactly one alert email;
        duplicates within the throttle window are suppressed."""
        from apps.common.exceptions import _log_error_and_alert

        request = _make_mock_request()

        # Track which cache keys have been "added" — simulates Redis cache.add
        # behaviour: returns True the first time a key is added, False after.
        seen_cache_keys = set()

        def mock_cache_add(key, value, ttl):
            if key in seen_cache_keys:
                return False  # duplicate — already in cache
            seen_cache_keys.add(key)
            return True  # first time — key was added

        delay_call_args = []

        def mock_delay(*args, **kwargs):
            delay_call_args.append(args)

        with patch(
            "apps.common.models.ErrorLog.objects.create",
            return_value=MagicMock(),
        ), patch(
            "django.core.cache.cache.add",
            side_effect=mock_cache_add,
        ), patch(
            "apps.common.models.EmailQueue.objects.create",
            return_value=MagicMock(id="fake-email-id"),
        ), patch(
            "apps.common.tasks.send_email_task.delay",
            side_effect=mock_delay,
        ):
            for msg in error_messages:
                _log_error_and_alert(msg, request)

        # Expected: one alert per unique message
        unique_messages = set(error_messages)
        expected_alert_count = len(unique_messages)

        self.assertEqual(
            len(delay_call_args),
            expected_alert_count,
            f"Expected {expected_alert_count} alerts for {len(unique_messages)} "
            f"unique messages out of {len(error_messages)} total calls, "
            f"but got {len(delay_call_args)}",
        )


# =========================================================================
# Property 7: Frontend error reports hash client IP
# Feature: cto-assessment-remediation, Property 7: Frontend error reports hash client IP
# =========================================================================

# Strategy: generate random IPv4 addresses, submit error reports via the
# ErrorReportView, mock ErrorLog.objects.create to capture kwargs, and verify
# that ip_hash equals SHA-256 of the raw IP and the raw IP does not appear
# in any of the stored fields.

import hashlib  # noqa: E402

from rest_framework.test import APIRequestFactory  # noqa: E402

_ipv4_addresses = st.tuples(
    st.integers(min_value=0, max_value=255),
    st.integers(min_value=0, max_value=255),
    st.integers(min_value=0, max_value=255),
    st.integers(min_value=0, max_value=255),
).map(lambda t: f"{t[0]}.{t[1]}.{t[2]}.{t[3]}")


class TestErrorReportHashesClientIP(SimpleTestCase):
    """Property 7: Frontend error reports hash client IP.

    For any error report submitted to POST /api/v1/errors/report/, the
    ip_hash stored in the resulting ErrorLog record should equal the SHA-256
    hex digest of the client's IP address, and the raw IP should not appear
    anywhere in the record.

    **Validates: Requirements 3.6**
    """

    @given(ip_addr=_ipv4_addresses, error_msg=_error_messages)
    @settings(max_examples=5, deadline=None)
    def test_ip_is_hashed_and_raw_ip_absent(self, ip_addr, error_msg):
        """The stored ip_hash equals SHA-256 of the client IP and the raw
        IP does not appear in any field of the created ErrorLog record."""
        from apps.common.error_views import ErrorReportView

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/errors/report/",
            {"message": error_msg},
            format="json",
            REMOTE_ADDR=ip_addr,
        )

        captured_kwargs = {}

        def mock_create(**kwargs):
            captured_kwargs.update(kwargs)
            return MagicMock()

        with patch(
            "apps.common.models.ErrorLog.objects.create",
            side_effect=mock_create,
        ), patch(
            "apps.common.error_views.ErrorReportView._dispatch_throttled_alert",
        ):
            view = ErrorReportView.as_view()
            response = view(request)

        # The endpoint should return 200 success
        self.assertEqual(response.status_code, 200)

        # Verify ErrorLog.objects.create was called
        self.assertTrue(
            len(captured_kwargs) > 0,
            "ErrorLog.objects.create was not called",
        )

        # Verify ip_hash equals SHA-256 of the raw IP
        expected_hash = hashlib.sha256(ip_addr.encode("utf-8")).hexdigest()
        self.assertEqual(captured_kwargs["ip_hash"], expected_hash)

        # Verify the raw IP does not appear in any stored field
        for field_name, field_value in captured_kwargs.items():
            if field_value is None:
                continue
            str_value = str(field_value)
            self.assertNotIn(
                ip_addr,
                str_value,
                f"Raw IP '{ip_addr}' found in field '{field_name}': {str_value}",
            )


# =========================================================================
# Property 5: Frontend error report validation rejects malformed payloads
# Feature: go-live-readiness, Property 5: Frontend error report validation
#          rejects malformed payloads
# =========================================================================

# Strategy: generate random JSON payloads that are missing the required
# `message` field (absent, None, or empty string), POST them to the
# ErrorReportView, and verify HTTP 400 with code "VALIDATION_ERROR" and
# no ErrorLog created.

_arbitrary_json_values = st.recursive(
    st.none() | st.booleans() | st.integers() | st.floats(allow_nan=False) | st.text(max_size=100),
    lambda children: st.lists(children, max_size=5) | st.dictionaries(st.text(max_size=20), children, max_size=5),
    max_leaves=10,
)

# Payloads that explicitly lack a valid `message` field
_malformed_payloads = st.one_of(
    # Case 1: dict with no `message` key at all (may have other keys)
    st.dictionaries(
        st.text(min_size=1, max_size=30).filter(lambda k: k != "message"),
        _arbitrary_json_values,
        max_size=5,
    ),
    # Case 2: dict with `message` set to None
    st.dictionaries(
        st.text(min_size=1, max_size=30).filter(lambda k: k != "message"),
        _arbitrary_json_values,
        max_size=5,
    ).map(lambda d: {**d, "message": None}),
    # Case 3: dict with `message` set to empty string
    st.dictionaries(
        st.text(min_size=1, max_size=30).filter(lambda k: k != "message"),
        _arbitrary_json_values,
        max_size=5,
    ).map(lambda d: {**d, "message": ""}),
)


class TestFrontendErrorReportRejectsMalformed(SimpleTestCase):
    """Property 5: Frontend error report validation rejects malformed payloads.

    For any POST payload to /api/v1/errors/report/ that is missing the
    required `message` field (absent, None, or empty string), the endpoint
    should return HTTP 400 with code "VALIDATION_ERROR" and no ErrorLog
    record should be created.

    Feature: go-live-readiness, Property 5: Frontend error report validation
    rejects malformed payloads

    **Validates: Requirements 5.5**
    """

    @given(payload=_malformed_payloads)
    @settings(max_examples=5, deadline=None)
    def test_malformed_payload_returns_400_no_error_log(self, payload):
        """Payloads missing a valid `message` field return 400 and create
        no ErrorLog record."""
        from apps.common.error_views import ErrorReportView

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/errors/report/",
            payload,
            format="json",
        )

        create_called = []

        def mock_create(**kwargs):
            create_called.append(kwargs)
            return MagicMock()

        with patch(
            "apps.common.models.ErrorLog.objects.create",
            side_effect=mock_create,
        ), patch(
            "apps.common.error_views.ErrorReportView._dispatch_throttled_alert",
        ):
            view = ErrorReportView.as_view()
            response = view(request)

        # Must return 400
        self.assertEqual(
            response.status_code,
            400,
            f"Expected 400 for payload {payload!r}, got {response.status_code}",
        )

        # Must include VALIDATION_ERROR code
        self.assertEqual(response.data["code"], "VALIDATION_ERROR")
        self.assertFalse(response.data["success"])

        # ErrorLog must NOT have been created
        self.assertEqual(
            len(create_called),
            0,
            f"ErrorLog.objects.create was called {len(create_called)} time(s) "
            f"for malformed payload {payload!r}",
        )
