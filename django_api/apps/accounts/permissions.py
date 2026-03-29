"""RBAC permission classes for DRF views.

Deterministic permission resolution from JWT role — no database lookup
for standard checks. Falls back to UserPermissionOverride table only
when the standard role check fails.

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


def _has_role_level(user, min_level: int) -> bool:
    """Check if user's role meets the minimum hierarchy level."""
    role = getattr(user, "role", None)
    return ROLE_HIERARCHY.get(role, 0) >= min_level


def _check_permission_override(user, required_permission: str) -> bool:
    """Check UserPermissionOverride table for per-user overrides.

    Only called when the standard role check fails.
    Returns True if the user has an override granting the required permission.
    """
    user_id = getattr(user, "pk", None) or getattr(user, "id", None)
    if not user_id:
        return False

    try:
        from apps.accounts.models import UserPermissionOverride

        override = UserPermissionOverride.objects.filter(user_id=user_id).first()
        if override and isinstance(override.permissions, list):
            return required_permission in override.permissions
    except Exception:
        logger.warning("Failed to check permission override for user %s", user_id)

    return False


class IsStudent(BasePermission):
    """Allows access to users with 'student' role or higher.

    Since student is the lowest role in the hierarchy, any authenticated
    user with a valid role passes this check.
    """

    def has_permission(self, request, view):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        if _has_role_level(request.user, ROLE_HIERARCHY["student"]):
            return True

        return _check_permission_override(request.user, "student:access")


class IsReviewer(BasePermission):
    """Allows access to users with 'reviewer', 'admin', or 'super_admin' role."""

    def has_permission(self, request, view):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        if _has_role_level(request.user, ROLE_HIERARCHY["reviewer"]):
            return True

        return _check_permission_override(request.user, "reviewer:access")


class IsAdmin(BasePermission):
    """Allows access to users with 'admin' or 'super_admin' role."""

    def has_permission(self, request, view):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        if _has_role_level(request.user, ROLE_HIERARCHY["admin"]):
            return True

        return _check_permission_override(request.user, "admin:access")


class IsSuperAdmin(BasePermission):
    """Allows access to users with 'super_admin' role only."""

    def has_permission(self, request, view):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        if _has_role_level(request.user, ROLE_HIERARCHY["super_admin"]):
            return True

        return _check_permission_override(request.user, "super_admin:access")


class IsOwnerOrAdmin(BasePermission):
    """Allows access if user owns the resource or has admin/super_admin role.

    has_permission: passes for any authenticated user (object-level check
    is where ownership is enforced).

    has_object_permission: checks obj.user_id or obj.user.id against
    request.user.id, or allows if user is admin/super_admin.
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

        # If no ownership field found, check permission override
        return _check_permission_override(request.user, "owner:access")
