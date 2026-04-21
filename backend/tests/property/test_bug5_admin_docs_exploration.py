"""Bug 5 exploration test: Admin URL at predictable /admin/ and public OpenAPI docs.

**Validates: Requirements 2.13, 2.14**

This test MUST FAIL on unfixed code — failure confirms the bug exists.
The bug condition (from design isBugCondition_Bug5):
  IF request.path == "/admin/" THEN RETURN true  -- predictable admin URL
  IF request.path IN ["/api/v1/schema/", "/api/v1/docs/", "/api/v1/redoc/"] THEN
    RETURN NOT request.user.is_authenticated AND settings.DEBUG == false

Expected behavior after fix:
  - reverse("admin:index") resolves to a non-standard path (NOT /admin/)
  - IsAuthenticatedOrDebug permission class exists and:
      DEBUG=False + anonymous → deny
      DEBUG=False + authenticated → allow
      DEBUG=True → always allow
  - Unauthenticated requests to /api/v1/schema/, /api/v1/docs/, /api/v1/redoc/
    with DEBUG=False return 403
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django

django.setup()

import pytest
from unittest.mock import MagicMock
from django.test import SimpleTestCase, RequestFactory, override_settings
from django.urls import reverse


# ---------------------------------------------------------------------------
# Test 1: Admin URL should NOT resolve to /admin/
# ---------------------------------------------------------------------------

class TestAdminURLNotPredictable(SimpleTestCase):
    """The admin URL must NOT be at the predictable /admin/ path.

    **Validates: Requirements 2.13**
    """

    def test_admin_index_not_at_slash_admin(self):
        """reverse('admin:index') should NOT resolve to /admin/.

        On unfixed code, this will FAIL because admin IS at /admin/.
        """
        admin_url = reverse("admin:index")
        self.assertNotEqual(
            admin_url,
            "/admin/",
            "Admin URL resolves to the predictable path /admin/ — "
            "expected a non-standard path like /mihas-admin-panel/",
        )


# ---------------------------------------------------------------------------
# Test 2: IsAuthenticatedOrDebug permission class
# ---------------------------------------------------------------------------

class TestIsAuthenticatedOrDebugPermission(SimpleTestCase):
    """The IsAuthenticatedOrDebug permission class must exist and work correctly.

    **Validates: Requirements 2.14**
    """

    def _get_permission_class(self):
        """Try to import IsAuthenticatedOrDebug; fail if it doesn't exist yet."""
        try:
            from apps.common.permissions import IsAuthenticatedOrDebug
            return IsAuthenticatedOrDebug
        except (ImportError, ModuleNotFoundError):
            self.fail(
                "IsAuthenticatedOrDebug permission class does not exist yet — "
                "expected at apps.common.permissions.IsAuthenticatedOrDebug"
            )

    def _make_request(self, authenticated=False):
        """Create a mock request object."""
        request = MagicMock()
        if authenticated:
            request.user.is_authenticated = True
        else:
            request.user.is_authenticated = False
        return request

    @override_settings(DEBUG=False)
    def test_debug_false_anonymous_denied(self):
        """DEBUG=False + anonymous user → deny access."""
        perm_class = self._get_permission_class()
        perm = perm_class()
        request = self._make_request(authenticated=False)
        self.assertFalse(
            perm.has_permission(request, None),
            "IsAuthenticatedOrDebug should deny anonymous users when DEBUG=False",
        )

    @override_settings(DEBUG=False)
    def test_debug_false_authenticated_allowed(self):
        """DEBUG=False + authenticated user → allow access."""
        perm_class = self._get_permission_class()
        perm = perm_class()
        request = self._make_request(authenticated=True)
        self.assertTrue(
            perm.has_permission(request, None),
            "IsAuthenticatedOrDebug should allow authenticated users when DEBUG=False",
        )

    @override_settings(DEBUG=True)
    def test_debug_true_always_allows(self):
        """DEBUG=True → always allow, regardless of auth status."""
        perm_class = self._get_permission_class()
        perm = perm_class()

        anon_request = self._make_request(authenticated=False)
        self.assertTrue(
            perm.has_permission(anon_request, None),
            "IsAuthenticatedOrDebug should allow anonymous users when DEBUG=True",
        )

        auth_request = self._make_request(authenticated=True)
        self.assertTrue(
            perm.has_permission(auth_request, None),
            "IsAuthenticatedOrDebug should allow authenticated users when DEBUG=True",
        )


# ---------------------------------------------------------------------------
# Test 3: OpenAPI docs require auth when DEBUG=False
# ---------------------------------------------------------------------------

class TestOpenAPIDocsRequireAuth(SimpleTestCase):
    """Unauthenticated requests to OpenAPI endpoints with DEBUG=False must return 403.

    Tests use DRF RequestFactory to call the views directly, avoiding DB dependency.

    **Validates: Requirements 2.14**
    """

    OPENAPI_VIEWS = [
        ("schema", "/api/v1/schema/"),
        ("swagger-ui", "/api/v1/docs/"),
        ("redoc", "/api/v1/redoc/"),
    ]

    def _get_view_for_name(self, url_name):
        """Resolve the view function for a given URL name."""
        from django.urls import resolve
        url = reverse(url_name)
        match = resolve(url)
        return match.func

    @override_settings(DEBUG=False)
    def test_schema_unauthenticated_returns_401(self):
        """Unauthenticated GET to /api/v1/schema/ with DEBUG=False should return 401.

        After auth architecture simplification, unauthenticated requests return 401
        (not 403) because JWTCookieAuthentication raises AuthenticationFailed before
        the permission check runs.
        """
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/v1/schema/")

        # Simulate anonymous user
        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()

        view = self._get_view_for_name("schema")
        response = view(request)

        self.assertIn(
            response.status_code,
            (401, 403),
            f"GET /api/v1/schema/ with DEBUG=False returned {response.status_code} — "
            f"expected 401 or 403 (unauthenticated access should be denied in production)",
        )

    @override_settings(DEBUG=False)
    def test_docs_unauthenticated_returns_401(self):
        """Unauthenticated GET to /api/v1/docs/ with DEBUG=False should return 401.

        After auth architecture simplification, unauthenticated requests return 401
        (not 403) because JWTCookieAuthentication raises AuthenticationFailed before
        the permission check runs.
        """
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/v1/docs/")

        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()

        view = self._get_view_for_name("swagger-ui")
        response = view(request)

        self.assertIn(
            response.status_code,
            (401, 403),
            f"GET /api/v1/docs/ with DEBUG=False returned {response.status_code} — "
            f"expected 401 or 403 (unauthenticated access should be denied in production)",
        )

    @override_settings(DEBUG=False)
    def test_redoc_unauthenticated_returns_401(self):
        """Unauthenticated GET to /api/v1/redoc/ with DEBUG=False should return 401.

        After auth architecture simplification, unauthenticated requests return 401
        (not 403) because JWTCookieAuthentication raises AuthenticationFailed before
        the permission check runs.
        """
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/v1/redoc/")

        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()

        view = self._get_view_for_name("redoc")
        response = view(request)

        self.assertIn(
            response.status_code,
            (401, 403),
            f"GET /api/v1/redoc/ with DEBUG=False returned {response.status_code} — "
            f"expected 401 or 403 (unauthenticated access should be denied in production)",
        )
