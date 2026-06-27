"""Admin serializers for Beanola multi-tenant onboarding resources."""

from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from apps.catalog.models import (
    AccessGrant,
    CanonicalProgram,
    Institution,
    InstitutionAsset,
    InstitutionDocumentProfile,
    InstitutionDocumentTemplate,
    InstitutionDomain,
    InstitutionRequiredDocument,
    Program,
    UserInstitutionMembership,
)

# Access_Grant permission allowlist (R12.5). This is the authoritative copy
# pinned in the serializer module; the Property 21 test
# (``tests/property/test_admin_validation_properties.py``) oracles against an
# equal set. Any permission value outside this allowlist is rejected.
GRANT_PERMISSION_ALLOWLIST = frozenset(
    {"view", "review", "manage", "verify_documents", "verify_payments", "export"}
)

# The three scope_type values R12 / the API contract accept.
VALID_GRANT_SCOPE_TYPES = frozenset(
    {"institution", "program_offering", "application"}
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

    # Branding defaults seeded at creation so a newly onboarded school always
    # produces non-bare official documents (the reportlab renderer reads these).
    # The renderer's own fallback teal is a last resort; seeding here means the
    # admin's chosen brand colours (or these sensible defaults) always win.
    _DEFAULT_PRIMARY_COLOR = "#0F766E"
    _DEFAULT_SECONDARY_COLOR = "#334155"

    def create(self, validated_data):
        now = timezone.now()
        validated_data.setdefault("created_at", now)
        validated_data.setdefault("updated_at", now)
        # Seed branding defaults so documents are styled from day one. A
        # brand_name falls back to the short name; colours fall back to the
        # platform defaults when the operator left them blank.
        if not validated_data.get("brand_name"):
            validated_data["brand_name"] = validated_data.get("name")
        if not validated_data.get("primary_color"):
            validated_data["primary_color"] = self._DEFAULT_PRIMARY_COLOR
        if not validated_data.get("secondary_color"):
            validated_data["secondary_color"] = self._DEFAULT_SECONDARY_COLOR
        if not validated_data.get("admissions_email"):
            validated_data["admissions_email"] = validated_data.get("email")
        if validated_data.get("is_active") is None:
            validated_data["is_active"] = True
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.setdefault("updated_at", timezone.now())
        return super().update(instance, validated_data)


class AdminInstitutionDomainSerializer(serializers.ModelSerializer):
    institution_id = serializers.UUIDField()

    class Meta:
        model = InstitutionDomain
        fields = [
            "id", "institution_id", "hostname", "is_primary",
            "is_active", "status", "verification_token", "dns_target",
            "verified_at", "last_checked_at", "last_error", "created_at",
            "created_by_id", "approved_by_id",
        ]
        read_only_fields = [
            "id",
            "status",
            "verification_token",
            "dns_target",
            "verified_at",
            "last_checked_at",
            "last_error",
            "created_at",
            "created_by_id",
            "approved_by_id",
        ]

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

        # Resolve effective values, falling back to the instance under edit so
        # partial updates validate against the persisted scope (R11.1–R11.5).
        def _effective(field):
            if field in attrs:
                return attrs[field]
            if self.instance is not None:
                return getattr(self.instance, field, None)
            return None

        institution_id = _effective("institution_id")
        program_id = _effective("program_id")
        canonical_program_id = _effective("canonical_program_id")
        document_type = _effective("document_type")

        # R11.1: institution must exist and be active.
        institution = (
            Institution.objects.filter(id=institution_id).first()
            if institution_id
            else None
        )
        if institution is None:
            raise serializers.ValidationError(
                {"institution_id": "Institution does not exist."}
            )
        if not institution.is_active:
            raise serializers.ValidationError(
                {"institution_id": "Institution is not active."}
            )

        # R11.2: if program_id supplied, program must exist, be active, and
        # belong to the referenced institution.
        program = None
        if program_id:
            program = Program.objects.filter(id=program_id).first()
            if program is None:
                raise serializers.ValidationError(
                    {"program_id": "Program offering does not exist."}
                )
            if not program.is_active:
                raise serializers.ValidationError(
                    {"program_id": "Program offering is not active."}
                )
            if str(program.institution_id) != str(institution_id):
                raise serializers.ValidationError(
                    {"program_id": "Program offering does not belong to this institution."}
                )

        # R11.3: if canonical_program_id supplied, canonical must exist + active.
        if canonical_program_id:
            canonical = CanonicalProgram.objects.filter(id=canonical_program_id).first()
            if canonical is None:
                raise serializers.ValidationError(
                    {"canonical_program_id": "Canonical program does not exist."}
                )
            if not canonical.is_active:
                raise serializers.ValidationError(
                    {"canonical_program_id": "Canonical program is not active."}
                )

        # R11.4: if both supplied, program's canonical must match the supplied
        # canonical program.
        if program is not None and canonical_program_id:
            if str(program.canonical_program_id) != str(canonical_program_id):
                raise serializers.ValidationError(
                    {"canonical_program_id": "Program offering does not belong to this canonical program."}
                )

        # R11.5: reject a duplicate active row for the same
        # (institution, document_type, program_id, canonical_program_id) scope.
        duplicate_qs = InstitutionRequiredDocument.objects.filter(
            institution_id=institution_id,
            document_type=document_type,
            program_id=program_id,
            canonical_program_id=canonical_program_id,
            is_active=True,
        )
        if self.instance is not None:
            duplicate_qs = duplicate_qs.exclude(id=self.instance.id)
        if duplicate_qs.exists():
            raise serializers.ValidationError(
                {"document_type": "An active required document already exists for this scope."}
            )

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

        # Resolve effective values, falling back to the instance under edit so
        # partial updates validate against the persisted grant (R12.6
        # self-update). Mirrors the required-document serializer pattern.
        def _effective(field):
            if field in attrs:
                return attrs[field]
            if self.instance is not None:
                return getattr(self.instance, field, None)
            return None

        scope_type = _effective("scope_type")
        institution_id = _effective("institution_id")
        program_id = _effective("program_id")
        application_id = _effective("application_id")
        permissions = _effective("permissions")
        expires_at = _effective("expires_at")

        # R12.7: scope_type must be present and one of the accepted values.
        if not scope_type:
            raise serializers.ValidationError(
                {"scope_type": "scope_type is required."}
            )
        if scope_type not in VALID_GRANT_SCOPE_TYPES:
            raise serializers.ValidationError(
                {"scope_type": "scope_type must be one of institution, program_offering, application."}
            )

        # R12.1/2/3: the target id required by the scope must be present.
        required_by_scope = {
            "institution": "institution_id",
            "program_offering": "program_id",
            "application": "application_id",
        }
        required = required_by_scope[scope_type]
        if not _effective(required):
            raise serializers.ValidationError(
                {required: f"{required} is required for {scope_type} grants."}
            )

        # The target id used for the duplicate-guard tuple (R12.6).
        target_id = None

        if scope_type == "institution":
            # R12.1: institution must exist and be active.
            institution = (
                Institution.objects.filter(id=institution_id).first()
                if institution_id
                else None
            )
            if institution is None:
                raise serializers.ValidationError(
                    {"institution_id": "Institution does not exist."}
                )
            if not institution.is_active:
                raise serializers.ValidationError(
                    {"institution_id": "Institution is not active."}
                )
            target_id = str(institution_id)

        elif scope_type == "program_offering":
            # R12.2: program must exist, be active, and be owned by a school
            # (non-global) institution; if institution_id is supplied the
            # program must belong to it.
            program = (
                Program.objects.filter(id=program_id).first()
                if program_id
                else None
            )
            if program is None:
                raise serializers.ValidationError(
                    {"program_id": "Program offering does not exist."}
                )
            if not program.is_active:
                raise serializers.ValidationError(
                    {"program_id": "Program offering is not active."}
                )
            if program.institution_id is None:
                raise serializers.ValidationError(
                    {"program_id": "Program offering is not owned by a school institution."}
                )
            if institution_id and str(program.institution_id) != str(institution_id):
                raise serializers.ValidationError(
                    {"institution_id": "Program offering does not belong to this institution."}
                )
            target_id = str(program_id)

        else:  # scope_type == "application"
            # R12.3: application must exist; if institution_id/program_id are
            # supplied, the application's institution and program-offering must
            # match the supplied value(s).
            # Imported lazily to avoid a module-level apps.catalog → apps.applications
            # → apps.catalog import cycle (caught by scripts/check_circular_imports.py).
            from apps.applications.models import Application

            application = (
                Application.objects.filter(id=application_id).first()
                if application_id
                else None
            )
            if application is None:
                raise serializers.ValidationError(
                    {"application_id": "Application does not exist."}
                )
            if institution_id and str(application.institution_ref_id) != str(institution_id):
                raise serializers.ValidationError(
                    {"institution_id": "Application does not belong to this institution."}
                )
            if program_id and str(application.program_offering_id) != str(program_id):
                raise serializers.ValidationError(
                    {"program_id": "Application does not belong to this program offering."}
                )
            target_id = str(application_id)

        # R12.4: expires_at, when supplied, must be strictly later than the
        # current server time in UTC.
        if expires_at is not None:
            if expires_at <= timezone.now():
                raise serializers.ValidationError(
                    {"expires_at": "expires_at must be strictly in the future."}
                )

        # R12.5: every permission value must be in the allowlist.
        if permissions:
            invalid = [p for p in permissions if p not in GRANT_PERMISSION_ALLOWLIST]
            if invalid:
                raise serializers.ValidationError(
                    {"permissions": f"Unsupported permission value(s): {sorted(set(invalid))}."}
                )

        # R12.6: reject a new active grant whose (user, scope_type, target id)
        # matches an existing active grant, except when updating that same row.
        user_id = _effective("user_id")
        scope_column = {
            "institution": "institution_id",
            "program_offering": "program_id",
            "application": "application_id",
        }[scope_type]
        duplicate_qs = AccessGrant.objects.filter(
            user_id=user_id,
            scope_type=scope_type,
            is_active=True,
            **{scope_column: target_id},
        )
        if self.instance is not None:
            duplicate_qs = duplicate_qs.exclude(id=self.instance.id)
        if duplicate_qs.exists():
            raise serializers.ValidationError(
                {scope_column: "An active access grant already exists for this user and target."}
            )

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
    host = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=255)


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
