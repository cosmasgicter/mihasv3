"""The scoped user directory: list, detail, bulk, import, export (task 9.3).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.3 — "Rebuild user
directory CRUD, import, bulk, and export".
Requirements: **R6.1**-**R6.5**. Findings: **ADM-03**, **ADM-04**, **AUTH-04**.
Design: §5.3 ("People And Access"), §14.1 (one envelope, one pagination schema).

Five endpoints, one authority
-----------------------------
* ``GET /api/v1/admin/users/`` — the directory. Search, filters, sort, page,
  **facets**, and **aggregates** all come from
  :class:`~apps.accounts.user_directory_service.UserDirectoryQueryService`,
  computed over the whole filtered set in SQL. ``?export=csv`` is
  page-independent, capability-gated, redacted, bounded, and audited.
* ``POST /api/v1/admin/users/`` — create one account (optionally into a school).
* ``GET/PATCH /api/v1/admin/users/{id}/`` — read/update one account, **through**
  the actor's scope. An unsupported field is rejected, not dropped.
* ``POST /api/v1/admin/users/bulk/`` — one bulk role/status command.
* ``POST /api/v1/admin/users/batch-import/preview/`` and
  ``POST /api/v1/admin/users/batch-import/`` — validate, then apply.
* ``GET /api/v1/admin/users/export/`` — the same page-independent export as
  ``?export=csv``, on the route that already existed.

The two-queryset shape, and why it matters
------------------------------------------
Like task 9.1's roster, the list builds the filtered queryset **twice**: once with
every filter applied (the page, the totals, the export) and once with the faceted
dimension left open (the facet counts). A role facet computed after ``role=admin``
can only ever offer ``admin``, which recreates ADM-03's defect in a new place —
an operator filters themselves into a corner with no way back. Facets describe
*what else you could ask for*; aggregates describe *what you asked for*.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import Any, Optional

from django.db import DatabaseError, IntegrityError, transaction
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile
from apps.accounts.user_bulk_service import (
    BULK_OP_DEACTIVATE,
    BULK_OPERATIONS,
    MAX_BULK_SIZE,
    UserBulkRejected,
    UserBulkService,
)
from apps.accounts.user_directory_service import (
    CREATE_FIELDS,
    EXPORT_ROW_LIMIT,
    IMPORT_MAX_ROWS,
    REGISTERED_PARAMETERS,
    SUPPORTED_ROLES,
    UPDATE_FIELDS,
    UnsupportedUserField,
    UserDirectoryFilters,
    UserDirectoryQueryService,
    UserExportTooLarge,
    UserRedactionPolicy,
    UserScopeDenied,
    csv_bytes,
    role_level,
)
from apps.accounts.user_import_service import (
    IMPORT_MODES,
    UserImportRejected,
    UserImportService,
)
from apps.catalog.permissions import HasTenantCapability
from apps.common.idempotency import idempotent
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination

logger = logging.getLogger(__name__)

#: Audit action for a user-directory export (R6.5). Registered alongside the
#: platform's other export actions rather than invented per surface.
ACTION_USER_EXPORTED = "user.exported"

#: The dimensions whose own filter is left open when computing facets, so a
#: narrowed query still offers the other values of that dimension.
FACET_OPEN_DIMENSIONS: dict[str, tuple[str, ...]] = {
    "role": ("roles",),
    "is_active": ("is_active",),
    "institution": ("institution_id",),
}

#: Export authority. The platform's one tenant export grant — the same capability
#: tasks 8.4 and 9.1 spend. No new capability is invented by this task.
USER_EXPORT_CAPABILITY = "tenant.application.export"

#: Read authority for the directory: *the staff in the schools I am scoped to*.
#: Already in the default tenant read bundle, so no capability is invented.
#:
#: This is a documented contract strengthening, recorded in the evidence README.
#: The pre-9.3 routes were gated on ``platform.user.manage_all``, which in the
#: capability model only a Super_Admin (or the dev/test all-access compat branch)
#: ever holds — so under production scope the whole directory was super-admin
#: only, and the membership narrowing inside it was unreachable defensive code.
#: R6.1 asks for a directory that "preserves tenant scope in every request",
#: which presupposes an actor who *has* tenant scope.
USER_READ_CAPABILITY = "tenant.staff.read"

#: Write authority: creating or re-roling a staff account in a school. The same
#: capability ``POST /api/v1/admin/staff/invitations/`` already spends.
USER_WRITE_CAPABILITY = "tenant.staff.invite"

#: Removing an account's access is its own decision, and the platform already
#: names it. Required *in addition* to :data:`USER_WRITE_CAPABILITY` when a
#: request deactivates an account.
USER_DISABLE_CAPABILITY = "tenant.staff.disable"


def _require_capability(request, capability: str) -> Optional[Response]:
    """Enforce one extra tenant capability, or return the refusal Response.

    Used for the deactivation half of an update: the view's declared
    ``required_capability`` covers the write, and this covers the *removal of
    access*, which the platform treats as a distinct grant.
    """
    from apps.catalog.services import AdminCapabilityService, CapabilityResolutionError
    from apps.catalog.tenant_audit_service import TenantAuditService

    try:
        capabilities = AdminCapabilityService().get_capabilities(request.user)
    except CapabilityResolutionError:
        capabilities = None
    if capabilities is not None and (
        capabilities.is_super_admin
        or capabilities.all_access
        or any(
            capability in held
            for held in (capabilities.institution_capabilities or {}).values()
        )
    ):
        return None

    try:
        TenantAuditService.record_event(
            action="auth.denied",
            entity_type="profiles",
            actor_id=getattr(request.user, "id", None),
            actor_role=getattr(request.user, "role", None),
            metadata={
                "resource_type": "user.deactivate",
                "required_capability": capability,
            },
            retention_category="security",
            request=request,
        )
    except Exception:  # pragma: no cover
        logger.warning("Failed to audit refused user deactivation", exc_info=True)
    return Response(
        {
            "success": False,
            "error": "You do not have permission to perform this action.",
            "code": "INSUFFICIENT_PERMISSIONS",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _masked_not_found(request, resource_type: str, resource_id: Any):
    """One masked 404 for every out-of-scope / unknown identifier."""
    from apps.catalog.tenant_audit_service import TenantAuditService

    try:
        TenantAuditService.record_scope_denied(
            resource_type=resource_type,
            resource_id=resource_id,
            actor_id=getattr(request.user, "id", None),
            actor_role=getattr(request.user, "role", None),
            request=request,
        )
    except Exception:  # pragma: no cover - audit must never block a read
        logger.warning("Failed to audit masked user-directory lookup", exc_info=True)
    return Response(
        {"success": False, "error": "Not found", "code": "NOT_FOUND"},
        status=status.HTTP_404_NOT_FOUND,
    )


def _unsupported_field_response(exc: UnsupportedUserField):
    """R6.2: an ignored mutation field is **rejected**, never silently lost."""
    return Response(
        {
            "success": False,
            "error": (
                "This request carries fields the platform does not accept here: "
                + ", ".join(exc.fields)
                + "."
            ),
            "code": "UNSUPPORTED_FIELD",
            "data": {"unsupported_fields": list(exc.fields)},
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _may_export(request, capability: str = USER_EXPORT_CAPABILITY) -> bool:
    """Whether the actor holds the platform's one tenant export grant (R6.5)."""
    from apps.catalog.services import AdminCapabilityService, CapabilityResolutionError

    try:
        capabilities = AdminCapabilityService().get_capabilities(request.user)
    except CapabilityResolutionError:
        return False
    if capabilities.is_super_admin or capabilities.all_access:
        return True
    return any(
        capability in held
        for held in (capabilities.institution_capabilities or {}).values()
    )


def _facets(service: UserDirectoryQueryService, user, filters: UserDirectoryFilters):
    """Facet counts per dimension, each with its own dimension left open."""
    result: dict[str, Any] = {}
    for name, open_fields in FACET_OPEN_DIMENSIONS.items():
        cleared: dict[str, Any] = {}
        for field_name in open_fields:
            current = getattr(filters, field_name, None)
            cleared[field_name] = () if isinstance(current, tuple) else None
        relaxed = replace(filters, **cleared)
        result.update(service.facets(service.filtered(user, relaxed), names=(name,)))
    return result


def _export_response(
    request,
    service: UserDirectoryQueryService,
    filters: UserDirectoryFilters,
    queryset,
    policy: UserRedactionPolicy,
):
    """Page-independent, capability-gated, audited CSV export (R6.5).

    One implementation, reached from both ``GET /admin/users/?export=csv`` and
    ``GET /admin/users/export/``. Two spellings of one export are fine; two
    implementations of it are how the browser ended up owning one of them.
    """
    from apps.catalog.tenant_audit_service import TenantAuditService

    if not _may_export(request):
        try:
            TenantAuditService.record_event(
                action="auth.denied",
                entity_type="profiles",
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                metadata={
                    "resource_type": "user.export",
                    "required_capability": USER_EXPORT_CAPABILITY,
                },
                retention_category="security",
                request=request,
            )
        except Exception:  # pragma: no cover
            logger.warning("Failed to audit refused user export", exc_info=True)
        return Response(
            {
                "success": False,
                "error": "You do not have permission to perform this action.",
                "code": "INSUFFICIENT_PERMISSIONS",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        rows = service.export_rows(queryset, policy=policy)
    except UserExportTooLarge as exc:
        return Response(
            {
                "success": False,
                "error": "This export is too large. Narrow the filters and try again.",
                "code": "EXPORT_TOO_LARGE",
                "data": {"row_count": exc.row_count, "row_limit": EXPORT_ROW_LIMIT},
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    body = csv_bytes(service.export_columns(policy), rows)
    try:
        TenantAuditService.record_export(
            action=ACTION_USER_EXPORTED,
            entity_type="profiles",
            institution_id=filters.institution_id,
            row_count=len(rows),
            row_limit=EXPORT_ROW_LIMIT,
            filters=filters.as_payload(),
            redaction=policy.as_payload(),
            actor_id=getattr(request.user, "id", None),
            actor_role=getattr(request.user, "role", None),
            request=request,
        )
    except Exception:  # pragma: no cover - audit must never block a read
        logger.warning("Failed to audit user-directory export", exc_info=True)

    filename = f"users-{timezone.now().strftime('%Y%m%d')}.csv"
    response = HttpResponse(body, content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


_LIST_PARAMETERS = [
    OpenApiParameter("institution_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="Restrict to accounts holding an active membership in one in-scope school. Out-of-scope or unknown → masked 404."),
    OpenApiParameter("role", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Comma-separated platform roles: " + ", ".join(SUPPORTED_ROLES) + "."),
    OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Match name, email, or phone."),
    OpenApiParameter("is_active", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False, description="true = accounts permitted to sign in; false = deactivated; omitted = active only."),
    OpenApiParameter("include_inactive", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False, description="Legacy spelling: true widens the default to include deactivated accounts."),
    OpenApiParameter("has_membership", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False, description="Accounts with (or without) an active school membership."),
    OpenApiParameter("start_date", OpenApiTypes.DATE, OpenApiParameter.QUERY, required=False),
    OpenApiParameter("end_date", OpenApiTypes.DATE, OpenApiParameter.QUERY, required=False),
    OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="created_at | display_name | email | role | is_active | updated_at"),
    OpenApiParameter("order", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="asc | desc"),
    OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
    OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
    OpenApiParameter("export", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Pass 'csv' to download the whole filtered set (page-independent). Requires tenant.application.export."),
]


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_users_list",
        tags=["admin"],
        parameters=_LIST_PARAMETERS,
        responses={
            200: OpenApiResponse(description="Scoped user directory with server facets and whole-set aggregates (JSON, or CSV download when export=csv)."),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    post=extend_schema(
        operation_id="admin_users_create",
        tags=["admin"],
        request=OpenApiTypes.OBJECT,
        responses={
            201: OpenApiResponse(description="Account created."),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class AdminUserListView(APIView):
    """GET/POST ``/api/v1/admin/users/`` — the scoped directory and create command.

    Read authority is the per-institution ``tenant.staff.read`` capability;
    create is ``tenant.staff.invite``. A caller with no tenant scope receives a
    masked 404 rather than a confirming empty page. The **row set** is scoped by
    membership: a Tenant_Admin sees the accounts in their own schools plus their
    own row, and the directory can no longer be paged past the end of that scope
    because the paging is the server's.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    audit_resource_type = "profiles"

    def get_permissions(self):
        if self.request.method == "POST":
            # Creation has two body-dependent authority modes: a global account
            # (platform-only) or a scoped staff invitation.  A single static
            # tenant capability check would reject read-only/no-scope operators
            # before the command could return the canonical
            # PRIVILEGE_ESCALATION denial for a global-account attempt.  The
            # body below resolves both modes through AdminCapabilityService and
            # scope-before-lookup; authentication still runs here.
            return [IsAuthenticated()]
        self.required_capability = (
            USER_WRITE_CAPABILITY
            if self.request.method == "POST"
            else USER_READ_CAPABILITY
        )
        return super().get_permissions()

    def get(self, request):
        service = UserDirectoryQueryService()
        try:
            filters = service.parse(request.user, request.query_params)
        except UserScopeDenied as exc:
            return _masked_not_found(
                request, f"user.{exc.resource_type}", exc.resource_id
            )

        policy = service.redaction_policy(request.user)
        queryset = service.filtered(request.user, filters)

        if (request.query_params.get("export") or "").lower() == "csv":
            return _export_response(request, service, filters, queryset, policy)

        paginator = StandardPagination()
        page_size = paginator.get_page_size(request) or paginator.page_size
        try:
            page_number = max(1, int(request.query_params.get("page") or 1))
        except (TypeError, ValueError):
            page_number = 1

        total_count = queryset.order_by().count()
        rows = service.rows_for(
            queryset,
            policy=policy,
            offset=(page_number - 1) * page_size,
            limit=page_size,
        )
        return Response(
            {
                "success": True,
                "data": {
                    "page": page_number,
                    "pageSize": page_size,
                    "totalCount": total_count,
                    # Server-computed. The alternative was Math.ceil in the
                    # browser over a length it had, which is the arithmetic this
                    # contract exists to take back.
                    "totalPages": (
                        max(1, -(-total_count // page_size)) if page_size else 1
                    ),
                    "results": rows,
                    "aggregates": service.aggregates(queryset),
                    "aggregate_definitions": service.aggregate_definitions(),
                    "facets": _facets(service, request.user, filters),
                    "filters": filters.as_payload(),
                    "redaction": policy.as_payload(),
                    "can_export": _may_export(request),
                    "supported_roles": list(SUPPORTED_ROLES),
                },
            }
        )

    def post(self, request):
        """Create one account, optionally as a staff invite into one school.

        Two shapes share this endpoint: a platform/global account (no
        ``institution_id``) and a tenant staff invite (``institution_id``
        supplied), where the account and its membership are one
        ``transaction.atomic()`` unit so a membership failure cannot leave an
        account with a staff role and no tenant scope.
        """
        from apps.accounts.services import hash_password
        from apps.catalog.services import AdminCapabilityService

        payload = request.data if isinstance(request.data, dict) else {}
        try:
            UserDirectoryQueryService.reject_unsupported(payload, CREATE_FIELDS)
        except UnsupportedUserField as exc:
            return _unsupported_field_response(exc)

        errors = _validate_identity(payload, require_password=True)
        role = str(payload.get("role") or "").strip().lower()
        if role not in SUPPORTED_ROLES:
            errors["role"] = [
                "Choose one of: " + ", ".join(SUPPORTED_ROLES) + "."
            ]
        if errors:
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # AUTH-04: the ceiling is the platform's hierarchy, and it is checked
        # before anything is written.
        if role_level(role) > role_level(getattr(request.user, "role", None)):
            return Response(
                {
                    "success": False,
                    "error": "You cannot assign a role higher than your own.",
                    "code": "PRIVILEGE_ESCALATION",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        service = UserDirectoryQueryService()
        institution = None
        raw_institution = str(payload.get("institution_id") or "").strip()
        # An unscoped account is platform authority.  A tenant-scoped operator
        # may invite staff into an institution they can manage, but may never
        # mint a global operator merely because the requested role is not above
        # their own numeric role level.
        from apps.catalog.services import CapabilityResolutionError

        try:
            actor_capabilities = AdminCapabilityService().get_capabilities(request.user)
        except CapabilityResolutionError:
            return Response(
                {
                    "success": False,
                    "error": "Your capabilities could not be resolved; the action is denied.",
                    "code": "CAPABILITY_RESOLUTION_FAILED",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not raw_institution and not actor_capabilities.is_super_admin:
            return Response(
                {
                    "success": False,
                    "error": "Only a platform administrator can create an unscoped account.",
                    "code": "PRIVILEGE_ESCALATION",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if raw_institution:
            try:
                service.resolve_institution_filter(request.user, raw_institution)
            except UserScopeDenied as exc:
                return _masked_not_found(
                    request, "user.institution", exc.resource_id
                )
            from apps.catalog.models import Institution

            institution = Institution.objects.filter(pk=raw_institution).first()
            if institution is not None and not AdminCapabilityService().can_invite_staff(
                request.user, institution, role
            ):
                return Response(
                    {
                        "success": False,
                        "error": "You cannot create an account with this role in this school.",
                        "code": "INSUFFICIENT_PRIVILEGES",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        email = str(payload.get("email") or "").strip().lower()
        if Profile.objects.filter(email__iexact=email).exists():
            return Response(
                {
                    "success": False,
                    "error": "An account with this address already exists.",
                    "code": "DUPLICATE_EMAIL",
                },
                status=status.HTTP_409_CONFLICT,
            )

        now = timezone.now()
        try:
            with transaction.atomic():
                profile = Profile.objects.create(
                    email=email,
                    password_hash=hash_password(str(payload.get("password") or "")),
                    first_name=str(payload.get("first_name") or "").strip(),
                    last_name=str(payload.get("last_name") or "").strip(),
                    phone=str(payload.get("phone") or "").strip()[:20],
                    nationality=str(payload.get("nationality") or "Zambian").strip(),
                    role=role,
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
                if institution is not None:
                    from apps.catalog.models import UserInstitutionMembership

                    UserInstitutionMembership.objects.create(
                        user_id=profile.pk,
                        institution_id=institution.pk,
                        role=role,
                        is_active=True,
                        created_at=now,
                        created_by_id=getattr(request.user, "id", None),
                    )
        except (IntegrityError, DatabaseError):
            logger.warning(
                "Account creation rolled back on write failure", exc_info=True
            )
            return Response(
                {
                    "success": False,
                    "error": "The account could not be created. No changes were saved.",
                    "code": "STAFF_CREATION_FAILED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        policy = service.redaction_policy(request.user)
        rows = service.rows_for(
            service.annotate(Profile.objects.filter(pk=profile.pk)),
            policy=policy,
            offset=0,
            limit=1,
        )
        return Response(
            {"success": True, "data": rows[0] if rows else {"id": str(profile.pk)}},
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_users_retrieve",
        tags=["admin"],
        parameters=[OpenApiParameter("pk", OpenApiTypes.UUID, OpenApiParameter.PATH)],
        responses={
            200: OpenApiResponse(description="One account, read through the actor's scope."),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="admin_users_update",
        tags=["admin"],
        parameters=[OpenApiParameter("pk", OpenApiTypes.UUID, OpenApiParameter.PATH)],
        request=OpenApiTypes.OBJECT,
        responses={
            200: OpenApiResponse(description="Account updated."),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class AdminUserDetailView(APIView):
    """GET/PATCH ``/api/v1/admin/users/{id}/``.

    Every field the edit form sends is now a field this endpoint implements
    (R6.2): ``email`` and ``phone`` used to be accepted with a 200 and dropped.
    An unsupported field is a 400 naming it, because a silent discard tells the
    operator their correction worked.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    audit_resource_type = "profiles"

    def get_permissions(self):
        self.required_capability = (
            USER_WRITE_CAPABILITY
            if self.request.method in {"PATCH", "PUT"}
            else USER_READ_CAPABILITY
        )
        return super().get_permissions()

    def get(self, request, pk):
        service = UserDirectoryQueryService()
        try:
            service.resolve_user(request.user, pk)
        except UserScopeDenied as exc:
            return _masked_not_found(request, "user", exc.resource_id)
        policy = service.redaction_policy(request.user)
        rows = service.rows_for(
            service.annotate(Profile.objects.filter(pk=pk)),
            policy=policy,
            offset=0,
            limit=1,
        )
        if not rows:  # pragma: no cover - resolve_user already proved it exists
            return _masked_not_found(request, "user", pk)
        return Response({"success": True, "data": rows[0]})

    def patch(self, request, pk):
        from apps.accounts.services import hash_password
        from apps.common.audit_network import build_audit_network_fields
        from apps.common.models import AuditLog

        payload = request.data if isinstance(request.data, dict) else {}
        try:
            UserDirectoryQueryService.reject_unsupported(payload, UPDATE_FIELDS)
        except UnsupportedUserField as exc:
            return _unsupported_field_response(exc)

        service = UserDirectoryQueryService()
        actor_level = role_level(getattr(request.user, "role", None))

        # The role-escalation guards are evaluated on the *target's* stored role,
        # so they must run against a real row. ``resolve_user`` is the scoped
        # fetch, so an out-of-scope target never reaches them — and a privilege
        # escalation attempt against an in-scope target is a 403 rather than a
        # mask, because the actor is entitled to know they were refused.
        requested_role = str(payload.get("role") or "").strip().lower() or None
        if requested_role is not None and requested_role not in SUPPORTED_ROLES:
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": {
                        "role": ["Choose one of: " + ", ".join(SUPPORTED_ROLES) + "."]
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if requested_role is not None and role_level(requested_role) > actor_level:
            return Response(
                {
                    "success": False,
                    "error": "You cannot assign a role higher than your own.",
                    "code": "PRIVILEGE_ESCALATION",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            user = service.resolve_user(request.user, pk)
        except UserScopeDenied as exc:
            return _masked_not_found(request, "user", exc.resource_id)

        if role_level(user.role) > actor_level:
            return Response(
                {
                    "success": False,
                    "error": "You cannot modify a user with a higher role than your own.",
                    "code": "INSUFFICIENT_PRIVILEGES",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        wants_deactivate = "is_active" in payload and not payload.get("is_active")
        if wants_deactivate:
            # Removing access is a distinct grant, and the platform already names
            # it. Checked here rather than in ``get_permissions`` because it
            # depends on the body, not the method.
            refusal = _require_capability(request, USER_DISABLE_CAPABILITY)
            if refusal is not None:
                return refusal
        if wants_deactivate and str(getattr(request.user, "pk", "")) == str(user.pk):
            return Response(
                {
                    "success": False,
                    "error": "You cannot deactivate your own account.",
                    "code": "SELF_DEACTIVATION_FORBIDDEN",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        errors = _validate_identity(payload, require_password=False, partial=True)
        if errors:
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        changes: dict[str, Any] = {}

        if "email" in payload:
            new_email = str(payload.get("email") or "").strip().lower()
            if new_email and new_email != (user.email or "").lower():
                if (
                    Profile.objects.filter(email__iexact=new_email)
                    .exclude(pk=user.pk)
                    .exists()
                ):
                    return Response(
                        {
                            "success": False,
                            "error": "An account with this address already exists.",
                            "code": "DUPLICATE_EMAIL",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                # Recorded as a *change happened* rather than as the old and new
                # addresses: an audit row is not a place to keep contact PII.
                changes["email"] = "changed"
                user.email = new_email

        for name in ("first_name", "last_name", "phone"):
            if name in payload:
                value = str(payload.get(name) or "").strip()
                if name == "phone":
                    value = value[:20]
                    if value != (getattr(user, name) or ""):
                        changes[name] = "changed"
                elif value != (getattr(user, name) or ""):
                    changes[name] = {"old": getattr(user, name), "new": value}
                setattr(user, name, value)

        if requested_role is not None and requested_role != user.role:
            changes["role"] = {"old": user.role, "new": requested_role}
            user.role = requested_role

        if "is_active" in payload:
            new_active = bool(payload.get("is_active"))
            if new_active != (user.is_active is not False):
                changes["is_active"] = {"old": user.is_active, "new": new_active}
            user.is_active = new_active

        if payload.get("password"):
            user.password_hash = hash_password(str(payload["password"]))
            changes["password"] = "reset"

        user.updated_at = timezone.now()
        try:
            user.save()
        except IntegrityError:
            return Response(
                {
                    "success": False,
                    "error": "An account with this address already exists.",
                    "code": "DUPLICATE_EMAIL",
                },
                status=status.HTTP_409_CONFLICT,
            )

        if changes:
            network_fields = build_audit_network_fields(request)
            try:
                AuditLog.objects.create(
                    actor_id=getattr(request.user, "pk", None),
                    action="user_update",
                    entity_type="profiles",
                    entity_id=user.pk,
                    changes=changes,
                    ip_address=network_fields["ip_address"],
                    user_agent=network_fields["user_agent"],
                    ip_address_encrypted=network_fields["ip_address_encrypted"],
                    user_agent_encrypted=network_fields["user_agent_encrypted"],
                    retention_category="security",
                )
            except Exception:  # pragma: no cover - audit must never block a write
                logger.warning("Failed to audit user update", exc_info=True)

        # A role change or a deactivation changes effective authority, so the
        # target's in-flight sessions carry stale authority.
        if "role" in changes or ("is_active" in changes and user.is_active is False):
            from apps.accounts.session_lifecycle import (
                revoke_sessions_for_authority_change,
            )

            revoke_sessions_for_authority_change(
                user.pk,
                reason="role" if "role" in changes else "deactivated",
                actor_id=getattr(request.user, "pk", None),
            )

        policy = service.redaction_policy(request.user)
        rows = service.rows_for(
            service.annotate(Profile.objects.filter(pk=user.pk)),
            policy=policy,
            offset=0,
            limit=1,
        )
        return Response({"success": True, "data": rows[0] if rows else {"id": str(user.pk)}})


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_users_export",
        tags=["admin"],
        parameters=_LIST_PARAMETERS,
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description="Page-independent CSV export of the whole filtered set.",
            ),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class AdminUserExportView(APIView):
    """GET ``/api/v1/admin/users/export/`` — the audited, bounded export (R6.5).

    Accepts the **same** filters as the directory and exports the whole filtered
    set, not the page the operator was looking at. Over
    :data:`~apps.accounts.user_directory_service.EXPORT_ROW_LIMIT` rows it
    refuses with ``EXPORT_TOO_LARGE`` rather than truncating, because a short
    export and a complete one look identical once downloaded.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    required_capability = USER_READ_CAPABILITY
    audit_resource_type = "profiles"

    def get(self, request):
        service = UserDirectoryQueryService()
        try:
            filters = service.parse(request.user, request.query_params)
        except UserScopeDenied as exc:
            return _masked_not_found(
                request, f"user.{exc.resource_type}", exc.resource_id
            )
        policy = service.redaction_policy(request.user)
        queryset = service.filtered(request.user, filters)
        return _export_response(request, service, filters, queryset, policy)


@extend_schema_view(
    post=extend_schema(
        operation_id="admin_users_bulk_update",
        tags=["admin"],
        request=OpenApiTypes.OBJECT,
        responses={
            200: OpenApiResponse(description="Bulk role/status command applied, or refused with per-target errors."),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class AdminUserBulkView(APIView):
    """POST ``/api/v1/admin/users/bulk/`` — one bulk role/status command (R6.5).

    Body: ``{operation, user_ids[], role?, confirmation_token}``. ``operation``
    is one of ``set_role`` / ``deactivate`` / ``reactivate``, at most
    :data:`~apps.accounts.user_bulk_service.MAX_BULK_SIZE` targets, and the token
    is SHA-256 over the sorted ids plus the operation and role — checked here, so
    a token computed for one selection cannot authorise a different one.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    required_capability = USER_WRITE_CAPABILITY
    audit_resource_type = "profiles"

    @idempotent
    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        service = UserBulkService()
        try:
            operation = service.resolve_operation(payload.get("operation"))
        except UserBulkRejected as exc:
            return Response(
                {
                    "success": False,
                    "error": exc.message,
                    "code": exc.code,
                    "data": exc.data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if operation == BULK_OP_DEACTIVATE:
            refusal = _require_capability(request, USER_DISABLE_CAPABILITY)
            if refusal is not None:
                return refusal

        try:
            result = service.apply(
                request.user,
                operation=operation,
                user_ids=list(payload.get("user_ids") or []),
                role=payload.get("role"),
                confirmation_token=str(payload.get("confirmation_token") or ""),
                request=request,
            )
        except UserBulkRejected as exc:
            http_status = (
                status.HTTP_403_FORBIDDEN
                if exc.code in {"INSUFFICIENT_PRIVILEGES", "PRIVILEGE_ESCALATION"}
                else status.HTTP_400_BAD_REQUEST
            )
            return Response(
                {
                    "success": False,
                    "error": exc.message,
                    "code": exc.code,
                    "data": exc.data,
                },
                status=http_status,
            )
        except UserScopeDenied as exc:
            return _masked_not_found(request, "user", exc.resource_id)

        return Response({"success": True, "data": result.as_payload()})


_IMPORT_REQUEST_DESCRIPTION = (
    "{institution_id, mode, rows[]} — rows carry email, first_name/last_name or "
    "full_name, role, and optionally phone and password. At most "
    f"{IMPORT_MAX_ROWS} rows. mode is one of " + " | ".join(IMPORT_MODES) + "."
)


class _ImportBase(APIView):
    """Shared authority, parsing, and error mapping for preview and commit."""

    permission_classes = [IsAuthenticated, HasTenantCapability]
    required_capability = USER_WRITE_CAPABILITY
    audit_resource_type = "profiles"

    def _plan(self, request):
        """Build the plan, or return the ``Response`` that refuses the request.

        One validator for both endpoints. That is the property that makes the
        preview meaningful: there is no second code path for the commit to
        disagree with.
        """
        payload = request.data if isinstance(request.data, dict) else {}
        rows = payload.get("rows")
        if rows is None and isinstance(request.data, list):
            # The pre-9.3 client posted a bare array. Accepted so an in-flight
            # deploy does not drop an operator's file, but it cannot name a
            # school, so it is refused by ``resolve_institution`` with the
            # actionable ``INSTITUTION_REQUIRED`` rather than a parse error.
            rows = request.data
            payload = {}

        service = UserImportService()
        try:
            mode = service.resolve_mode(payload.get("mode"))
            institution = service.resolve_institution(
                request.user, payload.get("institution_id")
            )
            plan = service.plan(request.user, rows, institution=institution, mode=mode)
        except UserImportRejected as exc:
            return None, None, Response(
                {
                    "success": False,
                    "error": exc.message,
                    "code": exc.code,
                    "data": exc.data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except UserScopeDenied as exc:
            return None, None, _masked_not_found(
                request, "user.institution", exc.resource_id
            )
        return service, plan, None


@extend_schema_view(
    post=extend_schema(
        operation_id="admin_users_import_preview",
        tags=["admin"],
        request=OpenApiTypes.OBJECT,
        description=_IMPORT_REQUEST_DESCRIPTION,
        responses={
            200: OpenApiResponse(description="Validation preview: the rows that would be created, the rows that would fail, and whether the batch would commit. Writes nothing."),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class AdminUserImportPreviewView(_ImportBase):
    """POST ``/api/v1/admin/users/batch-import/preview/`` — validate only (R6.4).

    Writes no account. Returns the same plan the commit will apply, including
    ``would_commit``, so an operator learns that row 340 names an unsupported
    role *before* the other 339 exist.
    """

    def post(self, request):
        service, plan, refusal = self._plan(request)
        if refusal is not None:
            return refusal
        service.audit_preview(request.user, plan, request=request)
        return Response({"success": True, "data": plan.as_payload()})


@extend_schema_view(
    post=extend_schema(
        operation_id="admin_users_batch_import",
        tags=["admin"],
        request=OpenApiTypes.OBJECT,
        description=_IMPORT_REQUEST_DESCRIPTION,
        responses={
            200: OpenApiResponse(description="The batch was refused; per-row errors explain why and nothing was created."),
            201: OpenApiResponse(description="The batch was applied."),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class AdminUserBatchImportView(_ImportBase):
    """POST ``/api/v1/admin/users/batch-import/`` — apply the plan (R6.4).

    ``@idempotent`` supplies replay safety: the same ``Idempotency-Key`` and body
    returns the first response instead of importing twice, and the same key with
    a different body is a 409. Absent a key, a replayed ``all_or_nothing`` batch
    fails closed — every row is ``EMAIL_EXISTS`` and nothing is written — so a
    double-submit still cannot produce duplicate accounts.
    """

    @idempotent
    def post(self, request):
        service, plan, refusal = self._plan(request)
        if refusal is not None:
            return refusal
        result = service.commit(request.user, plan, request=request)
        return Response(
            {"success": True, "data": result.as_payload()},
            status=(
                status.HTTP_201_CREATED if result.committed else status.HTTP_200_OK
            ),
        )


def _validate_identity(
    payload: dict, *, require_password: bool, partial: bool = False
) -> dict[str, list[str]]:
    """Validate the identity fields shared by create and update.

    Deliberately hand-rolled rather than a second ``Serializer``: the field
    contract is :data:`CREATE_FIELDS` / :data:`UPDATE_FIELDS`, and a serializer
    with its own ``ChoiceField`` list is precisely the third disagreeing copy of
    the role vocabulary that ADM-03 is about.
    """
    import re

    errors: dict[str, list[str]] = {}
    email_re = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

    if "email" in payload or not partial:
        email = str(payload.get("email") or "").strip()
        if not email:
            if not partial:
                errors["email"] = ["An email address is required."]
        elif not email_re.match(email) or len(email) > 255:
            errors["email"] = ["This is not a valid email address."]

    for name, label in (("first_name", "A first name"), ("last_name", "A last name")):
        if name in payload or not partial:
            value = str(payload.get(name) or "").strip()
            if not value and name == "first_name" and not partial:
                errors[name] = [f"{label} is required."]
            elif len(value) > 255:
                errors[name] = [f"{label} must be 255 characters or fewer."]

    password = payload.get("password")
    if require_password and not password:
        errors["password"] = ["A password is required."]
    if password is not None and str(password) and len(str(password)) < 6:
        errors["password"] = ["A password must be at least 6 characters."]

    if "phone" in payload and len(str(payload.get("phone") or "")) > 20:
        errors["phone"] = ["A phone number must be 20 characters or fewer."]

    return errors


__all__ = [
    "ACTION_USER_EXPORTED",
    "BULK_OPERATIONS",
    "FACET_OPEN_DIMENSIONS",
    "MAX_BULK_SIZE",
    "REGISTERED_PARAMETERS",
    "USER_DISABLE_CAPABILITY",
    "USER_EXPORT_CAPABILITY",
    "USER_READ_CAPABILITY",
    "USER_WRITE_CAPABILITY",
    "AdminUserBatchImportView",
    "AdminUserBulkView",
    "AdminUserDetailView",
    "AdminUserExportView",
    "AdminUserImportPreviewView",
    "AdminUserListView",
]
