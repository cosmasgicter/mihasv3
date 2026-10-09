"""Canonical owner-object authorization (Admissions V2 task 2.2 / AUTH-07).

This module is the single place the owner disclosure policy (design §5.2, the
task-2.1 ``disclosure-policy.json`` ``owner`` class) is implemented for
object-scoped student endpoints. It replaces the per-endpoint
``role in ("admin", "super_admin")`` ownership branch that returned a
*distinguishable* ``403 NOT_OWNER`` / ``403 INSUFFICIENT_PERMISSIONS`` for a
valid-but-non-owned object (finding **AUTH-07**) with one helper that returns an
**indistinguishable canonical 404 not-found mask** — existence is never
confirmed to a non-owner, matching the baseline already used by
``GET /api/v2/applications/{id}/`` and the official-documents family.

Authority rules (design §5.2 / enterprise-tenancy steering):

* The acting Student owns the object (``object.user_id == actor.id``) -> allowed.
* Composed scoped-staff read/write is derived **through
  ``AccessScopeService``** (active membership / grant), never a raw role
  string. Role is only an *input* to that scope computation, never the
  endpoint's second authority gate. Out-of-scope staff are 404-masked exactly
  like a non-owner.
* Everyone else (non-owner student, out-of-scope / unauthenticated) -> the same
  canonical 404 mask, so the response for "not yours" is byte-identical to
  "does not exist" (R3.2, R3.6).

The helper deliberately takes an *already-loaded* object so each view keeps its
existing "load or 404" step and only swaps the ownership branch — a minimal,
behaviour-preserving change for the owner path.
"""

from __future__ import annotations

from typing import Any, Optional, Tuple

from django.core.exceptions import ValidationError as _DjangoValidationError
from rest_framework import status
from rest_framework.response import Response


def not_found_response(entity: str = "Application", *, nested: bool = False) -> Response:
    """Return the canonical not-found envelope (byte-identical to a genuine miss).

    Two envelope shapes exist in the codebase (finding API-01). Each endpoint
    keeps the shape its other errors already use so an out-of-scope / non-owner
    404 is indistinguishable from a real not-found on that same endpoint:

    * ``nested=False`` (default, student/application endpoints):
      ``{"success": false, "error": "<entity> not found", "code": "NOT_FOUND"}``.
    * ``nested=True`` (payment endpoints, hardened envelope):
      ``{"success": false, "error": {"code": "NOT_FOUND", "message": ...}}``.
    """
    if nested:
        body = {
            "success": False,
            "error": {"code": "NOT_FOUND", "message": f"{entity} not found"},
        }
    else:
        body = {"success": False, "error": f"{entity} not found", "code": "NOT_FOUND"}
    return Response(body, status=status.HTTP_404_NOT_FOUND)


def actor_owns_application(application: Any, user: Any) -> bool:
    """Whether ``user`` is the owning Student of ``application``."""
    actor_id = str(getattr(user, "id", "") or getattr(user, "pk", "") or "")
    if not actor_id:
        return False
    return str(getattr(application, "user_id", "")) == actor_id


def staff_can_access_application(request: Any, application: Any) -> bool:
    """Whether the caller is in ``AccessScopeService`` scope for ``application``.

    This is the capability-derived scope check (membership / grant). Role is
    only an input to ``filter_applications`` — never compared directly here — so
    a bare ``admin`` with no active membership/grant is not in scope and is
    masked out (enterprise-tenancy: generic ``admin`` alone grants zero tenant
    data).
    """
    from apps.applications.models import Application
    from apps.catalog.services import AccessScopeService

    scoped = AccessScopeService().filter_applications(
        Application.objects.filter(pk=application.pk),
        getattr(request, "user", None),
    )
    return scoped.exists()


def authorize_owned_application(
    request: Any,
    application: Any,
    *,
    allow_scoped_staff: bool = False,
    entity: str = "Application",
    nested: bool = False,
) -> Optional[Response]:
    """Enforce the owner disclosure policy for an object-scoped endpoint.

    Returns ``None`` when the caller may act on ``application``; otherwise the
    canonical 404 not-found mask (never a distinguishable 403). This is the
    AUTH-07 fix: a valid-but-non-owned id is indistinguishable from a
    non-existent one.

    Args:
        allow_scoped_staff: when ``True`` a caller in ``AccessScopeService``
            scope for the application is also authorized (owner + composed
            scoped-staff class). When ``False`` the endpoint is owner-only
            (e.g. withdraw / confirm-enrollment / amendment request); every
            non-owner — including staff — is 404-masked.
    """
    if actor_owns_application(application, getattr(request, "user", None)):
        return None
    if allow_scoped_staff and staff_can_access_application(request, application):
        return None
    return not_found_response(entity, nested=nested)


def resolve_owned_application(
    request: Any,
    application_id: Any,
    *,
    allow_scoped_staff: bool = False,
    select_related: Tuple[str, ...] = ("user",),
    entity: str = "Application",
) -> Tuple[Optional[Any], Optional[Response]]:
    """Load an application and apply the owner disclosure policy in one step.

    Returns ``(application, None)`` when authorized, or ``(None, response)``
    where ``response`` is the canonical 404 mask. A genuinely missing id and a
    valid-but-non-owned id return the identical mask, so existence is never
    confirmed to a non-owner.
    """
    from apps.applications.models import Application

    qs = Application.objects.all()
    if select_related:
        qs = qs.select_related(*select_related)
    try:
        application = qs.get(id=application_id)
    except (Application.DoesNotExist, ValueError, TypeError, _DjangoValidationError):
        # A malformed UUID and a genuinely missing id both collapse to the same
        # canonical 404 mask.
        return None, not_found_response(entity)

    denied = authorize_owned_application(
        request, application, allow_scoped_staff=allow_scoped_staff, entity=entity
    )
    if denied is not None:
        return None, denied
    return application, None


__all__ = [
    "not_found_response",
    "actor_owns_application",
    "staff_can_access_application",
    "authorize_owned_application",
    "resolve_owned_application",
]
