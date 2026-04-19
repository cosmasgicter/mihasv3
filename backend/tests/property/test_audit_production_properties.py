"""Property-based tests for audit production fixes — backend fix validation.

Tests that the tracking code format validation and sessions envelope wrapping
work correctly across a wide range of generated inputs.

**Validates: Requirements 2.12, 2.16, 2.17**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import re  # noqa: E402
import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from hypothesis import given, settings, assume  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.test import APIRequestFactory  # noqa: E402

from apps.accounts.authentication import JWTUser  # noqa: E402
from apps.accounts.session_views import SessionListView  # noqa: E402
from apps.applications.views import ApplicationTrackView  # noqa: E402

_default_settings = settings(max_examples=5, deadline=None)

# The canonical pattern from ApplicationTrackView
TRACKING_CODE_PATTERN = re.compile(r"^(APP-\d{8}-[A-Z0-9]{8}|TRK-[A-Z0-9]{12})$")

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Strategy: valid APP-format tracking codes (APP-YYYYMMDD-XXXXXXXX)
_valid_app_codes = st.builds(
    lambda digits, alphanum: f"APP-{digits}-{alphanum}",
    digits=st.from_regex(r"[0-9]{8}", fullmatch=True),
    alphanum=st.from_regex(r"[A-Z0-9]{8}", fullmatch=True),
)

# Strategy: valid TRK-format tracking codes (TRK-XXXXXXXXXXXX)
_valid_trk_codes = st.builds(
    lambda alphanum: f"TRK-{alphanum}",
    alphanum=st.from_regex(r"[A-Z0-9]{12}", fullmatch=True),
)


# Strategy: all valid tracking codes (union of both formats)
_valid_tracking_codes = st.one_of(_valid_app_codes, _valid_trk_codes)

# Strategy: random strings that are NOT valid tracking codes
_arbitrary_strings = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126),
    min_size=0,
    max_size=50,
)

# Strategy: session-like data dicts
_session_data = st.lists(
    st.fixed_dictionaries({
        "id": st.builds(lambda: str(uuid.uuid4())),
        "device_info": st.text(min_size=0, max_size=100),
        "last_activity": st.one_of(st.none(), st.text(min_size=5, max_size=30)),
        "created_at": st.one_of(st.none(), st.text(min_size=5, max_size=30)),
    }),
    min_size=0,
    max_size=10,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(user_id=None):
    """Build a JWTUser for testing."""
    uid = user_id or uuid.uuid4()
    return JWTUser({
        "user_id": str(uid),
        "email": "test@example.com",
        "role": "student",
        "first_name": "Test",
        "last_name": "User",
    })


# =========================================================================
# Property: Tracking format validation
# =========================================================================


class TestTrackingFormatValidation:
    """Property 8: Tracking code format validation.

    For any string, if it matches APP-\\d{8}-[A-Z0-9]{8} or TRK-[A-Z0-9]{12},
    the ApplicationTrackView accepts it as valid format (proceeds to DB lookup).
    All other strings are rejected with 400 INVALID_FORMAT.

    **Validates: Requirements 2.16, 2.17**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationTrackView.as_view()

    @given(code=_valid_tracking_codes)
    @_default_settings
    def test_valid_format_codes_pass_validation(self, code):
        """Valid-format tracking codes should NOT get a 400 INVALID_FORMAT response.

        They should either get 404 (not found in DB) or 200 (found).
        The format validation step must accept them.
        """
        with patch("apps.applications.views.Application.objects") as mock_qs:
            from apps.applications.models import Application
            mock_qs.get.side_effect = Application.DoesNotExist

            request = self.factory.get(f"/api/v1/applications/track/?code={code}")
            response = self.view(request)

            # Valid format codes pass validation — they get 404 (not found), not 400
            assert response.status_code != 400, (
                f"Valid format code '{code}' was rejected with 400: {response.data}"
            )
            assert response.status_code == 404, (
                f"Expected 404 for valid-format non-existent code '{code}', got {response.status_code}"
            )

    @given(code=_arbitrary_strings)
    @_default_settings
    def test_invalid_format_codes_rejected(self, code):
        """Strings that don't match the tracking code pattern must be rejected with 400.

        Empty/whitespace strings and strings with URL-special characters (?, &, #)
        may result in empty query params after parsing, yielding VALIDATION_ERROR.
        Non-empty invalid format strings yield INVALID_FORMAT.
        Both are 400 — the key property is that invalid formats never reach the DB.
        """
        assume(len(code.strip()) > 0)  # skip empty/whitespace — handled separately
        assume(not TRACKING_CODE_PATTERN.match(code))  # only test invalid formats
        # Skip strings with URL-special chars that break query param parsing
        assume("?" not in code and "&" not in code and "#" not in code)

        request = self.factory.get(f"/api/v1/applications/track/?code={code}")
        response = self.view(request)

        assert response.status_code == 400, (
            f"Invalid format code '{code}' was not rejected: got {response.status_code}: {response.data}"
        )
        body = response.data
        assert body.get("code") in ("INVALID_FORMAT", "VALIDATION_ERROR"), (
            f"Expected INVALID_FORMAT or VALIDATION_ERROR for '{code}', got '{body.get('code')}'"
        )


# =========================================================================
# Property: Sessions envelope wrapping
# =========================================================================


class TestSessionsEnvelopeWrapping:
    """Property 6: Sessions endpoint envelope format.

    For any list of session data, the SessionListView always wraps the response
    in {"success": True, "data": <list>} structure.

    **Validates: Requirements 2.12**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = SessionListView.as_view()

    @given(sessions=_session_data)
    @_default_settings
    def test_envelope_always_wraps_session_list(self, sessions):
        """Response must always be {"success": True, "data": [...]} regardless of session data."""
        user = _make_user()

        # Mock the queryset to return objects that look like DeviceSession instances
        mock_sessions = []
        for s in sessions:
            mock_s = MagicMock()
            mock_s.id = s["id"]
            mock_s.device_info = s["device_info"]
            if s["last_activity"] is not None:
                mock_s.last_activity = MagicMock()
                mock_s.last_activity.isoformat.return_value = s["last_activity"]
            else:
                mock_s.last_activity = None
            if s["created_at"] is not None:
                mock_s.created_at = MagicMock()
                mock_s.created_at.isoformat.return_value = s["created_at"]
            else:
                mock_s.created_at = None
            mock_sessions.append(mock_s)

        with patch("apps.accounts.session_views.DeviceSession.objects") as mock_qs:
            mock_qs.filter.return_value.order_by.return_value = mock_sessions

            request = self.factory.get("/api/v1/sessions/")
            from rest_framework.test import force_authenticate
            force_authenticate(request, user=user)

            response = self.view(request)

            assert response.status_code == 200
            body = response.data

            # Must be a dict envelope, not a raw list
            assert isinstance(body, dict), (
                f"Expected dict envelope, got {type(body).__name__}: {body}"
            )
            assert "success" in body, f"Missing 'success' key: {body}"
            assert "data" in body, f"Missing 'data' key: {body}"
            assert body["success"] is True
            assert isinstance(body["data"], list), (
                f"Expected 'data' to be a list, got {type(body['data']).__name__}"
            )
            # Data length must match input session count
            assert len(body["data"]) == len(sessions), (
                f"Expected {len(sessions)} sessions, got {len(body['data'])}"
            )
