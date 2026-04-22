"""Catalog serializers.

Implements task 14.1.
Requirements: 5.3
"""

from rest_framework import serializers

from apps.catalog.models import Institution, Intake, Program, Subject


class InstitutionSerializer(serializers.ModelSerializer):
    """Institution serializer."""

    class Meta:
        model = Institution
        fields = [
            "id", "name", "code", "full_name", "type",
            "address", "phone", "email", "website",
            "accreditation_status", "is_active", "description",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProgramSerializer(serializers.ModelSerializer):
    """Program serializer with nested institution data."""

    institution = InstitutionSerializer(read_only=True)

    class Meta:
        model = Program
        fields = [
            "id", "name", "code", "institution", "duration_months",
            "application_fee", "tuition_fee", "requirements",
            "regulatory_body", "accreditation_status",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProgramCreateUpdateSerializer(serializers.ModelSerializer):
    """Admin CRUD serializer for programs."""

    institution_id = serializers.UUIDField()

    class Meta:
        model = Program
        fields = [
            "name", "code", "institution_id", "duration_months",
            "application_fee", "tuition_fee", "requirements",
            "regulatory_body", "accreditation_status", "is_active",
        ]

    def validate_institution_id(self, value):
        if not Institution.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid institution reference.")
        return value


class IntakeSerializer(serializers.ModelSerializer):
    """Intake serializer."""

    class Meta:
        model = Intake
        fields = [
            "id", "name", "year", "semester",
            "start_date", "end_date", "application_start_date",
            "application_deadline", "max_capacity", "current_enrollment",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SubjectSerializer(serializers.ModelSerializer):
    """Subject serializer."""

    class Meta:
        model = Subject
        fields = ["id", "name", "code", "category", "is_core", "is_active", "curriculum_type", "created_at"]
        read_only_fields = ["id", "created_at"]
