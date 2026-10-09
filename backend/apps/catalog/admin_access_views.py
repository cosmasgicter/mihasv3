"""Tenant membership and access-grant admin views.

``/api/v1/admin/{memberships,access-grants}/…`` — the two surfaces that grant
tenant authority, and therefore the two that revoke in-flight sessions on every
successful write (R3.5). Unlike the institution-child surfaces these carry **no
institution path segment**: they are narrowed by the actor's own scope set before
the optional ``?institution=`` filter, so naming another tenant narrows to
nothing rather than widening to it. Split out of ``admin_views.py`` by task 12.1;
every view is the one that was there, lifted verbatim.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, is_super_admin
from apps.accounts.session_lifecycle import revoke_sessions_for_authority_change
from apps.catalog._admin_view_helpers import (
    _actor_id_str,
    _forbidden_write_response,
    _integrity_conflict_response,
    _paginate,
    _scope_institution_ids,
    _self_mutation_forbidden_response,
    _staff_invite_forbidden_response,
    _write_allowed,
)
from apps.catalog.admin_serializers import (
    AdminAccessGrantSerializer,
    AdminMembershipSerializer,
)
from apps.catalog.canonical_config_commands import (
    audit_config_change as _audit_config_change,
    config_change_verb as _verb_for_payload,
)
from apps.catalog.models import AccessGrant, UserInstitutionMembership
from apps.catalog.services import AdminCapabilityService

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
        serializer = AdminMembershipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        target_user_id = data.get("user_id")
        institution_id = data.get("institution_id")
        target_role = data.get("role")

        # Super_Admins may create any membership. A non-super-admin may invite
        # staff only into an institution they manage, with a role at or below
        # their own authority (R6.3, R6.4), never targeting themselves (R6.7),
        # and never across tenants — ``can_invite_staff`` resolves an
        # out-of-scope institution to no capability so a cross-tenant invite is
        # rejected (R6.8).
        if not is_super_admin(request.user):
            if _actor_id_str(request.user) and str(target_user_id) == _actor_id_str(request.user):
                return _self_mutation_forbidden_response()
            if not AdminCapabilityService().can_invite_staff(
                request.user, institution_id, target_role
            ):
                return _staff_invite_forbidden_response()

        membership = serializer.save(created_by_id=getattr(request.user, "id", None))
        _audit_config_change(
            request,
            resource="membership",
            verb="created",
            entity_id=membership.id,
            institution_id=getattr(membership, "institution_id", None),
        )
        # R3.5: a new membership grants tenant authority — revoke the member's
        # in-flight sessions so their next request re-resolves capabilities.
        revoke_sessions_for_authority_change(
            getattr(membership, "user_id", None),
            reason="membership_created",
            actor_id=getattr(request.user, "id", None),
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
        if not _write_allowed(request.user, "platform.user.manage_all"):
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
        # R3.5: a membership change (role/permissions/is_active) alters the
        # member's authority — revoke their in-flight sessions.
        revoke_sessions_for_authority_change(
            getattr(membership, "user_id", None),
            reason="membership_updated",
            actor_id=getattr(request.user, "id", None),
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
        if not _write_allowed(request.user, "platform.access_grant.manage"):
            return _forbidden_write_response()
        serializer = AdminAccessGrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # The serializer validates the (user, scope_type, target) active-duplicate
        # guard, but the DB partial uniques (task 3.3) are the final race guard:
        # a concurrent double-submit that passes validation twice fails closed
        # here and returns a stable 409 instead of a 500 (R6.7).
        try:
            with transaction.atomic():
                grant = serializer.save(created_by_id=getattr(request.user, "id", None))
        except IntegrityError:
            return _integrity_conflict_response(
                "DUPLICATE_ACCESS_GRANT",
                "An active access grant already exists for this user and target.",
            )
        _audit_config_change(
            request,
            resource="grant",
            verb="created",
            entity_id=grant.id,
            institution_id=getattr(grant, "institution_id", None),
        )
        # R3.5: a new access grant widens the user's authority — revoke their
        # in-flight sessions so the new scope is re-resolved.
        revoke_sessions_for_authority_change(
            getattr(grant, "user_id", None),
            reason="grant_created",
            actor_id=getattr(request.user, "id", None),
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
        if not _write_allowed(request.user, "platform.access_grant.manage"):
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
        # R3.5: a grant change (permissions/scope/expiry/is_active) alters the
        # user's authority — revoke their in-flight sessions.
        revoke_sessions_for_authority_change(
            getattr(grant, "user_id", None),
            reason="grant_updated",
            actor_id=getattr(request.user, "id", None),
        )
        return Response({"success": True, "data": AdminAccessGrantSerializer(grant).data})
