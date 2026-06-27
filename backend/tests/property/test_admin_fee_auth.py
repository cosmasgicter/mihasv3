"""Property-based tests for admin fee endpoints requiring authentication.

# Feature: lenco-payment-integration, Property 15: Admin fee endpoints require authentication

For any request to the fee management endpoints without admin authentication,
the response should be HTTP 401 or 403.

Tests that ProgramFeeViewSet has `permission_classes = [IsAdmin]`.

**Validates: Requirements 13.5**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.accounts.permissions import IsAdmin  # noqa: E402
from apps.documents.payment_query_views import ProgramFeeViewSet  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# HTTP methods used for fee management endpoints
http_methods = st.sampled_from(["GET", "POST", "PUT", "PATCH", "DELETE"])

# Roles that should NOT have admin access
non_admin_roles = st.sampled_from(["student", "reviewer", "", None])

# Roles that SHOULD have admin access
admin_roles = st.sampled_from(["admin", "super_admin"])


class _FakeUser:
    """Minimal user stub for permission testing."""

    def __init__(self, role=None, is_authenticated=True):
        self.role = role
        self.is_authenticated = is_authenticated
        self.id = "test-user-id"
        self.pk = "test-user-id"


class _FakeRequest:
    """Minimal request stub for permission testing."""

    def __init__(self, user=None):
        self.user = user


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestProgramFeeViewSetUsesIsAdmin(SimpleTestCase):
    """ProgramFeeViewSet must declare IsAdmin as its permission class.

    **Validates: Requirements 13.5**
    """

    def test_permission_classes_contains_is_admin(self):
        """The viewset's permission_classes should include IsAdmin."""
        self.assertIn(
            IsAdmin,
            ProgramFeeViewSet.permission_classes,
            "ProgramFeeViewSet must use IsAdmin permission class",
        )


class TestUnauthenticatedRequestsDenied(SimpleTestCase):
    """Unauthenticated requests should be denied by IsAdmin.

    **Validates: Requirements 13.5**
    """

    @given(method=http_methods)
    @settings(max_examples=5)
    def test_unauthenticated_user_denied(self, method):
        """For any HTTP method, an unauthenticated user should be denied."""
        permission = IsAdmin()
        # User with is_authenticated=False
        user = _FakeUser(role="admin", is_authenticated=False)
        request = _FakeRequest(user=user)
        self.assertFalse(
            permission.has_permission(request, None),
            f"Unauthenticated user should be denied for {method}",
        )

    @given(method=http_methods)
    @settings(max_examples=5)
    def test_no_user_denied(self, method):
        """For any HTTP method, a request with no user should be denied."""
        permission = IsAdmin()
        request = _FakeRequest(user=None)
        self.assertFalse(
            permission.has_permission(request, None),
            f"Request with no user should be denied for {method}",
        )


class TestNonAdminRolesDenied(SimpleTestCase):
    """Non-admin roles should be denied by IsAdmin.

    **Validates: Requirements 13.5**
    """

    @given(role=non_admin_roles, method=http_methods)
    @settings(max_examples=5)
    def test_non_admin_role_denied(self, role, method):
        """For any non-admin role and any HTTP method, IsAdmin should deny access."""
        permission = IsAdmin()
        user = _FakeUser(role=role, is_authenticated=True)
        request = _FakeRequest(user=user)
        self.assertFalse(
            permission.has_permission(request, None),
            f"Role '{role}' should be denied for {method}",
        )


class TestAdminRolesAllowed(SimpleTestCase):
    """Admin and super_admin roles should be allowed by IsAdmin.

    **Validates: Requirements 13.5**
    """

    @given(role=admin_roles, method=http_methods)
    @settings(max_examples=5)
    def test_admin_role_allowed(self, role, method):
        """For any admin role and any HTTP method, IsAdmin should allow access."""
        permission = IsAdmin()
        user = _FakeUser(role=role, is_authenticated=True)
        request = _FakeRequest(user=user)
        self.assertTrue(
            permission.has_permission(request, None),
            f"Role '{role}' should be allowed for {method}",
        )
