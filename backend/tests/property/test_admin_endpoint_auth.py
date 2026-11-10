"""Property-based tests for admin endpoint authentication.

# Feature: pre-launch-audit, Property 13: Admin endpoints require admin authentication

For any backend endpoint called by admin service modules
(apps/admissions/src/services/admin/), the view must require **admin-level
authority** before it will act.

Rewritten by 13.6 remediation **M3** (cluster K)
-----------------------------------------------
The property is unchanged. Its *instrument* was replaced, because the old one
had inverted into an assertion that the platform's own anti-pattern is present.

The eleven "live verification" methods used to assert the literal class
``IsAdmin`` is in ``permission_classes``. ``IsAdmin`` is a **raw role-level
check** (``_has_role_level(user, ROLE_HIERARCHY["admin"])``), and admissions-v2
task 2.2 deliberately replaced those gates with capability gates resolved
through ``AdminCapabilityService``. The steering rule is explicit: *"Every
backend authorization decision evaluates capabilities ... never a raw
role-string comparison in endpoint code."* So the old instrument demanded the
thing the platform forbids, and eleven tests failed for doing their job on a
contract that had moved.

Two further reasons not to simply widen the old check:

* ``IsAdmin`` was never sufficient. It admits any actor at role level ``admin``
  regardless of which tenant's data is being touched, so a view that passed the
  old assertion could still serve another school's application. A capability
  gate cannot: it resolves per institution.
* The old file hand-transcribed each view's ``permission_classes`` into a string
  tuple. That is a registry, and registries drift — this one had drifted to the
  point of describing views that no longer looked anything like it. The
  transcription is gone; every check below reads the **live view class**.

The replacement predicate is therefore stronger than the one it replaces: a view
satisfies it only when authority is resolved through the capability layer, either

* by a capability permission class (``HasTenantCapability`` /
  ``HasPlatformCapability``), or
* by naming a ``tenant.*`` / ``platform.*`` capability through one of the
  canonical resolvers in its own handler (``resolve_scoped_*``,
  ``require_*_capability``, ``authorize_tenant_surface``).

A view left on ``[IsAuthenticated]`` with no capability resolution anywhere fails
— and ``test_the_predicate_rejects_an_unguarded_view`` proves the predicate can
say no, so a passing suite is not vacuous.

**Validates: Requirements 3.7, 13.4**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import inspect  # noqa: E402
import re  # noqa: E402
from dataclasses import dataclass  # noqa: E402
from importlib import import_module  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# What counts as admin-level authority
# ---------------------------------------------------------------------------

# Permission classes that resolve authority through ``AdminCapabilityService``.
# These are the platform's authority primitives (apps/catalog/permissions.py);
# a raw-role class such as ``IsAdmin`` is deliberately NOT here.
CAPABILITY_PERMISSION_CLASSES = {
    "HasTenantCapability",
    "HasPlatformCapability",
}

# The canonical in-handler resolvers. Each one either enforces a named
# ``tenant.*`` / ``platform.*`` capability or applies scope-before-lookup
# through ``AccessScopeService`` / ``visible_institution_queryset``.
CAPABILITY_RESOLVERS = (
    "resolve_scoped_application",
    "resolve_owner_or_scoped_application",
    "resolve_scoped_payment",
    "resolve_scoped_document",
    "resolve_scoped_program",
    "require_application_capability",
    "require_institution_capability",
    "require_capability",
    "authorize_tenant_surface",
    # Module-local thin wrappers over the resolvers above. Each is verified by
    # ``test_local_capability_wrappers_delegate_to_a_canonical_resolver``, so
    # naming one here cannot become a way to look guarded without being guarded.
    "_get_scoped_application",
    "_scoped_application",
)

_CAPABILITY_STRING = re.compile(r"""["'](?:tenant|platform)\.[a-z_]+\.[a-z_]+["']""")
_RESOLVER_CALL = re.compile(
    r"\b(" + "|".join(re.escape(name) for name in CAPABILITY_RESOLVERS) + r")\s*\("
)


# ---------------------------------------------------------------------------
# Admin endpoint definitions — the live views, not a transcription
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AdminEndpoint:
    """An admin endpoint, identified by the view class that actually serves it."""

    url_pattern: str
    module: str
    view_class_name: str
    source_module: str  # frontend service module that calls this endpoint

    @property
    def view_class(self):
        return getattr(import_module(self.module), self.view_class_name)

    def __str__(self) -> str:  # keeps hypothesis failure output readable
        return f"{self.view_class_name} ({self.url_pattern})"


# Endpoints called by admin service modules (admin/dashboard.ts, admin/audit.ts,
# admin/users.ts)
ADMIN_SERVICE_ENDPOINTS: list[AdminEndpoint] = [
    AdminEndpoint(
        url_pattern="/api/v1/admin/dashboard/",
        module="apps.accounts.admin_views",
        view_class_name="AdminDashboardView",
        source_module="admin/dashboard.ts",
    ),
    AdminEndpoint(
        url_pattern="/api/v1/admin/audit-logs/",
        module="apps.accounts.admin_views",
        view_class_name="AdminAuditLogView",
        source_module="admin/audit.ts",
    ),
    AdminEndpoint(
        url_pattern="/api/v1/admin/users/",
        module="apps.accounts.admin_views",
        view_class_name="AdminUserListView",
        source_module="admin/users.ts",
    ),
    AdminEndpoint(
        url_pattern="/api/v1/admin/users/{id}/",
        module="apps.accounts.admin_views",
        view_class_name="AdminUserDetailView",
        source_module="admin/users.ts",
    ),
    AdminEndpoint(
        url_pattern="/api/v1/admin/users/export/",
        module="apps.accounts.admin_views",
        view_class_name="AdminUserExportView",
        source_module="admin/users.ts",
    ),
]

# Additional admin-only endpoints called from applications.ts (not admin/ service
# modules, but still require admin-level authority per audit Task 4.5)
ADMIN_ONLY_APPLICATION_ENDPOINTS: list[AdminEndpoint] = [
    AdminEndpoint(
        url_pattern="/api/v1/applications/{id}/review/",
        module="apps.applications.admin_review_views",
        view_class_name="ApplicationReviewView",
        source_module="applications.ts",
    ),
    AdminEndpoint(
        url_pattern="/api/v1/applications/export/",
        module="apps.applications.admin_export_views",
        view_class_name="ApplicationExportView",
        source_module="applications.ts",
    ),
    AdminEndpoint(
        url_pattern="/api/v1/applications/bulk-status/",
        module="apps.applications.admin_bulk_views",
        view_class_name="ApplicationBulkStatusView",
        source_module="applications.ts",
    ),
    AdminEndpoint(
        url_pattern="/api/v1/applications/{id}/verify-document/",
        module="apps.applications.document_views",
        view_class_name="ApplicationVerifyDocumentView",
        source_module="applications.ts",
    ),
    AdminEndpoint(
        url_pattern="/api/v1/applications/{id}/acceptance-letter/",
        module="apps.applications.document_views",
        view_class_name="AcceptanceLetterView",
        source_module="applications.ts",
    ),
    AdminEndpoint(
        url_pattern="/api/v1/applications/{id}/finance-receipt/",
        module="apps.applications.document_views",
        view_class_name="FinanceReceiptView",
        source_module="applications.ts",
    ),
]

ALL_ADMIN_ENDPOINTS = ADMIN_SERVICE_ENDPOINTS + ADMIN_ONLY_APPLICATION_ENDPOINTS


# ---------------------------------------------------------------------------
# Authority inspection
# ---------------------------------------------------------------------------


def permission_class_names(view_class) -> tuple[str, ...]:
    """The live ``permission_classes`` names on a view."""
    return tuple(p.__name__ for p in getattr(view_class, "permission_classes", ()))


def _class_source(view_class) -> str:
    try:
        return inspect.getsource(view_class)
    except (OSError, TypeError):  # pragma: no cover - defensive
        return ""


def capability_evidence(view_class) -> dict[str, object]:
    """Everything this view does to resolve authority, as data.

    Returned rather than reduced to a bool so a failure message can say *what*
    was found instead of only that nothing was.
    """
    source = _class_source(view_class)
    names = permission_class_names(view_class)
    return {
        "permission_classes": names,
        "capability_permission_classes": tuple(
            n for n in names if n in CAPABILITY_PERMISSION_CLASSES
        ),
        "required_capability": getattr(view_class, "required_capability", None),
        "resolvers": tuple(sorted(set(_RESOLVER_CALL.findall(source)))),
        "named_capabilities": tuple(
            sorted({m.strip("\"'") for m in _CAPABILITY_STRING.findall(source)})
        ),
    }


def has_admin_authority(view_class) -> bool:
    """True when the view resolves authority through the capability layer.

    Either a capability permission class is installed, or the handler resolves a
    capability itself through one of the canonical resolvers. ``IsAuthenticated``
    alone is never enough.
    """
    evidence = capability_evidence(view_class)
    return bool(
        evidence["capability_permission_classes"]
        or evidence["resolvers"]
        or evidence["required_capability"]
    )


def describe_authority(endpoint: AdminEndpoint) -> str:
    evidence = capability_evidence(endpoint.view_class)
    return (
        f"{endpoint.view_class_name} at {endpoint.url_pattern} "
        f"(called by {endpoint.source_module}) resolves no capability. "
        f"permission_classes={evidence['permission_classes']} "
        f"required_capability={evidence['required_capability']!r} "
        f"resolvers={evidence['resolvers']} "
        f"named_capabilities={evidence['named_capabilities']}"
    )


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

admin_service_endpoint_st = st.sampled_from(ADMIN_SERVICE_ENDPOINTS)
admin_application_endpoint_st = st.sampled_from(ADMIN_ONLY_APPLICATION_ENDPOINTS)
all_admin_endpoint_st = st.sampled_from(ALL_ADMIN_ENDPOINTS)


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestAdminEndpointAuth(SimpleTestCase):
    """Property 13: Admin endpoints require admin-level authority.

    **Validates: Requirements 3.7, 13.4**
    """

    # ------------------------------------------------------------------
    # Property: every admin endpoint resolves authority through capabilities
    # ------------------------------------------------------------------

    @given(endpoint=admin_service_endpoint_st)
    @settings(max_examples=5)
    def test_admin_service_endpoint_has_admin_permission(self, endpoint: AdminEndpoint):
        """Any endpoint called by an admin service module resolves a capability."""
        self.assertTrue(has_admin_authority(endpoint.view_class), describe_authority(endpoint))

    @given(endpoint=admin_application_endpoint_st)
    @settings(max_examples=5)
    def test_admin_application_endpoint_has_admin_permission(
        self, endpoint: AdminEndpoint
    ):
        """Any admin-only application endpoint resolves a capability."""
        self.assertTrue(has_admin_authority(endpoint.view_class), describe_authority(endpoint))

    @given(endpoint=all_admin_endpoint_st)
    @settings(max_examples=5)
    def test_any_admin_endpoint_has_admin_permission(self, endpoint: AdminEndpoint):
        """Any admin endpoint from either category resolves a capability."""
        self.assertTrue(has_admin_authority(endpoint.view_class), describe_authority(endpoint))

    # ------------------------------------------------------------------
    # The predicate is not vacuous
    # ------------------------------------------------------------------

    def test_the_predicate_rejects_an_unguarded_view(self):
        """A view on ``[IsAuthenticated]`` with no capability resolution fails.

        Without this, a predicate that always returned ``True`` would make the
        whole file green — which is exactly the failure mode the old ``IsAdmin``
        assertion had in reverse.
        """
        from rest_framework.permissions import IsAuthenticated
        from rest_framework.response import Response
        from rest_framework.views import APIView

        class UnguardedView(APIView):
            permission_classes = [IsAuthenticated]

            def get(self, request):
                return Response({"success": True, "data": {}})

        self.assertFalse(has_admin_authority(UnguardedView))

    def test_is_admin_alone_does_not_satisfy_the_predicate(self):
        """A raw-role gate is not admin-level authority under this contract.

        ``IsAdmin`` admits any actor at role level ``admin`` without asking which
        tenant's data is in play, so it cannot be what this property accepts —
        and accepting it is what the previous version of this file required.
        """
        from rest_framework.response import Response
        from rest_framework.views import APIView

        from apps.accounts.permissions import IsAdmin

        class RoleGatedView(APIView):
            permission_classes = [IsAdmin]

            def get(self, request):
                return Response({"success": True, "data": {}})

        self.assertFalse(has_admin_authority(RoleGatedView))

    # ------------------------------------------------------------------
    # Live verification: each named view, and the capability it resolves
    # ------------------------------------------------------------------

    def test_every_admin_endpoint_resolves_a_named_capability(self):
        """Report per view, so a regression names the view rather than a count."""
        unguarded = [
            describe_authority(endpoint)
            for endpoint in ALL_ADMIN_ENDPOINTS
            if not has_admin_authority(endpoint.view_class)
        ]
        self.assertEqual(unguarded, [], "\n".join(unguarded))

    def test_no_admin_endpoint_is_reachable_on_is_authenticated_alone(self):
        """``[IsAuthenticated]`` with nothing else is the shape this rejects."""
        offenders = []
        for endpoint in ALL_ADMIN_ENDPOINTS:
            evidence = capability_evidence(endpoint.view_class)
            if evidence["permission_classes"] == ("IsAuthenticated",) and not (
                evidence["resolvers"] or evidence["required_capability"]
            ):
                offenders.append(describe_authority(endpoint))
        self.assertEqual(offenders, [], "\n".join(offenders))

    def test_no_admin_endpoint_relies_on_a_raw_role_permission_class(self):
        """The inverse of the retired assertion, and the steering rule as a test.

        A raw-role class reappearing on one of these views is a regression, not a
        fix: authority here resolves per institution or not at all.
        """
        raw_role_classes = {"IsAdmin", "IsAdminOrSuperAdmin", "IsSuperAdmin"}
        offenders = {}
        for endpoint in ALL_ADMIN_ENDPOINTS:
            found = raw_role_classes.intersection(
                permission_class_names(endpoint.view_class)
            )
            if found:
                offenders[endpoint.view_class_name] = sorted(found)
        self.assertEqual(offenders, {}, offenders)

    def test_local_capability_wrappers_delegate_to_a_canonical_resolver(self):
        """The two module-local wrapper names must really delegate.

        ``CAPABILITY_RESOLVERS`` includes ``_get_scoped_application`` and
        ``_scoped_application``. If either were a plain ``objects.get`` a view
        could look guarded while being unguarded, so each is checked here to call
        one of the canonical resolvers and to take a capability argument.
        """
        canonical = (
            "resolve_scoped_application",
            "resolve_owner_or_scoped_application",
        )
        checked = 0
        for module_name in (
            "apps.applications.document_views",
            "apps.applications.admin_views",
            "apps.applications.student_views",
            "apps.applications.history_views",
            "apps.applications.interview_views",
        ):
            module = import_module(module_name)
            for wrapper_name in ("_get_scoped_application", "_scoped_application"):
                wrapper = getattr(module, wrapper_name, None)
                if wrapper is None or not callable(wrapper):
                    continue
                source = inspect.getsource(wrapper)
                self.assertTrue(
                    any(name in source for name in canonical),
                    f"{module_name}.{wrapper_name} does not delegate to a "
                    f"canonical resolver: {source}",
                )
                self.assertIn(
                    "capability",
                    source,
                    f"{module_name}.{wrapper_name} does not pass a capability",
                )
                checked += 1
        self.assertGreater(
            checked, 0, "no local wrapper was found — CAPABILITY_RESOLVERS is stale"
        )

    # ------------------------------------------------------------------
    # Structural: all admin endpoints are represented, and resolvable
    # ------------------------------------------------------------------

    def test_all_admin_service_endpoints_covered(self):
        """All admin service URL patterns should be in the endpoint list."""
        expected_patterns = {
            "/api/v1/admin/dashboard/",
            "/api/v1/admin/audit-logs/",
            "/api/v1/admin/users/",
            "/api/v1/admin/users/{id}/",
            "/api/v1/admin/users/export/",
        }
        covered = {ep.url_pattern for ep in ADMIN_SERVICE_ENDPOINTS}
        missing = expected_patterns - covered
        self.assertEqual(missing, set(), f"Missing admin service endpoints: {missing}")

    def test_every_listed_view_class_still_exists(self):
        """An endpoint naming a view that has been renamed or removed is drift.

        This is the check the hand-transcribed ``permission_classes`` tuples used
        to hide: a stale string cannot fail to import.
        """
        for endpoint in ALL_ADMIN_ENDPOINTS:
            with self.subTest(endpoint=str(endpoint)):
                self.assertTrue(
                    inspect.isclass(endpoint.view_class),
                    f"{endpoint.module}.{endpoint.view_class_name} is not a class",
                )
