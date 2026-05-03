"""Unit tests for backend model and serializer alignment changes.

Structural checks that verify model field attributes and serializer field
lists without hitting the database.

Validates: Requirements 1.1, 4.7, 4.8, 4.9, 5.1, 5.2, 11.2
"""

from apps.applications.models import Application
from apps.applications.serializers import (
    ApplicationListSerializer,
    ApplicationSerializer,
    ApplicationTrackingSerializer,
)


# ---------------------------------------------------------------------------
# ApplicationTrackingSerializer field checks (Req 1.1, 11.2)
# ---------------------------------------------------------------------------


class TestApplicationTrackingSerializerFields:
    """Verify ApplicationTrackingSerializer.Meta.fields includes institution."""

    def test_institution_in_tracking_fields(self):
        assert "institution" in ApplicationTrackingSerializer.Meta.fields

    def test_expected_tracking_fields_present(self):
        expected = {
            "application_number",
            "public_tracking_code",
            "status",
            "program",
            "intake",
            "institution",
            "created_at",
            "submitted_at",
        }
        assert expected == set(ApplicationTrackingSerializer.Meta.fields)


# ---------------------------------------------------------------------------
# Application model max_length checks (Req 4.7, 4.8, 4.9)
# ---------------------------------------------------------------------------


class TestApplicationModelMaxLength:
    """Verify Application model text-FK fields have sufficient max_length."""

    def test_program_max_length_at_least_255(self):
        field = Application._meta.get_field("program")
        assert field.max_length >= 255

    def test_intake_max_length_at_least_100(self):
        field = Application._meta.get_field("intake")
        assert field.max_length >= 100

    def test_institution_max_length_at_least_255(self):
        field = Application._meta.get_field("institution")
        assert field.max_length >= 255


# ---------------------------------------------------------------------------
# ApplicationSerializer and ApplicationListSerializer (Req 5.1, 5.2)
# ---------------------------------------------------------------------------


class TestApplicationSerializerInstitution:
    """Verify full and list serializers include institution."""

    def test_institution_in_application_serializer(self):
        assert "institution" in ApplicationSerializer.Meta.fields

    def test_institution_in_application_list_serializer(self):
        assert "institution" in ApplicationListSerializer.Meta.fields
