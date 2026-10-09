"""RBAC permission classes for DRF views.

Deterministic permission resolution from the JWT role — no database lookup.
Authority is the canonical role hierarchy (``ROLE_HIERARCHY``) composed, at the
endpoint layer, with ``AdminCapabilityService`` (``backend/apps/catalog``). The
role hierarchy is the *only* input these primitives evaluate.

Legacy per-user permission overrides are **retired** (admissions-v2 task 2.4,
AUTH-04 / R3.4). The old ``UserPermissionOverride`` table and its invented
colon-delimited permission vocabulary no longer grant any authority: the
permission classes below never consult it. ``_check_permission_override``
is retained only as an inert, always-``False`` stub so the retirement is explicit
and testable; Phase 12.4 removes the stub together with the ``UserPermissionOverride``
model. The ``user_permission_overrides`` table is preserved for historical data
compatibility but is no longer an authority source.

Implements task 10.1.
Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
"""

import logging

from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)

# Role hierarchy: super_admin ⊇ admin ⊇ reviewer ⊇ student
ROLE_HIERARCHY = {
    "super_admin": 4,
    "admin": 3,
    "reviewer": 2,
    "student": 1,
}


def is_super_admin(user) -> bool:
    """Single source of truth for super-admin checks across views and services.

    Use this for any imperative check (early returns, conditional branches, audit
    decisions). For DRF permission classes use IsSuperAdmin instead.
    """
    return getattr(user, "role", None) == "super_admin"


def _has_role_level(user, min_level: int) -> bool:
    """Check if user's role meets the minimum hierarchy level."""
    role = getattr(user, "role", None)
    return ROLE_HIERARCHY.get(role, 0) >= min_level


def _check_permission_override(user, required_permission: str) -> bool:
    """Retired legacy per-user permission override check (admissions-v2 task 2.4).

    The old implementation consulted the ``UserPermissionOverride`` table for
    invented colon-permission strings and could elevate a lower role's
    authority. That legacy override authority is **retired**: the permission
    classes below no longer call this function, so a per-user override can never
    grant authority. This inert stub always returns ``False`` and is retained
    only so the retirement is explicit and testable; Phase 12.4 removes it along
    with the ``UserPermissionOverride`` model.
    """
    return False


class IsStudent(BasePermission):
    """Allows access to users with 'student' role or higher.

    Since student is the lowest role in the hierarchy, any authenticated
    user with a valid role passes this check. Authority is the role hierarchy
    only — no per-user override fallback (task 2.4).
    """

    def has_permission(self, request, view):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        return _has_role_level(request.user, ROLE_HIERARCHY["student"])


class IsReviewer(BasePermission):
    """Allows access to users with 'reviewer', 'admin', or 'super_admin' role.

    Role hierarchy only — no per-user override fallback (task 2.4).
    """

    def has_permission(self, request, view):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        return _has_role_level(request.user, ROLE_HIERARCHY["reviewer"])


class IsAdmin(BasePermission):
    """Allows access to users with 'admin' or 'super_admin' role.

    Role hierarchy only — no per-user override fallback (task 2.4).
    """

    def has_permission(self, request, view):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        return _has_role_level(request.user, ROLE_HIERARCHY["admin"])


class IsSuperAdmin(BasePermission):
    """Allows access to users with 'super_admin' role only.

    Role hierarchy only — no per-user override fallback (task 2.4).
    """

    def has_permission(self, request, view):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        return _has_role_level(request.user, ROLE_HIERARCHY["super_admin"])


class IsOwnerOrAdmin(BasePermission):
    """Allows access if user owns the resource or has admin/super_admin role.

    has_permission: passes for any authenticated user (object-level check
    is where ownership is enforced).

    has_object_permission: checks obj.user_id or obj.user.id against
    request.user.id, or allows if user is admin/super_admin. Ownership and role
    hierarchy are the only authority — there is no per-user override fallback
    (task 2.4); an object with no resolvable owner denies a non-admin.
    """

    def has_permission(self, request, view):
        return bool(
            request.user and getattr(request.user, "is_authenticated", False)
        )

    def has_object_permission(self, request, view, obj):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        # Admin and super_admin always have access
        if _has_role_level(request.user, ROLE_HIERARCHY["admin"]):
            return True

        # Check ownership: try obj.user_id first, then obj.user.id
        user_id = str(getattr(request.user, "id", ""))
        obj_user_id = getattr(obj, "user_id", None)
        if obj_user_id is not None:
            return str(obj_user_id) == user_id

        obj_user = getattr(obj, "user", None)
        if obj_user is not None:
            return str(getattr(obj_user, "id", "")) == user_id

        # No resolvable owner and not an admin — deny (fail closed).
        return False
