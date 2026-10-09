"""Representative V2 endpoints — one per domain to demonstrate the pattern.

Each view inherits from ``V2APIView`` and produces the canonical V2 envelope.
These are reference implementations showing how existing domain logic connects
to the V2 response contract.

Design: ``design.md`` section 14
Task: 1.3
Requirements: R14.1-R14.2, R17.2
Finding: API-01
"""

from __future__ import annotations

import logging

from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
)
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.common.v2.views import V2APIView
from apps.common.v2.exceptions import (
    V2DomainError,
    V2FeeNotConfigured,
    V2ProviderUnavailable,
)

logger = logging.getLogger(__name__)


class V2MetaSerializer(serializers.Serializer):
    request_id = serializers.UUIDField(allow_null=True)
    api_version = serializers.CharField(default="v2")


class V2ErrorBodySerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()
    fields = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField()),
        required=False,
    )
    retryable = serializers.BooleanField()


class V2ErrorEnvelopeSerializer(serializers.Serializer):
    success = serializers.BooleanField(default=False)
    error = V2ErrorBodySerializer()
    meta = V2MetaSerializer()


class V2SessionDataSerializer(serializers.Serializer):
    authenticated = serializers.BooleanField()
    id = serializers.UUIDField(required=False)
    email = serializers.EmailField(required=False)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    role = serializers.CharField(required=False)


class V2SessionEnvelopeSerializer(serializers.Serializer):
    success = serializers.BooleanField(default=True)
    data = V2SessionDataSerializer()
    meta = V2MetaSerializer()


class V2ProgramSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    code = serializers.CharField(allow_null=True)
    is_active = serializers.BooleanField()


class V2ProgramPageSerializer(serializers.Serializer):
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_count = serializers.IntegerField()
    results = V2ProgramSerializer(many=True)


class V2ProgramListEnvelopeSerializer(serializers.Serializer):
    success = serializers.BooleanField(default=True)
    data = V2ProgramPageSerializer()
    meta = V2MetaSerializer()


class V2ApplicationDetailSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.CharField()
    program = serializers.CharField()
    institution = serializers.CharField()
    created_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)


class V2ApplicationDetailEnvelopeSerializer(serializers.Serializer):
    success = serializers.BooleanField(default=True)
    data = V2ApplicationDetailSerializer()
    meta = V2MetaSerializer()


class V2FeeResolutionSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField()
    residency_category = serializers.CharField()
    source = serializers.CharField()
    provider_fee_estimate = serializers.DecimalField(max_digits=12, decimal_places=2)
    customer_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    bearer = serializers.CharField()
    is_binding_quote = serializers.BooleanField()


class V2FeeResolutionEnvelopeSerializer(serializers.Serializer):
    success = serializers.BooleanField(default=True)
    data = V2FeeResolutionSerializer()
    meta = V2MetaSerializer()


class V2DocumentSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    document_type = serializers.CharField()
    file_name = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField(allow_null=True)


class V2DocumentPageSerializer(serializers.Serializer):
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_count = serializers.IntegerField()
    results = V2DocumentSerializer(many=True)


class V2DocumentListEnvelopeSerializer(serializers.Serializer):
    success = serializers.BooleanField(default=True)
    data = V2DocumentPageSerializer()
    meta = V2MetaSerializer()


# ---------------------------------------------------------------------------
# Auth: Session endpoint (V2)
# ---------------------------------------------------------------------------


class V2SessionView(V2APIView):
    """GET /api/v2/auth/session/ — current user session info.

    Returns authenticated user data or {authenticated: false} for anonymous.
    Demonstrates: success envelope with meta, anonymous vs authenticated paths.
    """

    permission_classes = [AllowAny]

    @extend_schema(
        operation_id="v2_auth_session_retrieve",
        tags=["auth"],
        responses={200: OpenApiResponse(response=V2SessionEnvelopeSerializer)},
    )
    def get(self, request):
        from apps.accounts.authentication import OptionalJWTCookieAuthentication

        # Re-authenticate with optional auth (same as V1 session).
        user = request.user
        if not getattr(user, "is_authenticated", False):
            return Response({"authenticated": False})

        data = {
            "authenticated": True,
            "id": str(user.id),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
        }
        return Response(data)


# ---------------------------------------------------------------------------
# Catalog: Program list (V2)
# ---------------------------------------------------------------------------


class V2ProgramListView(V2APIView):
    """GET /api/v2/catalog/programs/ — paginated program list.

    Public endpoint returning active programs. Demonstrates: V2 pagination
    envelope with meta, page_size, total_count.
    """

    permission_classes = [AllowAny]

    @extend_schema(
        operation_id="v2_catalog_programs_list",
        tags=["catalog"],
        responses={200: OpenApiResponse(response=V2ProgramListEnvelopeSerializer)},
    )
    def get(self, request):
        from apps.catalog.models import Program

        queryset = Program.objects.filter(is_active=True).order_by("name")

        # Use the V2 pagination.
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)

        if page is not None:
            data = [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "code": getattr(p, "code", None),
                    "is_active": p.is_active,
                }
                for p in page
            ]
            return paginator.get_paginated_response(data)

        # No pagination needed (empty or below page size).
        data = [
            {
                "id": str(p.id),
                "name": p.name,
                "code": getattr(p, "code", None),
                "is_active": p.is_active,
            }
            for p in queryset
        ]
        return Response(data)


# ---------------------------------------------------------------------------
# Applications: Application detail (owner read) (V2)
# ---------------------------------------------------------------------------


class V2ApplicationDetailView(V2APIView):
    """GET /api/v2/applications/{id}/ — application detail for owner.

    Demonstrates: owner-scoped read, NOT_FOUND for non-existent/non-owned,
    success envelope with application data.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_applications_retrieve",
        tags=["applications"],
        parameters=[
            OpenApiParameter(
                "application_id",
                OpenApiTypes.UUID,
                OpenApiParameter.PATH,
                description="Application UUID.",
            )
        ],
        responses={
            200: OpenApiResponse(response=V2ApplicationDetailEnvelopeSerializer),
            404: OpenApiResponse(response=V2ErrorEnvelopeSerializer),
        },
    )
    def get(self, request, application_id):
        from apps.applications.models import Application

        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            raise NotFound()

        # Owner check: student can only see their own application.
        if application.user_id != request.user.id:
            # Return 404 rather than 403 to avoid leaking existence.
            raise NotFound()

        data = {
            "id": str(application.id),
            "status": application.status,
            "program": application.program,
            "institution": application.institution,
            "created_at": (
                application.created_at.isoformat()
                if application.created_at
                else None
            ),
            "updated_at": (
                application.updated_at.isoformat()
                if application.updated_at
                else None
            ),
        }
        return Response(data)


# ---------------------------------------------------------------------------
# Payment: Fee resolution (V2)
# ---------------------------------------------------------------------------


class V2FeeResolveView(V2APIView):
    """GET /api/v2/payments/resolve-fee/ — resolve application fee.

    Demonstrates: validation error with fields, domain error (FEE_NOT_CONFIGURED),
    provider unavailable, and success envelope.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_payments_fee_resolve",
        tags=["payments"],
        parameters=[
            OpenApiParameter(
                "program_code",
                OpenApiTypes.STR,
                OpenApiParameter.QUERY,
                required=True,
            ),
            OpenApiParameter("nationality", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("country", OpenApiTypes.STR, OpenApiParameter.QUERY),
        ],
        responses={
            200: OpenApiResponse(response=V2FeeResolutionEnvelopeSerializer),
            400: OpenApiResponse(response=V2ErrorEnvelopeSerializer),
            409: OpenApiResponse(response=V2ErrorEnvelopeSerializer),
            422: OpenApiResponse(response=V2ErrorEnvelopeSerializer),
            503: OpenApiResponse(response=V2ErrorEnvelopeSerializer),
        },
    )
    def get(self, request):
        from decimal import Decimal

        program_code = request.query_params.get("program_code")
        if not program_code:
            raise ValidationError(
                {"program_code": ["This field is required."]}
            )

        nationality = request.query_params.get("nationality")
        country = request.query_params.get("country")

        from apps.documents.fee_resolver import FeeResolver, FeeConfigurationError
        from apps.catalog.models import Program

        resolver = FeeResolver()

        try:
            resolved = resolver.resolve_fee(
                program_code=program_code,
                nationality=nationality,
                country=country,
            )
        except Program.DoesNotExist:
            raise V2FeeNotConfigured(
                "No fee is configured for this program and residency."
            )
        except FeeConfigurationError as exc:
            # Offering resolved but the canonical FeeSchedule is missing
            # (FEE_NOT_CONFIGURED) or ambiguous (FEE_AMBIGUOUS). Fail closed —
            # never a hardcoded amount (design §10.1, R12.2).
            if exc.code == "FEE_AMBIGUOUS":
                raise V2DomainError("CONFLICT", message=exc.message)
            raise V2FeeNotConfigured(exc.message)
        except Exception:
            logger.exception(
                "Fee resolution failed for program %s", program_code
            )
            raise V2ProviderUnavailable(
                "Fee resolution is temporarily unavailable."
            )

        # Task 8.1: provider fee from the server-side policy (the same authority
        # that mints a binding quote), never a client-side percentage (STU-08).
        from apps.documents.fee_quote_service import provider_fee_policy

        policy = provider_fee_policy()
        base_amount = Decimal(str(resolved.amount))
        provider_fee_estimate = policy.compute(base_amount)
        customer_total = base_amount + provider_fee_estimate

        data = {
            "amount": str(resolved.amount),
            "currency": resolved.currency,
            "residency_category": resolved.residency_category,
            "source": resolved.source,
            "provider_fee_estimate": str(provider_fee_estimate),
            "customer_total": str(customer_total),
            "bearer": policy.bearer,
            "is_binding_quote": False,
        }
        return Response(data)


# ---------------------------------------------------------------------------
# Documents: Document list (V2)
# ---------------------------------------------------------------------------


class V2DocumentListView(V2APIView):
    """GET /api/v2/documents/ — paginated document list for current user.

    Demonstrates: authenticated list with V2 pagination, empty results handling.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_documents_list",
        tags=["documents"],
        responses={200: OpenApiResponse(response=V2DocumentListEnvelopeSerializer)},
    )
    def get(self, request):
        from apps.documents.models import ApplicationDocument

        # Documents belong to a student through their application; there is no
        # direct ``user_id`` on ApplicationDocument.  Only expose the current,
        # non-deleted evidence version so superseded or soft-deleted uploads do
        # not reappear in the student's V2 list.
        queryset = (
            ApplicationDocument.objects.filter(
                application__user_id=request.user.id,
                is_current=True,
            )
            .exclude(verification_status="deleted")
            .order_by("-created_at")
        )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)

        if page is not None:
            data = [
                {
                    "id": str(doc.id),
                    "document_type": doc.document_type,
                    "file_name": doc.document_name,
                    "status": doc.verification_status,
                    "created_at": (
                        doc.created_at.isoformat()
                        if doc.created_at
                        else None
                    ),
                }
                for doc in page
            ]
            return paginator.get_paginated_response(data)

        data = [
            {
                "id": str(doc.id),
                "document_type": doc.document_type,
                "file_name": doc.document_name,
                "status": doc.verification_status,
                "created_at": (
                    doc.created_at.isoformat()
                    if doc.created_at
                    else None
                ),
            }
            for doc in queryset
        ]
        return Response(data)
