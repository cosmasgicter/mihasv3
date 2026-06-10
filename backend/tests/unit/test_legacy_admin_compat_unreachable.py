"""Legacy-admin compat path is unreachable under production — Phase 3 task 12.4.

R4.9: THE production access model SHALL be membership/grant-driven; the existing
test-settings-only legacy-admin compatibility path SHALL NOT be relied upon or
extended into production behaviour.

``AccessScopeService`` carries a single, deliberately-narrow compatibility
branch (``_legacy_admin_test_scope``) that grants a membership-less ``admin``
all-access **only** so legacy unit fixtures (which never created memberships)
keep passing. That branch is gated entirely behind ``_test_settings_active()``,
which is True **iff** ``DJANGO_SETTINGS_MODULE`` ends with ``.test``.

These tests pin two things so the compat path can never leak into production:

1. ``_test_settings_active()`` is False for every non-``.test`` settings module
   (``config.settings.prod``, ``config.settings.staging``, ``config.settings.dev``),
   so the compat branch is unreachable there.
2. With the compat branch forced off (production semantics), a membership-less
   admin resolves to an empty, non-global scope — proving production scope is
   membership/grant-driven only, never role-derived.

**Validates: Requirements R4.9**
"""

from __future__ import annotations

import pytest

from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import build_membership, build_profile


# ---------------------------------------------------------------------------
# 1. The gate itself — only ".test" activates the compat branch
# ---------------------------------------------------------------------------


class TestCompatGateProductionUnreachable:
    """``_test_settings_active`` is the sole gate, and it is False in prod.

    **Validates: Requirements R4.9**
    """

    @pytest.mark.parametrize(
        "settings_module",
        [
            "config.settings.prod",
            "config.settings.staging",
            "config.settings.dev",
            "config.settings.base",
            "",  # unset
        ],
    )
    def test_compat_inactive_for_non_test_settings(self, monkeypatch, settings_module):
        monkeypatch.setenv("DJANGO_SETTINGS_MODULE", settings_module)
        assert AccessScopeService._test_settings_active() is False

    def test_compat_active_only_for_test_settings(self, monkeypatch):
        monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.test")
        assert AccessScopeService._test_settings_active() is True

    def test_legacy_admin_scope_false_in_production(self, monkeypatch):
        """Even for an ``admin`` role, the legacy compat scope is False under a
        production settings module."""
        monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.prod")

        class _Admin:
            role = "admin"

        assert AccessScopeService._legacy_admin_test_scope(_Admin()) is False


# ---------------------------------------------------------------------------
# 2. Production scope is membership/grant-driven only
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestProductionScopeMembershipDriven:
    """Under production semantics a membership-less admin is empty-scoped.

    **Validates: Requirements R4.9**
    """

    @pytest.fixture()
    def production_scope(self, monkeypatch):
        """Force ``_test_settings_active`` False so the compat branch cannot
        fire, regardless of the settings module the suite runs under."""
        monkeypatch.setattr(
            AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
        )

    def test_membershipless_admin_has_empty_scope(self, production_scope):
        """A membership-less, grant-less admin gets a non-global, empty scope —
        NOT the all-access the compat branch would have granted under tests."""
        admin = build_profile(role="admin")
        filters = AccessScopeService().filters_for_user(admin)

        assert filters.all_access is False
        assert filters.institution_ids == set()
        assert filters.offering_ids == set()
        assert filters.application_ids == set()
        assert filters.has_no_scope is True

    def test_admin_scope_comes_from_membership(self, production_scope, tenant_world):
        """An admin with an active membership is scoped to exactly that
        institution — proving scope is membership-driven, not role-derived."""
        admin = build_profile(role="admin")
        build_membership(user=admin, institution=tenant_world.institution, role="admin")

        filters = AccessScopeService().filters_for_user(admin)

        assert filters.all_access is False
        assert filters.institution_ids == {tenant_world.institution_id}

    def test_compat_branch_would_change_result_under_tests(self, tenant_world):
        """Guard: with the compat branch ACTIVE (test settings), the SAME
        membership-less admin would get all-access. This documents exactly what
        production must avoid — and proves the production assertions above are
        not vacuous.

        Uses ``tenant_world`` only to ensure DB access is configured; the admin
        itself has no membership/grant.
        """
        admin = build_profile(role="admin")

        # Force the compat gate ON (as if running under config.settings.test).
        import apps.catalog.services as svc

        original = svc.AccessScopeService._test_settings_active
        try:
            svc.AccessScopeService._test_settings_active = staticmethod(lambda: True)
            filters = AccessScopeService().filters_for_user(admin)
            assert filters.all_access is True  # compat path grants all-access
        finally:
            svc.AccessScopeService._test_settings_active = staticmethod(original)
