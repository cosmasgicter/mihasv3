"""Custom permission classes for the MIHAS platform."""

from rest_framework.permissions import BasePermission


class IsAuthenticatedOrDebug(BasePermission):
    """Require authentication for protected docs/schema endpoints."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)
