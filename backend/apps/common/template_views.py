"""Admin views for communication templates.

Implements task 10.2; tenant-scoped management added in Phase 7 (task 29.1) of
the ``multi-tenant-beanola-remediation`` spec.

Requirements: 9.6, 14.6, 14.9
"""

import logging
import uuid

from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse, OpenApiTypes

from apps.common.models import CommunicationTemplate

logger = logging.getLogger(__name__)


def _get_admin_permission():
    """Lazy accessor for IsAdmin to avoid common ↔ accounts circular import."""
    from apps.accounts.permissions import IsAdmin
    return IsAdmin


def _is_super_admin(user) -> bool:
    """Lazy super-admin check (sole authority lives in accounts.permissions)."""
    from apps.accounts.permissions import is_super_admin
    return is_super_admin(user)


def _scope_institution_ids(user) -> set[str]:
    """Institution IDs the acting user may manage, via ``AccessScopeService``.

    Returns the empty set for a super-admin (callers gate super-admins with
    ``_is_super_admin`` and treat them as global). For a scoped School_Staff
    member it is the set of assigned institution IDs (membership + grant).
    """
    from apps.catalog.services import AccessScopeService

    scope = AccessScopeService().filters_for_user(user)
    if scope.all_access:
        return set()
    return scope.institution_ids


def _can_manage_institution(user, institution_id) -> bool:
    """Whether ``user`` may view/modify templates for ``institution_id``.

    R14.6/R14.9: super-admins are global; a School_Staff member may manage only
    the institutions they are assigned to. Platform templates
    (``institution_id`` NULL) are super-admin-only — School_Staff never manage
    them through this surface.
    """
    if _is_super_admin(user):
        return True
    if institution_id is None:
        return False
    return str(institution_id) in _scope_institution_ids(user)


def _coerce_institution_id(raw):
    """Parse a requested ``institution_id`` into ``(uuid_or_none, ok)``.

    ``None``/empty/"null"/"platform" select the Beanola platform template
    (``institution_id`` NULL). A valid UUID selects that institution's template.
    Any other value is rejected (``ok=False``) so a malformed id never silently
    falls through to the platform row.
    """
    if raw is None:
        return None, True
    text = str(raw).strip()
    if text == "" or text.lower() in {"null", "platform", "none"}:
        return None, True
    try:
        return uuid.UUID(text), True
    except (ValueError, TypeError, AttributeError):
        return None, False


def _out_of_scope_response():
    """Authorization error for an out-of-scope institution (R14.9).

    Indicates the institution is out of scope without leaking whether a template
    exists for it, and guarantees no mutation occurred (returned before any
    write).
    """
    return Response(
        {
            "success": False,
            "error": "This institution is outside your assigned scope.",
            "code": "OUT_OF_SCOPE",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _platform_forbidden_response():
    """Super-admin write gate for Beanola platform (NULL institution) templates."""
    return Response(
        {
            "success": False,
            "error": "Only super admins can manage Beanola platform templates.",
            "code": "FORBIDDEN",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


class CommunicationTemplateSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    template_key = serializers.CharField(read_only=True)
    institution_id = serializers.UUIDField(read_only=True, allow_null=True)
    version = serializers.IntegerField(read_only=True)
    subject_template = serializers.CharField(required=False, allow_blank=True)
    body_template = serializers.CharField(required=False, allow_blank=True)
    channel = serializers.ChoiceField(
        choices=["email", "notification", "both"], required=False
    )
    is_active = serializers.BooleanField(required=False)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class CommunicationTemplateListResponseSerializer(serializers.Serializer):
    """Envelope for GET /api/v1/admin/templates/ - returns a list of templates."""

    success = serializers.BooleanField()
    data = CommunicationTemplateSerializer(many=True)


class CommunicationTemplateUpdateRequestSerializer(serializers.Serializer):
    """PUT /api/v1/admin/templates/{key}/ request body.

    All fields optional - updating subject_template and/or body_template is the
    common case. Use is_active=false to soft-disable a template.
    """

    subject_template = serializers.CharField(required=False, allow_blank=True)
    body_template = serializers.CharField(required=False, allow_blank=True)
    channel = serializers.ChoiceField(
        choices=["email", "notification", "both"], required=False
    )
    is_active = serializers.BooleanField(required=False)


class CommunicationTemplateUpdateResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = CommunicationTemplateSerializer()


class CommunicationTemplateListView(APIView):
    """GET /api/v1/admin/templates/ - list communication templates.

    Tenant-scoped (R14.6): super-admins see every template (platform + all
    institutions); a School_Staff member sees only templates for the
    institutions they are assigned to (via ``AccessScopeService``). Platform
    (``institution_id`` NULL) templates are visible only to super-admins because
    only super-admins may manage them.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = CommunicationTemplateSerializer

    def get_permissions(self):
        return [_get_admin_permission()()]

    @extend_schema(
        request=None,
        parameters=[
            OpenApiParameter(
                "institution_id",
                OpenApiTypes.UUID,
                OpenApiParameter.QUERY,
                required=False,
                description="Filter to a single institution's templates (super-admins only; "
                "'platform' selects Beanola platform templates).",
            )
        ],
        responses={200: OpenApiResponse(response=CommunicationTemplateListResponseSerializer)},
        tags=["admin"],
        summary="List communication templates",
    )
    def get(self, request):
        queryset = CommunicationTemplate.objects.all().order_by(
            "template_key", "institution_id", "-version"
        )

        if not _is_super_admin(request.user):
            institution_ids = _scope_institution_ids(request.user)
            # A scoped staff member with no assigned institutions has nothing to
            # manage; never fall through to platform/global templates.
            queryset = (
                queryset.filter(institution_id__in=institution_ids)
                if institution_ids
                else queryset.none()
            )
        else:
            # Super-admins may narrow to one institution (or the platform set).
            if "institution_id" in request.query_params:
                institution_id, ok = _coerce_institution_id(
                    request.query_params.get("institution_id")
                )
                if not ok:
                    return Response(
                        {
                            "success": False,
                            "error": "Invalid institution_id.",
                            "code": "VALIDATION_ERROR",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                queryset = queryset.filter(institution_id=institution_id)

        data = CommunicationTemplateSerializer(queryset, many=True).data
        return Response({"success": True, "data": data})


class CommunicationTemplateUpdateView(APIView):
    """PUT /api/v1/admin/templates/{key}/ - update a template by key.

    Tenant-scoped (R14.6, R14.9): the target institution is selected with the
    optional ``institution_id`` query parameter (default: the Beanola platform
    template). Super-admins may modify any template; a School_Staff member may
    modify only templates for institutions they are assigned to. An out-of-scope
    institution is rejected with an ``OUT_OF_SCOPE`` authorization error and no
    mutation; platform templates require super-admin. The highest-version row
    for ``(template_key, institution_id)`` is updated.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = CommunicationTemplateUpdateRequestSerializer

    def get_permissions(self):
        return [_get_admin_permission()()]

    @extend_schema(
        request=CommunicationTemplateUpdateRequestSerializer,
        parameters=[
            OpenApiParameter(
                "institution_id",
                OpenApiTypes.UUID,
                OpenApiParameter.QUERY,
                required=False,
                description="Target institution ('platform' or omitted selects the Beanola "
                "platform template). Must be within the acting user's assigned scope.",
            )
        ],
        responses={
            200: OpenApiResponse(response=CommunicationTemplateUpdateResponseSerializer),
            400: OpenApiResponse(description="Validation error"),
            403: OpenApiResponse(description="Out of scope / platform template"),
            404: OpenApiResponse(description="Template not found"),
        },
        tags=["admin"],
        summary="Update a communication template",
    )
    def put(self, request, key):
        institution_id, ok = _coerce_institution_id(
            request.query_params.get("institution_id")
        )
        if not ok:
            return Response(
                {
                    "success": False,
                    "error": "Invalid institution_id.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Authorize the institution scope BEFORE any lookup or write so an
        # out-of-scope request never mutates and never leaks template existence
        # (R14.9).
        if not _can_manage_institution(request.user, institution_id):
            if institution_id is None:
                return _platform_forbidden_response()
            return _out_of_scope_response()

        template = (
            CommunicationTemplate.objects.filter(
                template_key=key, institution_id=institution_id
            )
            .order_by("-version")
            .first()
        )
        if template is None:
            return Response(
                {"success": False, "error": "Template not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = CommunicationTemplateSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        validated = serializer.validated_data
        if "subject_template" in validated:
            template.subject_template = validated["subject_template"]
        if "body_template" in validated:
            template.body_template = validated["body_template"]
        if "channel" in validated:
            template.channel = validated["channel"]
        if "is_active" in validated:
            template.is_active = validated["is_active"]

        template.save()
        logger.info(
            "Template '%s' (institution=%s) updated by admin %s",
            key,
            institution_id if institution_id is not None else "platform",
            getattr(request.user, "id", None),
        )

        return Response(
            {"success": True, "data": CommunicationTemplateSerializer(template).data}
        )
