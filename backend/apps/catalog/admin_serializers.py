"""Admin serializers for Beanola multi-tenant onboarding resources."""

from __future__ import annotations

from rest_framework import serializers

from apps.catalog.models import (
    AccessGrant,
    Institution,
    InstitutionAsset,
    InstitutionDocumentProfile,
    InstitutionDocumentTemplate,
    InstitutionDomain,
    InstitutionRequiredDocument,
    Program,
    UserInstitutionMembership,
)


class AdminInstitutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Institution
        fields = [
            "id", "name", "code", "slug", "full_name", "brand_name", "type",
            "address", "phone", "email", "support_email", "admissions_email",
            "website", "primary_color", "secondary_color",
            "accreditation_status", "is_active", "description",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_slug(self, value):
        if not value:
            return value
        queryset = Institution.objects.filter(slug__iexact=value)
        if self.instance is not None:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("Institution slug is already in use.")
        return value

    def validate_code(self, value):
        queryset = Institution.objects.filter(code__iexact=value)
        if self.instance is not None:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("Institution code is already in use.")
        return value


class AdminInstitutionDomainSerializer(serializers.ModelSerializer):
    institution_id = serializers.UUIDField()

    class Meta:
        model = InstitutionDomain
        fields = [
            "id", "institution_id", "hostname", "is_primary",
            "is_active", "verified_at", "created_at",
        ]
        read_only_fields = ["id", "verified_at", "created_at"]

    def validate_hostname(self, value):
        hostname = value.strip().lower()
        queryset = InstitutionDomain.objects.filter(hostname__iexact=hostname)
        if self.instance is not None:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("Domain hostname is already in use.")
        return hostname


class AdminInstitutionAssetSerializer(serializers.ModelSerializer):
    institution_id = serializers.UUIDField()

    class Meta:
        model = InstitutionAsset
        fields = [
            "id", "institution_id", "asset_type", "storage_key", "public_url",
            "mime_type", "checksum_sha256", "version", "is_active",
            "metadata", "created_at", "created_by_id",
        ]
        read_only_fields = ["id", "version", "created_at", "created_by_id"]

    def validate_mime_type(self, value):
        allowed = {"image/png", "image/jpeg", "image/webp", "image/svg+xml"}
        if value not in allowed:
            raise serializers.ValidationError("Unsupported asset MIME type.")
        return value


class AdminDocumentTemplateSerializer(serializers.ModelSerializer):
    institution_id = serializers.UUIDField()

    class Meta:
        model = InstitutionDocumentTemplate
        fields = [
            "id", "institution_id", "document_type", "name", "version",
            "sections", "tokens", "is_active", "created_at", "updated_at",
            "created_by_id",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by_id"]


class AdminDocumentProfileSerializer(serializers.ModelSerializer):
    """Rich tenant document profile serializer (R8.8).

    Surfaces the full profile shape — optional applies-to scope
    (``program_id``/``canonical_program_id``/``intake_id``), ``layout_key``,
    and the structured ``sections`` / ``fee_chart`` / ``bank_accounts`` /
    ``requirements`` / ``signatory`` JSON — for the admin TemplatesPanel.
    Content safety + structural caps are enforced separately by
    ``validate_profile_payload`` in the view (mapped to ``TEMPLATE_TOKEN_REJECTED``),
    exactly like the template path; this serializer only binds the columns.
    """

    institution_id = serializers.UUIDField()
    program_id = serializers.UUIDField(required=False, allow_null=True)
    canonical_program_id = serializers.UUIDField(required=False, allow_null=True)
    intake_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = InstitutionDocumentProfile
        fields = [
            "id", "institution_id", "document_type",
            "program_id", "canonical_program_id", "intake_id",
            "layout_key", "sections", "fee_chart", "bank_accounts",
            "requirements", "signatory", "rules", "version", "is_active",
            "created_at", "updated_at", "created_by_id",
        ]
        read_only_fields = ["id", "version", "created_at", "updated_at", "created_by_id"]


class AdminRequiredDocumentSerializer(serializers.ModelSerializer):
    institution_id = serializers.UUIDField()
    program_id = serializers.UUIDField(required=False, allow_null=True)
    canonical_program_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = InstitutionRequiredDocument
        fields = [
            "id", "institution_id", "program_id", "canonical_program_id",
            "document_type", "label", "is_required", "rules",
            "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        program_id = attrs.get("program_id")
        institution_id = attrs.get("institution_id")
        if program_id and institution_id:
            if not Program.objects.filter(id=program_id, institution_id=institution_id).exists():
                raise serializers.ValidationError({"program_id": "Program offering does not belong to this institution."})
        return attrs


class AdminMembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField()
    institution_id = serializers.UUIDField()

    class Meta:
        model = UserInstitutionMembership
        fields = [
            "id", "user_id", "institution_id", "role", "permissions",
            "is_active", "created_at", "created_by_id",
        ]
        read_only_fields = ["id", "created_at", "created_by_id"]


class AdminAccessGrantSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField()
    institution_id = serializers.UUIDField(required=False, allow_null=True)
    program_id = serializers.UUIDField(required=False, allow_null=True)
    application_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = AccessGrant
        fields = [
            "id", "user_id", "scope_type", "institution_id", "program_id",
            "application_id", "permissions", "expires_at", "is_active",
            "created_at", "created_by_id",
        ]
        read_only_fields = ["id", "created_at", "created_by_id"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        scope_type = attrs.get("scope_type")
        required_by_scope = {
            "institution": "institution_id",
            "program_offering": "program_id",
            "application": "application_id",
        }
        required = required_by_scope.get(scope_type)
        if required and not attrs.get(required):
            raise serializers.ValidationError({required: f"{required} is required for {scope_type} grants."})
        return attrs


class AdminRoutingSimulationSerializer(serializers.Serializer):
    """Validate inputs for the tenant "Test routing" simulator (R11.3).

    Mirrors the exact inputs accepted by ``OfferingAssignmentService.assign``:
    a canonical ``program_id`` + ``intake_id`` (required), optional residency
    inputs, and an optional white-label ``institution_id`` filter. No model is
    bound because the simulator never creates a row.
    """

    program_id = serializers.UUIDField()
    intake_id = serializers.UUIDField()
    country = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=128)
    nationality = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=128)
    institution_id = serializers.UUIDField(required=False, allow_null=True)


class TenantAuditLogSerializer(serializers.Serializer):
    """Read serializer for tenant observability Audit_Events (R13.2 / R13.5).

    Surfaces only non-PII columns of an ``audit_logs`` row. The ``changes``
    payload is already redacted at write time by
    :class:`apps.catalog.tenant_audit_service.TenantAuditService`, so it is safe
    to return verbatim here. Network hashes are intentionally omitted from this
    operational-review surface.
    """

    id = serializers.UUIDField(read_only=True)
    actor_id = serializers.UUIDField(read_only=True, allow_null=True)
    action = serializers.CharField(read_only=True)
    entity_type = serializers.CharField(read_only=True)
    entity_id = serializers.UUIDField(read_only=True, allow_null=True)
    changes = serializers.JSONField(read_only=True)
    retention_category = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
