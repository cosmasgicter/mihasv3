"""
Bug 5 (MEDIUM) — Draft logic split: Preservation Test

Property test verifying that payloads without draft_name continue to work
identically after adding the draft_name field.

**Validates: Requirements 3.10**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from unittest.mock import patch  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.serializers import ApplicationCreateSerializer  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

full_names = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz "),
    min_size=2,
    max_size=50,
)

sexes = st.sampled_from(["male", "female"])


# ---------------------------------------------------------------------------
# Mock resolver
# ---------------------------------------------------------------------------

class _FakeResolved:
    def __init__(self, name):
        self.source = "exact"
        self.name = name
        self.id = "00000000-0000-0000-0000-000000000001"


def _mock_resolve_program(value):
    return _FakeResolved(value)


def _mock_resolve_intake(value):
    return _FakeResolved(value)


def _mock_resolve_institution(value):
    return _FakeResolved(value)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPayloadsWithoutDraftNameUnchanged(SimpleTestCase):
    """For all valid payloads without draft_name, serializer behavior is
    identical to before.

    **Validates: Requirements 3.10**
    """

    @given(
        full_name=full_names,
        sex=sexes,
    )
    @settings(max_examples=5)
    def test_payload_without_draft_name_still_valid(self, full_name, sex):
        """Payloads without draft_name continue to validate successfully."""
        payload = {
            "full_name": full_name,
            "date_of_birth": "2000-01-15",
            "sex": sex,
            "phone": "+260971234567",
            "email": "test@example.com",
            "residence_town": "Lusaka",
            "program": "Computer Science",
            "intake": "January 2025",
            "institution": "MIHAS-KATC",
        }

        with patch(
            "apps.applications.serializers.IdentifierResolver"
        ) as mock_resolver:
            mock_resolver.resolve_program = _mock_resolve_program
            mock_resolver.resolve_intake = _mock_resolve_intake
            mock_resolver.resolve_institution = _mock_resolve_institution

            with patch(
                "apps.applications.serializers.validate_program_intake_compatibility"
            ):
                serializer = ApplicationCreateSerializer(data=payload)
                is_valid = serializer.is_valid()

        assert is_valid, f"Serializer should be valid without draft_name, errors: {serializer.errors}"
        # draft_name should default to empty string
        assert serializer.validated_data.get("draft_name") == "", (
            "draft_name should default to empty string when not provided"
        )
        # All original fields should still be present — CharField strips whitespace
        assert serializer.validated_data["full_name"] == full_name.strip()
        assert serializer.validated_data["sex"] == sex
