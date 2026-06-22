"""Catalog serializers.

Implements task 14.1.
Requirements: 5.3
"""

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import CanonicalProgram, Institution, Intake, Program, Subject


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
    institution_id = serializers.UUIDField(read_only=True)
    canonical_program_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Program
        fields = [
            "id", "name", "code", "institution", "institution_id", "duration_months",
            "canonical_program_id", "assignment_priority", "offering_status",
            "application_fee", "tuition_fee", "requirements",
            "regulatory_body", "accreditation_status",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProgramCreateUpdateSerializer(serializers.ModelSerializer):
    """Admin CRUD serializer for programs."""

    institution_id = serializers.UUIDField()
    canonical_program_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Program
        fields = [
            "name", "code", "institution_id", "duration_months",
            "canonical_program_id", "assignment_priority", "offering_status",
            "assignment_rules",
            "application_fee", "tuition_fee", "requirements",
            "regulatory_body", "accreditation_status", "is_active",
        ]

    def validate_institution_id(self, value):
        if not Institution.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid institution reference.")
        return value

    def validate_canonical_program_id(self, value):
        if value is not None and not CanonicalProgram.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid canonical program reference.")
        return value


class CanonicalProgramSerializer(serializers.ModelSerializer):
    """Public shared program option with available school offerings."""

    available_offerings = serializers.SerializerMethodField()

    class Meta:
        model = CanonicalProgram
        fields = [
            "id", "name", "code", "description", "duration_months",
            "regulatory_body", "is_active", "available_offerings",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    @extend_schema_field(ProgramSerializer(many=True))
    def get_available_offerings(self, obj):
        request = self.context.get("request")
        intake = request.query_params.get("intake") if request else None
        # Prefer the host-resolved tenant scope passed by the view (R8.7 /
        # R18.3) so a white-label portal nests only the resolved tenant's
        # offerings; fall back to an explicit ``?institution=`` query param for
        # callers that scope directly. ``None`` (shared Beanola portal) lists
        # every active offering grouped by canonical program (R8.6).
        institution = self.context.get("institution_id")
        if not institution and request:
            institution = request.query_params.get("institution")

        # Offerings prefetch fix (R4.4): when the list view attached the
        # ``prefetched_offerings`` set, resolve offerings from it (filtering by
        # intake/institution in Python) instead of issuing a per-object query.
        # The prefetched rows are already ``active`` and ordered by
        # ``assignment_priority``, ``name`` in the view, so the neutral-vs-tenant
        # grouping and ordering are preserved exactly.
        prefetched = getattr(obj, "prefetched_offerings", None)
        if prefetched is not None:
            offerings = prefetched
            if institution:
                offerings = [
                    p for p in offerings if str(p.institution_id) == str(institution)
                ]
            if intake:
                offerings = [
                    p for p in offerings if getattr(p, "_intake_matches", None)
                ]
            return ProgramSerializer(offerings, many=True).data

        # Fallback (no view-level prefetch, e.g. direct serializer use): keep the
        # original per-object query so behavior is identical.
        queryset = Program.objects.select_related("institution").filter(
            canonical_program_id=obj.id,
            is_active=True,
            offering_status="active",
        )
        if institution:
            queryset = queryset.filter(institution_id=institution)
        if intake:
            queryset = queryset.filter(programintake__intake_id=intake)
        return ProgramSerializer(queryset.distinct().order_by("assignment_priority", "name"), many=True).data


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
