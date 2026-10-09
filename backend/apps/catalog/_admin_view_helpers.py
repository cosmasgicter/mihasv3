"""Shared helpers for the Beanola tenant-admin view modules.

Split out of ``apps/catalog/admin_views.py`` by admissions-v2 task 12.1 (finding
**MAINT-01**), following the shape ``apps/applications/`` already uses
(``_view_helpers.py`` + ``admin_*_views.py``). Every definition here is the one
that was in ``admin_views.py``, lifted verbatim by
``docs/v2-evidence/12.1/raw/backend-view-extract.py``.

What lives here is the **shared answer vocabulary** of that surface — the stable
409/403 envelopes, the one capability gate (``_write_allowed``), the one scope
resolution (``_scope_institution_ids`` / ``_readable_institution_queryset``), the
one pagination wrapper, and the two institution-child base views that implement
*scope before lookup* for every child resource. Keeping them in one module is the
point: a second copy of ``_write_allowed`` or of the child ``get_queryset`` is how
a tenant boundary drifts.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, is_super_admin
from apps.catalog.canonical_config_commands import (
    audit_config_change as _audit_config_change,
    config_change_verb as _verb_for_payload,
)
from apps.catalog.models import Institution
from apps.catalog.services import AccessScopeService, AdminCapabilityService
from apps.common.pagination import StandardPagination

def _domain_not_verified_response():
    """Stable 409 when activating a domain whose status is not ``verified`` (R7.7)."""
    return Response(
        {
            "success": False,
            "error": "Domain must be verified before it can be activated.",
            "code": "DOMAIN_NOT_VERIFIED",
        },
        status=status.HTTP_409_CONFLICT,
    )


def _domain_transition_conflict_response(message: str):
    """Stable 409 when a domain lifecycle command is invalid for the current status (R5.1).

    Shared by the retry/approve/reject/reactivate commands and the disable PATCH
    so every rejected transition on the one ``DomainStatusMachine`` returns the
    same ``DOMAIN_TRANSITION_REJECTED`` code.
    """
    return Response(
        {
            "success": False,
            "error": message,
            "code": "DOMAIN_TRANSITION_REJECTED",
        },
        status=status.HTTP_409_CONFLICT,
    )


def _hostname_conflict_response():
    """Stable 409 when a hostname is already active for another tenant (R7.10)."""
    return Response(
        {
            "success": False,
            "error": "This hostname is already active for another tenant.",
            "code": "HOSTNAME_CONFLICT",
        },
        status=status.HTTP_409_CONFLICT,
    )


def _integrity_conflict_response(code: str, message: str):
    """Stable 409 for a DB integrity race (task 3.3, R6.7/R7.4/R15.5).

    A serializer/check-then-insert guard handles the common duplicate case, but
    the DB unique/scope constraint is the final race guard: a concurrent
    double-submit that slips past the guard raises ``IntegrityError`` which the
    view translates to this registered 409 (docs/canonical-truth-map.md →
    catalog integrity 409 codes) rather than a 500.
    """
    return Response(
        {"success": False, "error": message, "code": code},
        status=status.HTTP_409_CONFLICT,
    )


_WRITE_CAPABILITY_BY_RESOURCE = {
    "domain": "platform.domain.manage",
    "asset": "platform.asset.manage",
    "template": "platform.template.manage",
    "document_profile": "platform.document.manage",
    "required_document": "platform.document.manage",
    "membership": "platform.user.manage_all",
    "grant": "platform.access_grant.manage",
}


def _write_allowed(user, capability: str) -> bool:
    """Resolve platform write authority through the canonical capability service."""
    try:
        AdminCapabilityService().require_capability(user, capability)
    except PermissionDenied:
        return False
    return True


def _write_capability_for_resource(resource: str | None) -> str:
    return _WRITE_CAPABILITY_BY_RESOURCE.get(resource or "", "platform.tenant.update")


def _forbidden_write_response():
    return Response(
        {"success": False, "error": "Only super admins can manage tenant configuration.", "code": "FORBIDDEN"},
        status=status.HTTP_403_FORBIDDEN,
    )


def _actor_id_str(user) -> str:
    """The actor's profile id as a string (empty when unidentifiable)."""
    return str(getattr(user, "id", "") or getattr(user, "pk", "") or "")


def _self_mutation_forbidden_response():
    """Stable 403 when a tenant-admin targets their own grant/membership (R6.7)."""
    return Response(
        {
            "success": False,
            "error": "You cannot alter your own membership or access grant.",
            "code": "SELF_GRANT_FORBIDDEN",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _staff_invite_forbidden_response():
    """Stable 403 when an invite is out of scope or above the inviter's role (R6.3, R6.4, R6.8)."""
    return Response(
        {
            "success": False,
            "error": "You cannot invite a user with that role into that institution.",
            "code": "STAFF_INVITE_FORBIDDEN",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _scope_institution_ids(user) -> set[str]:
    scope = AccessScopeService().filters_for_user(user)
    if scope.all_access:
        return set()
    return scope.institution_ids


def _paginate(request, queryset, serializer_class):
    paginator = StandardPagination()
    page = paginator.paginate_queryset(queryset, request)
    if page is not None:
        serializer = serializer_class(page, many=True)
        return paginator.get_paginated_response(serializer.data)
    serializer = serializer_class(queryset, many=True)
    return Response({"success": True, "data": serializer.data})


def _readable_institution_queryset(user):
    queryset = Institution.objects.all()
    if is_super_admin(user):
        return queryset
    institution_ids = _scope_institution_ids(user)
    return queryset.filter(id__in=institution_ids) if institution_ids else queryset.none()


class _InstitutionChildListCreateView(APIView):
    permission_classes = [IsAdmin]
    model = None
    serializer_class = None
    order_by = ("-created_at",)
    audit_resource = None

    def get_write_capability(self) -> str:
        return _write_capability_for_resource(self.audit_resource)

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
        if not _write_allowed(request.user, self.get_write_capability()):
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

    def get_write_capability(self) -> str:
        return _write_capability_for_resource(self.audit_resource)

    def get_queryset(self, request, institution_id):
        queryset = self.model.objects.filter(institution_id=institution_id)
        institution_ids = _scope_institution_ids(request.user)
        if institution_ids and str(institution_id) not in institution_ids:
            return queryset.none()
        if not institution_ids and not is_super_admin(request.user):
            return queryset.none()
        return queryset

    def patch(self, request, institution_id, item_id):
        if not _write_allowed(request.user, self.get_write_capability()):
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
