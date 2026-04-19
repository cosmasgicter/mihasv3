"""
Bug 5 (MEDIUM) — Draft logic split: Fix Checking Test

Property test verifying that ApplicationCreateSerializer accepts and validates
the draft_name field for all valid draft names.

**Validates: Requirements 2.13**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from unittest.mock import patch, MagicMock  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings, assume  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.serializers import ApplicationCreateSerializer  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

draft_names = st.text(
    alphabet=st.sampled_from(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    ),
    min_size=1,
    max_size=255,
)


def make_valid_payload(draft_name=""):
    """Build a minimal valid application payload."""
    return {
        "full_name": "Test Applicant",
        "date_of_birth": "2000-01-15",
        "sex": "male",
        "phone": "+260971234567",
        "email": "test@example.com",
        "residence_town": "Lusaka",
        "program": "Computer Science",
        "intake": "January 2025",
        "institution": "MIHAS-KATC",
        "draft_name": draft_name,
    }


# ---------------------------------------------------------------------------
# Mock resolver to avoid DB hits
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


class TestDraftNameAccepted(SimpleTestCase):
    """For all valid draft names, ApplicationCreateSerializer accepts and
    validates them.

    **Validates: Requirements 2.13**
    """

    @given(draft_name=draft_names)
    @settings(max_examples=5)
    def test_draft_name_accepted_and_persisted(self, draft_name):
        """Serializer accepts draft_name and includes it in validated_data."""
        payload = make_valid_payload(draft_name)

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

        assert is_valid, f"Serializer should be valid with draft_name='{draft_name}', errors: {serializer.errors}"
        assert "draft_name" in serializer.validated_data, (
            "draft_name should be in validated_data"
        )
        assert serializer.validated_data["draft_name"] == draft_name, (
            f"Expected draft_name='{draft_name}', got '{serializer.validated_data['draft_name']}'"
        )

    def test_empty_draft_name_accepted(self):
        """Serializer accepts empty draft_name."""
        payload = make_valid_payload("")

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

        assert is_valid, f"Serializer should be valid with empty draft_name, errors: {serializer.errors}"
        assert serializer.validated_data["draft_name"] == ""
