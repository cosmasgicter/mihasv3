"""V2 tenant onboarding workflow endpoints (task 4.1).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.1
Requirements: R4.1-R4.6
Findings: TEN-01, TEN-02
Design: design.md §6.1 (workflow), §5.2 (authority), §14 (V2 envelope).

Thin V2 views over :class:`~apps.catalog.onboarding_service.TenantOnboardingService`.
They **replace the fragile client multi-call orchestration** (TEN-01): instead of
the browser creating an institution, then an admin, then a membership across
several calls (misreading shapes, stopping half-way, and marking the tenant
active on create), the client now makes durable **server workflow calls** —
begin, record-step, blockers, submit, activate, reject, cancel, suspend, resume
— each of which is a single audited, idempotent, transactional command.

Authorization is a separate policy layer (design §3): every endpoint resolves a
``platform.tenant.*`` capability through :class:`AdminCapabilityService` before
touching the service. The service owns business state, not authorization.
"""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.catalog.models import TenantOnboarding
from apps.catalog.onboarding_service import (
    ONBOARDING_STEPS,
    OnboardingError,
    TenantOnboardingService,
)
from apps.catalog.services import AdminCapabilityService
from apps.common.v2.exceptions import V2DomainError
from apps.common.v2.error_codes import V2ErrorCode, register_error_code
from apps.common.v2.views import V2APIView

# ---------------------------------------------------------------------------
# Register the onboarding-specific stable error codes (idempotent).
# ---------------------------------------------------------------------------
for _entry in (
    V2ErrorCode(
        "ONBOARDING_BLOCKED",
        409,
        "The tenant is not launch-ready. Resolve the outstanding blockers first.",
        retryable=False,
    ),
    V2ErrorCode(
        "ONBOARDING_INVALID_STATE",
        409,
        "That action is not allowed for the tenant's current onboarding state.",
        retryable=False,
    ),
    V2ErrorCode(
        "ONBOARDING_NOT_EDITABLE",
        409,
        "Configuration can no longer be changed for this tenant.",
        retryable=False,
    ),
    V2ErrorCode(
        "UNKNOWN_STEP",
        400,
        "That onboarding step is not recognised.",
        retryable=False,
    ),
    V2ErrorCode(
        "INSTITUTION_CONFLICT",
        409,
        "A tenant with these details already exists.",
        retryable=False,
    ),
):
    try:
        register_error_code(_entry)
    except ValueError:
        # Already registered with identical attributes on a previous import.
        pass


# Map an OnboardingError.code to a registered V2 error code. ``INVALID_STATE``
# is exposed as ``ONBOARDING_INVALID_STATE`` so it never collides with a
# transport-level code.
_ONBOARDING_CODE_MAP = {
    "ONBOARDING_BLOCKED": "ONBOARDING_BLOCKED",
    "INVALID_STATE": "ONBOARDING_INVALID_STATE",
    "ONBOARDING_NOT_EDITABLE": "ONBOARDING_NOT_EDITABLE",
    "UNKNOWN_STEP": "UNKNOWN_STEP",
    "INSTITUTION_CONFLICT": "INSTITUTION_CONFLICT",
    "VALIDATION_ERROR": "VALIDATION_ERROR",
}


def _raise_v2(err: OnboardingError) -> None:
    """Translate an :class:`OnboardingError` into a V2 error envelope."""
    code = _ONBOARDING_CODE_MAP.get(err.code or "", "INTERNAL_ERROR")
    fields = None
    if err.blockers:
        fields = {"blockers": [str(b.get("key")) for b in err.blockers]}
    raise V2DomainError(code, message=err.message, fields=fields)


# ---------------------------------------------------------------------------
# Serializers (transport validation only)
# ---------------------------------------------------------------------------


class OnboardingBeginSerializer(serializers.Serializer):
    """Validate the ``begin`` profile payload (transport shape only)."""

    name = serializers.CharField(max_length=255)
    code = serializers.CharField(max_length=50)
    slug = serializers.CharField(max_length=80, required=False, allow_blank=True)
    full_name = serializers.CharField(max_length=500, required=False, allow_blank=True)
    brand_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    support_email = serializers.CharField(max_length=255, required=False, allow_blank=True)
    admissions_email = serializers.CharField(max_length=255, required=False, allow_blank=True)
    primary_color = serializers.CharField(max_length=20, required=False, allow_blank=True)
    secondary_color = serializers.CharField(max_length=20, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email = serializers.CharField(max_length=255, required=False, allow_blank=True)
    website = serializers.CharField(max_length=255, required=False, allow_blank=True)
    type = serializers.CharField(max_length=100, required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)


class OnboardingStepSerializer(serializers.Serializer):
    """Validate a ``record_step`` command body."""

    step = serializers.ChoiceField(choices=list(ONBOARDING_STEPS))
    data = serializers.DictField(required=False, default=dict)


class OnboardingReasonSerializer(serializers.Serializer):
    """Optional reason for reject/cancel/suspend commands."""

    reason = serializers.CharField(
        required=False, allow_blank=True, max_length=1000, default=""
    )


class OnboardingRepresentationSerializer(serializers.Serializer):
    """OpenAPI representation of the durable onboarding aggregate."""

    id = serializers.UUIDField()
    institution_id = serializers.UUIDField()
    state = serializers.CharField()
    current_step = serializers.CharField(allow_null=True, allow_blank=True)
    configuration_version = serializers.IntegerField()
    steps = serializers.DictField()
    last_error = serializers.CharField(allow_null=True, allow_blank=True)
    blockers = serializers.ListField(child=serializers.DictField())
    readiness = serializers.DictField(required=False)
    created_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)
    activated_at = serializers.DateTimeField(allow_null=True)


class OnboardingBlockersSerializer(serializers.Serializer):
    institution_id = serializers.UUIDField()
    launch_ready = serializers.BooleanField()
    blockers = serializers.ListField(child=serializers.DictField())


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _serialize(onboarding: TenantOnboarding, *, service: TenantOnboardingService,
               include_readiness: bool = True) -> dict:
    """Serialize an onboarding aggregate with its live blockers/readiness."""
    body: dict[str, Any] = {
        "id": str(onboarding.id),
        "institution_id": str(onboarding.institution_id),
        "state": onboarding.state,
        "current_step": onboarding.current_step,
        "configuration_version": onboarding.configuration_version,
        "steps": onboarding.steps or {},
        "last_error": onboarding.last_error,
        "created_at": onboarding.created_at.isoformat() if onboarding.created_at else None,
        "updated_at": onboarding.updated_at.isoformat() if onboarding.updated_at else None,
        "activated_at": (
            onboarding.activated_at.isoformat() if onboarding.activated_at else None
        ),
        # Live-derived blockers (never the cached snapshot) so the UI always
        # sees the current outstanding readiness items (R4.5).
        "blockers": service.get_blockers(onboarding.institution_id),
    }
    if include_readiness:
        body["readiness"] = service.get_readiness(onboarding.institution_id)
    return body


def _require(user, capability: str) -> None:
    """Enforce a platform capability; raises DRF PermissionDenied on denial."""
    AdminCapabilityService().require_capability(user, capability)


def _get_onboarding(onboarding_id) -> TenantOnboarding:
    try:
        return TenantOnboarding.objects.get(id=onboarding_id)
    except TenantOnboarding.DoesNotExist:
        raise NotFound()


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


class V2TenantOnboardingListCreateView(V2APIView):
    """``/api/v2/admin/onboarding/`` — begin (POST) / list (GET) onboardings."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_admin_onboarding_list",
        request=None,
        responses=OnboardingRepresentationSerializer(many=True),
    )
    def get(self, request):
        _require(request.user, "platform.tenant.read_all")
        service = TenantOnboardingService()
        queryset = TenantOnboarding.objects.all().order_by("-created_at")
        state = request.query_params.get("state")
        if state:
            queryset = queryset.filter(state=state)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = [
            _serialize(o, service=service, include_readiness=False)
            for o in (page if page is not None else queryset)
        ]
        if page is not None:
            return paginator.get_paginated_response(rows)
        return Response(rows)

    @extend_schema(
        operation_id="v2_admin_onboarding_create",
        request=OnboardingBeginSerializer,
        responses={201: OnboardingRepresentationSerializer},
    )
    def post(self, request):
        _require(request.user, "platform.tenant.create")
        serializer = OnboardingBeginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        idempotency_key = request.headers.get("Idempotency-Key") or None
        service = TenantOnboardingService()
        try:
            onboarding = service.begin(
                profile=serializer.validated_data,
                created_by_id=getattr(request.user, "id", None),
                idempotency_key=idempotency_key,
                request=request,
            )
        except OnboardingError as err:
            _raise_v2(err)
        return Response(
            _serialize(onboarding, service=service),
            status=status.HTTP_201_CREATED,
        )


class V2TenantOnboardingDetailView(V2APIView):
    """``/api/v2/admin/onboarding/{id}/`` — onboarding detail + live readiness."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_admin_onboarding_retrieve",
        request=None,
        responses=OnboardingRepresentationSerializer,
    )
    def get(self, request, onboarding_id):
        _require(request.user, "platform.tenant.read_all")
        service = TenantOnboardingService()
        onboarding = _get_onboarding(onboarding_id)
        return Response(_serialize(onboarding, service=service))


class V2TenantOnboardingBlockersView(V2APIView):
    """``/api/v2/admin/onboarding/{id}/blockers/`` — live launch blockers (R4.5)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_admin_onboarding_blockers",
        request=None,
        responses=OnboardingBlockersSerializer,
    )
    def get(self, request, onboarding_id):
        _require(request.user, "platform.tenant.read_all")
        service = TenantOnboardingService()
        onboarding = _get_onboarding(onboarding_id)
        blockers = service.get_blockers(onboarding.institution_id)
        return Response(
            {
                "institution_id": str(onboarding.institution_id),
                "launch_ready": not blockers,
                "blockers": blockers,
            }
        )


class V2TenantOnboardingStepView(V2APIView):
    """``/api/v2/admin/onboarding/{id}/steps/`` — record a config step (R4.2)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="v2_admin_onboarding_record_step",
        request=OnboardingStepSerializer,
        responses=OnboardingRepresentationSerializer,
    )
    def post(self, request, onboarding_id):
        _require(request.user, "platform.tenant.update")
        body = OnboardingStepSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        service = TenantOnboardingService()
        onboarding = _get_onboarding(onboarding_id)
        try:
            onboarding = service.record_step(
                onboarding,
                body.validated_data["step"],
                actor_id=getattr(request.user, "id", None),
                data=body.validated_data.get("data") or {},
                request=request,
            )
        except OnboardingError as err:
            _raise_v2(err)
        return Response(_serialize(onboarding, service=service))


class _OnboardingCommandView(V2APIView):
    """Base for the single-command lifecycle transition endpoints."""

    permission_classes = [IsAuthenticated]
    capability = "platform.tenant.update"
    takes_reason = False

    def run(self, service: TenantOnboardingService, onboarding, *, actor_id, reason):
        raise NotImplementedError

    def post(self, request, onboarding_id):
        _require(request.user, self.capability)
        reason = ""
        if self.takes_reason:
            body = OnboardingReasonSerializer(data=request.data)
            body.is_valid(raise_exception=True)
            reason = body.validated_data.get("reason", "")
        service = TenantOnboardingService()
        onboarding = _get_onboarding(onboarding_id)
        try:
            onboarding = self.run(
                service,
                onboarding,
                actor_id=getattr(request.user, "id", None),
                reason=reason,
            )
        except OnboardingError as err:
            _raise_v2(err)
        return Response(_serialize(onboarding, service=service))


@extend_schema_view(
    post=extend_schema(
        operation_id="v2_admin_onboarding_submit",
        request=None,
        responses=OnboardingRepresentationSerializer,
    )
)
class V2TenantOnboardingSubmitView(_OnboardingCommandView):
    """``.../submit/`` — draft -> in_review."""

    def run(self, service, onboarding, *, actor_id, reason):
        return service.submit_for_review(onboarding, actor_id=actor_id)


@extend_schema_view(
    post=extend_schema(
        operation_id="v2_admin_onboarding_activate",
        request=None,
        responses=OnboardingRepresentationSerializer,
    )
)
class V2TenantOnboardingActivateView(_OnboardingCommandView):
    """``.../activate/`` — blocker-gated activation (R4.6)."""

    def run(self, service, onboarding, *, actor_id, reason):
        return service.activate(onboarding, actor_id=actor_id)


@extend_schema_view(
    post=extend_schema(
        operation_id="v2_admin_onboarding_reject",
        request=OnboardingReasonSerializer,
        responses=OnboardingRepresentationSerializer,
    )
)
class V2TenantOnboardingRejectView(_OnboardingCommandView):
    """``.../reject/`` — in_review -> rejected (terminal)."""

    takes_reason = True

    def run(self, service, onboarding, *, actor_id, reason):
        return service.reject(onboarding, actor_id=actor_id, reason=reason)


@extend_schema_view(
    post=extend_schema(
        operation_id="v2_admin_onboarding_cancel",
        request=OnboardingReasonSerializer,
        responses=OnboardingRepresentationSerializer,
    )
)
class V2TenantOnboardingCancelView(_OnboardingCommandView):
    """``.../cancel/`` — draft/in_review -> cancelled (terminal)."""

    takes_reason = True

    def run(self, service, onboarding, *, actor_id, reason):
        return service.cancel(onboarding, actor_id=actor_id, reason=reason)


@extend_schema_view(
    post=extend_schema(
        operation_id="v2_admin_onboarding_suspend",
        request=OnboardingReasonSerializer,
        responses=OnboardingRepresentationSerializer,
    )
)
class V2TenantOnboardingSuspendView(_OnboardingCommandView):
    """``.../suspend/`` — active -> suspended (deactivates institution)."""

    capability = "platform.tenant.deactivate"
    takes_reason = True

    def run(self, service, onboarding, *, actor_id, reason):
        return service.suspend(onboarding, actor_id=actor_id, reason=reason)


@extend_schema_view(
    post=extend_schema(
        operation_id="v2_admin_onboarding_resume",
        request=None,
        responses=OnboardingRepresentationSerializer,
    )
)
class V2TenantOnboardingResumeView(_OnboardingCommandView):
    """``.../resume/`` — suspended -> active (re-checks readiness)."""

    def run(self, service, onboarding, *, actor_id, reason):
        return service.resume(onboarding, actor_id=actor_id)
