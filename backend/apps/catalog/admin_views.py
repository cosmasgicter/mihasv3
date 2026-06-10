"""Admin management APIs for Beanola tenant onboarding."""

from __future__ import annotations

import hashlib
import os
import uuid

from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, IsSuperAdmin, is_super_admin
from apps.catalog.admin_serializers import (
    AdminAccessGrantSerializer,
    AdminDocumentTemplateSerializer,
    AdminInstitutionAssetSerializer,
    AdminInstitutionDomainSerializer,
    AdminInstitutionSerializer,
    AdminMembershipSerializer,
    AdminRequiredDocumentSerializer,
    AdminRoutingSimulationSerializer,
    TenantAuditLogSerializer,
)
from apps.catalog.models import (
    AccessGrant,
    CanonicalProgram,
    Institution,
    InstitutionAsset,
    InstitutionDocumentTemplate,
    InstitutionDomain,
    InstitutionRequiredDocument,
    Intake,
    ProgramIntake,
    UserInstitutionMembership,
)
from apps.catalog.services import AccessScopeService
from apps.catalog.services import (
    OfferingAssignmentError,
    OfferingAssignmentService,
    TemplateValidationError,
    validate_template_payload,
)
from apps.catalog.tenant_audit_service import TenantAuditService
from apps.common.pagination import StandardPagination
from apps.documents.validators import validate_asset_magic_bytes


# Maximum accepted institution-asset upload size (2 MiB). Logos/signatures/seals
# are small brand images; anything larger is treated as an invalid asset (R5.3).
_MAX_ASSET_BYTES = 2 * 1024 * 1024


def _write_allowed(user) -> bool:
    return is_super_admin(user)


def _forbidden_write_response():
    return Response(
        {"success": False, "error": "Only super admins can manage tenant configuration.", "code": "FORBIDDEN"},
        status=status.HTTP_403_FORBIDDEN,
    )


def _scope_institution_ids(user) -> set[str]:
    scope = AccessScopeService().filters_for_user(user)
    if scope.all_access:
        return set()
    return scope.institution_ids


def _verb_for_payload(data, *, created: bool) -> str:
    """Resolve the config-change verb (R13.1).

    A PATCH that sets ``is_active`` falsey is a deactivation; a create is a
    ``created``; any other update is ``updated``.
    """
    if created:
        return "created"
    if isinstance(data, dict):
        if "is_active" in data:
            value = data.get("is_active")
            is_false = value in (False, "false", "False", 0, "0")
            if is_false:
                return "deactivated"
    return "updated"


def _audit_config_change(request, *, resource, verb, entity_id, institution_id):
    """Best-effort tenant config-change Audit_Event (R13.1). Never raises."""
    try:
        TenantAuditService.record_config_change(
            resource=resource,
            verb=verb,
            entity_id=entity_id,
            institution_id=institution_id,
            actor_id=getattr(request.user, "id", None),
            actor_role=getattr(request.user, "role", None),
            request=request,
        )
    except Exception:  # pragma: no cover - audit must never block a write
        pass


def _paginate(request, queryset, serializer_class):
    paginator = StandardPagination()
    page = paginator.paginate_queryset(queryset, request)
    if page is not None:
        serializer = serializer_class(page, many=True)
        return paginator.get_paginated_response(serializer.data)
    serializer = serializer_class(queryset, many=True)
    return Response({"success": True, "data": serializer.data})


class AdminTenantListCreateView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = AdminInstitutionSerializer

    @extend_schema(
        operation_id="admin_tenant_institutions_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("active", OpenApiTypes.BOOL, OpenApiParameter.QUERY),
        ],
        responses={200: OpenApiResponse(response=AdminInstitutionSerializer(many=True))},
    )
    def get(self, request):
        queryset = Institution.objects.all().order_by("name")
        if not is_super_admin(request.user):
            institution_ids = _scope_institution_ids(request.user)
            queryset = queryset.filter(id__in=institution_ids) if institution_ids else queryset.none()
        search = request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(code__icontains=search) | Q(full_name__icontains=search))
        active = request.query_params.get("active")
        if active is not None:
            queryset = queryset.filter(is_active=str(active).lower() in {"1", "true", "yes"})
        return _paginate(request, queryset, AdminInstitutionSerializer)

    @extend_schema(
        operation_id="admin_tenant_institutions_create",
        tags=["admin"],
        request=AdminInstitutionSerializer,
        responses={201: OpenApiResponse(response=AdminInstitutionSerializer)},
    )
    def post(self, request):
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        serializer = AdminInstitutionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        institution = serializer.save()
        _audit_config_change(
            request,
            resource="institution",
            verb="created",
            entity_id=institution.id,
            institution_id=institution.id,
        )
        return Response({"success": True, "data": AdminInstitutionSerializer(institution).data}, status=status.HTTP_201_CREATED)


class AdminTenantDetailView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = AdminInstitutionSerializer

    def _get_queryset(self, request):
        queryset = Institution.objects.all()
        if not is_super_admin(request.user):
            institution_ids = _scope_institution_ids(request.user)
            queryset = queryset.filter(id__in=institution_ids) if institution_ids else queryset.none()
        return queryset

    def get(self, request, institution_id):
        try:
            institution = self._get_queryset(request).get(id=institution_id)
        except Institution.DoesNotExist:
            return Response({"success": False, "error": "Institution not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"success": True, "data": AdminInstitutionSerializer(institution).data})

    def patch(self, request, institution_id):
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        try:
            institution = Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
            return Response({"success": False, "error": "Institution not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminInstitutionSerializer(institution, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        institution = serializer.save()
        _audit_config_change(
            request,
            resource="institution",
            verb=_verb_for_payload(request.data, created=False),
            entity_id=institution.id,
            institution_id=institution.id,
        )
        return Response({"success": True, "data": AdminInstitutionSerializer(institution).data})


class _InstitutionChildListCreateView(APIView):
    permission_classes = [IsAdmin]
    model = None
    serializer_class = None
    order_by = ("-created_at",)
    audit_resource = None

    def get_queryset(self, request, institution_id):
        institution_ids = _scope_institution_ids(request.user)
        if institution_ids and str(institution_id) not in institution_ids:
            return self.model.objects.none()
        # A no-scope non-super-admin has an empty institution set that is
        # indistinguishable from a super-admin's global set; deny them rather
        # than leaking another school's child resources (R5.6). Mirrors the
        # guard in ``_InstitutionChildDetailView.get_queryset``.
        if not institution_ids and not is_super_admin(request.user):
            return self.model.objects.none()
        queryset = self.model.objects.filter(institution_id=institution_id)
        return queryset.order_by(*self.order_by)

    def get(self, request, institution_id):
        return _paginate(request, self.get_queryset(request, institution_id), self.serializer_class)

    def post(self, request, institution_id):
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        payload = request.data.copy()
        payload["institution_id"] = str(institution_id)
        serializer = self.serializer_class(data=payload)
        serializer.is_valid(raise_exception=True)
        save_kwargs = {}
        if any(field.name == "created_by" for field in self.model._meta.fields):
            save_kwargs["created_by_id"] = getattr(request.user, "id", None)
        instance = serializer.save(**save_kwargs)
        if self.audit_resource:
            _audit_config_change(
                request,
                resource=self.audit_resource,
                verb="created",
                entity_id=getattr(instance, "id", None),
                institution_id=institution_id,
            )
        return Response({"success": True, "data": self.serializer_class(instance).data}, status=status.HTTP_201_CREATED)


class _InstitutionChildDetailView(APIView):
    permission_classes = [IsAdmin]
    model = None
    serializer_class = None
    audit_resource = None

    def get_queryset(self, request, institution_id):
        queryset = self.model.objects.filter(institution_id=institution_id)
        institution_ids = _scope_institution_ids(request.user)
        if institution_ids and str(institution_id) not in institution_ids:
            return queryset.none()
        if not institution_ids and not is_super_admin(request.user):
            return queryset.none()
        return queryset

    def patch(self, request, institution_id, item_id):
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        try:
            instance = self.get_queryset(request, institution_id).get(id=item_id)
        except self.model.DoesNotExist:
            return Response({"success": False, "error": "Tenant resource not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        payload = request.data.copy()
        payload["institution_id"] = str(institution_id)
        serializer = self.serializer_class(instance, data=payload, partial=True)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        if self.audit_resource:
            _audit_config_change(
                request,
                resource=self.audit_resource,
                verb=_verb_for_payload(request.data, created=False),
                entity_id=getattr(instance, "id", None),
                institution_id=institution_id,
            )
        return Response({"success": True, "data": self.serializer_class(instance).data})


class AdminTenantDomainListCreateView(_InstitutionChildListCreateView):
    model = InstitutionDomain
    serializer_class = AdminInstitutionDomainSerializer
    order_by = ("hostname",)
    audit_resource = "domain"


class AdminTenantDomainDetailView(_InstitutionChildDetailView):
    model = InstitutionDomain
    serializer_class = AdminInstitutionDomainSerializer
    audit_resource = "domain"


class AdminTenantAssetListCreateView(_InstitutionChildListCreateView):
    model = InstitutionAsset
    serializer_class = AdminInstitutionAssetSerializer
    audit_resource = "asset"


class AdminTenantAssetUploadView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, institution_id):
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        try:
            Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
            return Response({"success": False, "error": "Institution not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response({"success": False, "error": "Asset file is required", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        # Size guard is part of asset validation (R5.3): an oversized asset is a
        # mismatched/invalid upload, surfaced under the stable ASSET_INVALID code.
        if uploaded_file.size > _MAX_ASSET_BYTES:
            return Response(
                {"success": False, "error": "Asset file exceeds the 2MB limit", "code": "ASSET_INVALID"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        asset_type = (request.data.get("asset_type") or "logo").strip().lower()
        if asset_type not in {"logo", "signature", "seal"}:
            return Response({"success": False, "error": "Invalid asset type", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        declared_mime = (uploaded_file.content_type or "").strip().lower()
        # MIME + magic-byte validation for PNG/JPEG/WebP/SVG (R5.3). Any
        # mismatch/disallowed/empty/malformed upload → stable ASSET_INVALID.
        try:
            detected_mime = validate_asset_magic_bytes(uploaded_file, declared_mime)
        except ValidationError:
            return Response(
                {"success": False, "error": "Asset file failed MIME or magic-byte validation", "code": "ASSET_INVALID"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            # A malformed/unreadable upload is a client error, not a server fault.
            return Response(
                {"success": False, "error": "Asset file could not be validated", "code": "ASSET_INVALID"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        digest = hashlib.sha256()
        uploaded_file.seek(0)
        for chunk in uploaded_file.chunks():
            digest.update(chunk)
        checksum = digest.hexdigest()
        uploaded_file.seek(0)

        extension = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/svg+xml": ".svg",
        }[detected_mime]
        safe_name = f"{asset_type}-{uuid.uuid4().hex}{extension}"
        storage_key = f"institution-assets/{institution_id}/{safe_name}"

        try:
            from apps.common.storage import MediaStorage

            storage = MediaStorage()
            stored_name = storage.save(storage_key, uploaded_file)
            public_url = storage.url(stored_name)
        except Exception:
            return Response({"success": False, "error": "Asset storage error", "code": "STORAGE_ERROR"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        current_version = (
            InstitutionAsset.objects.filter(institution_id=institution_id, asset_type=asset_type)
            .order_by("-version")
            .values_list("version", flat=True)
            .first()
            or 0
        )
        asset = InstitutionAsset.objects.create(
            institution_id=institution_id,
            asset_type=asset_type,
            storage_key=stored_name,
            public_url=public_url,
            mime_type=detected_mime,
            checksum_sha256=checksum,
            version=current_version + 1,
            is_active=True,
            metadata={"original_name": os.path.basename(uploaded_file.name or safe_name)},
            created_at=timezone.now(),
            created_by_id=getattr(request.user, "id", None),
        )
        try:
            TenantAuditService.record_asset_upload(
                asset_id=asset.id,
                institution_id=institution_id,
                asset_type=asset_type,
                version=asset.version,
                mime_type=detected_mime,
                checksum_sha256=checksum,
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block upload
            pass
        return Response({"success": True, "data": AdminInstitutionAssetSerializer(asset).data}, status=status.HTTP_201_CREATED)


class AdminTenantAssetDetailView(_InstitutionChildDetailView):
    model = InstitutionAsset
    serializer_class = AdminInstitutionAssetSerializer
    audit_resource = "asset"


def _template_rejected_response(message: str):
    """Map a ``TemplateValidationError`` to the stable ``TEMPLATE_TOKEN_REJECTED``
    400 envelope (R5.7 / R6.4)."""
    return Response(
        {"success": False, "error": message, "code": "TEMPLATE_TOKEN_REJECTED"},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _guard_template_payload(request):
    """Validate a document-template create/update payload (R5.7 / R6.4).

    Returns a ``TEMPLATE_TOKEN_REJECTED`` 400 ``Response`` when the payload is
    unsafe (disallowed section/token, injected token, or an arbitrary uploaded
    DOCX/PDF merge document), or ``None`` when it is safe to proceed.

    ``sections`` / ``tokens`` are only validated when present so a partial
    update that omits them is unaffected.
    """
    data = request.data
    has_uploaded_file = bool(getattr(request, "FILES", None))
    sections = data.get("sections") if "sections" in data else None
    tokens = data.get("tokens") if "tokens" in data else None
    try:
        validate_template_payload(
            sections=sections,
            tokens=tokens,
            has_uploaded_file=has_uploaded_file,
            extra_keys=list(data.keys()),
        )
    except TemplateValidationError as exc:
        return _template_rejected_response(exc.message)
    return None


class AdminTenantTemplateListCreateView(_InstitutionChildListCreateView):
    model = InstitutionDocumentTemplate
    serializer_class = AdminDocumentTemplateSerializer
    audit_resource = "template"

    def post(self, request, institution_id):
        # Permission first (mirrors the parent's super-admin write gate), so a
        # non-super-admin gets FORBIDDEN rather than a payload-inspection 400.
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        # Reject arbitrary merge documents / disallowed sections + tokens
        # before the generic create runs (R5.7 / R6.4).
        rejected = _guard_template_payload(request)
        if rejected is not None:
            return rejected
        return super().post(request, institution_id)


class AdminTenantTemplateDetailView(_InstitutionChildDetailView):
    model = InstitutionDocumentTemplate
    serializer_class = AdminDocumentTemplateSerializer
    audit_resource = "template"

    def patch(self, request, institution_id, item_id):
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        rejected = _guard_template_payload(request)
        if rejected is not None:
            return rejected
        return super().patch(request, institution_id, item_id)


class AdminTenantRequiredDocumentListCreateView(_InstitutionChildListCreateView):
    model = InstitutionRequiredDocument
    serializer_class = AdminRequiredDocumentSerializer
    audit_resource = "required_document"


class AdminTenantRequiredDocumentDetailView(_InstitutionChildDetailView):
    model = InstitutionRequiredDocument
    serializer_class = AdminRequiredDocumentSerializer
    audit_resource = "required_document"


class AdminMembershipListCreateView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = AdminMembershipSerializer

    def get(self, request):
        queryset = UserInstitutionMembership.objects.all().order_by("-created_at")
        institution_ids = _scope_institution_ids(request.user)
        if institution_ids:
            queryset = queryset.filter(institution_id__in=institution_ids)
        elif not is_super_admin(request.user):
            queryset = queryset.none()
        institution_id = request.query_params.get("institution")
        if institution_id:
            queryset = queryset.filter(institution_id=institution_id)
        return _paginate(request, queryset, AdminMembershipSerializer)

    def post(self, request):
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        serializer = AdminMembershipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = serializer.save(created_by_id=getattr(request.user, "id", None))
        _audit_config_change(
            request,
            resource="membership",
            verb="created",
            entity_id=membership.id,
            institution_id=getattr(membership, "institution_id", None),
        )
        return Response({"success": True, "data": AdminMembershipSerializer(membership).data}, status=status.HTTP_201_CREATED)


class AdminMembershipDetailView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = AdminMembershipSerializer

    def get_queryset(self, request):
        queryset = UserInstitutionMembership.objects.all()
        institution_ids = _scope_institution_ids(request.user)
        if institution_ids:
            return queryset.filter(institution_id__in=institution_ids)
        if not is_super_admin(request.user):
            return queryset.none()
        return queryset

    def patch(self, request, membership_id):
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        try:
            membership = self.get_queryset(request).get(id=membership_id)
        except UserInstitutionMembership.DoesNotExist:
            return Response({"success": False, "error": "Membership not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminMembershipSerializer(membership, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        _audit_config_change(
            request,
            resource="membership",
            verb=_verb_for_payload(request.data, created=False),
            entity_id=membership.id,
            institution_id=getattr(membership, "institution_id", None),
        )
        return Response({"success": True, "data": AdminMembershipSerializer(membership).data})


class AdminAccessGrantListCreateView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = AdminAccessGrantSerializer

    def get(self, request):
        now = timezone.now()
        queryset = AccessGrant.objects.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).order_by("-created_at")
        institution_ids = _scope_institution_ids(request.user)
        if institution_ids:
            queryset = queryset.filter(Q(institution_id__in=institution_ids) | Q(program__institution_id__in=institution_ids))
        elif not is_super_admin(request.user):
            queryset = queryset.none()
        user_id = request.query_params.get("user")
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        institution_id = request.query_params.get("institution")
        if institution_id:
            queryset = queryset.filter(Q(institution_id=institution_id) | Q(program__institution_id=institution_id))
        return _paginate(request, queryset, AdminAccessGrantSerializer)

    def post(self, request):
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        serializer = AdminAccessGrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grant = serializer.save(created_by_id=getattr(request.user, "id", None))
        _audit_config_change(
            request,
            resource="grant",
            verb="created",
            entity_id=grant.id,
            institution_id=getattr(grant, "institution_id", None),
        )
        return Response({"success": True, "data": AdminAccessGrantSerializer(grant).data}, status=status.HTTP_201_CREATED)


class AdminAccessGrantDetailView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = AdminAccessGrantSerializer

    def get_queryset(self, request):
        queryset = AccessGrant.objects.all()
        institution_ids = _scope_institution_ids(request.user)
        if institution_ids:
            return queryset.filter(Q(institution_id__in=institution_ids) | Q(program__institution_id__in=institution_ids))
        if not is_super_admin(request.user):
            return queryset.none()
        return queryset

    def patch(self, request, grant_id):
        if not _write_allowed(request.user):
            return _forbidden_write_response()
        try:
            grant = self.get_queryset(request).get(id=grant_id)
        except AccessGrant.DoesNotExist:
            return Response({"success": False, "error": "Access grant not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminAccessGrantSerializer(grant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        grant = serializer.save()
        _audit_config_change(
            request,
            resource="grant",
            verb=_verb_for_payload(request.data, created=False),
            entity_id=grant.id,
            institution_id=getattr(grant, "institution_id", None),
        )
        return Response({"success": True, "data": AdminAccessGrantSerializer(grant).data})


class AdminRoutingSimulateView(APIView):
    """POST /api/v1/admin/routing/simulate/ - dry-run the real assignment service.

    Tenant onboarding "Test routing" simulator (R11.3): given a canonical
    ``program_id`` + ``intake_id`` (plus optional ``country``/``nationality``
    and white-label ``institution_id``), this re-runs the canonical
    :class:`OfferingAssignmentService` and returns *exactly* the offering it
    would assign for the same inputs — it never reimplements the routing logic.
    The result is read-only (no application row is created) and carries enough
    detail for an operator to understand *why* an offering was (or was not)
    chosen.

    Super-admin gated: routing config spans every school, so only a global
    actor may probe arbitrary canonical-program/intake/institution combinations.
    Non-super-admins receive the same FORBIDDEN response used by every other
    tenant write surface.
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = AdminRoutingSimulationSerializer

    @extend_schema(
        operation_id="admin_routing_simulate",
        tags=["admin"],
        request=AdminRoutingSimulationSerializer,
        responses={200: OpenApiResponse(description="Assignment result or NO_ELIGIBLE_OFFERING failure detail.")},
    )
    def post(self, request):
        serializer = AdminRoutingSimulationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        program_id = str(payload["program_id"])
        intake_id = str(payload["intake_id"])
        country = payload.get("country") or None
        nationality = payload.get("nationality") or None
        institution_id = str(payload["institution_id"]) if payload.get("institution_id") else None

        inputs = {
            "program_id": program_id,
            "intake_id": intake_id,
            "country": country,
            "nationality": nationality,
            "institution_id": institution_id,
        }

        try:
            assigned = OfferingAssignmentService().assign(
                program_id=program_id,
                intake_id=intake_id,
                country=country,
                nationality=nationality,
                institution_id=institution_id,
            )
        except OfferingAssignmentError as exc:
            return Response(
                {
                    "success": True,
                    "data": {
                        "assigned": False,
                        "inputs": inputs,
                        "error": {
                            "code": getattr(exc, "code", "NO_ELIGIBLE_OFFERING"),
                            "message": str(exc),
                        },
                    },
                }
            )
        except (CanonicalProgram.DoesNotExist, Intake.DoesNotExist):
            return Response(
                {
                    "success": True,
                    "data": {
                        "assigned": False,
                        "inputs": inputs,
                        "error": {
                            "code": "NO_ELIGIBLE_OFFERING",
                            "message": "The selected program or intake is not active or does not exist.",
                        },
                    },
                }
            )

        offering = assigned.offering
        institution = assigned.institution
        program_intake = ProgramIntake.objects.filter(
            program_id=offering.id, intake_id=assigned.intake.id
        ).first()

        return Response(
            {
                "success": True,
                "data": {
                    "assigned": True,
                    "inputs": inputs,
                    "program_id": str(assigned.canonical_program.id),
                    "program_name": assigned.canonical_program.name,
                    "intake_id": str(assigned.intake.id),
                    "intake_name": assigned.intake.name,
                    "program_offering_id": str(offering.id),
                    "offering_code": offering.code,
                    "offering_name": offering.name,
                    "institution_id": str(institution.id),
                    "institution": {
                        "id": str(institution.id),
                        "name": institution.brand_name or institution.name,
                        "full_name": institution.full_name or institution.name,
                        "code": institution.code,
                    },
                    # Routing decision factors so an operator can see *why* this
                    # offering won (lower priority numbers win during sort).
                    "decision": {
                        "offering_priority": offering.assignment_priority,
                        "program_intake_priority": (
                            program_intake.assignment_priority if program_intake else None
                        ),
                        "offering_status": offering.offering_status,
                    },
                    "required_documents": assigned.required_documents,
                },
            }
        )


# ---------------------------------------------------------------------------
# Tenant observability views (R13.2 / R13.5)
# ---------------------------------------------------------------------------

from apps.catalog.tenant_audit_service import (  # noqa: E402
    OBSERVABILITY_CONFIG_PREFIX,
    OBSERVABILITY_ROUTING_FAILURE_ACTION,
)
from apps.common.models import AuditLog  # noqa: E402


class AdminTenantAuditView(APIView):
    """GET /api/v1/admin/tenant-audit/ — Super_Admin operational-review feed (R13.2).

    Returns recent **tenant configuration changes** (``tenant.*`` actions) and
    **routing failures** (``assignment.failed``) so a Super_Admin can review
    coverage gaps and config drift in one place. Super-admin only: it spans
    every school, so it is never exposed to school staff (who use the scoped
    per-institution view below).

    Optional ``action`` query param filters to an exact action; ``category``
    (``config`` | ``routing_failure``) narrows to one of the two feeds.
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = TenantAuditLogSerializer

    @extend_schema(
        operation_id="admin_tenant_audit_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("action", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("category", OpenApiTypes.STR, OpenApiParameter.QUERY, description="config | routing_failure"),
        ],
        responses={200: OpenApiResponse(response=TenantAuditLogSerializer(many=True))},
    )
    def get(self, request):
        config_q = Q(action__startswith=OBSERVABILITY_CONFIG_PREFIX)
        routing_q = Q(action=OBSERVABILITY_ROUTING_FAILURE_ACTION)

        category = (request.query_params.get("category") or "").strip().lower()
        if category == "config":
            queryset = AuditLog.objects.filter(config_q)
        elif category == "routing_failure":
            queryset = AuditLog.objects.filter(routing_q)
        else:
            queryset = AuditLog.objects.filter(config_q | routing_q)

        action = request.query_params.get("action")
        if action:
            queryset = queryset.filter(action=action)

        queryset = queryset.order_by("-created_at")
        return _paginate(request, queryset, TenantAuditLogSerializer)


class AdminInstitutionAuditView(APIView):
    """GET /api/v1/admin/institutions/<id>/audit/ — scoped per-institution feed (R13.5).

    Returns tenant Audit_Events for a single institution. A non-super-admin
    School_Staff caller may only read audit events for an institution within
    their membership/grant scope; an out-of-scope institution is masked as
    not-found (no leakage of another school's existence or activity). Events
    are matched on ``changes.institution_id`` (always recorded by
    :class:`TenantAuditService`).
    """

    permission_classes = [IsAdmin]
    serializer_class = TenantAuditLogSerializer

    @extend_schema(
        operation_id="admin_institution_audit_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("institution_id", OpenApiTypes.UUID, OpenApiParameter.PATH),
            OpenApiParameter("action", OpenApiTypes.STR, OpenApiParameter.QUERY),
        ],
        responses={200: OpenApiResponse(response=TenantAuditLogSerializer(many=True))},
    )
    def get(self, request, institution_id):
        institution_str = str(institution_id)
        if not is_super_admin(request.user):
            scope_ids = _scope_institution_ids(request.user)
            # No-scope or out-of-scope institution → identical not-found
            # response (R13.5 / R4.4): never confirm another school's existence.
            if not scope_ids or institution_str not in scope_ids:
                return Response(
                    {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Match on the institution_id recorded inside the redacted changes
        # payload. JSONField containment keeps the filter DB-portable.
        queryset = AuditLog.objects.filter(changes__institution_id=institution_str)

        action = request.query_params.get("action")
        if action:
            queryset = queryset.filter(action=action)

        queryset = queryset.order_by("-created_at")
        return _paginate(request, queryset, TenantAuditLogSerializer)
