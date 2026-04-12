"""Custom permission classes for the MIHAS platform."""

from django.conf import settings
from rest_framework.permissions import BasePermission


class IsAuthenticatedOrDebug(BasePermission):
    """Allow access if DEBUG is True, otherwise require authentication."""

    def has_permission(self, request, view):
        if settings.DEBUG:
            return True
        return request.user and request.user.is_authenticated
