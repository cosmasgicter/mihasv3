"""Tenant-staff authorization helpers (Admissions V2 task 2.2, R3.1/R3.2).

One canonical place that implements the design §5.2 tenant-capability
disclosure model, so staff endpoints derive authority through
``AdminCapabilityService`` / ``AccessScopeService`` instead of a raw-role
permission class (``IsAdmin`` / ``IsSuperAdmin``) acting as the endpoint's
second authority:

* **scope before lookup** — an out-of-scope (other-tenant) object, and an actor
  with no tenant scope at all (e.g. a Student on a staff endpoint), collapse to
  the same non-revealing **404** (existence is never confirmed);
* an in-scope object whose actor lacks the required ``tenant.*`` capability is a
  non-revealing **403**;
* a Super_Admin (platform all-access) passes every check.

Role is only ever an INPUT to the capability derivation inside
``AdminCapabilityService`` — it is never compared as a second authority here.
These helpers raise DRF exceptions (``NotFound`` / ``PermissionDenied``) so the
disclosure status is decided in one place and mapped by the envelope exception
handler to the canonical error body.
"""

from __future__ import annotations

from typing import Any, Optional

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import NotFound, PermissionDenied


def _services():
    """Lazily import the catalog authority services (avoid import cycles)."""
    from apps.catalog.services import (
        AccessScopeService,
        AdminCapabilityService,
        CapabilityResolutionError,
    )

    return AccessScopeService, AdminCapabilityService, CapabilityResolutionError


# ---------------------------------------------------------------------------
# Reviewer assignment scope (design §5.2 — Reviewer authority, R3.1 / AUTH-01)
# ---------------------------------------------------------------------------
#
# A Reviewer's tenant authority is *assignment-scoped*: "Named institution
# membership plus application assignment ... reviewer queue/read/review policy
# and only the specific actions assigned" (design §5.2). This is an explicit
# backend policy COMPOSED WITH the capability service (R3.1), not a raw-role
# gate: the capability service still decides whether the actor holds
# ``tenant.application.review`` etc.; this layer additionally restricts a
# ``reviewer``-role actor to applications assigned to them. A ``Tenant_Admin``
# (``admin`` role) is tenant-wide within scope and is NOT assignment-scoped; a
# Super_Admin / platform all-access caller is never restricted.


def _is_assignment_scoped_reviewer(user) -> bool:
    """True when ``user`` is a Reviewer whose authority is assignment-scoped.

    The Reviewer actor in the design authority table (§5.2): a non-super-admin
    whose canonical role is exactly ``reviewer``. Tenant_Admins (``admin``) and
    Super_Admins are excluded — their authority is tenant-wide / platform.
    """
    from apps.accounts.permissions import is_super_admin

    if is_super_admin(user):
        return False
    return (getattr(user, "role", "") or "").strip().lower() == "reviewer"


def apply_reviewer_assignment_scope(queryset, user):
    """Restrict an application queryset to a Reviewer's assigned work (R8.2).

    A no-op for every actor except an assignment-scoped Reviewer, for whom the
    queryset is narrowed to applications where they are the assigned reviewer.
    Composes *after* ``AccessScopeService.filter_applications`` so the reviewer
    queue contains only tenant-authorized **and** assigned applications.
    """
    if not _is_assignment_scoped_reviewer(user):
        return queryset
    actor_id = getattr(user, "id", None) or getattr(user, "pk", None)
    return queryset.filter(assigned_reviewer_id=actor_id)


def require_reviewer_assignment(request, application) -> None:
    """404-mask an application a Reviewer is not assigned to (design §5.2).

    Assumes ``application`` already passed scope-before-lookup and the tenant
    capability check. For an assignment-scoped Reviewer, an application not
    assigned to them returns the same indistinguishable ``NotFound`` used for
    an out-of-tenant object, so an unassigned application's existence is never
    confirmed. A no-op for Tenant_Admins / Super_Admins.
    """
    if not _is_assignment_scoped_reviewer(request.user):
        return
    actor_id = str(getattr(request.user, "id", "") or getattr(request.user, "pk", "") or "")
    assigned_id = str(getattr(application, "assigned_reviewer_id_id", "") or "")
    if not assigned_id or assigned_id != actor_id:
        raise NotFound("Application not found")


def resolve_scoped_application(
    request,
    application_id: Any,
    *,
    capability: Optional[str] = None,
    select_for_update: bool = False,
    queryset=None,
    not_found_detail: str = "Application not found",
    enforce_reviewer_assignment: bool = True,
):
    """Return the application scoped to the actor, or raise the masked error.

    Applies scope-before-lookup via ``AccessScopeService.filter_applications``
    (a Student / out-of-tenant caller therefore gets an indistinguishable
    404), then — when ``capability`` is given — enforces the per-institution
    ``tenant.*`` capability (an in-scope actor missing it gets a non-revealing
    403), then — when ``enforce_reviewer_assignment`` (default) — restricts an
    assignment-scoped Reviewer to applications assigned to them (an unassigned
    application is a 404 mask; design §5.2 / AUTH-01). A Super_Admin /
    Tenant_Admin / all-access caller passes the reviewer-assignment check.

    ``select_for_update`` locks the row (the caller must already be inside a
    ``transaction.atomic()`` block); ``queryset`` overrides the base queryset
    (e.g. to add ``select_related``). ``not_found_detail`` is the message on the
    masked 404 (preserving the endpoint's existing envelope message).
    """
    from apps.applications.models import Application

    AccessScopeService, _AdminCapabilityService, CapabilityResolutionError = _services()

    base = queryset if queryset is not None else Application.objects.all()
    if select_for_update:
        base = base.select_for_update()

    try:
        scoped = AccessScopeService().filter_applications(base, request.user)
    except CapabilityResolutionError:
        # Fail closed: an unresolved scope is treated as no scope → masked 404.
        raise NotFound(not_found_detail)

    try:
        application = scoped.get(id=application_id)
    except Application.DoesNotExist:
        raise NotFound(not_found_detail)
    except (ValueError, DjangoValidationError, TypeError):
        # A malformed id is indistinguishable from an out-of-scope/missing one.
        raise NotFound(not_found_detail)

    if capability:
        require_application_capability(request, application, capability)
    if enforce_reviewer_assignment:
        require_reviewer_assignment(request, application)
    return application


def require_application_capability(request, application, capability: str) -> None:
    """Enforce a scope-grained ``tenant.*`` capability for ``application``.

    Assumes the application has already passed scope-before-lookup (so the
    actor is in scope). Institution capabilities apply broadly; offering and
    application grants apply only when their exact target matches this row.
    Raises a non-revealing ``PermissionDenied`` (403) when the actor is in scope
    but lacks ``capability`` at every applicable grain. Fails closed on a
    resolution error.
    """
    _AccessScopeService, AdminCapabilityService, CapabilityResolutionError = _services()
    try:
        held = AdminCapabilityService().get_application_capabilities(
            request.user, application
        )
    except CapabilityResolutionError as exc:
        raise PermissionDenied(
            "Your capabilities could not be resolved; the action is denied."
        ) from exc
    if capability not in held:
        raise PermissionDenied()


# ---------------------------------------------------------------------------
# Self-description surfaces (Capability_Endpoint) — 13.6 remediation M3
# ---------------------------------------------------------------------------
#
# The masked 404 below protects the existence of *tenant data*. It is the wrong
# answer for the two endpoints whose entire payload is a statement about the
# CALLER's own authority — ``GET /api/v1/admin/capabilities/`` and the extended
# ``GET /api/v1/admin/scope/``. For an unassigned staff actor those endpoints
# return ``capabilities: []`` and ``institutions: []``: no tenant identifier,
# name, count or attribute, so there is nothing there to mask. Refusing instead
# of answering costs the platform the only honest source it has for "you have no
# school access assigned" — see
# ``tests/unit/test_no_scope_empty.py::TestDashboardNoScope``, whose own
# docstring says that state is rendered "from their **own** capability payload
# (``CapabilityContext.noAccess``, derived from
# ``GET /api/v1/admin/capabilities/``) ... not from a masked error."
#
# So a self surface takes ``self_description=True`` and separates the two cases
# the tenant-data contract deliberately collapses:
#
#   * a staff-tier actor (reviewer / admin / super_admin) is ANSWERED, with its
#     own possibly-empty capability set;
#   * everyone else — a Student above all — is still masked 404, preserving the
#     2.1 matrix's "student not in tenant admin scope (not-found mask)" and the
#     assumption the frontend provider already documents at
#     ``CapabilityContext.tsx`` ("a student is excluded rather than asked,
#     because the endpoint masks them as a 404").
#
# This reads ``role``, and that is deliberate and bounded. Capabilities cannot
# make this distinction: an unassigned ``admin`` and a ``student`` both resolve
# to zero platform and zero tenant capabilities, so the *only* thing that
# separates them in this model is the role the capability derivation itself
# takes as input. It is an explicit, named backend policy COMPOSED WITH the
# capability service — the same shape as ``_is_assignment_scoped_reviewer``
# above — and it is never a second authority: it decides disclosure for a
# payload that grants nothing, while every tenant-data decision on every other
# surface still resolves through ``AdminCapabilityService`` alone.


def _is_staff_tier(user) -> bool:
    """True when ``user``'s canonical role is reviewer or above.

    Uses the platform's one role hierarchy (``ROLE_HIERARCHY``) rather than a
    literal comparison, so a role added to the hierarchy above ``reviewer`` is
    covered without editing this function.
    """
    from apps.accounts.permissions import ROLE_HIERARCHY

    role = (getattr(user, "role", "") or "").strip().lower()
    return ROLE_HIERARCHY.get(role, 0) >= ROLE_HIERARCHY["reviewer"]


def authorize_tenant_surface(
    request,
    *,
    capability: Optional[str] = None,
    self_description: bool = False,
    allow_target_scope: bool = False,
) -> None:
    """Authorize an aggregate / self staff surface with the tenant disclosure model.

    Used by endpoints that are not a single tenant object (dashboards, scoped
    lists, exports, settlement/fee reads, communication templates, etc.):

    * Super_Admin / all-access → pass.
    * No tenant scope at all (a Student, or a staff actor with no active
      membership/grant) → 404 mask — the staff surface's existence is not
      confirmed to a non-staff caller (matches the 2.1 matrix
      "student not in tenant admin scope (not-found mask)").
    * In scope, ``capability`` given but not held for any in-scope institution
      → non-revealing 403.
    * In scope and (``capability`` is ``None`` — an admin-tier read — or the
      capability is held) → pass.

    ``self_description=True`` marks a Capability_Endpoint: a surface whose whole
    payload describes the caller's own authority and discloses no tenant fact.
    On such a surface an unassigned **staff-tier** actor is answered with its
    empty capability set (R2.1's "every actor that can reach the endpoint")
    while a non-staff actor is still masked. See the block comment above for why
    this reads ``role`` and why it is bounded to this one case.
    """
    _AccessScopeService, AdminCapabilityService, CapabilityResolutionError = _services()
    try:
        caps = AdminCapabilityService().get_capabilities(request.user)
    except CapabilityResolutionError:
        raise NotFound()

    if caps.is_super_admin or caps.all_access:
        return

    authority_maps = [caps.institution_capabilities or {}]
    if allow_target_scope:
        # Only row-filtered application-shaped surfaces may opt in.  Keeping
        # this explicit prevents a constrained offering/application grant from
        # becoming institution-wide authority on dashboards or other aggregate
        # endpoints that do not apply target-grained queryset filters.
        authority_maps.extend(
            [caps.offering_capabilities or {}, caps.application_capabilities or {}]
        )

    if not any(authority_maps):
        if self_description and _is_staff_tier(request.user):
            # Answer the actor's own (empty) authority rather than refusing it.
            # Nothing about any tenant is disclosed by an empty capability set.
            return
        # No tenant scope → mask the staff surface as not-found.
        raise NotFound()

    if capability is None:
        return

    if any(
        capability in held
        for mapping in authority_maps
        for held in mapping.values()
    ):
        return

    raise PermissionDenied()


def resolve_owner_or_scoped_application(
    request,
    application_id: Any,
    *,
    capability: str,
    queryset=None,
    not_found_detail: str = "Application not found",
):
    """Resolve an application through owner OR scoped-capability authority.

    The owner lookup is constrained by ``user_id``. If it misses, the staff
    lookup is independently constrained through ``AccessScopeService`` before
    retrieval and then checked for ``capability``. Consequently a non-owner,
    an out-of-scope staff actor, and an unknown UUID all receive the same 404.
    """
    from apps.applications.models import Application

    base = queryset if queryset is not None else Application.objects.all()
    actor_id = getattr(request.user, "id", None) or getattr(request.user, "pk", None)
    try:
        return base.filter(user_id=actor_id).get(id=application_id)
    except Application.DoesNotExist:
        return resolve_scoped_application(
            request,
            application_id,
            capability=capability,
            queryset=base,
            not_found_detail=not_found_detail,
        )
    except (ValueError, DjangoValidationError, TypeError):
        raise NotFound(not_found_detail)


def resolve_scoped_payment(
    request,
    payment_id: Any,
    *,
    capability: str,
    queryset=None,
    not_found_detail: str = "Payment not found",
):
    """Resolve a payment with scope-before-lookup and tenant capability."""
    from apps.documents.models import Payment

    AccessScopeService, AdminCapabilityService, CapabilityResolutionError = _services()
    base = queryset if queryset is not None else Payment.objects.all()
    try:
        scoped = AccessScopeService().filter_payments(base, request.user)
    except CapabilityResolutionError:
        raise NotFound(not_found_detail)
    try:
        payment = scoped.get(id=payment_id)
    except (Payment.DoesNotExist, ValueError, DjangoValidationError, TypeError):
        raise NotFound(not_found_detail)
    institution_id = getattr(getattr(payment, "application", None), "institution_ref_id", None)
    AdminCapabilityService().require_institution_capability(
        request.user, institution_id, capability
    )
    return payment


def resolve_owner_or_scoped_payment(
    request,
    payment_id: Any,
    *,
    capability: str = "tenant.payment.read",
    queryset=None,
    not_found_detail: str = "Payment not found",
):
    """Resolve a payment through owner OR scoped staff capability."""
    from apps.documents.models import Payment

    base = queryset if queryset is not None else Payment.objects.all()
    actor_id = getattr(request.user, "id", None) or getattr(request.user, "pk", None)
    try:
        return base.filter(user_id=actor_id).get(id=payment_id)
    except Payment.DoesNotExist:
        return resolve_scoped_payment(
            request,
            payment_id,
            capability=capability,
            queryset=base,
            not_found_detail=not_found_detail,
        )
    except (ValueError, DjangoValidationError, TypeError):
        raise NotFound(not_found_detail)


def resolve_scoped_document(
    request,
    document_id: Any,
    *,
    capability: str,
    queryset=None,
    not_found_detail: str = "Document not found",
):
    """Resolve an application document with scope-before-lookup."""
    from apps.documents.models import ApplicationDocument

    AccessScopeService, AdminCapabilityService, CapabilityResolutionError = _services()
    base = queryset if queryset is not None else ApplicationDocument.objects.all()
    try:
        scoped = AccessScopeService().filter_documents(base, request.user)
    except CapabilityResolutionError:
        raise NotFound(not_found_detail)
    try:
        document = scoped.get(id=document_id)
    except (
        ApplicationDocument.DoesNotExist,
        ValueError,
        DjangoValidationError,
        TypeError,
    ):
        raise NotFound(not_found_detail)
    # Scope-grained, like applications: an offering or application grant reaches
    # exactly its own target, and institution authority reaches all of them. The
    # institution-grain check alone would deny an application-scoped grant that
    # ``filter_documents`` already admitted.
    require_application_capability(request, document.application, capability)
    return document


def resolve_owner_or_scoped_document(
    request,
    document_id: Any,
    *,
    capability: str = "tenant.document.read",
    queryset=None,
    not_found_detail: str = "Document not found",
):
    """Resolve a document through its application owner or staff capability."""
    from apps.documents.models import ApplicationDocument

    base = queryset if queryset is not None else ApplicationDocument.objects.all()
    actor_id = getattr(request.user, "id", None) or getattr(request.user, "pk", None)
    try:
        return base.filter(application__user_id=actor_id).get(id=document_id)
    except ApplicationDocument.DoesNotExist:
        return resolve_scoped_document(
            request,
            document_id,
            capability=capability,
            queryset=base,
            not_found_detail=not_found_detail,
        )
    except (ValueError, DjangoValidationError, TypeError):
        raise NotFound(not_found_detail)


def resolve_scoped_program(
    request,
    program_id: Any,
    *,
    capability: str,
    queryset=None,
    not_found_detail: str = "Program not found",
):
    """Resolve a tenant program offering after institution scoping."""
    from apps.catalog.models import Program

    _AccessScopeService, AdminCapabilityService, CapabilityResolutionError = _services()
    base = queryset if queryset is not None else Program.objects.all()
    service = AdminCapabilityService()
    try:
        visible = service.visible_institution_queryset(request.user)
        program = base.filter(institution_id__in=visible.values("pk")).get(id=program_id)
    except CapabilityResolutionError:
        raise NotFound(not_found_detail)
    except (Program.DoesNotExist, ValueError, DjangoValidationError, TypeError):
        raise NotFound(not_found_detail)
    service.require_institution_capability(request.user, program.institution_id, capability)
    return program


__all__ = [
    "resolve_scoped_application",
    "resolve_owner_or_scoped_application",
    "resolve_scoped_payment",
    "resolve_owner_or_scoped_payment",
    "resolve_scoped_document",
    "resolve_owner_or_scoped_document",
    "resolve_scoped_program",
    "require_application_capability",
    "require_reviewer_assignment",
    "apply_reviewer_assignment_scope",
    "authorize_tenant_surface",
]
