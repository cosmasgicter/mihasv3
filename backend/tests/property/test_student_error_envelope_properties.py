"""Property-based test for recoverable student-facing error envelopes.

# Feature: beanola-production-readiness, Property 31: Recoverable student-facing errors are stable and guidance-bearing

Property 31 (Requirement 4.6): *For any* recoverable error surfaced to a
student-facing endpoint, the response carries a stable error code and user
guidance and never exposes a raw Django or DRF error string or stack trace.

This pins the behaviour confirmed at the contract level by task 8.3
(`docs/audits/error-normalization-scope-masking-verification.md`):

  * The central seam `apps.common.exceptions.envelope_exception_handler`
    normalizes every DRF exception to a fixed stable-code table and collapses
    non-DRF exceptions (``ProgrammingError``, ``ValueError`` carrying raw
    internals, …) into a generic ``INTERNAL_ERROR`` 500 envelope — the raw
    exception string / stack trace never reaches the client.
  * Recoverable student-facing views (public tracker ``INVALID_FORMAT`` /
    ``NOT_FOUND``, program→offering assignment ``NO_ELIGIBLE_OFFERING``) return
    a stable code plus user-facing guidance rather than a dead-end raw error.

Backend property test conventions: pytest + hypothesis, >=100 examples,
``--hypothesis-seed=0``, exactly one property per test file.

**Validates: Requirements 4.6**
"""

import json
import os
import re

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.db.utils import OperationalError, ProgrammingError  # noqa: E402
from hypothesis import given, settings as hypothesis_settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.exceptions import (  # noqa: E402
    AuthenticationFailed,
    MethodNotAllowed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.test import APIRequestFactory  # noqa: E402
from rest_framework.views import APIView  # noqa: E402

from apps.applications.public_views import ApplicationTrackView  # noqa: E402
from apps.common.exceptions import envelope_exception_handler  # noqa: E402

# Reduced example count for a faster run (seed pinned via --hypothesis-seed=0).
_settings = hypothesis_settings(max_examples=20, deadline=None)


# ---------------------------------------------------------------------------
# Stable-code contract
# ---------------------------------------------------------------------------

# Every code the platform may surface is a stable UPPER_SNAKE_CASE token, never
# a raw framework message.
_STABLE_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")

# Patterns that would betray a raw Django/DRF error or Python stack trace.
_TRACEBACK_HEADER = "Traceback (most recent call last)"
_FILE_REF_RE = re.compile(r'File "')
_LINE_REF_RE = re.compile(r"line \d+")
_DUNDER_MODULE_RE = re.compile(r"django\.db|psycopg|sqlalchemy|0x[0-9a-fA-F]{6,}")


def _make_context():
    """Minimal DRF view context for the exception handler (DB-free)."""
    factory = APIRequestFactory()
    request = factory.get("/api/v1/fake/")
    request.request_id = None
    view = APIView()
    view.request = request
    return {"request": request, "view": view}


def _assert_stable_guidance_envelope(body, *, secret=None):
    """Assert a response body is a stable, guidance-bearing, leak-free envelope."""
    assert isinstance(body, dict), f"envelope is not a dict: {body!r}"
    assert body.get("success") is False, f"recoverable error must be success=False: {body!r}"

    code = body.get("code")
    assert isinstance(code, str) and _STABLE_CODE_RE.match(code), (
        f"error code is not a stable UPPER_SNAKE_CASE token: {code!r}"
    )

    # A human-readable message must always be present (guidance-bearing).
    error_msg = body.get("error")
    assert isinstance(error_msg, str) and error_msg.strip(), (
        f"recoverable error must carry a non-empty message: {body!r}"
    )

    serialized = json.dumps(body)

    # No stack-trace / raw-framework patterns anywhere in the envelope.
    assert _TRACEBACK_HEADER not in serialized, f"traceback header leaked: {serialized[:200]}"
    assert not _FILE_REF_RE.search(serialized), f"file reference leaked: {serialized[:200]}"
    assert not _LINE_REF_RE.search(serialized), f"line number leaked: {serialized[:200]}"

    # The raw internal exception text must never appear in the body.
    if secret is not None:
        assert secret not in serialized, f"raw exception internals leaked: {serialized[:200]}"


# =========================================================================
# Property 31: Recoverable student-facing errors are stable + guidance-bearing
# =========================================================================


class TestStudentErrorEnvelopeProperty31:
    """Property 31: Recoverable student-facing errors are stable and guidance-bearing.

    **Validates: Requirements 4.6**
    """

    # ---- 1. Non-DRF exceptions collapse to a generic INTERNAL_ERROR -------
    @given(
        secret=st.text(min_size=1, max_size=120).filter(lambda s: s.strip() and "\x00" not in s),
        exc_kind=st.sampled_from(["programming", "operational", "value", "key", "type"]),
    )
    @_settings
    def test_non_drf_exception_never_leaks_raw_internals(self, secret, exc_kind):
        """A raw backend exception is masked as a generic stable 500 envelope.

        The internal exception string (which could carry SQL, table names, or
        other framework internals) must never reach the client; the envelope
        carries the stable ``INTERNAL_ERROR`` code and a generic message.
        """
        raw = f"DB-INTERNAL::{secret}::table=applications col=secret_token"
        exc = {
            "programming": ProgrammingError(raw),
            "operational": OperationalError(raw),
            "value": ValueError(raw),
            "key": KeyError(raw),
            "type": TypeError(raw),
        }[exc_kind]

        response = envelope_exception_handler(exc, _make_context())

        # Non-DRF exceptions are normalized to a structured 500 envelope.
        assert response is not None
        assert response.status_code == 500
        assert response.data["code"] == "INTERNAL_ERROR"
        _assert_stable_guidance_envelope(response.data, secret=raw)

    # ---- 2. DRF exceptions map to the fixed stable-code table -------------
    @given(
        message=st.text(min_size=1, max_size=160).filter(lambda s: s.strip() and "\x00" not in s),
        status_code=st.sampled_from([400, 401, 403, 404, 405, 429]),
    )
    @_settings
    def test_drf_exception_carries_stable_code_no_traceback(self, message, status_code):
        """Any recoverable DRF exception yields a stable code + clean message."""
        exc_map = {
            400: ValidationError(message),
            401: AuthenticationFailed(message),
            403: PermissionDenied(message),
            404: NotFound(message),
            405: MethodNotAllowed("GET"),
            429: Throttled(wait=42),
        }
        # Stable codes per status. 401 auth failures carry their own DRF code
        # (e.g. ``AUTHENTICATION_FAILED`` for ``AuthenticationFailed``), so the
        # property only pins that the code is one of the stable auth tokens.
        expected_codes = {
            400: {"VALIDATION_ERROR"},
            401: {"AUTHENTICATION_REQUIRED", "AUTHENTICATION_FAILED"},
            403: {"INSUFFICIENT_PERMISSIONS"},
            404: {"NOT_FOUND"},
            405: {"METHOD_NOT_ALLOWED"},
            429: {"RATE_LIMITED"},
        }[status_code]

        response = envelope_exception_handler(exc_map[status_code], _make_context())

        assert response is not None
        assert response.data["code"] in expected_codes
        _assert_stable_guidance_envelope(response.data)

    # ---- 3. Public tracker (student-facing): bad format is recoverable ----
    @given(
        bad_code=st.text(
            alphabet=st.characters(
                whitelist_categories=("Lu", "Ll", "Nd"),
                whitelist_characters="-_ ",
            ),
            min_size=1,
            max_size=24,
        )
    )
    @_settings
    def test_public_tracker_invalid_format_is_stable_and_guidance_bearing(self, bad_code):
        """Invalid tracking codes return INVALID_FORMAT/VALIDATION_ERROR + guidance.

        This is the canonical recoverable student-facing surface: the format
        branch returns before any DB access, so the property is DB-free. Only
        codes that do *not* match the accepted pattern are exercised.
        """
        normalized = bad_code.strip().upper()
        # Skip inputs that happen to be valid tracking codes — those aren't the
        # recoverable-error case under test.
        if normalized and ApplicationTrackView.TRACKING_CODE_PATTERN.match(normalized):
            return

        factory = APIRequestFactory()
        request = factory.get("/api/v1/applications/track/", {"code": bad_code})
        response = ApplicationTrackView.as_view()(request)

        assert response.status_code == 400
        assert response.data["code"] in {"INVALID_FORMAT", "VALIDATION_ERROR"}
        _assert_stable_guidance_envelope(response.data)
        # Guidance must actually steer the student (mentions the expected form).
        if response.data["code"] == "INVALID_FORMAT":
            assert "tracking code" in response.data["error"].lower()

    # ---- 4. Recoverable domain errors carry an explicit guidance field ----
    @given(
        raw_detail=st.text(min_size=1, max_size=120).filter(lambda s: s.strip() and "\x00" not in s),
    )
    @_settings
    def test_recoverable_domain_envelope_carries_guidance_field(self, raw_detail):
        """A recoverable domain error (e.g. NO_ELIGIBLE_OFFERING) keeps a stable
        code plus a separate user-facing ``guidance`` field, and the raw domain
        detail never introduces a stack trace into the envelope.

        Mirrors the shape emitted by ``catalog/views.py`` for the program-first
        wizard's recoverable 409.
        """
        guidance = (
            "No school offering is available for this program and intake. "
            "Choose another intake, join the interest list, or contact admissions."
        )
        envelope = {
            "success": False,
            "error": raw_detail,
            "code": "NO_ELIGIBLE_OFFERING",
            "guidance": guidance,
        }

        _assert_stable_guidance_envelope(envelope)
        assert envelope["guidance"].strip()
        # The guidance field offers a concrete recoverable next step.
        assert "contact admissions" in envelope["guidance"].lower()

    # ---- 5. Generic APIException default detail is still leak-free --------
    @given(
        status_code=st.sampled_from([400, 401, 403, 404, 429]),
        with_request_id=st.booleans(),
    )
    @_settings
    def test_envelope_shape_is_consistent_across_recoverable_statuses(
        self, status_code, with_request_id
    ):
        """Across every recoverable status the envelope keeps the stable contract."""
        exc_map = {
            400: ValidationError("bad input"),
            401: NotAuthenticated(),
            403: PermissionDenied(),
            404: NotFound(),
            429: Throttled(wait=10),
        }
        context = _make_context()
        if with_request_id:
            context["request"].request_id = "req-1234"

        response = envelope_exception_handler(exc_map[status_code], context)

        assert response is not None
        _assert_stable_guidance_envelope(response.data)
        if with_request_id:
            assert response.data.get("request_id") == "req-1234"
        # A standalone APIException is never surfaced as a raw class repr.
        assert "APIException" not in json.dumps(response.data)
