"""Tenant staff invitation endpoints (task 4.2).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.2
Requirements: R4.3, R4.4, R6.3. Findings: TEN-01, TEN-05.
Design: design.md §5.3 (People And Access), §6.1 (Tenant Aggregate).

Thin views over :class:`~apps.catalog.staff_invitation_service.StaffInvitationService`.
They replace the fragile client multi-call invite (TEN-01): the browser now
makes a single durable server command that atomically creates the identity,
invitation, and membership, emails a single-use accept link (no plaintext
password ever leaves the server), and offers an email/name **search selector**
instead of raw UUID entry (R6.3, TEN-05).

Authorization is a separate policy layer (design §3): every admin endpoint
resolves a ``platform.user.manage_all`` / ``tenant.staff.*`` capability through
:class:`AdminCapabilityService` before touching the service. The public accept
endpoint is unauthenticated (the invitee is not yet signed in) and is guarded by
the single-use token alone. Every response uses the ``{"success", "data"}``
envelope; a serialized invitation **never** includes the token or any password.
"""

from __future__ import annotations

from typing import Any, Optional

from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework import serializers
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, is_super_admin
from apps.catalog.models import TenantStaffInvitation
from apps.catalog.services import AdminCapabilityService, CapabilityResolutionError
from apps.catalog.staff_invitation_service import InvitationError, StaffInvitationService

# Reuse the shared tenant-admin helpers (scope + audit). ``admin_views`` does not
# import this module, so there is no import cycle.
from apps.catalog.admin_views import _audit_config_change, _scope_institution_ids
from apps.common.pagination import StandardPagination


# HTTP status for each stable InvitationError code.
_ERROR_STATUS = {
    "VALIDATION_ERROR": status.HTTP_400_BAD_REQUEST,
    "INVALID_ROLE": status.HTTP_400_BAD_REQUEST,
    "INVITATION_INVALID": status.HTTP_400_BAD_REQUEST,
    "INVITATION_EXPIRED": status.HTTP_400_BAD_REQUEST,
    "INVITATION_REVOKED": status.HTTP_400_BAD_REQUEST,
    "INVITATION_ALREADY_PENDING": status.HTTP_409_CONFLICT,
    "INVITATION_ALREADY_MEMBER": status.HTTP_409_CONFLICT,
    "INVITATION_NOT_RESENDABLE": status.HTTP_409_CONFLICT,
}


class StaffInvitationCreateSchemaSerializer(serializers.Serializer):
    email = serializers.EmailField()
    institution_id = serializers.UUIDField()
    role = serializers.CharField(required=False, default="admin")
    full_name = serializers.CharField(required=False, allow_blank=True)
    permissions = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )


class StaffInvitationRepresentationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    institution_id = serializers.UUIDField()
    email = serializers.EmailField()
    invited_role = serializers.CharField()
    permissions = serializers.ListField(child=serializers.CharField())
    status = serializers.CharField()
    profile_id = serializers.UUIDField(allow_null=True)
    membership_id = serializers.UUIDField(allow_null=True)
    expires_at = serializers.DateTimeField(allow_null=True)
    accepted_at = serializers.DateTimeField(allow_null=True)
    revoked_at = serializers.DateTimeField(allow_null=True)
    last_sent_at = serializers.DateTimeField(allow_null=True)
    resend_count = serializers.IntegerField()
    created_at = serializers.DateTimeField(allow_null=True)


class StaffCandidateSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    full_name = serializers.CharField()
    role = serializers.CharField()


class StaffInvitationAcceptSchemaSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)


class StaffInvitationAcceptResponseSerializer(serializers.Serializer):
    message = serializers.CharField()
    email = serializers.EmailField(allow_null=True)


def _error_response(err: InvitationError) -> Response:
    """Map an :class:`InvitationError` to the ``{success:false}`` envelope."""
    code = err.code or "VALIDATION_ERROR"
    http_status = _ERROR_STATUS.get(code, status.HTTP_400_BAD_REQUEST)
    return Response(
        {"success": False, "error": err.message, "code": code},
        status=http_status,
    )


def _forbidden(message: str = "You do not have permission to manage staff for this tenant.") -> Response:
    return Response(
        {"success": False, "error": message, "code": "STAFF_INVITE_FORBIDDEN"},
        status=status.HTTP_403_FORBIDDEN,
    )


def _serialize_invitation(invitation: TenantStaffInvitation) -> dict:
    """Safe projection of an invitation — never the token hash or any password."""
    return {
        "id": str(invitation.id),
        "institution_id": str(invitation.institution_id),
        "email": invitation.email,
        "invited_role": invitation.invited_role,
        "permissions": list(invitation.permissions or []),
        "status": invitation.status,
        "profile_id": str(invitation.profile_id) if invitation.profile_id else None,
        "membership_id": str(invitation.membership_id) if invitation.membership_id else None,
        "expires_at": invitation.expires_at.isoformat() if invitation.expires_at else None,
        "accepted_at": invitation.accepted_at.isoformat() if invitation.accepted_at else None,
        "revoked_at": invitation.revoked_at.isoformat() if invitation.revoked_at else None,
        "last_sent_at": invitation.last_sent_at.isoformat() if invitation.last_sent_at else None,
        "resend_count": invitation.resend_count or 0,
        "created_at": invitation.created_at.isoformat() if invitation.created_at else None,
    }


def _has_institution_capability(user, institution_id, capability: str) -> bool:
    """Whether ``user`` holds ``capability`` for ``institution_id`` (fail-closed)."""
    if is_super_admin(user):
        return True
    try:
        caps = AdminCapabilityService().get_institution_capabilities(user, institution_id)
    except CapabilityResolutionError:
        return False
    return capability in caps


def _invitation_in_scope(user, invitation: TenantStaffInvitation) -> bool:
    """Whether ``invitation`` belongs to an institution the actor can see."""
    if is_super_admin(user):
        return True
    scoped = _scope_institution_ids(user)
    return str(invitation.institution_id) in scoped


# ---------------------------------------------------------------------------
# Admin endpoints (capability-gated)
# ---------------------------------------------------------------------------


class AdminStaffInvitationListCreateView(APIView):
    """``/api/v1/admin/staff/invitations/`` — list (GET) / invite (POST)."""

    permission_classes = [IsAdmin]

    @extend_schema(
        operation_id="admin_staff_invitations_list",
        request=None,
        responses=StaffInvitationRepresentationSerializer(many=True),
    )
    def get(self, request):
        queryset = TenantStaffInvitation.objects.all().order_by("-created_at")
        if not is_super_admin(request.user):
            scoped = _scope_institution_ids(request.user)
            queryset = queryset.filter(institution_id__in=scoped) if scoped else queryset.none()
        institution_id = request.query_params.get("institution")
        if institution_id:
            queryset = queryset.filter(institution_id=institution_id)
        state = request.query_params.get("status")
        if state:
            queryset = queryset.filter(status=state)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        rows = [_serialize_invitation(i) for i in (page if page is not None else queryset)]
        if page is not None:
            return paginator.get_paginated_response(rows)
        return Response({"success": True, "data": rows})

    @extend_schema(
        operation_id="admin_staff_invitations_create",
        request=StaffInvitationCreateSchemaSerializer,
        responses={201: StaffInvitationRepresentationSerializer},
    )
    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        email = (data.get("email") or "").strip()
        role = (data.get("role") or data.get("invited_role") or "admin").strip().lower()
        institution_id = data.get("institution_id") or data.get("institution")
        full_name = (data.get("full_name") or "").strip()
        permissions = data.get("permissions") if isinstance(data.get("permissions"), list) else None

        if not email:
            return Response(
                {"success": False, "error": "An email address is required.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not institution_id:
            return Response(
                {"success": False, "error": "An institution is required.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Authority: Super_Admin, or a Tenant_Admin who may invite this role into
        # this institution (scope + role ceiling), resolved centrally (R6.3/R6.4).
        if not AdminCapabilityService().can_invite_staff(request.user, institution_id, role):
            return _forbidden()

        service = StaffInvitationService()
        try:
            invitation, _raw_token = service.invite(
                institution_id=institution_id,
                email=email,
                invited_role=role,
                permissions=permissions,
                full_name=full_name,
                actor_id=getattr(request.user, "id", None),
                request=request,
            )
        except InvitationError as err:
            return _error_response(err)

        _audit_config_change(
            request,
            resource="staff_invitation",
            verb="created",
            entity_id=invitation.id,
            institution_id=invitation.institution_id,
        )
        # The raw token is intentionally NOT returned to the browser (R4.3); it
        # only ever appears in the emailed accept link.
        return Response(
            {"success": True, "data": _serialize_invitation(invitation)},
            status=status.HTTP_201_CREATED,
        )


class AdminStaffCandidateSearchView(APIView):
    """``/api/v1/admin/staff/candidates/`` — email/name search selector (R6.3)."""

    permission_classes = [IsAdmin]

    @extend_schema(
        operation_id="admin_staff_candidates_search",
        request=None,
        parameters=[
            OpenApiParameter("q", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("institution", OpenApiTypes.UUID, OpenApiParameter.QUERY),
            OpenApiParameter("limit", OpenApiTypes.INT, OpenApiParameter.QUERY),
        ],
        responses=StaffCandidateSerializer(many=True),
    )
    def get(self, request):
        query = (request.query_params.get("q") or request.query_params.get("search") or "").strip()
        institution_id = request.query_params.get("institution")

        # Non-super-admins must scope the search to an institution they can staff.
        if not is_super_admin(request.user):
            if not institution_id or not _has_institution_capability(
                request.user, institution_id, "tenant.staff.invite"
            ):
                return _forbidden("You do not have permission to search staff candidates.")

        try:
            limit = int(request.query_params.get("limit") or 10)
        except (TypeError, ValueError):
            limit = 10

        results = StaffInvitationService().search_candidates(query=query, limit=limit)
        return Response({"success": True, "data": results})


class _StaffInvitationCommandView(APIView):
    """Base for the single-command resend/revoke endpoints."""

    permission_classes = [IsAdmin]
    #: The tenant capability a non-super-admin must hold for this command.
    required_capability = "tenant.staff.invite"

    def get_invitation(self, invitation_id) -> Optional[TenantStaffInvitation]:
        return TenantStaffInvitation.objects.filter(id=invitation_id).first()

    def run(self, service: StaffInvitationService, invitation, *, actor_id, request):
        raise NotImplementedError

    def post(self, request, invitation_id):
        invitation = self.get_invitation(invitation_id)
        # Out-of-scope / unknown → indistinguishable 404 (no tenant disclosure).
        if invitation is None or not _invitation_in_scope(request.user, invitation):
            return Response(
                {"success": False, "error": "Invitation not found.", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not _has_institution_capability(
            request.user, invitation.institution_id, self.required_capability
        ) and not _has_institution_capability(
            request.user, invitation.institution_id, "tenant.staff.invite"
        ):
            return _forbidden()

        service = StaffInvitationService()
        try:
            invitation = self.run(
                service, invitation, actor_id=getattr(request.user, "id", None), request=request
            )
        except InvitationError as err:
            return _error_response(err)
        return Response({"success": True, "data": _serialize_invitation(invitation)})


@extend_schema_view(
    post=extend_schema(
        operation_id="admin_staff_invitations_resend",
        request=None,
        responses=StaffInvitationRepresentationSerializer,
    )
)
class AdminStaffInvitationResendView(_StaffInvitationCommandView):
    """``/api/v1/admin/staff/invitations/{id}/resend/`` — rotate token + re-email."""

    required_capability = "tenant.staff.invite"

    def run(self, service, invitation, *, actor_id, request):
        invitation, _raw = service.resend(invitation, actor_id=actor_id, request=request)
        _audit_config_change(
            request,
            resource="staff_invitation",
            verb="updated",
            entity_id=invitation.id,
            institution_id=invitation.institution_id,
        )
        return invitation


@extend_schema_view(
    post=extend_schema(
        operation_id="admin_staff_invitations_revoke",
        request=None,
        responses=StaffInvitationRepresentationSerializer,
    )
)
class AdminStaffInvitationRevokeView(_StaffInvitationCommandView):
    """``/api/v1/admin/staff/invitations/{id}/revoke/`` — cancel + remove access."""

    # Revoke maps to the staff-disable authority; invite is also accepted.
    required_capability = "tenant.staff.disable"

    def run(self, service, invitation, *, actor_id, request):
        invitation = service.revoke(invitation, actor_id=actor_id, request=request)
        _audit_config_change(
            request,
            resource="staff_invitation",
            verb="deactivated",
            entity_id=invitation.id,
            institution_id=invitation.institution_id,
        )
        return invitation


# ---------------------------------------------------------------------------
# Public accept endpoint (unauthenticated — guarded by the single-use token)
# ---------------------------------------------------------------------------


class StaffInvitationAcceptView(APIView):
    """``/api/v1/auth/staff-invitation/accept/`` — the handoff (public).

    The invited staff member sets their **own** password here by consuming the
    single-use token from the emailed link (R4.3). Unauthenticated — the invitee
    is not yet signed in — and CSRF-exempt like the other token-based auth
    endpoints; the token is the sole guard.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        operation_id="auth_staff_invitation_accept",
        request=StaffInvitationAcceptSchemaSerializer,
        responses=StaffInvitationAcceptResponseSerializer,
    )
    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        token = (data.get("token") or "").strip()
        password = data.get("password") or data.get("new_password") or ""

        try:
            profile = StaffInvitationService().accept(token=token, password=password)
        except InvitationError as err:
            return _error_response(err)

        return Response(
            {
                "success": True,
                "data": {
                    "message": "Invitation accepted. You can now sign in with your new password.",
                    "email": getattr(profile, "email", None),
                },
            },
            status=status.HTTP_200_OK,
        )
