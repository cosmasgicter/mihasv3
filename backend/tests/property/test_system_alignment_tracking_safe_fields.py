"""Property-based test: Tracking serializer exposes only non-sensitive fields.

Feature: system-alignment-audit, Property 2: Tracking serializer exposes only non-sensitive fields

For any Application instance, the set of field names returned by
ApplicationTrackingSerializer should be a subset of
{application_number, public_tracking_code, status, payment_status, program,
intake, institution, created_at, submitted_at} and should NOT contain any of
{email, phone, nrc_number, passport_number, date_of_birth, sex,
address_line_1, address_line_2, postal_code, next_of_kin_name,
next_of_kin_phone, user_id, admin_feedback, eligibility_notes}.

**Validates: Requirements 1.1, 1.4**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock  # noqa: E402

import django  # noqa: E402

django.setup()

from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.serializers import ApplicationTrackingSerializer  # noqa: E402

_default_settings = settings(max_examples=100, deadline=None)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_FIELDS = frozenset({
    "application_number",
    "public_tracking_code",
    "status",
    "payment_status",
    "program",
    "intake",
    "institution",
    "created_at",
    "submitted_at",
})

SENSITIVE_FIELDS = frozenset({
    "email",
    "phone",
    "nrc_number",
    "passport_number",
    "date_of_birth",
    "sex",
    "address_line_1",
    "address_line_2",
    "postal_code",
    "next_of_kin_name",
    "next_of_kin_phone",
    "user_id",
    "admin_feedback",
    "eligibility_notes",
})

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_safe_text = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126),
    min_size=1,
    max_size=50,
)

_status_values = st.sampled_from([
    "draft", "submitted", "under_review", "accepted", "rejected", "withdrawn",
])

_payment_status_values = st.sampled_from([
    "not_paid", "pending_review", "verified", "rejected", "force_approved",
])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_application_instance(**overrides):
    """Build a mock Application instance without touching the database.

    The Application model has managed=False, so we construct a MagicMock that
    behaves like a model instance for serializer field access.
    """
    defaults = {
        "id": uuid.uuid4(),
        "application_number": f"APP-20260416-{''.join('A' for _ in range(8))}",
        "public_tracking_code": f"TRK-{''.join('B' for _ in range(12))}",
        "status": "submitted",
        "payment_status": "verified",
        "program": "Diploma in Clinical Medicine",
        "intake": "July 2026 Intake",
        "institution": "Kalulushi Training Centre",
        "created_at": "2026-04-16T10:00:00Z",
        "submitted_at": "2026-04-16T12:00:00Z",
    }
    defaults.update(overrides)

    mock = MagicMock()
    for key, value in defaults.items():
        setattr(mock, key, value)

    return mock


# =========================================================================
# Property 2: Tracking serializer exposes only non-sensitive fields
# =========================================================================


class TestTrackingSerializerSafeFields:
    """Property 2: Tracking serializer exposes only non-sensitive fields.

    For any Application instance, the serializer output field names must be
    a subset of the allowed set and must exclude all sensitive fields.

    Feature: system-alignment-audit, Property 2: Tracking serializer exposes only non-sensitive fields

    **Validates: Requirements 1.1, 1.4**
    """

    @given(
        program=_safe_text,
        intake=_safe_text,
        institution=_safe_text,
        status=_status_values,
        payment_status=_payment_status_values,
    )
    @_default_settings
    def test_output_fields_are_subset_of_allowed(
        self, program, intake, institution, status, payment_status
    ):
        """Serializer output field names must be a subset of the allowed set."""
        app = _make_application_instance(
            program=program,
            intake=intake,
            institution=institution,
            status=status,
            payment_status=payment_status,
        )
        serializer = ApplicationTrackingSerializer(app)
        output_fields = set(serializer.data.keys())

        assert output_fields <= ALLOWED_FIELDS, (
            f"Unexpected fields in tracking serializer output: "
            f"{output_fields - ALLOWED_FIELDS}"
        )

    @given(
        program=_safe_text,
        intake=_safe_text,
        institution=_safe_text,
        status=_status_values,
        payment_status=_payment_status_values,
    )
    @_default_settings
    def test_output_fields_exclude_sensitive(
        self, program, intake, institution, status, payment_status
    ):
        """Serializer output must not contain any sensitive fields."""
        app = _make_application_instance(
            program=program,
            intake=intake,
            institution=institution,
            status=status,
            payment_status=payment_status,
        )
        serializer = ApplicationTrackingSerializer(app)
        output_fields = set(serializer.data.keys())

        leaked = output_fields & SENSITIVE_FIELDS
        assert not leaked, (
            f"Sensitive fields leaked in tracking serializer output: {leaked}"
        )
