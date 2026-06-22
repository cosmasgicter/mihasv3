"""DRF permission classes and scoping mixin for the tenant authority (task 4.1).

The backend is the only security boundary (design principle). These thin DRF
helpers defer every authority decision to :class:`AdminCapabilityService` so
views stay declarative and there is a single place that decides what an actor
may do:

* :class:`HasPlatformCapability` enforces a single ``platform.*`` capability
  declared on the view (``view.required_capability``), delegating to
  ``AdminCapabilityService.require_capability``. On denial it emits an
  ``auth.denied`` / ``scope.denied`` Audit_Event and returns a **non-revealing**
  failure (a bare 403 with the default message — no tenant identifier, name,
  count, or attribute is leaked).
* :class:`TenantScopedCapabilityMixin` provides ``get_scoped_object()`` which
  scopes through ``visible_institution_queryset`` **before** the ``.get()`` so
  an out-of-scope or unknown id surfaces a non-revealing 404 and the object's
  existence is never confirmed.

Requirements: R3.4, R3.5, R4.3, R4.5.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import BasePermission

from apps.accounts.permissions import is_super_admin
from apps.catalog.models import Institution
from apps.catalog.services import AdminCapabilityService, CapabilityResolutionError
from apps.catalog.tenant_audit_service import TenantAuditService

logger = logging.getLogger(__name__)

#: Authorization-denial audit action (a missing capability), distinct from the
#: ``scope.denied`` masked-not-found action defined by ``TenantAuditService``.
ACTION_AUTH_DENIED = "auth.denied"

#: Sentinel distinguishing "argument omitted" from an explicit ``None``.
_UNSET = object()


def _actor_id(user: Any) -> Optional[Any]:
    return getattr(user, "id", None) or getattr(user, "pk", None)


def _actor_role(user: Any) -> Optional[str]:
    return getattr(user, "role", None)


def _emit_auth_denied(
    request: Any, user: Any, capability: Optional[str], resource_type: str
) -> None:
    """Emit an ``auth.denied`` Audit_Event for a missing capability (R10.6).

    Never raises — ``TenantAuditService`` already swallows writer failures, and
    this wrapper guards against any unexpected error so authorization decisions
    are never aborted by an audit problem.
    """
    try:
        TenantAuditService.record_event(
            action=ACTION_AUTH_DENIED,
            entity_type=resource_type,
            entity_id=None,
            actor_id=_actor_id(user),
            actor_role=_actor_role(user),
            metadata={
                "resource_type": resource_type,
                "required_capability": capability,
            },
            retention_category="security",
            request=request,
        )
    except Exception:  # pragma: no cover - defensive only
        logger.warning("Failed to emit auth.denied audit event", exc_info=True)


def _emit_scope_denied(
    request: Any, user: Any, resource_type: str, resource_id: Any
) -> None:
    """Emit a ``scope.denied`` Audit_Event for a masked out-of-scope read (R10.6)."""
    try:
        TenantAuditService.record_scope_denied(
            resource_type=resource_type,
            resource_id=resource_id,
            actor_id=_actor_id(user),
            actor_role=_actor_role(user),
            request=request,
        )
    except Exception:  # pragma: no cover - defensive only
        logger.warning("Failed to emit scope.denied audit event", exc_info=True)


class HasPlatformCapability(BasePermission):
    """Require a single ``platform.*`` capability declared on the view (R3.4).

    The view sets the required capability via ``required_capability`` (preferred)
    or the class-level ``capability`` attribute, e.g.::

        class InstitutionListCreateView(HasPlatformCapability-gated view):
            required_capability = "platform.tenant.create"

    Resolution is delegated to ``AdminCapabilityService.require_capability`` so
    there is exactly one authority path. Both an absent capability
    (``PermissionDenied``) and a fail-closed ``CapabilityResolutionError`` (R1.6)
    deny the request; an ``auth.denied`` audit event is emitted and a
    non-revealing 403 is returned (no tenant data, no existence confirmation).
    """

    #: Optional class-level fallback when the view does not set
    #: ``required_capability``.
    capability: Optional[str] = None

    message = "You do not have permission to perform this action."

    def _required_capability(self, view) -> Optional[str]:
        return getattr(view, "required_capability", None) or getattr(
            view, "capability", None
        ) or self.capability

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return False

        capability = self._required_capability(view)
        if not capability:
            # Misconfigured view: fail closed rather than silently allowing.
            logger.error(
                "HasPlatformCapability used on %s without a required_capability",
                getattr(view, "__class__", view),
            )
            return False

        resource_type = getattr(view, "audit_resource_type", "capability")
        try:
            AdminCapabilityService().require_capability(user, capability)
            return True
        except (PermissionDenied, CapabilityResolutionError):
            _emit_auth_denied(request, user, capability, resource_type)
            return False


class TenantScopedCapabilityMixin:
    """Scope object lookups through ``visible_institution_queryset`` (R3.5, R4.3, R4.5).

    ``get_scoped_object()`` filters the candidate queryset by the actor's
    visible institutions **before** issuing the ``.get()``, so an id belonging
    to another tenant (or an id that does not exist at all) is indistinguishable:
    both raise a non-revealing :class:`~rest_framework.exceptions.NotFound`
    (404). The object's existence is never confirmed and no tenant identifier,
    name, count, or attribute is leaked. A masked lookup emits a ``scope.denied``
    Audit_Event so operators can detect cross-tenant probing.

    Views may configure defaults at the class level or pass them per call:

    * ``scoped_model`` — the model to look up (defaults to :class:`Institution`).
    * ``scope_institution_field`` — the field linking the target model to an
      institution (e.g. ``"institution_id"``). ``None`` (the default) means the
      target row *is* an ``Institution`` and is scoped on its own ``pk``.
    * ``lookup_field`` / ``lookup_url_kwarg`` — mirror DRF's generic-view names.
    """

    scoped_model = None
    scope_institution_field: Optional[str] = None
    lookup_field: str = "pk"
    lookup_url_kwarg: Optional[str] = None

    def get_scoped_object(
        self,
        model=None,
        lookup_value: Any = _UNSET,
        *,
        lookup_field: Optional[str] = None,
        queryset=None,
        institution_field: Any = _UNSET,
        resource_type: Optional[str] = None,
    ):
        """Return the scoped object or raise a non-revealing 404.

        ``lookup_value`` defaults to the view's URL kwarg
        (``lookup_url_kwarg`` / ``lookup_field``) when omitted, matching DRF's
        ``get_object`` ergonomics.
        """
        request = getattr(self, "request", None)
        user = getattr(request, "user", None)

        # Resolve the base queryset / model.
        if queryset is None:
            target_model = model or self.scoped_model or Institution
            queryset = target_model._default_manager.all()
        else:
            target_model = queryset.model

        lookup_field = lookup_field or self.lookup_field or "pk"
        if institution_field is _UNSET:
            institution_field = self.scope_institution_field

        # Resolve the lookup value from the URL kwargs when not supplied.
        if lookup_value is _UNSET:
            url_kwarg = self.lookup_url_kwarg or lookup_field
            view_kwargs = getattr(self, "kwargs", {}) or {}
            lookup_value = view_kwargs.get(url_kwarg)

        resource_type = resource_type or getattr(
            target_model._meta, "model_name", "resource"
        )

        # Compute the actor's visible institutions BEFORE the lookup. Fail
        # closed: a resolution failure denies the read as a masked not-found.
        service = AdminCapabilityService()
        try:
            visible_institutions = service.visible_institution_queryset(user)
        except CapabilityResolutionError:
            _emit_scope_denied(request, user, resource_type, lookup_value)
            raise NotFound()

        # Scope the queryset to the visible institutions before .get().
        if is_super_admin(user):
            scoped_qs = queryset
        elif institution_field:
            scoped_qs = queryset.filter(
                **{f"{institution_field}__in": visible_institutions.values("pk")}
            )
        else:
            scoped_qs = queryset.filter(pk__in=visible_institutions.values("pk"))

        try:
            return scoped_qs.get(**{lookup_field: lookup_value})
        except (ObjectDoesNotExist, ValueError, ValidationError, TypeError):
            # Out-of-scope, unknown, or malformed id — all collapse to the same
            # non-revealing 404 and a scope.denied audit event.
            _emit_scope_denied(request, user, resource_type, lookup_value)
            raise NotFound()


__all__ = [
    "HasPlatformCapability",
    "TenantScopedCapabilityMixin",
    "ACTION_AUTH_DENIED",
]
