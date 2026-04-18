"""Property-based test: Institution field pass-through identity.

Feature: system-alignment-audit, Property 1: Institution field pass-through identity

For any string value stored in an Application's `institution` field (whether a
code like "KATC" or a full name like "Kalulushi Training Centre"), serializing
the application through ApplicationTrackingSerializer should return that exact
string unchanged in the `institution` key of the output.

**Validates: Requirements 1.2, 1.3**
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
# Strategies
# ---------------------------------------------------------------------------

# Institution strings up to max_length=255, covering codes, full names,
# unicode, whitespace, and edge cases.
_institution_strings = st.text(
    alphabet=st.characters(min_codepoint=1, max_codepoint=65535, exclude_categories=("Cs",)),
    min_size=1,
    max_size=255,
)


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
# Property 1: Institution field pass-through identity
# =========================================================================


class TestInstitutionPassThroughIdentity:
    """Property 1: Institution field pass-through identity.

    For any string stored in Application.institution,
    ApplicationTrackingSerializer returns it unchanged in the `institution`
    key of the output.

    Feature: system-alignment-audit, Property 1: Institution field pass-through identity

    **Validates: Requirements 1.2, 1.3**
    """

    @given(institution=_institution_strings)
    @_default_settings
    def test_institution_value_passes_through_unchanged(self, institution):
        """The serializer must return the exact institution string stored on the model."""
        app = _make_application_instance(institution=institution)
        serializer = ApplicationTrackingSerializer(app)
        data = serializer.data

        assert "institution" in data, (
            f"'institution' key missing from serializer output: {list(data.keys())}"
        )
        assert data["institution"] == institution, (
            f"Institution value changed: stored={institution!r}, "
            f"serialized={data['institution']!r}"
        )
