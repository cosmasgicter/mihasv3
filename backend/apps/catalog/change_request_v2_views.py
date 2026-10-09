"""V2 tenant change-request endpoints (task 4.5).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.5
Requirements: R5.4, R5.5
Findings: TEN-06
Design: design.md §6.4 (change-request workflow), §5.2 (authority), §14 (V2 envelope).

Thin V2 views over :class:`~apps.catalog.change_request_service.TenantChangeRequestService`.
They close TEN-06: a Tenant_Admin SUBMITS a typed profile/program/domain change
request (they hold ``tenant.<kind>.request_change`` but not the platform
capability to mutate directly); a Platform_Admin reviews it, and approval applies
it through the SAME canonical command a Platform_Admin uses directly (R5.5).

Authorization (design §3): submit/cancel require the tenant
``tenant.<kind>.request_change`` capability on the target institution; approve/
reject require the platform capability of the underlying canonical command
(``platform.tenant.update`` / ``platform.program_assignment.manage`` /
``platform.domain.manage``). List/detail scope through
``visible_institution_queryset`` **before** lookup so a cross-tenant id returns a
non-revealing 404 (tenant isolation). The service owns business state, not
authorization.
"""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.catalog.change_request_service import (
    ChangeRequestError,
    TenantChangeRequestService,
)
from apps.catalog.models import Institution, TenantChangeRequest
from apps.catalog.services import AdminCapabilityService, CapabilityResolutionError
from apps.common.v2.error_codes import V2ErrorCode, register_error_code
from apps.common.v2.exceptions import V2DomainError
from apps.common.v2.views import V2APIView

# ---------------------------------------------------------------------------
# Register the change-request-specific stable error codes (idempotent).
# ---------------------------------------------------------------------------
for _entry in (
    V2ErrorCode(
        "CHANGE_REQUEST_INVALID_STATE",
        409,
        "That action is not allowed for the change request's current state.",
        retryable=False,
    ),
    V2ErrorCode(
        "CHANGE_REQUEST_APPLY_FAILED",
        422,
        "The change could not be applied and was returned to submitted.",
        retryable=False,
    ),
    V2ErrorCode(
        "HOSTNAME_CONFLICT",
        409,
        "That hostname is already in use by an active domain.",
        retryable=False,
    ),
):
    try:
        register_error_code(_entry)
    except ValueError:
        pass


# The tenant capability required to SUBMIT/CANCEL a change of each kind.
_TENANT_CAP_BY_KIND = {
    TenantChangeRequest.KIND_PROFILE: "tenant.profile.request_change",
    TenantChangeRequest.KIND_PROGRAM: "tenant.program.request_change",
    TenantChangeRequest.KIND_DOMAIN: "tenant.domain.request_change",
}

# The platform capability required to APPROVE/REJECT (apply) each kind — the
# capability of the underlying canonical command a Platform_Admin uses directly.
_PLATFORM_CAP_BY_KIND = {
    TenantChangeRequest.KIND_PROFILE: "platform.tenant.update",
    TenantChangeRequest.KIND_PROGRAM: "platform.program_assignment.manage",
    TenantChangeRequest.KIND_DOMAIN: "platform.domain.manage",
}


def _raise_v2(err: ChangeRequestError) -> None:
    """Translate a :class:`ChangeRequestError` into a V2 error envelope."""
    code = err.code or "INTERNAL_ERROR"
    if code == "INVALID_PAYLOAD":
        raise V2DomainError("VALIDATION_ERROR", message=err.message, fields=err.fields or None)
    raise V2DomainError(code, message=err.message, fields=err.fields or None)


# ---------------------------------------------------------------------------
# Serializers (transport validation only)
# ---------------------------------------------------------------------------


class ChangeRequestCreateSerializer(serializers.Serializer):
    """Validate the create/submit body (transport shape only)."""

    institution_id = serializers.UUIDField()
    change_kind = serializers.ChoiceField(
        choices=[
            TenantChangeRequest.KIND_PROFILE,
            TenantChangeRequest.KIND_PROGRAM,
            TenantChangeRequest.KIND_DOMAIN,
        ]
    )
    payload = serializers.DictField()
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000, default="")
    submit = serializers.BooleanField(required=False, default=True)


class ChangeRequestReasonSerializer(serializers.Serializer):
    """Optional note for submit/cancel/approve/reject commands."""

    note = serializers.CharField(required=False, allow_blank=True, max_length=1000, default="")


class ChangeRequestRepresentationSerializer(serializers.Serializer):
    """OpenAPI representation returned by the change-request workflow."""

    id = serializers.UUIDField()
    institution_id = serializers.UUIDField()
    change_kind = serializers.CharField()
    status = serializers.CharField()
    payload = serializers.DictField()
    target_object_id = serializers.UUIDField(allow_null=True)
    configuration_version = serializers.IntegerField()
    before_data = serializers.DictField(allow_null=True)
    after_data = serializers.DictField(allow_null=True)
    review_note = serializers.CharField(allow_null=True, allow_blank=True)
    last_error = serializers.CharField(allow_null=True, allow_blank=True)
    requested_by_id = serializers.UUIDField(allow_null=True)
    reviewed_by_id = serializers.UUIDField(allow_null=True)
    submitted_at = serializers.DateTimeField(allow_null=True)
    reviewed_at = serializers.DateTimeField(allow_null=True)
    applied_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)


# ---------------------------------------------------------------------------
# Serialization + scope helpers
# ---------------------------------------------------------------------------


def _serialize(cr: TenantChangeRequest) -> dict:
    return {
        "id": str(cr.id),
        "institution_id": str(cr.institution_id),
        "change_kind": cr.change_kind,
        "status": cr.status,
        "payload": cr.payload or {},
        "target_object_id": str(cr.target_object_id) if cr.target_object_id else None,
        "configuration_version": cr.configuration_version,
        "before_data": cr.before_data,
        "after_data": cr.after_data,
        "review_note": cr.review_note,
        "last_error": cr.last_error,
        "requested_by_id": str(cr.requested_by_id) if cr.requested_by_id else None,
        "reviewed_by_id": str(cr.reviewed_by_id) if cr.reviewed_by_id else None,
        "submitted_at": cr.submitted_at.isoformat() if cr.submitted_at else None,
        "reviewed_at": cr.reviewed_at.isoformat() if cr.reviewed_at else None,
        "applied_at": cr.applied_at.isoformat() if cr.applied_at else None,
        "created_at": cr.created_at.isoformat() if cr.created_at else None,
        "updated_at": cr.updated_at.isoformat() if cr.updated_at else None,
    }


def _scoped_queryset(user):
    """Change requests the actor may see, scoped BEFORE any lookup (tenant isolation).

    Filters through ``visible_institution_queryset`` so a Tenant_Admin sees only
    their own institution's requests and a cross-tenant id is never confirmed to
    exist. Fails closed (403) on a capability-resolution error.
    """
    try:
        visible = AdminCapabilityService().visible_institution_queryset(user)
    except CapabilityResolutionError as exc:
        raise PermissionDenied(
            "Your capabilities could not be resolved; the action is denied."
        ) from exc
    return TenantChangeRequest.objects.filter(institution__in=visible)


def _get_scoped_or_404(user, change_request_id) -> TenantChangeRequest:
    try:
        return _scoped_queryset(user).get(id=change_request_id)
    except TenantChangeRequest.DoesNotExist:
        raise NotFound()


def _require_tenant_capability(user, institution_id, change_kind) -> None:
    """Enforce the tenant ``request_change`` capability for the kind + institution."""
    capability = _TENANT_CAP_BY_KIND[change_kind]
    AdminCapabilityService().require_institution_capability(user, institution_id, capability)


def _require_platform_capability(user, change_kind) -> None:
    """Enforce the platform capability of the underlying canonical command."""
    capability = _PLATFORM_CAP_BY_KIND[change_kind]
    AdminCapabilityService().require_capability(user, capability)


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


class V2TenantChangeRequestListCreateView(V2APIView):
    """``/api/v2/admin/change-requests/`` — list (GET) / submit (POST)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_admin_change_requests_list",
        request=None,
        responses=ChangeRequestRepresentationSerializer(many=True),
    )
    def get(self, request):
        queryset = _scoped_queryset(request.user).order_by("-created_at")
        institution_id = request.query_params.get("institution_id")
        if institution_id:
            queryset = queryset.filter(institution_id=institution_id)
        change_status = request.query_params.get("status")
        if change_status:
            queryset = queryset.filter(status=change_status)
        change_kind = request.query_params.get("change_kind")
        if change_kind:
            queryset = queryset.filter(change_kind=change_kind)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = [_serialize(cr) for cr in (page if page is not None else queryset)]
        if page is not None:
            return paginator.get_paginated_response(rows)
        return Response(rows)

    @extend_schema(
        operation_id="v2_admin_change_requests_create",
        request=ChangeRequestCreateSerializer,
        responses={201: ChangeRequestRepresentationSerializer},
    )
    def post(self, request):
        body = ChangeRequestCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        institution_id = str(body.validated_data["institution_id"])
        change_kind = body.validated_data["change_kind"]

        # Capability BEFORE any lookup: an out-of-scope institution resolves to
        # zero tenant capabilities, so this denies (403) without confirming the
        # institution exists (tenant isolation, non-revealing).
        _require_tenant_capability(request.user, institution_id, change_kind)
        try:
            institution = Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
            raise NotFound()

        service = TenantChangeRequestService()
        idempotency_key = request.headers.get("Idempotency-Key") or None
        try:
            change_request = service.create(
                institution=institution,
                change_kind=change_kind,
                payload=body.validated_data.get("payload") or {},
                requested_by_id=getattr(request.user, "id", None),
                note=body.validated_data.get("note", ""),
                submit=body.validated_data.get("submit", True),
                idempotency_key=idempotency_key,
                request=request,
            )
        except ChangeRequestError as err:
            _raise_v2(err)
        return Response(_serialize(change_request), status=status.HTTP_201_CREATED)


class V2TenantChangeRequestDetailView(V2APIView):
    """``/api/v2/admin/change-requests/{id}/`` — scoped detail read."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_admin_change_requests_retrieve",
        request=None,
        responses=ChangeRequestRepresentationSerializer,
    )
    def get(self, request, change_request_id):
        change_request = _get_scoped_or_404(request.user, change_request_id)
        return Response(_serialize(change_request))


class V2TenantChangeRequestSubmitView(V2APIView):
    """``.../submit/`` — draft -> submitted (tenant request_change)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_admin_change_requests_submit",
        request=None,
        responses=ChangeRequestRepresentationSerializer,
    )
    def post(self, request, change_request_id):
        change_request = _get_scoped_or_404(request.user, change_request_id)
        _require_tenant_capability(request.user, change_request.institution_id, change_request.change_kind)
        service = TenantChangeRequestService()
        try:
            change_request = service.submit(
                change_request, actor_id=getattr(request.user, "id", None), request=request
            )
        except ChangeRequestError as err:
            _raise_v2(err)
        return Response(_serialize(change_request))


class V2TenantChangeRequestCancelView(V2APIView):
    """``.../cancel/`` — draft/submitted -> cancelled (tenant request_change)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_admin_change_requests_cancel",
        request=ChangeRequestReasonSerializer,
        responses=ChangeRequestRepresentationSerializer,
    )
    def post(self, request, change_request_id):
        change_request = _get_scoped_or_404(request.user, change_request_id)
        _require_tenant_capability(request.user, change_request.institution_id, change_request.change_kind)
        body = ChangeRequestReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        service = TenantChangeRequestService()
        try:
            change_request = service.cancel(
                change_request,
                actor_id=getattr(request.user, "id", None),
                note=body.validated_data.get("note", ""),
                request=request,
            )
        except ChangeRequestError as err:
            _raise_v2(err)
        return Response(_serialize(change_request))


class V2TenantChangeRequestApproveView(V2APIView):
    """``.../approve/`` — submitted -> approved -> applied via the canonical command."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_admin_change_requests_approve",
        request=ChangeRequestReasonSerializer,
        responses=ChangeRequestRepresentationSerializer,
    )
    def post(self, request, change_request_id):
        change_request = _get_scoped_or_404(request.user, change_request_id)
        _require_platform_capability(request.user, change_request.change_kind)
        body = ChangeRequestReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        service = TenantChangeRequestService()
        try:
            change_request = service.approve(
                change_request,
                reviewer_id=getattr(request.user, "id", None),
                note=body.validated_data.get("note", ""),
                request=request,
            )
        except ChangeRequestError as err:
            _raise_v2(err)
        return Response(_serialize(change_request))


class V2TenantChangeRequestRejectView(V2APIView):
    """``.../reject/`` — submitted -> rejected (platform review)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_admin_change_requests_reject",
        request=ChangeRequestReasonSerializer,
        responses=ChangeRequestRepresentationSerializer,
    )
    def post(self, request, change_request_id):
        change_request = _get_scoped_or_404(request.user, change_request_id)
        _require_platform_capability(request.user, change_request.change_kind)
        body = ChangeRequestReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        service = TenantChangeRequestService()
        try:
            change_request = service.reject(
                change_request,
                reviewer_id=getattr(request.user, "id", None),
                note=body.validated_data.get("note", ""),
                request=request,
            )
        except ChangeRequestError as err:
            _raise_v2(err)
        return Response(_serialize(change_request))
