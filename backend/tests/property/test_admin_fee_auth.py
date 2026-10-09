"""Property-based tests for admin fee endpoint authority.

# Feature: lenco-payment-integration, Property 15: Admin fee endpoints require
# authentication — **carried forward** by admissions-v2 task 8.4.

The original property was "any request to the fee management endpoints without
admin authentication is 401/403", pinned by asserting
``ProgramFeeViewSet.permission_classes`` contained ``IsAdmin``.

Admissions-v2 task 8.4 (finding **AUTH-02**: "fee and settlement authority is
role-based"; requirement R3.1: "the backend capability service SHALL be the sole
authority") replaced that raw-role gate with the canonical capability primitives:

* **read** — ``HasTenantCapability`` + ``tenant.program.read``, scoped through
  ``visible_institution_queryset`` before the lookup, so a scoped Reviewer is
  admitted (``IsAdmin`` denied them) and another tenant's offering is a masked 404;
* **write** — ``HasPlatformCapability`` + ``platform.program_assignment.manage``,
  so a read-only Tenant_Admin can no longer mutate a fee (``IsAdmin`` let any
  admin-role actor through to ``IsSuperAdmin``, and the role string was the whole
  test).

The property itself is unchanged and still holds: **no unauthenticated request
reaches a fee endpoint, by any method.** What changed is *which* primitive
enforces it, so the assertions below pin the capability gates rather than the
retired role classes. The behavioural half — reviewer admitted, read-only tenant
admin refused, cross-tenant id masked — is proven against the live endpoints in
``backend/tests/unit/test_settlement_fee_authority_8_4.py``.

**Validates: Requirements 13.5 (lenco), R3.1, R3.2, R7.3 (admissions-v2)**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.permissions import IsAuthenticated  # noqa: E402

from apps.accounts.permissions import IsAdmin, IsSuperAdmin  # noqa: E402
from apps.catalog.permissions import (  # noqa: E402
    HasPlatformCapability,
    HasTenantCapability,
)
from apps.documents.payment_query_views import ProgramFeeViewSet  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# HTTP methods used for fee management endpoints
http_methods = st.sampled_from(["GET", "POST", "PUT", "PATCH", "DELETE"])

# The two authority primitives the fee endpoints are allowed to use.
capability_permissions = st.sampled_from([HasPlatformCapability, HasTenantCapability])


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
        self.META = {}


class _FakeView:
    """A view stub carrying the capability the permission class reads."""

    def __init__(self, capability=None):
        self.required_capability = capability
        self.audit_resource_type = "program_fee"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestProgramFeeViewSetUsesCapabilityGates(SimpleTestCase):
    """The fee viewset declares capability gates, never a raw-role class.

    **Validates: Requirements R3.1, R7.3**
    """

    def test_read_actions_use_the_tenant_capability_gate(self):
        viewset = ProgramFeeViewSet()
        viewset.action = "list"
        classes = [type(permission) for permission in viewset.get_permissions()]
        self.assertIn(IsAuthenticated, classes)
        self.assertIn(HasTenantCapability, classes)
        self.assertEqual(ProgramFeeViewSet.read_capability, "tenant.program.read")

    def test_write_actions_use_the_platform_capability_gate(self):
        for action in ("create", "update", "partial_update", "destroy"):
            with self.subTest(action=action):
                viewset = ProgramFeeViewSet()
                viewset.action = action
                classes = [type(permission) for permission in viewset.get_permissions()]
                self.assertIn(IsAuthenticated, classes)
                self.assertIn(HasPlatformCapability, classes)
        self.assertEqual(
            ProgramFeeViewSet.required_capability, "platform.program_assignment.manage"
        )

    def test_no_raw_role_permission_class_remains(self):
        """AUTH-02 closure: the role classes are no longer the fee authority."""
        for action in ("list", "retrieve", "create", "update", "destroy"):
            viewset = ProgramFeeViewSet()
            viewset.action = action
            classes = [type(permission) for permission in viewset.get_permissions()]
            self.assertNotIn(IsAdmin, classes, action)
            self.assertNotIn(IsSuperAdmin, classes, action)
        self.assertNotIn(IsAdmin, ProgramFeeViewSet.permission_classes)
        self.assertNotIn(IsSuperAdmin, ProgramFeeViewSet.permission_classes)


class TestUnauthenticatedRequestsDenied(SimpleTestCase):
    """Unauthenticated requests are denied by both capability gates.

    This is the original Property 15, re-pinned against the current primitives.

    **Validates: Requirements 13.5, R3.1**
    """

    @given(method=http_methods, permission_class=capability_permissions)
    @settings(max_examples=10)
    def test_unauthenticated_user_denied(self, method, permission_class):
        """For any HTTP method and either gate, an unauthenticated user is denied."""
        permission = permission_class()
        user = _FakeUser(role="admin", is_authenticated=False)
        request = _FakeRequest(user=user)
        self.assertFalse(
            permission.has_permission(request, _FakeView("platform.program_assignment.manage")),
            f"Unauthenticated user should be denied for {method} by {permission_class.__name__}",
        )

    @given(method=http_methods, permission_class=capability_permissions)
    @settings(max_examples=10)
    def test_no_user_denied(self, method, permission_class):
        """For any HTTP method and either gate, a request with no user is denied."""
        permission = permission_class()
        request = _FakeRequest(user=None)
        self.assertFalse(
            permission.has_permission(request, _FakeView("tenant.program.read")),
            f"Request with no user should be denied for {method} by {permission_class.__name__}",
        )


class TestMisconfiguredViewFailsClosed(SimpleTestCase):
    """A gate with no declared capability denies rather than admitting (R1.6).

    The role gate had no equivalent failure mode: forgetting to declare authority
    on a capability-gated view must never mean "allow everyone".

    **Validates: Requirements R3.1**
    """

    def test_platform_gate_without_capability_denies(self):
        permission = HasPlatformCapability()
        request = _FakeRequest(user=_FakeUser(role="super_admin"))
        self.assertFalse(permission.has_permission(request, _FakeView(None)))
